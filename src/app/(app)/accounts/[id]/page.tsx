import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { day, when, inr } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { LogTouch } from "@/components/LogTouch";
import { Timeline } from "@/components/Timeline";
import { RULES } from "@/signals/rules";
import { STAGE_LABEL, SERVICE_LINES } from "@/domain/deals";
import { completeTask } from "../../work/actions";
import { searchApolloPeople, type ApolloPerson } from "@/discovery/apollo";
import { revealContact } from "../../leads/actions";
import { FinanceCard } from "@/components/FinanceCard";
import { estimateItBudget, readSettings } from "@/domain/estimate";
import { apolloReady } from "@/domain/enrich";
import { addContactFromPoint, updateAccount, rescan, addSignal, removeSignal, addContact, optOutContact, createDeal } from "../actions";

const ruleLabel = (id: string) => RULES.find((r) => r.id === id)?.label ?? id;

export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; people?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const a = await db.account.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      owner: { select: { name: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      signals: { orderBy: [{ category: "asc" }, { weight: "desc" }] },
      deals: { orderBy: { updatedAt: "desc" } },
      scans: { orderBy: { startedAt: "desc" }, take: 1 },
      contactPoints: { orderBy: [{ kind: "asc" }, { foundAt: "asc" }] },
      activities: { orderBy: { at: "desc" }, take: 30, include: { user: { select: { name: true } }, contact: { select: { name: true } } } },
    },
  });
  if (!a) notFound();
  const [users, tasks] = await Promise.all([
    db.user.findMany({ where: { orgId: user.orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.task.findMany({ where: { orgId: user.orgId, done: false, OR: [{ entityId: a.id }, { entityId: { in: a.deals.map((d) => d.id) } }] }, orderBy: { dueAt: "asc" }, include: { owner: { select: { name: true } } } }),
  ]);
  const edit = can(user.role, "accounts.edit");
  const need = a.signals.filter((s) => s.category === "NEED");
  const contactable = a.contacts.filter((c) => !c.optedOutAt);
  const backTo = `/accounts/${a.id}`;
  const lastScan = a.scans[0];
  // Apollo people search uses no credits; only adding a person (revealing the email) does.
  const apollo = Boolean(process.env.APOLLO_API_KEY) && can(user.role, "leads.find");
  let people: ApolloPerson[] | null = null;
  let peopleError: string | null = null;
  if (apollo && sp.people === "1") {
    try { people = await searchApolloPeople(a.domain, process.env.APOLLO_API_KEY!); }
    catch (e) { peopleError = (e as Error).message; }
  }
  const known = new Set(a.contacts.map((c) => c.name.toLowerCase()));
  const org = await db.organization.findUniqueOrThrow({ where: { id: user.orgId }, select: { settings: true } });
  const estimate = estimateItBudget({
    industry: a.industry, revenueInr: a.revenueInr, staffSize: a.staffSize, stack: a.stack,
    signalIds: a.signals.map((x) => x.ruleId), contactTitles: a.contacts.map((c) => c.title),
  }, readSettings(org.settings));
  const knownValues = new Set(a.contacts.flatMap((c) => [c.email, c.phone].filter(Boolean) as string[]));

  return (
    <div className="stack">
      <div className="head">
        <div>
          <Link href="/accounts" className="faint">← Accounts</Link>
          <h1>{a.name}</h1>
          <div className="muted">
            <a href={`https://${a.domain}`} target="_blank" rel="noreferrer">{a.domain}</a>
            {a.city && ` · ${a.city}`}{a.industry && ` · ${a.industry}`}{a.owner && ` · Owner: ${a.owner.name}`}
          </div>
        </div>
        <div className="row">
          <span className={`badge ${a.needLabel}`}>Need {a.needLabel} · {a.needScore}</span>
          <span className="badge grey">Fit {a.fitScore}</span>
          <span className="badge">Priority {a.priority}</span>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Need signals</h2>
              {edit && (
                <form action={rescan}><input type="hidden" name="id" value={a.id} /><button className="btn btn-sm">Re-scan</button></form>
              )}
            </div>
            {a.serviceHint && <p style={{ marginTop: 0 }}>Lead with <strong>{a.serviceHint}</strong>.</p>}
            {need.length === 0 ? (
              <p className="faint">No need signals {a.lastScannedAt ? "found" : "yet: the scan has not run"}.</p>
            ) : (
              <table>
                <tbody>
                  {need.map((s) => (
                    <tr key={s.id}>
                      <td style={{ width: "40%" }}>{ruleLabel(s.ruleId)} {s.manual && <span className="badge grey">manual</span>}</td>
                      <td className="num" style={{ width: 40 }}>+{s.weight}</td>
                      <td className="faint" style={{ wordBreak: "break-word" }}>{s.evidence}</td>
                      <td style={{ width: 60 }}>
                        {edit && s.manual && (
                          <form action={removeSignal}>
                            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="signalId" value={s.id} />
                            <button className="btn btn-sm btn-danger">Remove</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="faint" style={{ marginBottom: 0 }}>
              Current stack (internal context only, never mention in outreach): {a.stack.length ? a.stack.join(", ") : "none detected"}.
              {" "}Last scan: {a.lastScannedAt ? when(a.lastScannedAt) : "never"}
              {lastScan?.status === "FAILED" && ` (failed: ${lastScan.error})`}.
            </p>
            {edit && (
              <details style={{ marginTop: 12 }}>
                <summary>Add a signal you know about</summary>
                <form action={addSignal} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={a.id} />
                  <div className="row">
                    <label>Signal
                      <select name="ruleId" defaultValue="referral">
                        <option value="referral">Referral (+25)</option>
                        <option value="job-post-it">IT job post (+20)</option>
                        <option value="growth-news">Growth news (+15)</option>
                      </select>
                    </label>
                    <label style={{ flex: 3 }}>Evidence<input name="evidence" required placeholder="Who referred them, or a link to the job post or news" /></label>
                  </div>
                  <div><button className="btn btn-sm">Add signal</button></div>
                </form>
              </details>
            )}
          </section>

          <FinanceCard a={a} estimate={estimate} edit={edit} canEnrich={can(user.role, "leads.find")} apollo={apolloReady()} canSettings={can(user.role, "users.manage")} />

          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}><h2>Deals</h2></div>
            {a.deals.length === 0 && <p className="faint">No deals yet.</p>}
            {a.deals.length > 0 && (
              <table>
                <tbody>
                  {a.deals.map((d) => (
                    <tr key={d.id}>
                      <td><Link href={`/deals/${d.id}`}>{d.title}</Link><div className="faint">{d.serviceLine}</div></td>
                      <td><span className={`badge ${d.stage === "LOST" ? "bad" : ""}`}>{STAGE_LABEL[d.stage]}</span></td>
                      <td className="num">{inr(d.valueInr)}</td>
                      <td className="faint">{d.nextStep ? `${d.nextStep} · ${day(d.nextStepAt)}` : "No next step"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {can(user.role, "deals.edit") && (
              <details style={{ marginTop: 12 }} open={a.deals.length === 0}>
                <summary>Start a deal</summary>
                <form action={createDeal} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={a.id} />
                  <div className="row">
                    <label>Service line
                      <select name="serviceLine" defaultValue={SERVICE_LINES.find((s) => s.toLowerCase() === (a.serviceHint ?? "").toLowerCase()) ?? "Custom app"}>
                        {SERVICE_LINES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                    <label style={{ flex: 2 }}>Title<input name="title" placeholder={`${a.name} – …`} /></label>
                    <label>Estimated value (₹)<input name="valueInr" inputMode="numeric" /></label>
                  </div>
                  <label className="inline"><input type="checkbox" name="indiaOriginated" defaultChecked /> Originated by the India team (counts for the 60/40 revenue share)</label>
                  <div><button className="btn btn-primary btn-sm">Create deal</button></div>
                </form>
              </details>
            )}
          </section>

          <section className="card">
            <h2>Log a touch</h2>
            <LogTouch accountId={a.id} contacts={contactable} backTo={backTo} />
          </section>

          <section className="card">
            <h2>Timeline</h2>
            <Timeline items={a.activities} />
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>Open tasks</h2>
            {tasks.length === 0 && <p className="faint">None.</p>}
            <ul className="timeline">
              {tasks.map((t) => (
                <li key={t.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span>{t.title}<div className="faint">{day(t.dueAt)} · {t.owner.name}</div></span>
                  {t.ownerId === user.id && (
                    <form action={completeTask}>
                      <input type="hidden" name="taskId" value={t.id} /><input type="hidden" name="backTo" value={backTo} />
                      <button className="btn btn-sm">Done</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Contacts</h2>
            {a.contacts.length === 0 && <p className="faint">No contacts yet. Deals cannot leave Target until one is added.</p>}
            <ul className="timeline">
              {a.contacts.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong>{c.title && <span className="muted"> · {c.title}</span>}
                  {c.optedOutAt && <span className="badge bad" style={{ marginLeft: 6 }}>Opted out</span>}
                  <div className="faint">
                    {[c.email, c.phone, c.whatsappOptIn ? "WhatsApp opt-in" : null, c.language === "ta" ? "Tamil" : null].filter(Boolean).join(" · ")}
                  </div>
                  <div className="faint">Source: {c.consentSource}</div>
                  {edit && !c.optedOutAt && (
                    <form action={optOutContact} style={{ marginTop: 4 }}>
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="contactId" value={c.id} />
                      <button className="btn btn-sm btn-danger">Mark opted out</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {apollo && (
              <div style={{ marginTop: 12 }}>
                {people === null && !peopleError && <Link className="btn btn-sm" href={`/accounts/${a.id}?people=1`}>Find decision makers (Apollo)</Link>}
                {peopleError && <p className="notice error">{peopleError}</p>}
                {people && people.length === 0 && <p className="faint">Apollo has no decision makers for {a.domain}.</p>}
                {people && people.length > 0 && (
                  <div>
                    <h3>Decision makers on Apollo</h3>
                    <p className="faint" style={{ marginTop: 0 }}>Adding a person reveals their work email and uses Apollo credits.</p>
                    <ul className="timeline">
                      {people.map((p) => (
                        <li key={p.id} className="row" style={{ justifyContent: "space-between" }}>
                          <span>{p.name}{p.title && <span className="muted"> · {p.title}</span>}</span>
                          {known.has(p.name.toLowerCase()) ? <span className="faint">added</span> : (
                            <form action={revealContact}>
                              <input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="personId" value={p.id} />
                              <button className="btn btn-sm">Add</button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {edit && (
              <details style={{ marginTop: 12 }}>
                <summary>Add contact</summary>
                <form action={addContact} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={a.id} />
                  <label>Name *<input name="name" required /></label>
                  <label>Title<input name="title" placeholder="Owner, MD, IT head…" /></label>
                  <label>Email<input name="email" type="email" /></label>
                  <label>Phone<input name="phone" /></label>
                  <label>Language
                    <select name="language" defaultValue="en"><option value="en">English</option><option value="ta">Tamil</option></select>
                  </label>
                  <label className="inline"><input type="checkbox" name="whatsappOptIn" /> Agreed to WhatsApp messages</label>
                  <label>How we got this contact *<input name="consentSource" required placeholder="Business card at event, referral by…" /></label>
                  <div><button className="btn btn-sm">Add contact</button></div>
                </form>
              </details>
            )}
          </section>

          <section className="card">
            <h2>Published contact details</h2>
            {a.contactPoints.length === 0 ? (
              <p className="faint">None found on {a.domain}{a.lastScannedAt ? "" : " yet: the website has not been scanned"}.</p>
            ) : (
              <ul className="timeline">
                {a.contactPoints.map((p) => (
                  <li key={p.id} className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                    <span>
                      {p.kind === "email" ? <a href={`mailto:${p.value}`}>{p.value}</a> : <a href={`tel:${p.value.replace(/\s/g, "")}`}>{p.value}</a>}
                      <div className="faint"><a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.sourceUrl.replace(/^https?:\/\//, "")}</a></div>
                    </span>
                    {edit && !knownValues.has(p.value) && (
                      <form action={addContactFromPoint}>
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="pointId" value={p.id} />
                        <button className="btn btn-sm">Add as contact</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="faint" style={{ marginBottom: 0 }}>Emails and phone numbers the company publishes on its own website, found during the scan.</p>
          </section>

          <section className="card">
            <h2>Details</h2>
            <form action={updateAccount} className="form">
              <input type="hidden" name="id" value={a.id} />
              <label>Name<input name="name" defaultValue={a.name} disabled={!edit} /></label>
              <label>City<input name="city" defaultValue={a.city ?? ""} disabled={!edit} /></label>
              <label>Industry<input name="industry" defaultValue={a.industry ?? ""} disabled={!edit} /></label>
              <label>Staff (approx.)<input name="staffSize" defaultValue={a.staffSize ?? ""} inputMode="numeric" disabled={!edit} /></label>
              <label>Office phone<input name="phone" defaultValue={a.phone ?? ""} disabled={!edit} /></label>
              <label>GSTIN<input name="gstin" defaultValue={a.gstin ?? ""} disabled={!edit} /></label>
              <label>Owner
                <select name="ownerId" defaultValue={a.ownerId ?? ""} disabled={!edit}>
                  <option value="">—</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label>Notes<textarea name="notes" defaultValue={a.notes ?? ""} disabled={!edit} /></label>
              <p className="faint" style={{ margin: 0 }}>Source: {a.source}{a.sourceNote ? ` — ${a.sourceNote}` : ""} · added {day(a.createdAt)}</p>
              {edit && <div><button className="btn btn-sm">Save details</button></div>}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
