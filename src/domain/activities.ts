import type { PrismaClient, ActivityType } from "@prisma/client";

export const CALL_OUTCOMES = ["Connected", "Replied", "No answer", "Call back later", "Meeting booked", "Not interested", "Wrong number"];

export interface LogInput {
  orgId: string;
  userId: string;
  accountId: string;
  dealId?: string | null;
  contactId?: string | null;
  type: Extract<ActivityType, "CALL" | "MEETING" | "NOTE" | "EMAIL" | "WHATSAPP">;
  outcome?: string | null;
  body?: string | null;
  at?: Date;
  /** Required for calls and meetings: every touch ends with a dated next step. */
  nextStep?: string | null;
  nextStepAt?: Date | null;
}

export async function logActivity(db: PrismaClient, i: LogInput) {
  const needsNext = i.type === "CALL" || i.type === "MEETING";
  const closes = i.outcome === "Not interested" || i.outcome === "Wrong number";
  if (needsNext && !closes && (!i.nextStep?.trim() || !i.nextStepAt)) throw new Error("Add the next step and its date.");
  return db.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        orgId: i.orgId, userId: i.userId, accountId: i.accountId, dealId: i.dealId || null, contactId: i.contactId || null,
        type: i.type, outcome: i.outcome || null, body: i.body?.trim() || null, at: i.at ?? new Date(), direction: "out",
      },
    });
    if (i.nextStep?.trim() && i.nextStepAt) {
      await tx.task.create({
        data: {
          orgId: i.orgId, ownerId: i.userId, title: i.nextStep.trim(), dueAt: i.nextStepAt,
          entity: i.dealId ? "Deal" : "Account", entityId: i.dealId || i.accountId,
        },
      });
      if (i.dealId) await tx.deal.update({ where: { id: i.dealId }, data: { nextStep: i.nextStep.trim(), nextStepAt: i.nextStepAt } });
    }
    return activity;
  });
}
