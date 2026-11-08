import Link from "next/link";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { when, day } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { CITIES, INDUSTRIES, SOURCE_LABEL, type SourceId } from "@/discovery/types";
import { sourceReady } from "@/discovery/ingest";
import { search, toggleSaved } from "./actions";

const SOURCES: { id: SourceId; cost: string; about: string }[] = [
  { id: "osm", cost: "Free", about: "Shops, offices, clinics and factories mapped on OpenStreetMap that list a website. Coverage varies by area." },
  { id: "wikidata", cost: "Free", about: "Companies headquartered in the city with an official website. Mostly larger, well-known firms." },
  { id: "google-places", cost: "Free for 1,000 searches a month, then about $35 per 1,000", about: "Google Maps business listings: the widest coverage of local businesses, with website and phone." },
  { id: "apollo", cost: "Company search uses no credits", about: "Apollo's company database with staff size; best for 50+ staff. Decision makers can then be added from the account page." },
];

function SearchForm({ source, disabled }: { source: SourceId; disabled: string | null }) {
  return (
    <form action={search} className="form">
      <input type="hidden" name="source" value={source} />
      <div className="row">
        <label>Industry
          <select name="industry" defaultValue="Manufacturing" disabled={!!disabled}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select>
        </label>
        <label>City
          <input name="city" list="cities" defaultValue="Chennai" disabled={!!disabled} />
        </label>
      </div>
      <label>Keywords (optional{source === "apollo" ? ", comma-separated" : ""})
        <input name="keywords" placeholder={source === "google-places" ? "e.g. pump manufacturers, garment exporters" : "narrows the search"} disabled={!!disabled} />
      </label>
      {source === "apollo" && (
        <label>Staff
          <select name="staffRange" defaultValue="11,500" disabled={!!disabled}>
            <option value="1,10">1-10</option><option value="11,50">11-50</option><option value="51,200">51-200</option>
            <option value="201,500">201-500</option><option value="11,500">11-500</option>
          </select>
        </label>
      )}
      <label className="inline"><input type="checkbox" name="save" disabled={!!disabled} /> Also run this search every week</label>
      {disabled ? <p className="notice" style={{ margin: 0 }}>{disabled}</p> : <div><button className="btn btn-primary btn-sm">Search {SOURCE_LABEL[source]}</button></div>}
    </form>
  );
}

export default async function FindLeads({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireCan("leads.find");
  const sp = await searchParams;
  const [runs, saved, toReview] = await Promise.all([
    db.discoveryRun.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.savedSearch.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" } }),
    db.leadCandidate.count({ where: { orgId: user.orgId, status: "NEW" } }),
  ]);
  return (
    <div className="stack">
      <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="head">
        <div>
          <h1>Find leads</h1>
          <p className="muted" style={{ margin: 0 }}>Search by industry and city. Companies with their own website are added as accounts and scanned; the rest go to the review list.</p>
        </div>
        <Link className="btn" href="/leads/review">Review list ({toReview})</Link>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid2">
        {SOURCES.map((s) => (
          <section className="card stack" key={s.id}>
            <div>
              <h2 style={{ marginBottom: 4 }}>{SOURCE_LABEL[s.id]} <span className="badge grey">{s.cost}</span></h2>
              <p className="faint" style={{ margin: 0 }}>{s.about}</p>
            </div>
            <SearchForm source={s.id} disabled={sourceReady(s.id)} />
          </section>
        ))}
      </div>

      <section className="card">
        <h2>Weekly searches</h2>
        {saved.length === 0 && <p className="faint">None yet. Tick &ldquo;Also run this search every week&rdquo; on a search. They run on Monday at 2:30 am IST.</p>}
        <table>
          <tbody>
            {saved.map((s) => (
              <tr key={s.id}>
                <td>{SOURCE_LABEL[s.source as SourceId]}</td>
                <td>{s.keywords || s.industry} · {s.city}{s.staffRange ? ` · ${s.staffRange.replace(",", "-")} staff` : ""}</td>
                <td className="faint">{s.lastRunAt ? `last run ${day(s.lastRunAt)}` : "not run yet"}</td>
                <td className="row" style={{ justifyContent: "flex-end" }}>
                  <form action={toggleSaved}><input type="hidden" name="id" value={s.id} /><button className="btn btn-sm">{s.active ? "Pause" : "Resume"}</button></form>
                  <form action={toggleSaved}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="delete" value="1" /><button className="btn btn-sm btn-danger">Delete</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Recent searches</h2>
        {runs.length === 0 && <p className="faint">No searches yet.</p>}
        <table>
          {runs.length > 0 && <thead><tr><th>When</th><th>Source</th><th>Search</th><th className="num">Found</th><th className="num">New accounts</th><th className="num">To review</th><th className="num">Known</th></tr></thead>}
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="faint">{when(r.createdAt)}{r.savedSearchId ? " · weekly" : ""}</td>
                <td>{SOURCE_LABEL[r.source as SourceId]}</td>
                <td>{r.query}{r.error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{r.error}</div>}</td>
                <td className="num">{r.found}</td><td className="num">{r.added}</td><td className="num">{r.candidates}</td><td className="num">{r.existing}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint" style={{ marginBottom: 0 }}>OpenStreetMap data © OpenStreetMap contributors (ODbL). Wikidata is CC0. Google and Apollo data are used under their terms.</p>
      </section>
    </div>
  );
}
