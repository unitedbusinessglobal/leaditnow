import type { PrismaClient, DealStage, Role } from "@prisma/client";
import { can, DISCOUNT_LIMIT_PCT } from "@/lib/roles";

export const STAGES: { id: DealStage; label: string; exit: string }[] = [
  { id: "TARGET", label: "Target account", exit: "A contact is on the account" },
  { id: "OUTREACH", label: "Outreach", exit: "A meeting is booked or held" },
  { id: "DISCOVERY", label: "Discovery call", exit: "Pain and budget are recorded" },
  { id: "PROTOTYPE_DEMO", label: "Prototype demo", exit: "Demo held and a champion named" },
  { id: "MOU_SCOPING", label: "MOU + paid scoping", exit: "Signed MOU recorded" },
  { id: "MSA_SOW", label: "MSA + SOW", exit: "Signed MSA recorded, deal value set, no pending approval" },
  { id: "ONBOARD", label: "Onboard client", exit: "Client live in production" },
  { id: "RENEW_EXPAND", label: "Renew and expand", exit: "" },
];
export const STAGE_LABEL: Record<DealStage, string> = Object.fromEntries(
  [...STAGES.map((s) => [s.id, s.label]), ["LOST", "Lost"]],
) as Record<DealStage, string>;

export const SERVICE_LINES = ["ERP", "CRM", "SaaS product", "E-commerce", "Custom app", "ITES", "AI automation"];

/** Days a deal may sit in a stage before it counts as stuck. */
export const STUCK_DAYS: Partial<Record<DealStage, number>> = {
  TARGET: 21, OUTREACH: 14, DISCOVERY: 14, PROTOTYPE_DEMO: 14, MOU_SCOPING: 21, MSA_SOW: 21, ONBOARD: 30,
};

const order = (s: DealStage) => STAGES.findIndex((x) => x.id === s);

type DealCtx = Awaited<ReturnType<typeof loadDeal>>;

export async function loadDeal(db: PrismaClient, dealId: string) {
  return db.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: {
      account: { include: { contacts: { select: { id: true, name: true } } } },
      activities: { select: { type: true, at: true } },
      documents: { select: { kind: true, status: true } },
      approvals: { select: { status: true } },
    },
  });
}

/** What still blocks leaving `from` (one stage's exit rule). Empty list = rule met. */
export function exitGaps(deal: DealCtx, from: DealStage): string[] {
  const gaps: string[] = [];
  const meetings = deal.activities.filter((a) => a.type === "MEETING");
  switch (from) {
    case "TARGET":
      if (deal.account.contacts.length === 0) gaps.push("Add at least one contact to the account");
      break;
    case "OUTREACH":
      if (meetings.length === 0) gaps.push("Log the booked or held meeting");
      break;
    case "DISCOVERY":
      if (!deal.pain?.trim()) gaps.push("Record the client's pain");
      if (deal.budgetInr == null) gaps.push("Record the confirmed budget");
      break;
    case "PROTOTYPE_DEMO":
      if (meetings.length < 2) gaps.push("Log the demo meeting");
      if (!deal.championContactId) gaps.push("Name the champion");
      break;
    case "MOU_SCOPING":
      if (!deal.documents.some((d) => d.kind === "MOU" && d.status === "SIGNED")) gaps.push("Record the signed MOU");
      break;
    case "MSA_SOW":
      if (!deal.documents.some((d) => d.kind === "MSA" && d.status === "SIGNED")) gaps.push("Record the signed MSA");
      if (!deal.valueInr) gaps.push("Set the deal value");
      if (deal.approvals.some((a) => a.status === "PENDING")) gaps.push("Wait for the pending founder approval");
      if (deal.discountPct > DISCOUNT_LIMIT_PCT && !deal.approvals.some((a) => a.status === "APPROVED"))
        gaps.push(`Discount above ${DISCOUNT_LIMIT_PCT}% needs founder approval`);
      break;
    case "ONBOARD":
      if (!deal.liveAt) gaps.push("Mark the client live in production");
      break;
  }
  return gaps;
}

export interface MoveCheck { ok: boolean; gaps: string[] }

/**
 * Forward moves go one stage at a time and need the current stage's exit rule.
 * Backward moves are always allowed; LOST needs a reason. Contract stages need Director or Founder.
 */
export function checkMove(deal: DealCtx, to: DealStage, role: Role, lostReason?: string): MoveCheck {
  if (to === deal.stage) return { ok: false, gaps: ["The deal is already in this stage"] };
  if (to === "LOST") return lostReason?.trim() ? { ok: true, gaps: [] } : { ok: false, gaps: ["Give a reason for losing the deal"] };
  if (deal.stage === "LOST") return { ok: true, gaps: [] }; // reopen anywhere
  const from = order(deal.stage), target = order(to);
  if (target < from) return { ok: true, gaps: [] };
  if (target > from + 1) return { ok: false, gaps: ["Move one stage at a time so each exit rule is checked"] };
  const gaps = exitGaps(deal, deal.stage);
  if ((to === "MOU_SCOPING" || to === "MSA_SOW" || to === "ONBOARD") && !can(role, "deals.contract"))
    gaps.push("Only the Director or Founder can move a deal into contract stages");
  return { ok: gaps.length === 0, gaps };
}

export async function moveDeal(db: PrismaClient, dealId: string, to: DealStage, user: { id: string; role: Role }, lostReason?: string) {
  const deal = await loadDeal(db, dealId);
  const check = checkMove(deal, to, user.role, lostReason);
  if (!check.ok) return check;
  await db.$transaction([
    db.deal.update({
      where: { id: dealId },
      data: { stage: to, stageChangedAt: new Date(), lostReason: to === "LOST" ? lostReason!.trim() : deal.lostReason },
    }),
    db.activity.create({
      data: {
        orgId: deal.orgId, type: "STAGE_CHANGE", userId: user.id, dealId, accountId: deal.accountId,
        body: `${STAGE_LABEL[deal.stage]} → ${STAGE_LABEL[to]}${to === "LOST" ? `: ${lostReason}` : ""}`,
      },
    }),
    db.auditLog.create({
      data: { orgId: deal.orgId, actorId: user.id, entity: "Deal", entityId: dealId, action: "stage", diff: { from: deal.stage, to } },
    }),
  ]);
  return check;
}

export function isStuck(d: { stage: DealStage; stageChangedAt: Date; nextStepAt: Date | null }, now = new Date()): string | null {
  const limit = STUCK_DAYS[d.stage];
  if (!limit) return null;
  const days = Math.floor((now.getTime() - d.stageChangedAt.getTime()) / 86_400_000);
  if (days > limit) return `${days} days in stage (limit ${limit})`;
  if (!d.nextStepAt) return "No next step";
  if (d.nextStepAt < new Date(now.getTime() - 86_400_000)) return "Next step overdue";
  return null;
}
