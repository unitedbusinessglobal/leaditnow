import type { PrismaClient, Prisma, Role } from "@prisma/client";
import { can } from "@/lib/roles";

/**
 * Who works an account.
 * - New accounts from searches, the review list and imports start unassigned (no team, no owner).
 * - The Founder, Director and Sales Lead assign accounts to a team or a person, and can take them back.
 * - A team lead hands accounts in the team to a member, or puts them back in the team queue.
 * - A team member picks up an account waiting in the team queue, or releases their own back to it.
 */
export interface Actor { id: string; role: Role; teamId: string | null; leadOf: string[] }
export interface Holding { ownerId: string | null; teamId: string | null }
export interface Target { teamId: string | null; ownerId: string | null }
/** The person the account would go to (when there is one). */
export interface Person { id: string; teamId: string | null; active: boolean }

export type AssignKind = "assign" | "pickup" | "release" | "handover";

export function checkAssign(actor: Actor, from: Holding, to: Target, person?: Person | null): { ok: true; kind: AssignKind } | { ok: false; error: string } {
  if (to.ownerId && (!person || person.id !== to.ownerId || !person.active)) return { ok: false, error: "That person is not an active team member." };
  if (from.ownerId === to.ownerId && from.teamId === to.teamId) return { ok: false, error: "Nothing changed." };
  if (can(actor.role, "accounts.assign")) return { ok: true, kind: "assign" };

  const team = from.teamId;
  const sameTeam = to.teamId === team;
  if (team && actor.leadOf.includes(team)) {
    if (!sameTeam) return { ok: false, error: "Only the Sales Lead, Director or Founder can move an account to another team." };
    if (to.ownerId && person!.teamId !== team) return { ok: false, error: "You can only hand accounts to members of your team." };
    return { ok: true, kind: to.ownerId ? "handover" : "release" };
  }
  if (team && actor.teamId === team && sameTeam) {
    if (!from.ownerId && to.ownerId === actor.id) return { ok: true, kind: "pickup" };
    if (from.ownerId === actor.id && !to.ownerId) return { ok: true, kind: "release" };
    return { ok: false, error: "You can pick up accounts waiting in your team's queue, or put your own back. Ask your team lead to hand one over." };
  }
  if (!team) return { ok: false, error: "This account is not assigned to a team yet. The Sales Lead assigns new accounts." };
  return { ok: false, error: "This account belongs to another team." };
}

export async function actorFor(db: PrismaClient, user: { id: string; role: Role; teamId: string | null }): Promise<Actor> {
  const led = await db.team.findMany({ where: { leadId: user.id }, select: { id: true } });
  return { id: user.id, role: user.role, teamId: user.teamId, leadOf: led.map((t) => t.id) };
}

/** Tomorrow 09:00 IST (03:30 UTC). */
export function tomorrowMorningIst(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 3, 30));
}

/**
 * Move an account to a team and/or person. The person's team is used when no team is given.
 * Open deals and open tasks of the previous owner follow the account to the new owner.
 */
export async function assignAccount(
  db: PrismaClient,
  orgId: string,
  actorUser: { id: string; role: Role; teamId: string | null; name: string },
  accountId: string,
  to: Target,
  note?: string | null,
): Promise<{ kind: AssignKind; summary: string }> {
  const account = await db.account.findFirst({ where: { id: accountId, orgId }, include: { team: true, owner: true } });
  if (!account) throw new Error("Account not found.");
  const person = to.ownerId ? await db.user.findFirst({ where: { id: to.ownerId, orgId } }) : null;
  // Giving it to a person puts it in that person's team (or keeps the current team if they have none).
  const target: Target = { ownerId: to.ownerId, teamId: to.teamId ?? (to.ownerId ? person?.teamId ?? account.teamId : null) };
  if (target.teamId && !(await db.team.findFirst({ where: { id: target.teamId, orgId } }))) throw new Error("Team not found.");
  const actor = await actorFor(db, actorUser);
  const check = checkAssign(actor, { ownerId: account.ownerId, teamId: account.teamId }, target, person);
  if (!check.ok) throw new Error(check.error);
  const team = target.teamId ? await db.team.findUnique({ where: { id: target.teamId } }) : null;

  const summary =
    check.kind === "pickup" ? `Picked up by ${actorUser.name}` :
    check.kind === "release" ? `Put back in the ${team?.name ?? "team"} queue by ${actorUser.name}` :
    person ? `Assigned to ${person.name}${team ? ` (${team.name})` : ""} by ${actorUser.name}` :
    team ? `Assigned to the ${team.name} queue by ${actorUser.name}` :
    `Unassigned by ${actorUser.name}`;

  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id: accountId }, data: { ownerId: target.ownerId, teamId: target.teamId, assignedAt: new Date() } });
    if (target.ownerId) {
      // Open deals the previous owner (or nobody) held follow the account.
      await tx.deal.updateMany({
        where: { accountId, stage: { notIn: ["LOST"] }, OR: [{ ownerId: null }, ...(account.ownerId ? [{ ownerId: account.ownerId }] : [])] },
        data: { ownerId: target.ownerId },
      });
      if (account.ownerId && account.ownerId !== target.ownerId) {
        const deals = await tx.deal.findMany({ where: { accountId }, select: { id: true } });
        await tx.task.updateMany({
          where: { ownerId: account.ownerId, done: false, OR: [{ entity: "Account", entityId: accountId }, { entity: "Deal", entityId: { in: deals.map((d) => d.id) } }] },
          data: { ownerId: target.ownerId },
        });
      }
    }
    await tx.activity.create({
      data: { orgId, type: "NOTE", outcome: "Assigned", userId: actorUser.id, accountId, body: note?.trim() ? `${summary}: ${note.trim()}` : summary },
    });
    if (target.ownerId && target.ownerId !== actorUser.id) {
      await tx.task.create({
        data: {
          orgId, ownerId: target.ownerId, assignedById: actorUser.id, dueAt: tomorrowMorningIst(),
          title: `Pick up ${account.name}${note?.trim() ? `: ${note.trim()}` : ""}`, entity: "Account", entityId: accountId,
        },
      });
    }
    await tx.auditLog.create({
      data: { orgId, actorId: actorUser.id, entity: "Account", entityId: accountId, action: check.kind, diff: { from: { ownerId: account.ownerId, teamId: account.teamId }, to: { ...target } } as Prisma.InputJsonValue },
    });
  });
  return { kind: check.kind, summary };
}

/** Whom an actor may give tasks to: themselves, their team if they lead it, anyone if they assign org-wide. */
export function canGiveTask(actor: Actor, assignee: Person): boolean {
  if (assignee.id === actor.id) return true;
  if (!assignee.active) return false;
  if (can(actor.role, "accounts.assign")) return true;
  return !!assignee.teamId && actor.leadOf.includes(assignee.teamId);
}

// ---------- Progress funnel ----------

export const RESPONSE_OUTCOMES = ["Connected", "Call back later", "Meeting booked", "Replied"];
const TOUCHES = ["CALL", "EMAIL", "WHATSAPP", "MEETING"] as const;

export type Stage = "unassigned" | "queue" | "working" | "contacted" | "responded" | "deal" | "signed";

export const STAGE_LABEL: Record<Stage, string> = {
  unassigned: "New, unassigned",
  queue: "Waiting in a team queue",
  working: "Being worked on",
  contacted: "Contacted",
  responded: "Responded",
  deal: "Deal started",
  signed: "Contract signed",
};

/** Account filter for each banner figure. Each figure counts accounts that have reached that point. */
export function stageWhere(stage: Stage): Prisma.AccountWhereInput {
  switch (stage) {
    case "unassigned": return { teamId: null, ownerId: null };
    case "queue": return { teamId: { not: null }, ownerId: null };
    case "working": return { ownerId: { not: null } };
    case "contacted": return { activities: { some: { type: { in: [...TOUCHES] } } } };
    case "responded": return { activities: { some: { OR: [{ outcome: { in: RESPONSE_OUTCOMES } }, { type: "MEETING" }, { direction: "in" }] } } };
    case "deal": return { deals: { some: { stage: { not: "LOST" } } } };
    case "signed": return { deals: { some: { OR: [{ documents: { some: { kind: { in: ["MOU", "MSA"] }, status: "SIGNED" } } }, { stage: { in: ["ONBOARD", "RENEW_EXPAND"] } }] } } };
  }
}

export const STAGES = Object.keys(STAGE_LABEL) as Stage[];

export async function progressCounts(db: PrismaClient, orgId: string, scope: Prisma.AccountWhereInput = {}): Promise<Record<Stage, number>> {
  const counts = await Promise.all(STAGES.map((s) => db.account.count({ where: { orgId, AND: [scope, stageWhere(s)] } })));
  return Object.fromEntries(STAGES.map((s, i) => [s, counts[i]])) as Record<Stage, number>;
}

// ---------- Choices for the assign controls ----------

export interface TeamLite { id: string; name: string; leadId: string | null; members: { id: string; name: string; role: Role; active: boolean }[] }
export interface OptionGroup { label: string; options: { value: string; label: string }[] }

/**
 * What an actor can choose in "Assign to". Org-wide assigners see every team, its members and people outside teams;
 * a team lead sees their own team's queue and members. `accountTeamId` narrows a team lead to that account's team.
 */
export function assignOptions(actor: Actor, teams: TeamLite[], outsiders: { id: string; name: string; role: Role }[], accountTeamId?: string | null): OptionGroup[] {
  const orgWide = can(actor.role, "accounts.assign");
  const visible = orgWide ? teams : teams.filter((t) => actor.leadOf.includes(t.id) && (accountTeamId === undefined || accountTeamId === t.id));
  const groups: OptionGroup[] = [];
  const people = (t: TeamLite) => t.members.filter((m) => m.active && m.role !== "INTERN").sort((a, b) => a.name.localeCompare(b.name));
  if (visible.length) groups.push({ label: "Team queue (any member can pick it up)", options: visible.map((t) => ({ value: `team:${t.id}`, label: `${t.name} queue` })) });
  for (const t of visible) {
    const ms = people(t);
    if (ms.length) groups.push({ label: `${t.name} members`, options: ms.map((m) => ({ value: `user:${m.id}`, label: `${m.name}${m.id === t.leadId ? " (team lead)" : ""}` })) });
  }
  if (orgWide) {
    const rest = outsiders.filter((u) => u.role !== "INTERN");
    if (rest.length) groups.push({ label: "Not in a team", options: rest.map((u) => ({ value: `user:${u.id}`, label: u.name })) });
    groups.push({ label: "Take back", options: [{ value: "none", label: "Unassigned (new leads pool)" }] });
  }
  return groups;
}

/** Load teams with members, and active people outside any team, for the assign controls. */
export async function loadTeams(db: PrismaClient, orgId: string) {
  const [teams, outsiders] = await Promise.all([
    db.team.findMany({ where: { orgId }, orderBy: { name: "asc" }, include: { members: { select: { id: true, name: true, role: true, active: true } }, lead: { select: { id: true, name: true } } } }),
    db.user.findMany({ where: { orgId, active: true, teamId: null }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
  ]);
  return { teams, outsiders };
}
