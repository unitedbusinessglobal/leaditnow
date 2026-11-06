import type { PrismaClient, Role, ApprovalKind } from "@prisma/client";
import { can, DISCOUNT_LIMIT_PCT } from "@/lib/roles";

/**
 * Discounts: Director or Founder apply up to the limit directly; anything above goes to the Founder.
 * Edited clauses and new pricing always go to the Founder.
 */
export async function setDiscount(db: PrismaClient, dealId: string, pct: number, reason: string, user: { id: string; role: Role }) {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Discount must be between 0 and 100%.");
  if (!can(user.role, "deals.contract")) throw new Error("Only the Director or Founder can set a discount.");
  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (pct <= DISCOUNT_LIMIT_PCT || user.role === "FOUNDER") {
    await db.deal.update({ where: { id: dealId }, data: { discountPct: Math.round(pct) } });
    await db.auditLog.create({ data: { orgId: deal.orgId, actorId: user.id, entity: "Deal", entityId: dealId, action: "discount", diff: { pct, reason } } });
    return { applied: true as const };
  }
  const approval = await requestApproval(db, dealId, "DISCOUNT", reason || `Discount of ${pct}%`, user.id, Math.round(pct));
  return { applied: false as const, approvalId: approval.id };
}

export async function requestApproval(db: PrismaClient, dealId: string, kind: ApprovalKind, detail: string, userId: string, discountPct?: number) {
  if (!detail.trim()) throw new Error("Describe what needs approval.");
  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
  const a = await db.approval.create({
    data: { orgId: deal.orgId, dealId, kind, detail: detail.trim(), discountPct: discountPct ?? null, requestedById: userId },
  });
  await db.auditLog.create({ data: { orgId: deal.orgId, actorId: userId, entity: "Approval", entityId: a.id, action: "request", diff: { kind, detail, discountPct } } });
  return a;
}

export async function decideApproval(db: PrismaClient, approvalId: string, approve: boolean, note: string, user: { id: string; role: Role }) {
  if (!can(user.role, "approvals.decide")) throw new Error("Only the Founder decides approvals.");
  const a = await db.approval.findUniqueOrThrow({ where: { id: approvalId } });
  if (a.status !== "PENDING") throw new Error("This approval has already been decided.");
  await db.$transaction(async (tx) => {
    await tx.approval.update({
      where: { id: approvalId },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: note.trim() || null },
    });
    if (approve && a.kind === "DISCOUNT" && a.discountPct != null) await tx.deal.update({ where: { id: a.dealId }, data: { discountPct: a.discountPct } });
    await tx.auditLog.create({ data: { orgId: a.orgId, actorId: user.id, entity: "Approval", entityId: a.id, action: approve ? "approve" : "reject", diff: { note } } });
  });
}
