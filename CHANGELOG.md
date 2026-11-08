# Changelog

## 2026-11-08 — v0.6.0 enrichment (LDITNW-29)

- **Published contact details**: every scan saves the business emails and phone numbers a company publishes on its own website, with the page they came from; one click adds one as a contact (source recorded for DPDP). The office phone is filled if empty.
- **Size and finance** on each account: revenue, staff, listed or unlisted with stock symbol and a market-cap link, founded year, paid-up capital, company class and CIN, technologies. Filled from Apollo (**Enrich from Apollo**, and **Enrich next 20** on Accounts) or by hand; values typed by hand are never overwritten.
- When Apollo or Google Places isn't connected, every place that uses them says so and points to the manual or free alternative.
- **Estimated IT budget** band per account: revenue × the industry's IT-spend %, or staff × an amount per employee, raised when the company already uses several business tools, is hiring for IT, or has an IT lead. **Estimates** settings page (Founder and Director); all industries start at a placeholder 2%.
- CSV import keeps CIN, paid-up capital, company class, listed flag and revenue columns, including on review-list items, which carry them to the account when added.
- Accounts list shows a Size column.

## 2026-11-08 — v0.5.1 search feedback (LDITNW-27)

- Search, Add and scan, and Scan next 8 buttons show progress while they run; searches no longer scan websites inline (the nightly job or "Scan next 8" does), so results come back faster.
- A search that finds nothing says so, with suggestions.
- OpenStreetMap "Manufacturing" no longer matches generic company offices; Wikidata keeps only companies whose listed industry fits.

## 2026-11-08 — v0.5.0 landing page and family theme (LDITNW-28)

- Public landing page at `/` in the AInformatIQ product layout (as TestItNow): gradient mark and LeadIt**Now** logo, hero with a product mock-up, features, how it works, sources, call to action, footer linking the other products.
- The five shared themes (Light, Dark, Ocean, Forest, Sunset) across the landing page, sign-in and the app; the choice is remembered in the browser under the same key the family uses.
- Restyled sign-in page; Inter font; favicon.
- My day moved from `/` to `/today`; sign-in lands there.
- Custom domain `leaditnow.ainformatiq.com` added to the Vercel project (needs a CNAME at the DNS host).
- Wikidata searches return businesses only and respect the chosen industry (LDITNW-27).

## 2026-11-08 — v0.4.0 Find leads (LDITNW-27)

- **Find leads** page: search by industry and city across OpenStreetMap and Wikidata (free), Google Places (free tier, then paid) and Apollo (company search, no credits).
- Companies with their own website become accounts, deduplicated by domain, phone, Google place ID or Apollo ID, and scanned; social pages and marketplaces don't count as a website.
- **Review list** for companies without a website: search the web, paste the site, add; or dismiss.
- Weekly saved searches (Mondays 2:30 am IST via Vercel Cron) and a log of every search with its counts or error.
- Account page: **Find decision makers (Apollo)**, free search; adding a person reveals the work email (uses Apollo credits).
- CSV import: rows without a website go to the review list; a Company ID (CIN) column dedupes them; inactive companies (e.g. Strike Off in an MCA register file) are skipped.
- `/api/discover/preview` (preview builds only) runs a source live without saving, for checking connectors.

## 2026-11-08 — Google sign-in on

- Google OAuth client configured in Vercel (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`); production sign-in enabled (LDITNW-7).

## 2026-11-06 — v0.3.0 sprint 1 and beyond

- Sign-in: Google (invite-only), Founder bootstrap from `FOUNDER_EMAIL`, roles and permissions, Team page; email test sign-in on local and preview builds only (LDITNW-7).
- CSV import with column matching, merge by domain then phone, gap-filling, contacts once, DPDP source (LDITNW-8).
- Add a company by domain: duplicate check, first contact, scan saved at once (LDITNW-9).
- Pipeline board with 8 stages; exit rules enforced one stage at a time; contract stages for Director and Founder; Lost with reason; stuck flags (LDITNW-10).
- Scans saved to the account with evidence; nightly Vercel Cron scans new accounts and re-scans after 30 days (LDITNW-11).
- Manual signals: referral, IT job post, growth news (LDITNW-12).
- Fit and priority computed from profile, decision-maker contacts and referrals; accounts list sorts and filters (LDITNW-14).
- My day: due and overdue tasks, open deals, next accounts to work (LDITNW-15).
- Call, meeting, email, WhatsApp and note logging; calls and meetings need a dated next step that becomes a task (LDITNW-17).
- Approvals: discounts above 10%, edited clauses and off-list pricing go to the Founder; decisions audited (LDITNW-22).
- Dashboard: pipeline by stage and service line, stuck deals, 7-day activity per person (LDITNW-23, without the weekly email).
- Invoices, payments and the monthly Net Revenue statement with the 60/40 split, fee components and development reserve, CSV export (LDITNW-24).
- Prisma on the Rust-free client with `@prisma/adapter-pg` and `attachDatabasePool`; migrations generated from the schema by GitHub Actions; CI runs type checks and database tests on Postgres.
- Vercel bundles now include Prisma's query-compiler wasm (`outputFileTracingIncludes`); without it every database call failed in production.
- `/api/scan` now needs a signed-in user or the `CRON_SECRET` bearer token.

## 2026-11-06 — Neon Singapore

- Build waits up to 30s (plus one retry) for a paused Neon branch to wake before migrating (LDITNW-11).
- Linked to Neon project `polished-cell-49111239` with `neon init` (`neon.ts`, `@neon/config`, `@neon/env`; `.neon` is git-ignored).
- All four environments (dev, qa, uat, production) now use the Neon Singapore branches; Vercel functions moved to Singapore (sin1) to sit next to the database; production moved to Singapore too (LDITNW-11).

## 2026-11-05 — database migration

- Vercel builds apply pending migrations to their own Neon branch (`vercel-build` script); prod and qa connected; `GET /api/health` reports database status (LDITNW-11).
- Initial migration `prisma/migrations/0001_init` (12 tables, enums, indexes) generated from the schema by a GitHub workflow; apply with `npm run db:deploy` (LDITNW-11).

## 2026-11-05 — backlog and links

- Jira project LDITNW set up: epics LDITNW-1 to LDITNW-5, stories LDITNW-7 to LDITNW-26.
- README and CONTRIBUTING link the Jira project and GitHub repo.
- Vercel project connected to GitHub (Node 22); `main` deploys to production.
- Scan API also answers `GET /api/scan?domain=…` (LDITNW-6).
- Scan result lists the raw MX hosts; Google Workspace detection also covers `smtp.google.com` (LDITNW-6).

## 2026-11-05 — v0.2.0 broader positioning (LDITNW-6)

- Scanner now looks for general need signals (no online ordering, marketplace-only selling, not mobile-friendly, no HTTPS, outdated site, free webmail, basic contact) instead of Zoho-specific signals.
- Technology in use (email provider, website platform, store, payments, business apps) recorded as stack context, capped at 5 points, never used in outreach.
- Manual signals: referral, IT job post, growth news.
- Need score with High / Medium / Low labels, service-line hints, strong-intent boost; fit score covers 10-500 staff and retail/e-commerce.
- Schema: role DIRECTOR, signal category, account need score and stack, deal service line and `indiaOriginated` flag.

## 2026-11-05 — v0.1.0 project start (LDITNW-6)

- Project scaffold: Next.js (App Router, TypeScript), Prisma schema for the MVP data model, Vitest.
- Zoho-signal scanner: DNS (Zoho Mail MX, SPF include) and public website checks (Forms, Creator, Books, SalesIQ, Bookings, Desk, Recruit, Sites, PageSense), rules in `src/signals/signals.json`.
- Scoring: Zoho score and label, apps detected, Zoho One hint, custom-need flag, fit score, priority.
- Scan page at `/`, API `POST /api/scan`, CLI `npm run scan`.
- README, MANUAL, CONTRIBUTING (Jira + CHANGELOG + MANUAL change process).
