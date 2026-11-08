import Link from "next/link";
import type { Account } from "@prisma/client";
import { day } from "@/lib/format";
import { inrShort, type Estimate } from "@/domain/estimate";
import { APOLLO_MISSING } from "@/domain/enrich";
import { updateFinance, enrichOne } from "@/app/(app)/accounts/actions";
import { SubmitButton } from "./SubmitButton";

const quoteUrl = (sym: string, ex: string | null) =>
  `https://www.google.com/finance/quote/${encodeURIComponent(sym)}:${encodeURIComponent(ex && /BSE|BOM/i.test(ex) ? "BOM" : "NSE")}`;

export function FinanceCard({ a, estimate, edit, canEnrich, apollo, canSettings }: {
  a: Account; estimate: Estimate | null; edit: boolean; canEnrich: boolean; apollo: boolean; canSettings: boolean;
}) {
  const rows: [string, React.ReactNode][] = [
    ["Revenue", a.revenueInr ? <>{inrShort(a.revenueInr)} a year <span className="faint">({a.revenueSource === "apollo" ? "Apollo estimate" : a.revenueSource === "manual" ? "entered" : a.revenueSource})</span></> : null],
    ["Staff", a.staffSize ? `${a.staffSize.toLocaleString("en-IN")}` : null],
    ["Listed", a.listed == null ? null : a.listed ? (
      <>Yes{a.stockSymbol && <> · <a href={quoteUrl(a.stockSymbol, a.stockExchange)} target="_blank" rel="noreferrer">{a.stockSymbol}{a.stockExchange ? ` (${a.stockExchange})` : ""} — market cap ↗</a></>}</>
    ) : "No (unlisted)"],
    ["Founded", a.foundedYear],
    ["Paid-up capital", a.paidUpCapitalInr ? inrShort(a.paidUpCapitalInr) : null],
    ["Company", [a.companyClass, a.cin].filter(Boolean).join(" · ") || null],
  ];
  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Size and finance</h2>
        {canEnrich && apollo && (
          <form action={enrichOne}><input type="hidden" name="id" value={a.id} /><SubmitButton className="btn btn-sm" pending="Asking Apollo…">{a.enrichedAt ? "Refresh from Apollo" : "Enrich from Apollo"}</SubmitButton></form>
        )}
      </div>
      {canEnrich && !apollo && <p className="notice" style={{ margin: 0 }}>{APOLLO_MISSING}</p>}

      <div>
        <div className="faint" style={{ marginBottom: 4 }}>Estimated IT budget</div>
        {estimate ? (
          <>
            <div className="kpi" style={{ fontSize: 22 }}>{inrShort(estimate.lowInr)} – {inrShort(estimate.highInr)} <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}>a year</span></div>
            <div className="faint">Estimate from {estimate.notes.join("; ")}.{canSettings && <> <Link href="/settings/estimates">Change the percentages</Link>.</>}</div>
          </>
        ) : (
          <div className="faint">Add the annual revenue below{canSettings ? <>, or set an amount per employee in <Link href="/settings/estimates">Estimates</Link>,</> : ""} to see an estimate.</div>
        )}
      </div>

      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td className="faint" style={{ width: 130 }}>{k}</td><td>{v ?? <span className="faint">—</span>}</td></tr>
          ))}
        </tbody>
      </table>
      {a.technologies.length > 0 && (
        <div><div className="faint" style={{ marginBottom: 4 }}>Technologies (Apollo)</div><div className="row" style={{ gap: 4 }}>{a.technologies.slice(0, 20).map((t) => <span key={t} className="badge grey">{t}</span>)}</div></div>
      )}
      {a.enrichedAt && <p className="faint" style={{ margin: 0 }}>Apollo checked {day(a.enrichedAt)}.</p>}

      {edit && (
        <details>
          <summary>Enter or correct by hand</summary>
          <form action={updateFinance} className="form" style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={a.id} />
            <div className="row">
              <label>Annual revenue (₹, e.g. 4.5 crore)<input name="revenue" defaultValue={a.revenueInr ? inrShort(a.revenueInr).replace("₹", "") : ""} /></label>
              <label>Staff<input name="staffSize" inputMode="numeric" defaultValue={a.staffSize ?? ""} /></label>
            </div>
            <div className="row">
              <label>Listed?
                <select name="listed" defaultValue={a.listed == null ? "" : a.listed ? "yes" : "no"}><option value="">Not known</option><option value="yes">Listed</option><option value="no">Unlisted</option></select>
              </label>
              <label>Stock symbol<input name="stockSymbol" defaultValue={a.stockSymbol ?? ""} placeholder="e.g. ASHOKLEY" /></label>
              <label>Exchange<input name="stockExchange" defaultValue={a.stockExchange ?? ""} placeholder="NSE / BSE" /></label>
            </div>
            <div className="row">
              <label>Founded<input name="foundedYear" inputMode="numeric" defaultValue={a.foundedYear ?? ""} /></label>
              <label>Paid-up capital (₹)<input name="paidUpCapital" defaultValue={a.paidUpCapitalInr ? inrShort(a.paidUpCapitalInr).replace("₹", "") : ""} /></label>
            </div>
            <div className="row">
              <label>CIN<input name="cin" defaultValue={a.cin ?? ""} /></label>
              <label>Company class<input name="companyClass" defaultValue={a.companyClass ?? ""} placeholder="Private, Public, LLP" /></label>
            </div>
            <div><button className="btn btn-sm">Save</button></div>
          </form>
        </details>
      )}
    </section>
  );
}
