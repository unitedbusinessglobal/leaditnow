import Link from "next/link";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { inr, day } from "@/lib/format";
import { STAGES, STAGE_LABEL, SERVICE_LINES, isStuck } from "@/domain/deals";

export default async function Dashboard() {
  const user = await requireCan("dashboard.view");
  const orgId = user.orgId;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [deals, users, acts, accounts, highNeed, won, pendingApprovals] = await Promise.all([
    db.deal.findMany({ where: { orgId }, include: { account: { select: { name: true } }, owner: { select: { name: true } } } }),
    db.user.findMany({ where: { orgId, active: true }, orderBy: { name: "asc" } }),
    db.activity.groupBy({ by: ["userId", "type"], where: { orgId, at: { gte: weekAgo }, type: { not: "STAGE_CHANGE" } }, _count: true }),
    db.account.count({ where: { orgId } }),
    db.account.count({ where: { orgId, needLabel: "High" } }),
    db.deal.count({ where: { orgId, stage: { in: ["ONBOARD", "RENEW_EXPAND"] } } }),
    db.approval.count({ where: { orgId, status: "PENDING" } }),
  ]);
  const open = deals.filter((d) => d.stage !== "LOST");
  const stuck = open.map((d) => ({ d, why: isStuck(d) })).filter((x) => x.why);
  const pipelineValue = open.filter((d) => d.stage !== "ONBOARD" && d.stage !== "RENEW_EXPAND").reduce((t, d) => t + (d.valueInr ?? 0), 0);
  const reached = (i: number) => deals.filter((d) => d.stage !== "LOST" && STAGES.findIndex((s) => s.id === d.stage) >= i).length;
  const count = (uid: string, type: string) => acts.find((a) => a.userId === uid && a.type === type)?._count ?? 0;

  return (
    <div className="stack">
      <div className="head">
        <div><h1>Dashboard</h1><p className="muted" style={{ margin: 0 }}>The whole India pipeline at a glance.</p></div>
        {pendingApprovals > 0 && user.role === "FOUNDER" && <Link className="btn btn-primary" href="/approvals">{pendingApprovals} approval{pendingApprovals === 1 ? "" : "s"} waiting</Link>}
      </div>
      <div className="grid4">
        <div className="card"><div className="kpi">{accounts}</div><div className="faint">accounts · {highNeed} high need</div></div>
        <div className="card"><div className="kpi">{open.length}</div><div className="faint">open deals</div></div>
        <div className="card"><div className="kpi">{inr(pipelineValue)}</div><div className="faint">pipeline value (pre-onboard)</div></div>
        <div className="card"><div className="kpi">{won}</div><div className="faint">clients signed</div></div>
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Pipeline by stage</h2>
          <table>
            <thead><tr><th>Stage</th><th className="num">Deals</th><th className="num">Value</th><th className="num">Reached</th></tr></thead>
            <tbody>
              {STAGES.map((s, i) => {
                const col = open.filter((d) => d.stage === s.id);
                return (
                  <tr key={s.id}>
                    <td>{i + 1}. {s.label}</td>
                    <td className="num">{col.length}</td>
                    <td className="num">{inr(col.reduce((t, d) => t + (d.valueInr ?? 0), 0))}</td>
                    <td className="num">{reached(i)}</td>
                  </tr>
                );
              })}
              <tr><td>Lost</td><td className="num">{deals.length - open.length}</td><td /><td /></tr>
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>By service line</h2>
          <table>
            <thead><tr><th>Service line</th><th className="num">Open</th><th className="num">Value</th></tr></thead>
            <tbody>
              {SERVICE_LINES.map((l) => {
                const col = open.filter((d) => d.serviceLine === l);
                if (col.length === 0) return null;
                return <tr key={l}><td>{l}</td><td className="num">{col.length}</td><td className="num">{inr(col.reduce((t, d) => t + (d.valueInr ?? 0), 0))}</td></tr>;
              })}
              {open.length === 0 && <tr><td className="faint" colSpan={3}>No open deals.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <h2>Stuck deals ({stuck.length})</h2>
        {stuck.length === 0 && <p className="faint">None: every open deal has a next step and is within its stage time limit.</p>}
        <table>
          <tbody>
            {stuck.map(({ d, why }) => (
              <tr key={d.id}>
                <td><Link href={`/deals/${d.id}`}>{d.account.name}</Link><div className="faint">{d.title}</div></td>
                <td>{STAGE_LABEL[d.stage]}</td>
                <td style={{ color: "var(--bad)" }}>{why}</td>
                <td>{d.owner?.name ?? "—"}</td>
                <td className="faint">since {day(d.stageChangedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Activity in the last 7 days</h2>
        <table>
          <thead><tr><th>Person</th><th className="num">Calls</th><th className="num">Meetings</th><th className="num">Emails</th><th className="num">WhatsApp</th><th className="num">Notes</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                {["CALL", "MEETING", "EMAIL", "WHATSAPP", "NOTE"].map((t) => <td key={t} className="num">{count(u.id, t)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
