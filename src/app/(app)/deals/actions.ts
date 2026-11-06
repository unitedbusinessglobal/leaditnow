"use server";

import { redirect } from "next/navigation";
import type { DealStage, DocumentKind, ApprovalKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCan, requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { str, intOrNull, fromDateInput } from "@/lib/format";
import { moveDeal, SERVICE_LINES, STAGES } from "@/domain/deals";
import { setDiscount, requestApproval } from "@/domain/approvals";

const back = (id: string, msg: string, kind: "ok" | "error" = "ok"): never =>
  redirect(`/deals/${id}?${kind}=${encodeURIComponent(msg)}`);

async function ownDeal(orgId: string, id: string) {
  const d = await db.deal.findFirst({ where: { id, orgId } });
  if (!d) throw new Error("Deal not found");
  return d;
}

export async function updateDeal(fd: FormData) {
  const user = await requireCan("deals.edit");
  const id = str(fd.get("id"));
  await ownDeal(user.orgId, id);
  const serviceLine = str(fd.get("serviceLine"));
  await db.deal.update({
    where: { id },
    data: {
      title: str(fd.get("title")) || undefined,
      serviceLine: SERVICE_LINES.includes(serviceLine) ? serviceLine : undefined,
      valueInr: intOrNull(fd.get("valueInr")),
      pain: str(fd.get("pain")) || null,
      budgetInr: intOrNull(fd.get("budgetInr")),
      championContactId: str(fd.get("championContactId")) || null,
      liveAt: fromDateInput(fd.get("liveAt")),
      indiaOriginated: fd.get("indiaOriginated") === "on",
      ownerId: str(fd.get("ownerId")) || null,
    },
  });
  await audit(user.orgId, user.id, "Deal", id, "update");
  back(id, "Saved.");
}

export async function move(fd: FormData) {
  const user = await requireCan("deals.edit");
  const id = str(fd.get("id"));
  await ownDeal(user.orgId, id);
  const to = str(fd.get("to")) as DealStage;
  if (![...STAGES.map((s) => s.id), "LOST"].includes(to)) back(id, "Unknown stage.", "error");
  const r = await moveDeal(db, id, to, user, str(fd.get("lostReason")));
  const from = str(fd.get("from"));
  if (from === "board") redirect(`/pipeline?${r.ok ? "ok=Moved." : `error=${encodeURIComponent(r.gaps.join("; "))}`}`);
  back(id, r.ok ? "Moved." : r.gaps.join("; "), r.ok ? "ok" : "error");
}

export async function recordDocument(fd: FormData) {
  const user = await requireCan("deals.contract");
  const id = str(fd.get("id"));
  const deal = await ownDeal(user.orgId, id);
  const kind = str(fd.get("kind")) as DocumentKind;
  if (!["MOU", "MSA", "SOW", "PROPOSAL"].includes(kind)) back(id, "Pick a document type.", "error");
  const status = str(fd.get("status")) === "SIGNED" ? "SIGNED" : "SENT";
  const prev = await db.document.count({ where: { dealId: id, kind } });
  const doc = await db.document.create({
    data: { orgId: deal.orgId, dealId: id, kind, status, version: prev + 1, fileKey: str(fd.get("link")) || null },
  });
  await audit(user.orgId, user.id, "Document", doc.id, `record-${status.toLowerCase()}`, { kind });
  back(id, `${kind} recorded as ${status.toLowerCase()}.`);
}

export async function discount(fd: FormData) {
  const user = await requireCan("deals.edit");
  const id = str(fd.get("id"));
  await ownDeal(user.orgId, id);
  try {
    const r = await setDiscount(db, id, Number(str(fd.get("pct"))), str(fd.get("reason")), user);
    back(id, r.applied ? "Discount applied." : "Above your limit: sent to the Founder for approval.");
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    back(id, (e as Error).message, "error");
  }
}

export async function askApproval(fd: FormData) {
  const user = await requireCan("deals.edit");
  const id = str(fd.get("id"));
  await ownDeal(user.orgId, id);
  const kind = str(fd.get("kind")) as ApprovalKind;
  if (!["TERMS", "PRICING"].includes(kind)) back(id, "Pick what needs approval.", "error");
  const detail = str(fd.get("detail"));
  if (!detail) back(id, "Describe the clause or price that needs approval.", "error");
  await requestApproval(db, id, kind, detail, user.id);
  back(id, "Sent to the Founder for approval.");
}

export async function addInvoice(fd: FormData) {
  const user = await requireCan("invoices.edit");
  const id = str(fd.get("id"));
  const deal = await ownDeal(user.orgId, id);
  const number = str(fd.get("number"));
  const issuedAt = fromDateInput(fd.get("issuedAt"));
  const amountInr = intOrNull(fd.get("amountInr"));
  if (!number || !issuedAt || !amountInr) back(id, "Invoice number, date and amount are required.", "error");
  try {
    await db.invoice.create({
      data: { orgId: deal.orgId, dealId: id, number, issuedAt: issuedAt!, amountInr: amountInr!, gstInr: intOrNull(fd.get("gstInr")) ?? 0 },
    });
  } catch {
    back(id, `Invoice ${number} already exists.`, "error");
  }
  await audit(user.orgId, user.id, "Invoice", number, "create", { dealId: id, amountInr });
  back(id, "Invoice added.");
}

export async function recordPayment(fd: FormData) {
  const user = await requireCan("invoices.edit");
  const id = str(fd.get("id"));
  await ownDeal(user.orgId, id);
  const invoiceId = str(fd.get("invoiceId"));
  const amount = intOrNull(fd.get("collectedInr"));
  const at = fromDateInput(fd.get("collectedAt"));
  if (amount == null || !at) back(id, "Amount and date received are required.", "error");
  await db.invoice.updateMany({ where: { id: invoiceId, dealId: id }, data: { collectedInr: amount!, collectedAt: at } });
  await audit(user.orgId, user.id, "Invoice", invoiceId, "payment", { amount });
  back(id, "Payment recorded.");
}

export async function deleteDeal(fd: FormData) {
  const user = await requireUser();
  if (user.role !== "FOUNDER" && user.role !== "DIRECTOR") throw new Error("Only the Director or Founder can delete a deal.");
  const id = str(fd.get("id"));
  const deal = await ownDeal(user.orgId, id);
  if ((await db.invoice.count({ where: { dealId: id } })) > 0) back(id, "This deal has invoices; mark it Lost instead.", "error");
  await db.$transaction([db.activity.deleteMany({ where: { dealId: id } }), db.document.deleteMany({ where: { dealId: id } }), db.deal.delete({ where: { id } })]);
  await audit(user.orgId, user.id, "Deal", id, "delete", { title: deal.title });
  redirect(`/accounts/${deal.accountId}?ok=${encodeURIComponent("Deal deleted.")}`);
}
