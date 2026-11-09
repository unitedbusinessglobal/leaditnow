"use server";

import { redirect } from "next/navigation";
import { isMarket, guessCountry } from "@/discovery/markets";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { audit } from "@/lib/audit";
import { str, intOrNull } from "@/lib/format";
import { upsertAccount, scanAndSave, addManualSignal, recomputeScores } from "@/domain/accounts";
import { importRows, rupees, type Field } from "@/domain/csv";
import { enrichAccount, enrichReady, ENRICH_MISSING, findEmails, EMAILS_MISSING, emailsReady } from "@/domain/enrich";
import { SERVICE_LINES } from "@/domain/deals";

const back = (id: string, msg: string, kind: "ok" | "error" = "ok") =>
  redirect(`/accounts/${id}?${kind}=${encodeURIComponent(msg)}`);

async function ownAccount(orgId: string, id: string) {
  const a = await db.account.findFirst({ where: { id, orgId } });
  if (!a) throw new Error("Account not found");
  return a;
}

export async function createAccount(fd: FormData) {
  const user = await requireCan("accounts.edit");
  let created: Awaited<ReturnType<typeof upsertAccount>>;
  try {
    created = await upsertAccount(db, user.orgId, {
      domain: str(fd.get("domain")),
      name: str(fd.get("name")),
      city: str(fd.get("city")),
      industry: str(fd.get("industry")),
      staffSize: intOrNull(fd.get("staffSize")),
      phone: str(fd.get("phone")),
      country: guessCountry(str(fd.get("city"))),
      // Someone who adds a company by hand works it themselves.
      ownerId: user.id,
      teamId: user.teamId,
      source: "manual",
      sourceNote: str(fd.get("sourceNote")) || `Added by ${user.name}`,
    });
  } catch (e) {
    redirect(`/accounts/new?error=${encodeURIComponent((e as Error).message)}`);
  }
  const { account } = created;
  if (!created.created) back(account.id, "This company is already in LeadItNow.");
  const contactName = str(fd.get("contactName"));
  if (contactName) {
    await db.contact.create({
      data: {
        orgId: user.orgId, accountId: account.id, name: contactName, title: str(fd.get("contactTitle")) || null,
        email: str(fd.get("contactEmail")).toLowerCase() || null, phone: str(fd.get("contactPhone")) || null,
        consentSource: str(fd.get("sourceNote")) || `Added by ${user.name}`,
      },
    });
  }
  await audit(user.orgId, user.id, "Account", account.id, "create", { domain: account.domain });
  const scanned = await scanAndSave(db, account);
  if (!scanned) await recomputeScores(db, account.id);
  back(account.id, scanned ? "Account added and scanned." : "Account added. The scan could not reach the website; try Re-scan later.");
}

export async function updateAccount(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  await ownAccount(user.orgId, id);
  await db.account.update({
    where: { id },
    data: {
      name: str(fd.get("name")) || undefined,
      country: isMarket(str(fd.get("country"))) && str(fd.get("country")) !== "IN" ? str(fd.get("country")) : null,
      city: str(fd.get("city")) || null,
      industry: str(fd.get("industry")) || null,
      staffSize: intOrNull(fd.get("staffSize")),
      phone: str(fd.get("phone")) || null,
      gstin: str(fd.get("gstin")).toUpperCase() || null,
      notes: str(fd.get("notes")) || null,
    },
  });
  await recomputeScores(db, id);
  await audit(user.orgId, user.id, "Account", id, "update");
  back(id, "Saved.");
}

export async function rescan(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const account = await ownAccount(user.orgId, str(fd.get("id")));
  const r = await scanAndSave(db, account);
  back(account.id, r ? "Re-scanned." : "The website could not be reached.", r ? "ok" : "error");
}

export async function addSignal(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  await ownAccount(user.orgId, id);
  const ruleId = str(fd.get("ruleId")) as "referral" | "job-post-it" | "growth-news";
  if (!["referral", "job-post-it", "growth-news"].includes(ruleId)) back(id, "Pick a signal type.", "error");
  const evidence = str(fd.get("evidence"));
  if (!evidence) back(id, "Add the evidence: a link or who referred them.", "error");
  await addManualSignal(db, id, ruleId, evidence, user.id);
  back(id, "Signal added.");
}

export async function removeSignal(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  await ownAccount(user.orgId, id);
  await db.signal.deleteMany({ where: { id: str(fd.get("signalId")), accountId: id, manual: true } });
  await recomputeScores(db, id);
  back(id, "Signal removed.");
}

export async function addContact(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  await ownAccount(user.orgId, id);
  const name = str(fd.get("name"));
  if (!name) back(id, "Contact name is required.", "error");
  await db.contact.create({
    data: {
      orgId: user.orgId, accountId: id, name, title: str(fd.get("title")) || null,
      email: str(fd.get("email")).toLowerCase() || null, phone: str(fd.get("phone")) || null,
      whatsappOptIn: fd.get("whatsappOptIn") === "on", language: str(fd.get("language")) || "en",
      consentSource: str(fd.get("consentSource")) || `Added by ${user.name}`,
    },
  });
  await recomputeScores(db, id);
  back(id, "Contact added.");
}

export async function optOutContact(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  await ownAccount(user.orgId, id);
  const contactId = str(fd.get("contactId"));
  await db.contact.updateMany({ where: { id: contactId, accountId: id }, data: { optedOutAt: new Date(), whatsappOptIn: false } });
  await audit(user.orgId, user.id, "Contact", contactId, "opt-out");
  back(id, "Contact marked as opted out. Do not contact them again.");
}

export async function createDeal(fd: FormData) {
  const user = await requireCan("deals.edit");
  const id = str(fd.get("id"));
  const account = await ownAccount(user.orgId, id);
  const serviceLine = str(fd.get("serviceLine"));
  if (!SERVICE_LINES.includes(serviceLine)) back(id, "Pick a service line.", "error");
  const deal = await db.deal.create({
    data: {
      orgId: user.orgId, accountId: id, title: str(fd.get("title")) || `${account.name} – ${serviceLine}`,
      serviceLine, indiaOriginated: fd.getAll("indiaOriginated").includes("on"), ownerId: user.id, valueInr: intOrNull(fd.get("valueInr")),
    },
  });
  await audit(user.orgId, user.id, "Deal", deal.id, "create");
  redirect(`/deals/${deal.id}`);
}

export async function runImport(input: {
  rows: string[][];
  mapping: Partial<Record<Field, number>>;
  fileName: string;
  scanNow: boolean;
}) {
  const user = await requireCan("accounts.import");
  if (input.rows.length > 5001) throw new Error("Import up to 5,000 rows at a time.");
  const res = await importRows(db, user.orgId, input.rows, input.mapping, { sourceName: input.fileName, ownerId: null });
  for (const accountId of res.accountIds) await recomputeScores(db, accountId);
  await audit(user.orgId, user.id, "Import", input.fileName, "csv", { created: res.created, merged: res.merged, skipped: res.skipped.length });
  // Scan a handful now; the daily job scans the rest.
  if (input.scanNow) {
    const fresh = await db.account.findMany({ where: { id: { in: res.accountIds }, lastScannedAt: null }, take: 5 });
    await Promise.all(fresh.map((a) => scanAndSave(db, a)));
  }
  revalidatePath("/accounts");
  return res;
}

export async function scanPending() {
  const user = await requireCan("accounts.edit");
  const pending = await db.account.findMany({ where: { orgId: user.orgId, lastScannedAt: null }, take: 8, orderBy: { createdAt: "asc" } });
  await Promise.all(pending.map((a) => scanAndSave(db, a)));
  const left = await db.account.count({ where: { orgId: user.orgId, lastScannedAt: null } });
  redirect(`/accounts?ok=${encodeURIComponent(`Scanned ${pending.length}. ${left} still waiting.`)}`);
}

export async function updateFinance(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  const a = await ownAccount(user.orgId, id);
  const revenue = rupees(str(fd.get("revenue")));
  const listed = str(fd.get("listed"));
  const year = intOrNull(fd.get("foundedYear"));
  await db.account.update({
    where: { id },
    data: {
      revenueInr: revenue,
      revenueSource: revenue == null ? null : revenue === a.revenueInr ? a.revenueSource : "manual",
      staffSize: intOrNull(fd.get("staffSize")),
      listed: listed === "yes" ? true : listed === "no" ? false : null,
      stockSymbol: str(fd.get("stockSymbol")).toUpperCase() || null,
      stockExchange: str(fd.get("stockExchange")).toUpperCase() || null,
      foundedYear: year && year > 1800 && year <= new Date().getFullYear() ? year : null,
      paidUpCapitalInr: rupees(str(fd.get("paidUpCapital"))),
      cin: str(fd.get("cin")).toUpperCase() || null,
      companyClass: str(fd.get("companyClass")) || null,
    },
  });
  await recomputeScores(db, id);
  await audit(user.orgId, user.id, "Account", id, "finance");
  back(id, "Size and finance saved.");
}

export async function enrichOne(fd: FormData) {
  const user = await requireCan("leads.find");
  const a = await ownAccount(user.orgId, str(fd.get("id")));
  let r: Awaited<ReturnType<typeof enrichAccount>>;
  try {
    r = await enrichAccount(db, a);
  } catch (e) {
    back(a.id, `No source could look this up: ${(e as Error).message}`, "error");
  }
  if (r!.status === "not-connected") back(a.id, ENRICH_MISSING, "error");
  await recomputeScores(db, a.id);
  await audit(user.orgId, user.id, "Account", a.id, "enrich", { ...r! });
  const skipped = r!.errors.length ? ` Skipped: ${r!.errors.join("; ")}.` : "";
  back(a.id, r!.status === "done" ? `Updated from ${r!.used.join(" and ")}.${skipped}` : `No source has a company record for ${a.domain}. Enter what you know by hand.${skipped}`);
}

export async function enrichBatch() {
  const user = await requireCan("leads.find");
  if (!enrichReady()) redirect(`/accounts?error=${encodeURIComponent(ENRICH_MISSING)}`);
  const batch = await db.account.findMany({ where: { orgId: user.orgId, enrichedAt: null }, orderBy: [{ priority: "desc" }], take: 20 });
  let done = 0, missing = 0, failed = 0;
  const errors = new Set<string>();
  for (const a of batch) {
    try {
      const r = await enrichAccount(db, a);
      r.errors.forEach((e) => errors.add(e));
      if (r.status === "done") { done++; await recomputeScores(db, a.id); } else missing++;
    } catch (e) { failed++; errors.add((e as Error).message); }
  }
  const left = await db.account.count({ where: { orgId: user.orgId, enrichedAt: null } });
  const msg = `Enriched ${done}; no record for ${missing}${failed ? `; ${failed} failed` : ""}. ${left} not yet enriched.${errors.size ? ` Problems: ${[...errors].slice(0, 3).join("; ")}` : ""}`;
  redirect(`/accounts?${done || missing ? "ok" : "error"}=${encodeURIComponent(msg)}`);
}

/** Look up work emails on the company's domain (Hunter, Snov.io) and keep them under contact details. */
export async function findEmailsOne(fd: FormData) {
  const user = await requireCan("leads.find");
  const a = await ownAccount(user.orgId, str(fd.get("id")));
  if (!emailsReady()) back(a.id, EMAILS_MISSING, "error");
  const r = await findEmails(db, a);
  await audit(user.orgId, user.id, "Account", a.id, "find-emails", { ...r });
  const skipped = r.errors.length ? ` Skipped: ${r.errors.join("; ")}.` : "";
  if (r.used.length === 0) back(a.id, `No source could look this up.${skipped}`, "error");
  back(a.id, r.added ? `${r.added} new ${r.added === 1 ? "email" : "emails"} from ${r.used.join(" and ")}.${skipped}` : `No new emails found for ${a.domain}.${skipped}`);
}

export async function addContactFromPoint(fd: FormData) {
  const user = await requireCan("accounts.edit");
  const id = str(fd.get("id"));
  await ownAccount(user.orgId, id);
  const p = await db.contactPoint.findFirst({ where: { id: str(fd.get("pointId")), accountId: id } });
  if (!p) back(id, "Not found.", "error");
  const local = p!.kind === "email" ? p!.value.split("@")[0] : "";
  const name = str(fd.get("name")) || p!.name || (p!.kind === "email" ? `${local.charAt(0).toUpperCase()}${local.slice(1)} (general)` : "Office");
  await db.contact.create({
    data: {
      orgId: user.orgId, accountId: id, name, title: str(fd.get("title")) || p!.title || null,
      email: p!.kind === "email" ? p!.value : null, phone: p!.kind === "phone" ? p!.value : null,
      consentSource: p!.source === "website" ? `Published on the company website: ${p!.sourceUrl}` : `Business email found by ${p!.sourceUrl}`,
    },
  });
  await recomputeScores(db, id);
  back(id, "Added to contacts.");
}
