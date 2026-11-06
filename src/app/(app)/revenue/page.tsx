import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { statement, SPLIT } from "@/domain/revenue";

function thisMonth() {
  const ist = new Date(Date.now() + 330 * 60_000);
  return ist.toISOString().slice(0, 7);
}

export default async function Revenue({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireCan("revenue.view");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const s = await statement(db, user.orgId, month);
  const rows: [string, number, boolean?][] = [
    ["Net Revenue (collected, excl. GST)", s.netRevenueInr, true],
    [`US licence fee (${SPLIT.usPct}%)`, s.usFeeInr, true],
    [`Brand and IP royalty (${SPLIT.royaltyPct}%)`, s.royaltyInr],
    [`Platform licence (${SPLIT.platformPct}%)`, s.platformInr],
    [`Services and support (${SPLIT.servicesPct}%)`, s.servicesInr],
    [`India share (${SPLIT.indiaPct}%)`, s.indiaShareInr, true],
    [`Development reserve (${SPLIT.devReserveOfIndiaPct}% of India share)`, s.devReserveInr],
    ["India net after reserve", s.indiaNetInr],
  ];
  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <div className="head">
        <div>
          <h1>Net Revenue statement</h1>
          <p className="muted" style={{ margin: 0 }}>Monthly licence-fee basis under the intercompany agreement: India-originated deals only.</p>
        </div>
        <form className="row" method="get">
          <input type="month" name="month" defaultValue={month} />
          <button className="btn">Show</button>
          <a className="btn" href={`/api/revenue?month=${month}`}>Download CSV</a>
        </form>
      </div>
      <div className="grid3">
        <div className="card"><div className="kpi">{inr(s.invoicedInr)}</div><div className="faint">invoiced in {month}</div></div>
        <div className="card"><div className="kpi">{inr(s.netRevenueInr)}</div><div className="faint">collected (Net Revenue)</div></div>
        <div className="card"><div className="kpi">{inr(s.usFeeInr)}</div><div className="faint">licence fee due to the LLC</div></div>
      </div>
      <section className="card">
        <h2>Split</h2>
        <table>
          <tbody>
            {rows.map(([label, v, strong]) => (
              <tr key={label}><td style={strong ? { fontWeight: 600 } : { paddingLeft: 24 }}>{label}</td><td className="num" style={strong ? { fontWeight: 600 } : undefined}>{inr(v)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="faint" style={{ marginBottom: 0 }}>Before withholding tax and GST under reverse charge; the CA computes those for Forms 15CA/15CB.</p>
      </section>
      <section className="card">
        <h2>Deals</h2>
        {s.lines.length === 0 && <p className="faint">No India-originated invoices issued or paid in {month}.</p>}
        {s.lines.length > 0 && (
          <table>
            <thead><tr><th>Account</th><th>Deal</th><th>Invoices</th><th className="num">Invoiced</th><th className="num">Collected</th></tr></thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.dealId}><td>{l.account}</td><td><a href={`/deals/${l.dealId}`}>{l.deal}</a></td><td className="faint">{l.invoices.join(", ")}</td><td className="num">{inr(l.invoicedInr)}</td><td className="num">{inr(l.collectedInr)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
