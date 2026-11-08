"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { str, fromDateInput } from "@/lib/format";
import { logActivity } from "@/domain/activities";
import { actorFor, canGiveTask } from "@/domain/assign";

/** Log a call, meeting, note, email or WhatsApp touch; calls and meetings must end with a dated next step. */
export async function logTouch(fd: FormData) {
  const user = await requireCan("activities.log");
  const accountId = str(fd.get("accountId"));
  const dealId = str(fd.get("dealId")) || null;
  const backTo = str(fd.get("backTo")) || `/accounts/${accountId}`;
  const account = await db.account.findFirst({ where: { id: accountId, orgId: user.orgId } });
  if (!account) throw new Error("Account not found");
  const sep = backTo.includes("?") ? "&" : "?";
  try {
    await logActivity(db, {
      orgId: user.orgId, userId: user.id, accountId, dealId,
      contactId: str(fd.get("contactId")) || null,
      type: str(fd.get("type")) as "CALL" | "MEETING" | "NOTE" | "EMAIL" | "WHATSAPP",
      outcome: str(fd.get("outcome")) || null,
      body: str(fd.get("body")),
      nextStep: str(fd.get("nextStep")),
      nextStepAt: fromDateInput(fd.get("nextStepAt")),
    });
  } catch (e) {
    redirect(`${backTo}${sep}error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`${backTo}${sep}ok=${encodeURIComponent("Logged.")}`);
}

export async function completeTask(fd: FormData) {
  const user = await requireCan("activities.log");
  await db.task.updateMany({
    where: { id: str(fd.get("taskId")), orgId: user.orgId, ownerId: user.id },
    data: { done: true, finishedAt: new Date() },
  });
  revalidatePath("/today");
  const backTo = str(fd.get("backTo"));
  if (backTo) redirect(backTo);
}

export async function addTask(fd: FormData) {
  const user = await requireCan("activities.log");
  const title = str(fd.get("title"));
  const dueAt = fromDateInput(fd.get("dueAt"));
  const backTo = str(fd.get("backTo")) || "/today";
  const sep = backTo.includes("?") ? "&" : "?";
  if (!title || !dueAt) redirect(`${backTo}${sep}error=${encodeURIComponent("Add the task and its date.")}`);
  // A task can be given to a team member by their team lead, or to anyone by the Founder, Director or Sales Lead.
  const ownerId = str(fd.get("ownerId")) || user.id;
  const assignee = await db.user.findFirst({ where: { id: ownerId, orgId: user.orgId } });
  if (!assignee || !canGiveTask(await actorFor(db, user), assignee)) redirect(`${backTo}${sep}error=${encodeURIComponent("You can only give tasks to members of a team you lead.")}`);
  await db.task.create({
    data: {
      orgId: user.orgId, ownerId, assignedById: ownerId === user.id ? null : user.id, title, dueAt: dueAt!,
      entity: str(fd.get("entity")) || null, entityId: str(fd.get("entityId")) || null,
    },
  });
  redirect(`${backTo}${sep}ok=${encodeURIComponent(ownerId === user.id ? "Task added." : `Task given to ${assignee!.name}.`)}`);
}
