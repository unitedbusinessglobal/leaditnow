import Link from "next/link";
import { currentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { ThemePicker } from "@/components/ThemePicker";

export const dynamic = "force-dynamic";

const FEATURES = [
  { ico: "🔎", title: "Need-signal scanner", text: "Reads a company's public website and DNS: no online ordering, not mobile-friendly, out-of-date site, free webmail. Every signal shows its evidence." },
  { ico: "🧭", title: "Find leads by industry and city", text: "Search OpenStreetMap, Wikidata, Google Places and Apollo across Tamil Nadu. New companies are added once, scanned and scored." },
  { ico: "📈", title: "Need, fit and priority", text: "Need from the evidence, fit from city, size, industry and decision makers, priority from both — so the team calls the right companies first." },
  { ico: "🗂️", title: "Pipeline with exit rules", text: "Eight stages from target to renewal. A deal moves on only when its exit rule is met: meeting held, budget confirmed, MOU signed." },
  { ico: "☀️", title: "My day", text: "Due tasks, stuck deals and the next accounts to work. Every call and meeting ends with a dated next step." },
  { ico: "✅", title: "Approvals and Net Revenue", text: "Discounts, edited clauses and off-list prices go to the founder. Invoices feed a monthly revenue statement with the agreed split." },
];

const STEPS = [
  { title: "Find", text: "Pick an industry and a city, or import a list. LeadItNow adds the companies and skips the ones you already have." },
  { title: "Score", text: "Each website is scanned for need signals and every company gets need, fit and priority scores." },
  { title: "Work", text: "The team works the top of the list: calls, meetings and WhatsApp, each with a dated next step." },
  { title: "Close", text: "Demo, paid scoping MOU, then MSA and SOW on approved templates, with the founder approving exceptions." },
];

const PRODUCTS = [
  { name: "TestItNow", href: "https://testitnow.ainformatiq.com" },
  { name: "BreakItNow", href: "https://breakitnow.ainformatiq.com" },
  { name: "MediNow", href: "https://medinow.ainformatiq.com" },
  { name: "AgentNow", href: "https://agentnow.ainformatiq.com" },
  { name: "Fandaura", href: "https://fandaura.ainformatiq.com" },
];

function Mock() {
  return (
    <div className="lp-mock" aria-label="LeadItNow account example">
      <div className="chrome"><i /><i /><i /><span>leaditnow.ainformatiq.com/accounts</span></div>
      <div className="body">
        <div className="row2">
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Kovai Precision Pumps</div>
            <div className="faint">kovaipumps.example · Coimbatore · Manufacturing · 120 staff</div>
          </div>
          <span className="badge High">Need High · 45</span>
        </div>
        <div className="row2" style={{ justifyContent: "flex-start", gap: 6 }}>
          <span className="badge grey">Fit 90</span><span className="badge">Priority 55</span><span className="badge grey">Lead with ERP</span>
        </div>
        <div className="sig"><span>Sells products but has no online ordering</span><b>+15</b></div>
        <div className="sig"><span>Website not mobile-friendly</span><b>+10</b></div>
        <div className="sig"><span>Referral: TN Chamber of Commerce</span><b>+25</b></div>
        <div className="ai">Next step · <strong>Discovery call with the MD</strong> · Tue 10 Nov</div>
        <div className="row2" style={{ gap: 6 }}>
          {["Target", "Outreach", "Discovery", "Demo", "MOU", "MSA"].map((s, i) => (
            <span key={s} className={`badge ${i < 2 ? "good" : i === 2 ? "" : "grey"}`} style={{ flex: 1, textAlign: "center" }}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function Landing() {
  const user = await currentUser();
  const appHref = user ? "/today" : "/login";
  const appLabel = user ? "Open LeadItNow →" : "Sign in →";
  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="bar lp-wrap">
          <Logo />
          <div className="links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#sources">Sources</a>
            <a href="https://www.ainformatiq.com" target="_blank" rel="noreferrer">AInformatIQ</a>
          </div>
          <div className="right">
            <ThemePicker />
            <Link className="lp-btn primary" href={appHref}>{appLabel}</Link>
          </div>
        </div>
      </nav>

      <section className="lp-hero lp-wrap">
        <div className="orb" style={{ top: "12%", right: "6%", width: 480, height: 480, background: "radial-gradient(circle, var(--brand-soft) 0%, transparent 70%)" }} />
        <div className="orb" style={{ bottom: "12%", left: "2%", width: 380, height: 380, background: "radial-gradient(circle, color-mix(in srgb, var(--brand2) 9%, transparent) 0%, transparent 70%)" }} />
        <div className="grid">
          <div>
            <div className="lp-eyebrow"><span className="dot" />AI-Powered Lead Discovery</div>
            <h1 className="big">Find the businesses<br />that need you.<br /><span className="acc">Close them faster.</span></h1>
            <p className="lead">
              LeadItNow searches business listings across Tamil Nadu, reads each company&apos;s public website for signs it needs ERP, CRM,
              e-commerce or custom software, and walks your team from the first call to a signed MSA.
            </p>
            <div className="ctas">
              <Link className="lp-btn primary lg" href={appHref}>{appLabel}</Link>
              <a className="lp-btn ghost lg" href="#how-it-works">See how it works</a>
            </div>
            <div className="proof">
              <div><strong>4</strong>lead sources</div>
              <div><strong>8</strong>pipeline stages</div>
              <div><strong>0</strong>logins scraped — public data only</div>
            </div>
          </div>
          <Mock />
        </div>
      </section>

      <section id="features" className="lp-sec lp-wrap">
        <div className="head">
          <div className="kicker">Features</div>
          <h2 className="big">Everything the team needs, from first signal to signed MSA</h2>
          <p className="muted" style={{ margin: 0 }}>One place for finding, researching, reaching and closing — built for an India sales team working with a US founder.</p>
        </div>
        <div className="lp-cards">
          {FEATURES.map((f) => (
            <div className="lp-card" key={f.title}><div className="ico">{f.ico}</div><h3>{f.title}</h3><p>{f.text}</p></div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="lp-sec alt lp-wrap">
        <div className="head">
          <div className="kicker">How it works</div>
          <h2 className="big">From a city and an industry to a signed client in 4 steps</h2>
        </div>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div className="lp-step" key={s.title}><div className="n">{i + 1}</div><h3>{s.title}</h3><p>{s.text}</p></div>
          ))}
        </div>
      </section>

      <section id="sources" className="lp-sec lp-wrap">
        <div className="head">
          <div className="kicker">Sources</div>
          <h2 className="big">Public, licensed data. <span className="acc">Nothing scraped from behind a login.</span></h2>
          <p className="muted" style={{ margin: 0 }}>Every record keeps where it came from, so contact data stays compliant with India&apos;s DPDP Act.</p>
        </div>
        <div className="lp-sources">
          {["OpenStreetMap", "Wikidata", "Google Places", "Apollo", "Company register files", "Your CSV lists", "Company websites and DNS"].map((s) => <span key={s}>{s}</span>)}
        </div>
      </section>

      <section className="lp-sec lp-wrap" style={{ paddingTop: 20 }}>
        <div className="lp-cta">
          <h2 className="big">Stop guessing who to call.<br /><span className="acc">Start with the evidence.</span></h2>
          <p className="muted" style={{ maxWidth: 460, margin: "0 auto 28px" }}>Invite-only for the AInformatIQ team. Sign in with your work Google account.</p>
          <Link className="lp-btn primary lg" href={appHref}>{appLabel}</Link>
        </div>
      </section>

      <footer className="lp-foot lp-wrap">
        <div className="cols">
          <div>
            <Logo />
            <p className="muted" style={{ fontSize: 14, marginTop: 12, maxWidth: 300 }}>Lead discovery and pipeline for software and IT services. Part of the AInformatIQ product family.</p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#sources">Sources</a><Link href={appHref}>{user ? "Open app" : "Sign in"}</Link>
          </div>
          <div>
            <h4>AInformatIQ products</h4>
            {PRODUCTS.map((p) => <a key={p.name} href={p.href} target="_blank" rel="noreferrer">{p.name} ↗</a>)}
          </div>
          <div>
            <h4>Company</h4>
            <a href="https://www.ainformatiq.com" target="_blank" rel="noreferrer">AInformatIQ ↗</a>
            <a href="https://www.ainformatiq.com/staffing.html" target="_blank" rel="noreferrer">Staffing ↗</a>
            <a href="mailto:contact@AInformatiq.com">contact@AInformatiq.com</a>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} Analytical Informatics LLC. All rights reserved.</span>
          <span>OpenStreetMap data © OpenStreetMap contributors</span>
        </div>
      </footer>
    </div>
  );
}
