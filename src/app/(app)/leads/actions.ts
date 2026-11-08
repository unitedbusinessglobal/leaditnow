"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { audit } from "@/lib/audit";
import { str } from "@/lib/format";
import { runDiscovery } from "@/discovery/ingest";
import type { SourceId } from "@/discovery/types";
import { upsertAccount, recomputeScores, scanAndSave } from "@/domain/accounts";
import { revealApolloPerson } from "@/discovery/apollo";

const SOURCES: SourceId[] = ["osm", "wikidata", "google-places", "apollo"];
const go = (path: string, kind: "ok" | "error", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

function input(fd: FormData) {
  const staffRange = str(fd.get("staffRange"));
  return {
    industry: str(fd.get("industry")),
    city: str(fd.get("city")),
    keywords: str(fd.get("keywords")) || null,
    staffRange: /^\d+,\d+$/.test(staffRange) ? staffRange : null,
  };
}

export async function search(fd: FormData) {
  const user = await requireCan("leads.find");
  const source = str(fd.get("source")) as SourceId;
  if (!SOURCES.includes(source)) go("/leads", "error", "Pick a source.");
  const i = input(fd);
  if (!i.industry || !i.city) go("/leads", "error", "Pick an industry and a city.");
  let savedId: string | null = null;
  if (fd.get("save") === "on") {
    const s = await db.savedSearch.create({ data: { orgId: user.orgId, source, ...i, createdById: user.id } });
    savedId = s.id;
  }
  const { run, result } = await runDiscovery(db, user.orgId, source, i, { userId: user.id, savedSearchId: savedId });
  if (savedId) await db.savedSearch.update({ where: { id: savedId }, data: { lastRunAt: new Date() } });
  if (!result) go("/leads", "error", run.error ?? "The search failed.");
  // New accounts are scanned by the nightly job, or straight away with "Scan next 8" on Accounts.
  const r = result!;
  const msg = r.found === 0
    ? `No companies found for this search. Try another industry, a nearby city, or Google Places.`
    : `Found ${r.found}: ${r.added} new accounts, ${r.candidates} to review, ${r.existing} already known.${r.added ? " New accounts are scanned tonight, or use “Scan next 8” on Accounts." : ""}${savedId ? " Saved to run weekly." : ""}`;
  go("/leads", r.found === 0 ? "error" : "ok", msg);
}

export async function toggleSaved(fd: FormData) {
  const user = await requireCan("leads.find");
  const id = str(fd.get("id"));
  const s = await db.savedSearch.findFirst({ where: { id, orgId: user.orgId } });
  if (!s) go("/leads", "error", "Not found.");
  if (fd.get("delete") === "1") await db.savedSearch.delete({ where: { id } });
  else await db.savedSearch.update({ where: { id }, data: { active: !s!.active } });
  go("/leads", "ok", "Saved searches updated.");
}

export async function addCandidate(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  const c = await db.leadCandidate.findFirst({ where: { id, orgId: user.orgId } });
  if (!c) go("/leads/review", "error", "Not found.");
  const website = str(fd.get("website"));
  if (!website) go("/leads/review", "error", `Add ${c!.name}'s website first.`);
  let res: Awaited<ReturnType<typeof upsertAccount>>;
  try {
    res = await upsertAccount(db, user.orgId, {
      domain: website, name: c!.name, city: c!.city, industry: c!.industry, staffSize: c!.staffSize, phone: c!.phone,
      ownerId: user.id, source: c!.source, sourceNote: c!.note,
    });
  } catch (e) {
    go("/leads/review", "error", (e as Error).message);
  }
  await db.leadCandidate.update({ where: { id }, data: { status: "ADDED", accountId: res!.account.id } });
  const extra = (c!.extra ?? {}) as { cin?: string; paidUpCapitalInr?: number; listed?: boolean; companyClass?: string; revenueInr?: number };
  if (res!.created && Object.keys(extra).length) {
    await db.account.update({
      where: { id: res!.account.id },
      data: {
        cin: extra.cin ?? null, paidUpCapitalInr: extra.paidUpCapitalInr ?? null, listed: extra.listed ?? null, companyClass: extra.companyClass ?? null,
        ...(extra.revenueInr ? { revenueInr: extra.revenueInr, revenueSource: "manual" } : {}),
      },
    });
  }
  if (c!.source === "google-places") await db.account.update({ where: { id: res!.account.id }, data: { placeId: c!.externalId } });
  await scanAndSave(db, res!.account).then((r) => r ?? recomputeScores(db, res!.account.id));
  await audit(user.orgId, user.id, "LeadCandidate", id, "add", { accountId: res!.account.id });
  redirect(`/accounts/${res!.account.id}?ok=${encodeURIComponent(res!.created ? "Added from the review list and scanned." : "This company was already an account; linked it.")}`);
}

export async function dismissCandidate(fd: FormData) {
  const user = await requireCan("accounts.edit");
  await db.leadCandidate.updateMany({ where: { id: str(fd.get("id")), orgId: user.orgId }, data: { status: "DISMISSED" } });
  go("/leads/review", "ok", "Dismissed.");
}

export async function revealContact(fd: FormData) {
  const user = await requireCan("leads.find");
  const accountId = str(fd.get("accountId"));
  const account = await db.account.findFirst({ where: { id: accountId, orgId: user.orgId } });
  if (!account) throw new Error("Account not found");
  if (!process.env.APOLLO_API_KEY) go(`/accounts/${accountId}`, "error", "Apollo is not connected.");
  try {
    const p = await revealApolloPerson(str(fd.get("personId")), process.env.APOLLO_API_KEY!);
    await db.contact.create({
      data: {
        orgId: user.orgId, accountId, name: p.name, title: p.title, email: p.email?.toLowerCase() ?? null,
        consentSource: `Apollo business contact data${p.linkedin ? ` · ${p.linkedin}` : ""}`,
      },
    });
    await recomputeScores(db, accountId);
    await audit(user.orgId, user.id, "Contact", accountId, "apollo-reveal", { name: p.name });
    go(`/accounts/${accountId}`, "ok", `${p.name} added${p.email ? ` with ${p.email}` : " (Apollo had no work email)"}.`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    go(`/accounts/${accountId}`, "error", (e as Error).message);
  }
}
