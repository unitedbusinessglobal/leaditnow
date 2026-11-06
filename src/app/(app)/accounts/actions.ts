"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { audit } from "@/lib/audit";
import { str, intOrNull } from "@/lib/format";
import { upsertAccount, scanAndSave, addManualSignal, recomputeScores } from "@/domain/accounts";
import { importRows, type Field } from "@/domain/csv";
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
      ownerId: user.id,
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
  const owner = str(fd.get("ownerId"));
  await db.account.update({
    where: { id },
    data: {
      name: str(fd.get("name")) || undefined,
      city: str(fd.get("city")) || null,
      industry: str(fd.get("industry")) || null,
      staffSize: intOrNull(fd.get("staffSize")),
      phone: str(fd.get("phone")) || null,
      gstin: str(fd.get("gstin")).toUpperCase() || null,
      notes: str(fd.get("notes")) || null,
      ownerId: owner || null,
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
  const res = await importRows(db, user.orgId, input.rows, input.mapping, { sourceName: input.fileName, ownerId: user.id });
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
