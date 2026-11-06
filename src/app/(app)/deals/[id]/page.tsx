import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can, DISCOUNT_LIMIT_PCT } from "@/lib/roles";
import { day, inr, toDateInput, when } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { LogTouch } from "@/components/LogTouch";
import { Timeline } from "@/components/Timeline";
import { STAGES, STAGE_LABEL, SERVICE_LINES, loadDeal, checkMove, isStuck } from "@/domain/deals";
import { updateDeal, move, recordDocument, discount, askApproval, addInvoice, recordPayment, deleteDeal } from "../actions";

export default async function DealPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const found = await db.deal.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
  if (!found) notFound();
  const ctx = await loadDeal(db, id);
  const [deal, users] = await Promise.all([
    db.deal.findUniqueOrThrow({
      where: { id },
      include: {
        account: { include: { contacts: { where: { optedOutAt: null }, select: { id: true, name: true, title: true } } } },
        owner: { select: { name: true } },
        documents: { orderBy: { createdAt: "desc" } },
        approvals: { orderBy: { createdAt: "desc" } },
        invoices: { orderBy: { issuedAt: "desc" } },
        activities: { orderBy: { at: "desc" }, take: 40, include: { user: { select: { name: true } }, contact: { select: { name: true } } } },
      },
    }),
    db.user.findMany({ where: { orgId: user.orgId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const idx = STAGES.findIndex((s) => s.id === deal.stage);
  const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
  const prev = idx > 0 ? STAGES[idx - 1] : null;
  const nextCheck = next ? checkMove(ctx, next.id, user.role) : null;
  const stuck = isStuck(deal);
  const edit = can(user.role, "deals.edit");
  const contract = can(user.role, "deals.contract");
  const money = can(user.role, "invoices.edit");
  const backTo = `/deals/${deal.id}`;

  return (
    <div className="stack">
      <div className="head">
        <div>
          <Link href={`/accounts/${deal.accountId}`} className="faint">← {deal.account.name}</Link>
          <h1>{deal.title}</h1>
          <div className="muted">{deal.serviceLine} · {inr(deal.valueInr)}{deal.discountPct ? ` · ${deal.discountPct}% discount` : ""} · Owner: {deal.owner?.name ?? "—"}{deal.indiaOriginated ? " · India-originated" : ""}</div>
        </div>
        <div className="row">
          <span className={`badge ${deal.stage === "LOST" ? "bad" : ""}`}>{STAGE_LABEL[deal.stage]}</span>
          {stuck && <span className="badge bad">{stuck}</span>}
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="split">
        <div className="stack">
          <section className="card stack">
            <h2>Stage</h2>
            <div className="row" style={{ gap: 4 }}>
              {STAGES.map((s, i) => (
                <span key={s.id} className={`badge ${s.id === deal.stage ? "" : i < idx ? "good" : "grey"}`}>{i + 1}. {s.label}</span>
              ))}
            </div>
            {deal.stage === "LOST" ? (
              <p style={{ margin: 0 }}>Lost: {deal.lostReason}. You can reopen it in any stage.</p>
            ) : next ? (
              <div>
                <p style={{ margin: "0 0 6px" }}>Exit rule for <strong>{STAGES[idx].label}</strong>: {STAGES[idx].exit}.</p>
                {nextCheck && nextCheck.gaps.length > 0 && (
                  <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>{nextCheck.gaps.map((g) => <li key={g} className="muted">{g}</li>)}</ul>
                )}
              </div>
            ) : <p style={{ margin: 0 }}>Final stage: keep renewing and expanding.</p>}
            {edit && (
              <div className="row">
                {next && deal.stage !== "LOST" && (
                  <form action={move}>
                    <input type="hidden" name="id" value={deal.id} /><input type="hidden" name="to" value={next.id} />
                    <button className="btn btn-primary" disabled={!nextCheck?.ok}>Move to {next.label}</button>
                  </form>
                )}
                {prev && deal.stage !== "LOST" && (
                  <form action={move}>
                    <input type="hidden" name="id" value={deal.id} /><input type="hidden" name="to" value={prev.id} />
                    <button className="btn">Back to {prev.label}</button>
                  </form>
                )}
                {deal.stage === "LOST" && (
                  <form action={move} className="row">
                    <input type="hidden" name="id" value={deal.id} />
                    <select name="to" defaultValue="OUTREACH">{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                    <button className="btn">Reopen</button>
                  </form>
                )}
                {deal.stage !== "LOST" && (
                  <details>
                    <summary>Mark lost</summary>
                    <form action={move} className="row" style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={deal.id} /><input type="hidden" name="to" value="LOST" />
                      <input name="lostReason" required placeholder="Reason: price, timing, chose another vendor…" style={{ minWidth: 280 }} />
                      <button className="btn btn-danger">Mark lost</button>
                    </form>
                  </details>
                )}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Log a touch</h2>
            <LogTouch accountId={deal.accountId} dealId={deal.id} contacts={deal.account.contacts} backTo={backTo} />
          </section>

          <section className="card">
            <h2>Timeline</h2>
            <Timeline items={deal.activities} />
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>Deal details</h2>
            <form action={updateDeal} className="form">
              <input type="hidden" name="id" value={deal.id} />
              <label>Title<input name="title" defaultValue={deal.title} disabled={!edit} /></label>
              <label>Service line
                <select name="serviceLine" defaultValue={deal.serviceLine} disabled={!edit}>{SERVICE_LINES.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              <label>Deal value (₹, before GST)<input name="valueInr" defaultValue={deal.valueInr ?? ""} inputMode="numeric" disabled={!edit} /></label>
              <label>Client&apos;s pain, in their words<textarea name="pain" defaultValue={deal.pain ?? ""} disabled={!edit} /></label>
              <label>Confirmed budget (₹)<input name="budgetInr" defaultValue={deal.budgetInr ?? ""} inputMode="numeric" disabled={!edit} /></label>
              <label>Champion
                <select name="championContactId" defaultValue={deal.championContactId ?? ""} disabled={!edit}>
                  <option value="">—</option>
                  {deal.account.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? ` (${c.title})` : ""}</option>)}
                </select>
              </label>
              <label>Live in production on<input name="liveAt" type="date" defaultValue={toDateInput(deal.liveAt)} disabled={!edit} /></label>
              <label>Owner
                <select name="ownerId" defaultValue={deal.ownerId ?? ""} disabled={!edit}>
                  <option value="">—</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="inline"><input type="checkbox" name="indiaOriginated" defaultChecked={deal.indiaOriginated} disabled={!edit} /> India-originated (60/40 revenue share)</label>
              <p className="faint" style={{ margin: 0 }}>Next step: {deal.nextStep ? `${deal.nextStep} by ${day(deal.nextStepAt)}` : "none — log a touch to set one"}</p>
              {edit && <div><button className="btn btn-sm">Save</button></div>}
            </form>
          </section>

          <section className="card">
            <h2>Contracts</h2>
            {deal.documents.length === 0 && <p className="faint">No MOU, MSA or SOW recorded.</p>}
            <ul className="timeline">
              {deal.documents.map((d) => (
                <li key={d.id}>
                  <span className={`badge ${d.status === "SIGNED" ? "good" : "grey"}`}>{d.kind} v{d.version} · {d.status.toLowerCase()}</span>{" "}
                  <span className="faint">{day(d.createdAt)}</span>
                  {d.fileKey && <div className="faint"><a href={d.fileKey} target="_blank" rel="noreferrer">Open document</a></div>}
                </li>
              ))}
            </ul>
            {contract ? (
              <details style={{ marginTop: 10 }}>
                <summary>Record a document</summary>
                <form action={recordDocument} className="form" style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={deal.id} />
                  <div className="row">
                    <select name="kind" defaultValue="MOU"><option>MOU</option><option>MSA</option><option>SOW</option><option>PROPOSAL</option></select>
                    <select name="status" defaultValue="SIGNED"><option value="SENT">Sent</option><option value="SIGNED">Signed</option></select>
                  </div>
                  <input name="link" placeholder="Link to the signed copy (Drive, DocuSign…)" />
                  <p className="faint" style={{ margin: 0 }}>Use only the approved templates. Non-standard terms need founder approval first.</p>
                  <div><button className="btn btn-sm">Record</button></div>
                </form>
              </details>
            ) : <p className="faint">The Director or Founder records contracts.</p>}
          </section>

          <section className="card">
            <h2>Discounts and approvals</h2>
            {deal.approvals.length === 0 && <p className="faint">No approval requests.</p>}
            <ul className="timeline">
              {deal.approvals.map((a) => (
                <li key={a.id}>
                  <span className={`badge ${a.status === "APPROVED" ? "good" : a.status === "REJECTED" ? "bad" : "warn"}`}>{a.kind.toLowerCase()} · {a.status.toLowerCase()}</span>
                  <div>{a.detail}{a.discountPct != null ? ` (${a.discountPct}%)` : ""}</div>
                  {a.decisionNote && <div className="faint">Founder: {a.decisionNote}</div>}
                  <div className="faint">{when(a.createdAt)}</div>
                </li>
              ))}
            </ul>
            {contract && (
              <details style={{ marginTop: 10 }}>
                <summary>Set a discount</summary>
                <form action={discount} className="form" style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={deal.id} />
                  <div className="row"><label>Discount %<input name="pct" inputMode="decimal" defaultValue={deal.discountPct || ""} required /></label></div>
                  <input name="reason" placeholder="Why (sent to the Founder if above the limit)" />
                  <p className="faint" style={{ margin: 0 }}>Up to {DISCOUNT_LIMIT_PCT}% applies at once; more needs founder approval.</p>
                  <div><button className="btn btn-sm">Apply or request</button></div>
                </form>
              </details>
            )}
            {edit && (
              <details style={{ marginTop: 10 }}>
                <summary>Ask for approval of terms or pricing</summary>
                <form action={askApproval} className="form" style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={deal.id} />
                  <select name="kind" defaultValue="TERMS"><option value="TERMS">Edited contract clause</option><option value="PRICING">Price outside the list</option></select>
                  <textarea name="detail" required placeholder="Which clause or price, and why the client needs it" />
                  <div><button className="btn btn-sm">Send to Founder</button></div>
                </form>
              </details>
            )}
          </section>

          {money && (
            <section className="card">
              <h2>Invoices</h2>
              {deal.invoices.length === 0 && <p className="faint">No invoices yet.</p>}
              <table>
                <tbody>
                  {deal.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.number}<div className="faint">{day(inv.issuedAt)}</div></td>
                      <td className="num">{inr(inv.amountInr)}<div className="faint">+GST {inr(inv.gstInr)}</div></td>
                      <td>
                        {inv.collectedAt ? (
                          <span className="faint">Received {inr(inv.collectedInr)} on {day(inv.collectedAt)}</span>
                        ) : (
                          <form action={recordPayment} className="row" style={{ gap: 4 }}>
                            <input type="hidden" name="id" value={deal.id} /><input type="hidden" name="invoiceId" value={inv.id} />
                            <input name="collectedInr" defaultValue={inv.amountInr} style={{ width: 100 }} />
                            <input name="collectedAt" type="date" style={{ width: 140 }} />
                            <button className="btn btn-sm">Received</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <details style={{ marginTop: 10 }}>
                <summary>Add invoice</summary>
                <form action={addInvoice} className="form" style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={deal.id} />
                  <label>Invoice number<input name="number" required placeholder="AIIPL/26-27/001" /></label>
                  <label>Date<input name="issuedAt" type="date" required /></label>
                  <label>Taxable value (₹, excluding GST)<input name="amountInr" required inputMode="numeric" /></label>
                  <label>GST (₹)<input name="gstInr" inputMode="numeric" /></label>
                  <div><button className="btn btn-sm">Add invoice</button></div>
                </form>
              </details>
            </section>
          )}

          {(user.role === "FOUNDER" || user.role === "DIRECTOR") && (
            <form action={deleteDeal}>
              <input type="hidden" name="id" value={deal.id} />
              <button className="btn btn-sm btn-danger">Delete deal (created by mistake)</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
