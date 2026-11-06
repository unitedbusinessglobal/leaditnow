import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { day, when, todayIst, inr } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { STAGE_LABEL, isStuck } from "@/domain/deals";
import { completeTask, addTask } from "./work/actions";

export default async function MyDay({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { start, end } = todayIst();
  const [tasks, myDeals, topAccounts, todays] = await Promise.all([
    db.task.findMany({ where: { orgId: user.orgId, ownerId: user.id, done: false, dueAt: { lt: end } }, orderBy: { dueAt: "asc" }, take: 50 }),
    db.deal.findMany({
      where: { orgId: user.orgId, ownerId: user.id, stage: { notIn: ["LOST", "RENEW_EXPAND"] } },
      include: { account: { select: { name: true } } }, orderBy: { stageChangedAt: "asc" },
    }),
    db.account.findMany({
      where: { orgId: user.orgId, OR: [{ ownerId: user.id }, { ownerId: null }], deals: { none: {} } },
      orderBy: [{ priority: "desc" }], take: 8,
    }),
    db.activity.count({ where: { orgId: user.orgId, userId: user.id, at: { gte: start, lt: end }, type: { not: "STAGE_CHANGE" } } }),
  ]);
  const upcoming = await db.task.findMany({ where: { orgId: user.orgId, ownerId: user.id, done: false, dueAt: { gte: end } }, orderBy: { dueAt: "asc" }, take: 8 });
  const stuck = myDeals.map((d) => ({ d, why: isStuck(d) })).filter((x) => x.why);
  // Link tasks to their account or deal.
  const entityHref = (t: { entity: string | null; entityId: string | null }) =>
    t.entityId ? (t.entity === "Deal" ? `/deals/${t.entityId}` : `/accounts/${t.entityId}`) : null;

  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Good day, {user.name.split(" ")[0]}</h1>
          <p className="muted" style={{ margin: 0 }}>{tasks.length} task{tasks.length === 1 ? "" : "s"} due · {stuck.length} stuck deal{stuck.length === 1 ? "" : "s"} · {todays} touch{todays === 1 ? "" : "es"} logged today</p>
        </div>
        <Link className="btn btn-primary" href="/accounts/new">Add company</Link>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="split">
        <div className="stack">
          <section className="card">
            <h2>Due today and overdue</h2>
            {tasks.length === 0 && <p className="faint">Nothing due. Work the top accounts below.</p>}
            <ul className="timeline">
              {tasks.map((t) => {
                const href = entityHref(t);
                const overdue = t.dueAt < start;
                return (
                  <li key={t.id} className="row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {href ? <Link href={href}>{t.title}</Link> : t.title}
                      <div className={overdue ? "" : "faint"} style={overdue ? { color: "var(--bad)", fontSize: 13 } : undefined}>{overdue ? "Overdue since " : "Due "}{day(t.dueAt)}</div>
                    </span>
                    <form action={completeTask}><input type="hidden" name="taskId" value={t.id} /><input type="hidden" name="backTo" value="/" /><button className="btn btn-sm">Done</button></form>
                  </li>
                );
              })}
            </ul>
            <details style={{ marginTop: 10 }}>
              <summary>Add a task</summary>
              <form action={addTask} className="row" style={{ marginTop: 8 }}>
                <input type="hidden" name="backTo" value="/" />
                <input name="title" required placeholder="What to do" style={{ flex: 1, minWidth: 220 }} />
                <input name="dueAt" type="date" required />
                <button className="btn btn-sm">Add</button>
              </form>
            </details>
          </section>

          <section className="card">
            <h2>Next accounts to work</h2>
            <p className="faint" style={{ marginTop: -6 }}>Highest priority companies with no deal yet, yours or unassigned.</p>
            <table>
              <tbody>
                {topAccounts.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/accounts/${a.id}`}>{a.name}</Link><div className="faint">{a.domain}{a.city ? ` · ${a.city}` : ""}</div></td>
                    <td><span className={`badge ${a.needLabel}`}>{a.needLabel}</span></td>
                    <td>{a.serviceHint ?? ""}</td>
                    <td className="num"><strong>{a.priority}</strong></td>
                  </tr>
                ))}
                {topAccounts.length === 0 && <tr><td className="faint">No accounts waiting. Import a list or add a company.</td></tr>}
              </tbody>
            </table>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>My open deals</h2>
            {myDeals.length === 0 && <p className="faint">None yet.</p>}
            <ul className="timeline">
              {myDeals.map((d) => {
                const why = isStuck(d);
                return (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`}>{d.account.name}</Link> <span className="badge grey">{STAGE_LABEL[d.stage]}</span>
                    <div className="faint">{inr(d.valueInr)} · {d.nextStep ? `${d.nextStep} · ${day(d.nextStepAt)}` : "no next step"}</div>
                    {why && <div style={{ color: "var(--bad)", fontSize: 13 }}>{why}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="card">
            <h2>Coming up</h2>
            {upcoming.length === 0 && <p className="faint">Nothing scheduled.</p>}
            <ul className="timeline">
              {upcoming.map((t) => {
                const href = entityHref(t);
                return <li key={t.id}>{href ? <Link href={href}>{t.title}</Link> : t.title}<div className="faint">{when(t.dueAt)}</div></li>;
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
