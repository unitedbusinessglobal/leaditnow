import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { inr, day } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { STAGES, SERVICE_LINES, isStuck } from "@/domain/deals";
import { move } from "../deals/actions";

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ owner?: string; line?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const where: Prisma.DealWhereInput = { orgId: user.orgId, stage: { not: "LOST" } };
  if (sp.owner === "me") where.ownerId = user.id;
  if (sp.line) where.serviceLine = sp.line;
  const deals = await db.deal.findMany({
    where, orderBy: [{ stageChangedAt: "asc" }],
    include: { account: { select: { name: true } }, owner: { select: { name: true } } },
  });
  const lost = await db.deal.count({ where: { orgId: user.orgId, stage: "LOST" } });
  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Pipeline</h1>
          <p className="muted" style={{ margin: 0 }}>Every deal passes a demo and a paid scoping MOU before the MSA. A red edge means the deal is stuck. {lost} lost.</p>
        </div>
        <form className="row" method="get">
          <select name="owner" defaultValue={sp.owner ?? ""}><option value="">Everyone&apos;s deals</option><option value="me">My deals</option></select>
          <select name="line" defaultValue={sp.line ?? ""}><option value="">All service lines</option>{SERVICE_LINES.map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn">Filter</button>
        </form>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="board">
        {STAGES.map((s, i) => {
          const col = deals.filter((d) => d.stage === s.id);
          const total = col.reduce((t, d) => t + (d.valueInr ?? 0), 0);
          const next = STAGES[i + 1];
          return (
            <div className="col" key={s.id}>
              <h3><span>{i + 1}. {s.label}</span><span className="faint">{col.length}</span></h3>
              <div className="faint">{inr(total)}{s.exit ? ` · exit: ${s.exit.toLowerCase()}` : ""}</div>
              {col.map((d) => {
                const stuck = isStuck(d);
                return (
                  <div className={`deal ${stuck ? "stuck" : ""}`} key={d.id}>
                    <Link href={`/deals/${d.id}`}><strong>{d.account.name}</strong></Link>
                    <div className="faint">{d.serviceLine} · {inr(d.valueInr)}</div>
                    <div className="faint">{d.nextStep ? `${d.nextStep} · ${day(d.nextStepAt)}` : "No next step"}</div>
                    {stuck && <div style={{ color: "var(--bad)", fontSize: 12 }}>{stuck}</div>}
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                      <span className="faint">{d.owner?.name ?? "—"}</span>
                      {next && (
                        <form action={move}>
                          <input type="hidden" name="id" value={d.id} /><input type="hidden" name="to" value={next.id} /><input type="hidden" name="from" value="board" />
                          <button className="btn btn-sm" title={`Move to ${next.label}`}>→</button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
