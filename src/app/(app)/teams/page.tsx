import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireCan } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/roles";
import { str, day, todayIst } from "@/lib/format";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/Flash";
import { ProgressBanner } from "@/components/ProgressBanner";
import { progressCounts, stageWhere } from "@/domain/assign";
import { isStuck } from "@/domain/deals";

const go = (kind: "ok" | "error", msg: string): never => redirect(`/teams?${kind}=${encodeURIComponent(msg)}`);
const TOUCHES = ["CALL", "EMAIL", "WHATSAPP", "MEETING"] as const;

async function saveTeam(fd: FormData) {
  "use server";
  const me = await requireCan("teams.manage");
  const id = str(fd.get("id"));
  const name = str(fd.get("name"));
  const leadId = str(fd.get("leadId")) || null;
  if (!name) go("error", "Give the team a name.");
  if (leadId && !(await db.user.findFirst({ where: { id: leadId, orgId: me.orgId, active: true } }))) go("error", "Choose an active person as team lead.");
  const clash = await db.team.findFirst({ where: { orgId: me.orgId, name, NOT: id ? { id } : undefined } });
  if (clash) go("error", `There is already a team called ${name}.`);
  const team = id
    ? await db.team.update({ where: { id, orgId: me.orgId }, data: { name, leadId } })
    : await db.team.create({ data: { orgId: me.orgId, name, leadId } });
  // The lead belongs to the team they lead.
  if (leadId) await db.user.update({ where: { id: leadId }, data: { teamId: team.id } });
  await audit(me.orgId, me.id, "Team", team.id, id ? "update" : "create", { name, leadId });
  go("ok", id ? "Team saved." : `${name} created.`);
}

async function setMember(fd: FormData) {
  "use server";
  const me = await requireCan("teams.manage");
  const userId = str(fd.get("userId"));
  const teamId = str(fd.get("teamId")) || null;
  const person = await db.user.findFirst({ where: { id: userId, orgId: me.orgId } });
  if (!person) go("error", "Person not found.");
  if (teamId && !(await db.team.findFirst({ where: { id: teamId, orgId: me.orgId } }))) go("error", "Team not found.");
  const leads = await db.team.findFirst({ where: { leadId: userId, NOT: teamId ? { id: teamId } : undefined } });
  if (leads) go("error", `${person!.name} leads ${leads.name}. Choose another lead for it first.`);
  await db.user.update({ where: { id: userId }, data: { teamId } });
  await audit(me.orgId, me.id, "User", userId, "team", { teamId });
  go("ok", teamId ? `${person!.name} added to the team.` : `${person!.name} removed from the team. Accounts they own stay with them.`);
}

export default async function Teams({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manage = can(user.role, "teams.manage");
  const allTeams = await db.team.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    include: { lead: { select: { id: true, name: true } }, members: { where: { active: true }, orderBy: { name: "asc" } } },
  });
  const teams = manage ? allTeams : allTeams.filter((t) => t.id === user.teamId || t.leadId === user.id);
  const people = manage ? await db.user.findMany({ where: { orgId: user.orgId, active: true }, orderBy: { name: "asc" } }) : [];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const sections = await Promise.all(teams.map(async (t) => {
    const ids = t.members.map((m) => m.id);
    const [counts, deals, overdue, touches, lastTouch, owned, contacted, responded] = await Promise.all([
      progressCounts(db, user.orgId, { teamId: t.id }),
      db.deal.findMany({ where: { orgId: user.orgId, ownerId: { in: ids }, stage: { not: "LOST" } }, select: { ownerId: true, stage: true, stageChangedAt: true, nextStepAt: true } }),
      // Overdue means due before today (IST), as on My day.
      db.task.groupBy({ by: ["ownerId"], where: { orgId: user.orgId, ownerId: { in: ids }, done: false, dueAt: { lt: todayIst().start } }, _count: true }),
      db.activity.groupBy({ by: ["userId"], where: { orgId: user.orgId, userId: { in: ids }, at: { gte: weekAgo }, type: { in: [...TOUCHES] } }, _count: true }),
      db.activity.groupBy({ by: ["userId"], where: { orgId: user.orgId, userId: { in: ids }, type: { in: [...TOUCHES] } }, _max: { at: true } }),
      db.account.groupBy({ by: ["ownerId"], where: { orgId: user.orgId, ownerId: { in: ids } }, _count: true }),
      db.account.groupBy({ by: ["ownerId"], where: { orgId: user.orgId, ownerId: { in: ids }, ...stageWhere("contacted") }, _count: true }),
      db.account.groupBy({ by: ["ownerId"], where: { orgId: user.orgId, ownerId: { in: ids }, ...stageWhere("responded") }, _count: true }),
    ]);
    const n = (rows: { ownerId?: string | null; userId?: string | null; _count: number }[], id: string) => rows.find((r) => (r.ownerId ?? r.userId) === id)?._count ?? 0;
    const rows = t.members.map((m) => {
      const mine = deals.filter((d) => d.ownerId === m.id);
      return {
        m,
        owned: n(owned, m.id), contacted: n(contacted, m.id), responded: n(responded, m.id),
        deals: mine.length, stuck: mine.filter((d) => isStuck(d, now)).length,
        overdue: n(overdue, m.id), touches: n(touches, m.id),
        last: lastTouch.find((r) => r.userId === m.id)?._max.at ?? null,
      };
    });
    return { t, counts, rows };
  }));
  const pool = can(user.role, "accounts.assign") ? await db.account.count({ where: { orgId: user.orgId, ...stageWhere("unassigned") } }) : 0;

  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Teams</h1>
          <p className="muted" style={{ margin: 0 }}>New leads go to a team&apos;s queue; the team lead or any member picks them up. Figures for each person count the accounts and deals they own.</p>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {pool > 0 && (
        <div className="notice row" style={{ justifyContent: "space-between" }}>
          <span>{pool} new {pool === 1 ? "lead is" : "leads are"} not assigned to a team yet.</span>
          <Link className="btn btn-sm btn-primary" href="/accounts?status=unassigned">Assign them</Link>
        </div>
      )}
      {teams.length === 0 && (
        <p className="muted">{manage ? "No teams yet. Create the first one below and name its lead." : "You are not in a team yet. Ask the Sales Lead to add you."}</p>
      )}

      {sections.map(({ t, counts, rows }) => (
        <section key={t.id} className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: 0 }}>{t.name}</h2>
              <div className="faint">Lead: {t.lead?.name ?? "none"} · {t.members.length} {t.members.length === 1 ? "member" : "members"}</div>
            </div>
            <Link className="btn btn-sm" href={`/accounts?team=${t.id}&status=queue`}>Open the queue ({counts.queue})</Link>
          </div>
          <ProgressBanner counts={counts} query={`&team=${t.id}`} label={`${t.name} progress`} />
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Person</th><th className="num">Accounts</th><th className="num">Contacted</th><th className="num">Responded</th>
                  <th className="num">Open deals</th><th className="num">Stuck</th><th className="num">Overdue tasks</th><th className="num">Touches (7 days)</th><th>Last touch</th>
                  {manage && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.m.id}>
                    <td><strong>{r.m.name}</strong>{r.m.id === t.leadId && <span className="badge" style={{ marginLeft: 6 }}>Lead</span>}<div className="faint">{ROLE_LABEL[r.m.role]}</div></td>
                    <td className="num">{r.owned}</td>
                    <td className="num">{r.contacted}</td>
                    <td className="num">{r.responded}</td>
                    <td className="num">{r.deals}</td>
                    <td className="num">{r.stuck ? <span className="badge bad">{r.stuck}</span> : 0}</td>
                    <td className="num">{r.overdue ? <span className="badge warn">{r.overdue}</span> : 0}</td>
                    <td className="num">{r.touches}</td>
                    <td className="faint">{r.last ? day(r.last) : "never"}</td>
                    {manage && (
                      <td>
                        {r.m.id !== t.leadId && (
                          <form action={setMember}>
                            <input type="hidden" name="userId" value={r.m.id} /><input type="hidden" name="teamId" value="" />
                            <button className="btn btn-sm">Remove</button>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={manage ? 10 : 9} className="muted">No members yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {manage && (
            <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
              <form action={setMember} className="row">
                <input type="hidden" name="teamId" value={t.id} />
                <select name="userId" required defaultValue="">
                  <option value="" disabled>Add a member…</option>
                  {people.filter((p) => p.teamId !== t.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {ROLE_LABEL[p.role]}{p.teamId ? ` (moves from ${allTeams.find((x) => x.id === p.teamId)?.name})` : ""}</option>
                  ))}
                </select>
                <button className="btn btn-sm">Add</button>
              </form>
              <details>
                <summary>Rename or change lead</summary>
                <form action={saveTeam} className="row" style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={t.id} />
                  <input name="name" defaultValue={t.name} required />
                  <select name="leadId" defaultValue={t.leadId ?? ""}>
                    <option value="">No lead</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button className="btn btn-sm">Save</button>
                </form>
              </details>
            </div>
          )}
        </section>
      ))}

      {manage && (
        <section className="card">
          <h2>Create a team</h2>
          <form action={saveTeam} className="row">
            <input name="name" required placeholder="Team name, e.g. Chennai sales" />
            <select name="leadId" defaultValue={people.find((p) => p.role === "SALES_LEAD")?.id ?? ""}>
              <option value="">Team lead…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLE_LABEL[p.role]}</option>)}
            </select>
            <button className="btn btn-primary">Create</button>
          </form>
          <p className="faint" style={{ marginBottom: 0 }}>The team lead joins the team automatically. The Sales Lead can lead a team too.</p>
        </section>
      )}
    </div>
  );
}
