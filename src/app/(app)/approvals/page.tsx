import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { inr, when } from "@/lib/format";
import { str } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { decideApproval } from "@/domain/approvals";

async function decide(fd: FormData) {
  "use server";
  const user = await requireCan("approvals.decide");
  const id = str(fd.get("approvalId"));
  const a = await db.approval.findFirst({ where: { id, orgId: user.orgId } });
  if (!a) redirect("/approvals?error=Not%20found");
  try {
    await decideApproval(db, id, fd.get("decision") === "approve", str(fd.get("note")), user);
  } catch (e) {
    redirect(`/approvals?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/approvals?ok=${fd.get("decision") === "approve" ? "Approved." : "Rejected."}`);
}

export default async function Approvals({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireCan("approvals.decide");
  const sp = await searchParams;
  const [pending, recent] = await Promise.all([
    db.approval.findMany({ where: { orgId: user.orgId, status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { deal: { include: { account: { select: { name: true } } } } } }),
    db.approval.findMany({ where: { orgId: user.orgId, status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 20, include: { deal: { select: { title: true } } } }),
  ]);
  const names = Object.fromEntries((await db.user.findMany({ where: { orgId: user.orgId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <div className="stack">
      <div className="head"><div><h1>Approvals</h1><p className="muted" style={{ margin: 0 }}>Discounts above the limit, edited clauses and off-list pricing wait here for you.</p></div></div>
      <Flash ok={sp.ok} error={sp.error} />
      {pending.length === 0 && <p className="card faint">Nothing waiting.</p>}
      {pending.map((a) => (
        <section className="card stack" key={a.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <span className="badge warn">{a.kind.toLowerCase()}</span>{" "}
              <Link href={`/deals/${a.dealId}`}><strong>{a.deal.account.name}</strong> · {a.deal.title}</Link>
              <div className="faint">Requested by {names[a.requestedById] ?? "—"} · {when(a.createdAt)} · deal value {inr(a.deal.valueInr)}</div>
            </div>
            {a.discountPct != null && <div className="kpi">{a.discountPct}%</div>}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{a.detail}</div>
          <form action={decide} className="row">
            <input type="hidden" name="approvalId" value={a.id} />
            <input name="note" placeholder="Note to the team (optional)" style={{ flex: 1, minWidth: 220 }} />
            <button className="btn btn-primary" name="decision" value="approve">Approve</button>
            <button className="btn btn-danger" name="decision" value="reject">Reject</button>
          </form>
        </section>
      ))}
      {recent.length > 0 && (
        <section className="card">
          <h2>Recently decided</h2>
          <table>
            <tbody>
              {recent.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/deals/${a.dealId}`}>{a.deal.title}</Link></td>
                  <td>{a.kind.toLowerCase()}{a.discountPct != null ? ` ${a.discountPct}%` : ""}</td>
                  <td><span className={`badge ${a.status === "APPROVED" ? "good" : "bad"}`}>{a.status.toLowerCase()}</span></td>
                  <td className="faint">{when(a.decidedAt)}{a.decisionNote ? ` · ${a.decisionNote}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
