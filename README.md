# LeadItNow

LeadItNow finds Indian businesses that are likely to need software or IT services (ERP, CRM, SaaS, e-commerce, custom apps, AI automation, ITES), shows the evidence, and helps the AInformatIQ Chennai team work them from first contact to a signed MSA.

Product spec: LeadItNow product spec (Claude doc) · Part of the AInformatIQ product family (TestItNow, BreakItNow, BuilditNow).

## Links

- Code: https://github.com/unitedbusinessglobal/leaditnow
- Backlog: Jira project LDITNW (https://ainformatiq.atlassian.net/browse/LDITNW-1), epics LDITNW-1 to 5
- Hosting: Vercel project `leaditnow` (region sin1, Singapore, next to the Neon database)

## What works today (v0.3)

- **Sign-in and roles** (`src/auth.ts`, `src/lib/roles.ts`): Google sign-in, invite-only. The first sign-in by `FOUNDER_EMAIL` creates the organisation and the Founder account; the Founder and Director add people under **Team**. Roles: Founder, Director (Marketing and Sales), Business Analyst, Inside Sales, Intern. Local and preview builds also offer an email-only test sign-in (`DEV_LOGIN=1`), never production.
- **Accounts**: add a company by its domain (scanned at once, scores saved), list sorted by priority with filters, account page with need signals and evidence, manual signals (referral, IT job post, growth news), contacts with DPDP source and opt-out, details, tasks and timeline.
- **CSV import**: Apollo, HubSpot or hand-made files; columns guessed and adjustable; merge by domain, then phone; gaps filled, nothing overwritten; source recorded.
- **Pipeline**: 8 stages with exit rules enforced one stage at a time (contact, meeting, pain and budget, demo and champion, signed MOU, signed MSA and value with no pending approval, live in production); backward moves and Lost with a reason; contract stages need the Director or Founder; stuck-deal flags.
- **Daily work**: log calls, meetings, emails, WhatsApp and notes; calls and meetings need a dated next step, which becomes a task; **My day** shows due tasks, open deals and the next accounts to work.
- **Approvals**: discounts above `DISCOUNT_LIMIT_PCT` (10%), edited clauses and off-list pricing go to the Founder.
- **Dashboard**: pipeline by stage and service line, stuck deals, activity per person over 7 days.
- **Net Revenue statement**: invoices and payments per deal; monthly statement on India-originated collections with the 60/40 split, fee components (20/25/15) and 15% development reserve; CSV export.
- **Scanner** (`src/signals/`): public website and DNS need signals and stack context, as in v0.2; **Quick scan** page; `GET|POST /api/scan` (signed in, or `Authorization: Bearer $CRON_SECRET`); daily Vercel Cron re-scans new and 30-day-old accounts.
- **Health**: `GET /api/health` shows the environment, database endpoint and applied migrations.

Rules and weights live in `src/signals/signals.json`, so they can change without code changes. Test each rule on 10 known businesses before relying on it.

## Database and migrations

Prisma with the Rust-free client and `@prisma/adapter-pg` over a `pg` pool (`src/lib/db.ts`), as Neon recommends for Vercel. Change `prisma/schema.prisma` and push to `main`: the **Migrations from schema** GitHub workflow writes the SQL into `prisma/migrations/` and commits it, and each Vercel build applies pending migrations to its own Neon branch before building (`scripts/vercel-build.sh`).

## Run locally

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL, AUTH_SECRET, FOUNDER_EMAIL, DEV_LOGIN=1
npx prisma migrate deploy    # create the tables
npm run dev                  # http://localhost:3000, sign in with FOUNDER_EMAIL
npm test                     # offline tests; add TEST_DATABASE_URL to run the database tests too
```

## Environments

Code moves DEV -> QA -> UAT -> PROD on branches `dev`, `qa`, `uat`, `main`, each with its own Vercel deployment and Neon database branch. See CONTRIBUTING.md for the change process.

## Guardrails

Public DNS records and public pages only: no logins, no scraping behind authentication, no vendor API calls on prospects' data. The detected stack is internal context: outreach never names or criticises another vendor.
