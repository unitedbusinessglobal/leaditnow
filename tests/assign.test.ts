import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, type Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { checkAssign, canGiveTask, assignOptions, assignAccount, progressCounts, tomorrowMorningIst, type Actor } from "@/domain/assign";
import { upsertAccount } from "@/domain/accounts";
import { logActivity } from "@/domain/activities";
import { ingest } from "@/discovery/ingest";

const T = "team-1";
const actor = (role: Role, over: Partial<Actor> = {}): Actor => ({ id: "me", role, teamId: null, leadOf: [], ...over });
const person = (id: string, teamId: string | null = T) => ({ id, teamId, active: true });

describe("assignment rules", () => {
  it("lets the Founder, Director and Sales Lead assign anything", () => {
    for (const r of ["FOUNDER", "DIRECTOR", "SALES_LEAD"] as Role[]) {
      expect(checkAssign(actor(r), { ownerId: null, teamId: null }, { teamId: T, ownerId: null })).toEqual({ ok: true, kind: "assign" });
    }
  });
  it("does not let a salesperson assign a new, unassigned lead", () => {
    const r = checkAssign(actor("SALES", { teamId: T }), { ownerId: null, teamId: null }, { teamId: null, ownerId: "me" }, person("me"));
    expect(r.ok).toBe(false);
  });
  it("lets a team member pick up from their team queue and put their own back", () => {
    const me = actor("SALES", { teamId: T });
    expect(checkAssign(me, { ownerId: null, teamId: T }, { teamId: T, ownerId: "me" }, person("me"))).toEqual({ ok: true, kind: "pickup" });
    expect(checkAssign(me, { ownerId: "me", teamId: T }, { teamId: T, ownerId: null })).toEqual({ ok: true, kind: "release" });
  });
  it("stops a member taking a colleague's account or another team's queue", () => {
    const me = actor("SALES", { teamId: T });
    expect(checkAssign(me, { ownerId: "x", teamId: T }, { teamId: T, ownerId: "me" }, person("me")).ok).toBe(false);
    expect(checkAssign(me, { ownerId: null, teamId: "other" }, { teamId: "other", ownerId: "me" }, person("me")).ok).toBe(false);
  });
  it("lets a team lead hand over within the team only", () => {
    const lead = actor("SALES", { teamId: T, leadOf: [T] });
    expect(checkAssign(lead, { ownerId: "a", teamId: T }, { teamId: T, ownerId: "b" }, person("b"))).toEqual({ ok: true, kind: "handover" });
    expect(checkAssign(lead, { ownerId: "a", teamId: T }, { teamId: "other", ownerId: "c" }, person("c", "other")).ok).toBe(false);
    expect(checkAssign(lead, { ownerId: null, teamId: T }, { teamId: T, ownerId: "c" }, person("c", "other")).ok).toBe(false);
  });
  it("rejects inactive people and no-op moves", () => {
    expect(checkAssign(actor("FOUNDER"), { ownerId: null, teamId: T }, { teamId: T, ownerId: "z" }, { id: "z", teamId: T, active: false }).ok).toBe(false);
    expect(checkAssign(actor("FOUNDER"), { ownerId: null, teamId: T }, { teamId: T, ownerId: null }).ok).toBe(false);
  });
  it("limits who can be given a task", () => {
    expect(canGiveTask(actor("SALES", { teamId: T }), person("me"))).toBe(true);
    expect(canGiveTask(actor("SALES", { teamId: T }), person("b"))).toBe(false);
    expect(canGiveTask(actor("SALES", { teamId: T, leadOf: [T] }), person("b"))).toBe(true);
    expect(canGiveTask(actor("SALES_LEAD"), person("q", null))).toBe(true);
  });
  it("offers a team lead only their own team", () => {
    const teams = [
      { id: T, name: "Chennai", leadId: "me", members: [{ id: "me", name: "Lead", role: "SALES" as Role, active: true }, { id: "b", name: "Bala", role: "SALES" as Role, active: true }] },
      { id: "t2", name: "Coimbatore", leadId: null, members: [{ id: "c", name: "Chitra", role: "SALES" as Role, active: true }] },
    ];
    const g = assignOptions(actor("SALES", { teamId: T, leadOf: [T] }), teams, [{ id: "f", name: "Founder", role: "FOUNDER" }]);
    const values = g.flatMap((x) => x.options.map((o) => o.value));
    expect(values).toEqual(["team:team-1", "user:b", "user:me"]);
    const all = assignOptions(actor("SALES_LEAD"), teams, [{ id: "f", name: "Founder", role: "FOUNDER" }]).flatMap((x) => x.options.map((o) => o.value));
    expect(all).toEqual(expect.arrayContaining(["team:t2", "user:c", "user:f", "none"]));
  });
  it("dates the pick-up task 09:00 IST the next day", () => {
    expect(tomorrowMorningIst(new Date("2026-11-08T20:00:00Z")).toISOString()).toBe("2026-11-10T03:30:00.000Z");
    expect(tomorrowMorningIst(new Date("2026-11-08T10:00:00Z")).toISOString()).toBe("2026-11-09T03:30:00.000Z");
  });
});

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("assignment on Postgres", () => {
  let db: PrismaClient;
  let pool: Pool;
  let orgId: string;
  let teamId: string;
  const u: Record<string, { id: string; role: Role; teamId: string | null; name: string }> = {};

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    orgId = (await db.organization.create({ data: { name: `Assign ${Date.now()}` } })).id;
    const mk = async (key: string, role: Role) => {
      const x = await db.user.create({ data: { orgId, role, name: key, email: `${key}-${Date.now()}@t.in` } });
      u[key] = { id: x.id, role, teamId: null, name: key };
    };
    await mk("founder", "FOUNDER"); await mk("lead", "SALES_LEAD"); await mk("asha", "SALES"); await mk("bala", "SALES");
    teamId = (await db.team.create({ data: { orgId, name: "Chennai", leadId: u.lead.id } })).id;
    await db.user.updateMany({ where: { id: { in: [u.lead.id, u.asha.id, u.bala.id] } }, data: { teamId } });
    for (const k of ["lead", "asha", "bala"]) u[k].teamId = teamId;
  });
  afterAll(async () => { await db.$disconnect(); await pool.end(); });

  it("puts searched companies in the unassigned pool", async () => {
    await ingest(db, orgId, [{ name: "Kovai Pumps", website: "https://kovaipumps.in", city: "Coimbatore", source: "osm", externalId: "n1" } as never], { ownerId: null, query: "test" });
    const a = await db.account.findFirstOrThrow({ where: { orgId, domain: "kovaipumps.in" } });
    expect([a.ownerId, a.teamId]).toEqual([null, null]);
    expect((await progressCounts(db, orgId)).unassigned).toBe(1);
  });

  it("walks a lead from the pool to a signed contract", async () => {
    const a = await db.account.findFirstOrThrow({ where: { orgId, domain: "kovaipumps.in" } });
    await expect(assignAccount(db, orgId, u.asha, a.id, { teamId, ownerId: u.asha.id })).rejects.toThrow(/not assigned to a team/);
    await assignAccount(db, orgId, u.lead, a.id, { teamId, ownerId: null }, "Pumps maker, needs ERP");
    expect((await progressCounts(db, orgId)).queue).toBe(1);
    const r = await assignAccount(db, orgId, u.asha, a.id, { teamId, ownerId: u.asha.id });
    expect(r.kind).toBe("pickup");
    await expect(assignAccount(db, orgId, u.bala, a.id, { teamId, ownerId: u.bala.id })).rejects.toThrow(/pick up accounts waiting/);

    await logActivity(db, { orgId, userId: u.asha.id, accountId: a.id, type: "CALL", outcome: "No answer", nextStep: "Call again", nextStepAt: new Date(Date.now() + 86400000) });
    let c = await progressCounts(db, orgId);
    expect([c.working, c.contacted, c.responded]).toEqual([1, 1, 0]);
    await logActivity(db, { orgId, userId: u.asha.id, accountId: a.id, type: "EMAIL", outcome: "Replied" });
    const deal = await db.deal.create({ data: { orgId, accountId: a.id, title: "ERP", serviceLine: "ERP", ownerId: u.asha.id } });
    c = await progressCounts(db, orgId);
    expect([c.responded, c.deal, c.signed]).toEqual([1, 1, 0]);

    // The team lead hands it to Bala: the deal and Asha's open task move with it, and Bala gets a pick-up task.
    const h = await assignAccount(db, orgId, u.lead, a.id, { teamId: null, ownerId: u.bala.id }, "Asha is on leave");
    expect(h.summary).toMatch(/Assigned to bala \(Chennai\)/);
    expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).ownerId).toBe(u.bala.id);
    const balaTasks = await db.task.findMany({ where: { ownerId: u.bala.id, done: false } });
    expect(balaTasks.map((t) => t.title).sort()).toEqual(["Call again", "Pick up Kovai Pumps: Asha is on leave"]);
    expect(balaTasks.find((t) => t.title.startsWith("Pick up"))!.assignedById).toBe(u.lead.id);
    expect(await db.activity.count({ where: { accountId: a.id, outcome: "Assigned" } })).toBe(3);

    await db.document.create({ data: { orgId, dealId: deal.id, kind: "MOU", status: "SIGNED" } });
    expect((await progressCounts(db, orgId)).signed).toBe(1);
    expect((await progressCounts(db, orgId, { teamId: "nobody" })).signed).toBe(0);
  });

  it("lets the Founder take an account back to the pool", async () => {
    const a = await db.account.findFirstOrThrow({ where: { orgId, domain: "kovaipumps.in" } });
    await assignAccount(db, orgId, u.founder, a.id, { teamId: null, ownerId: null });
    const after = await db.account.findUniqueOrThrow({ where: { id: a.id } });
    expect([after.ownerId, after.teamId]).toEqual([null, null]);
  });

  it("keeps a hand-added company with the person who added it", async () => {
    const r = await upsertAccount(db, orgId, { domain: "madurai-silks.in", ownerId: u.asha.id, teamId });
    expect([r.account.ownerId, r.account.teamId]).toEqual([u.asha.id, teamId]);
  });
});
