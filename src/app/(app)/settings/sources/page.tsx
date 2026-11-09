import { requireCan } from "@/lib/session";
import { PROVIDERS, providerReady } from "@/enrich/providers";

/** Which company-data and email sources are connected, what their free plans give, and how to connect the rest. */
export default async function Sources() {
  await requireCan("leads.find");
  const placesReady = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  return (
    <div className="stack">
      <div>
        <h1>Data sources</h1>
        <p className="muted" style={{ margin: 0 }}>
          When you fetch a company&apos;s size and revenue, LeadItNow asks the connected sources in this order and stops once staff, revenue and industry are known,
          so free credits go furthest. <strong>Find emails</strong> uses Hunter, then Snov.io.
        </p>
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Source</th><th>Status</th><th>Free plan</th><th>Cheapest paid plan</th><th>Gives</th></tr></thead>
          <tbody>
            {PROVIDERS.map((p) => {
              const on = providerReady(p);
              return (
                <tr key={p.id}>
                  <td><strong>{p.label}</strong><div className="faint">{p.company ? "Size and revenue" : ""}{p.company && p.emails ? " · " : ""}{p.emails ? "Emails" : ""}</div></td>
                  <td>{on ? <span className="badge High">Connected</span> : <span className="badge grey">Not connected</span>}</td>
                  <td>{p.free}{p.note && <div className="faint">{p.note}</div>}</td>
                  <td>{p.paid}</td>
                  <td className="faint">{p.gives}</td>
                </tr>
              );
            })}
            <tr>
              <td><strong>Google Places</strong><div className="faint">Find leads</div></td>
              <td>{placesReady ? <span className="badge High">Connected</span> : <span className="badge grey">Not connected</span>}</td>
              <td>About 1,000 searches a month free</td><td>About $35 per 1,000 after that</td>
              <td className="faint">Local businesses with website and phone, any country</td>
            </tr>
          </tbody>
        </table>
      </div>
      <section className="card">
        <h2>Connecting a source</h2>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {PROVIDERS.filter((p) => !providerReady(p)).map((p) => (
            <li key={p.id}><a href={p.signup} target="_blank" rel="noreferrer">Sign up for {p.label}</a>, copy the API key from its settings, and send it to the Founder to add as <code>{p.env.join(" and ")}</code>.</li>
          ))}
        </ol>
        <p className="faint" style={{ marginBottom: 0 }}>Keys are kept as server settings, never shown in the app. A source that runs out of credits is skipped and the next one is tried.</p>
      </section>
    </div>
  );
}
