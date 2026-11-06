# LeadItNow

LeadItNow finds Indian businesses that are likely to need software or IT services (ERP, CRM, SaaS, e-commerce, custom apps, AI automation, ITES), shows the evidence, and helps the AInformatIQ Chennai team work them from first contact to a signed MSA.

Product spec: LeadItNow product spec (Claude doc) · Part of the AInformatIQ product family (TestItNow, BreakItNow, BuilditNow).

## Links

- Code: https://github.com/unitedbusinessglobal/leaditnow
- Backlog: Jira project LDITNW (https://ainformatiq.atlassian.net/browse/LDITNW-1), epics LDITNW-1 to 5
- Hosting: Vercel project `leaditnow` (region sin1, Singapore, next to the Neon database)

## What works today (v0.2)

- **Need-signal scanner** (`src/signals/`): checks a domain's public website (home page plus up to 10 same-site pages, robots.txt honoured, 1 request a second) and DNS for:
  - **Need signals** (scored): sells products with no online ordering, sells only via marketplaces, not mobile-friendly, no HTTPS, out-of-date copyright, free webmail contact, contact by basic form only; plus manual signals for referrals, IT job posts and growth news.
  - **Stack signals** (context, max 5 points): email provider, website platform, store and payment tools, visible business apps.
- **Scoring**: need score (0-100, High / Medium / Low / None), service-line hints, current stack, fit score and priority.
- **Web page** at `/` and API `POST /api/scan` `{ "domain": "acme.co.in" }` or `GET /api/scan?domain=acme.co.in`. Live at https://leaditnow.vercel.app (Vercel login required).
- **CLI**: `npm run scan -- acme.co.in other.in`.
- **Data model** in `prisma/schema.prisma` for the MVP, including `Deal.indiaOriginated` for the intercompany revenue share.

Rules and weights live in `src/signals/signals.json`, so they can change without code changes. Test each rule on 10 known businesses before relying on it.

## Run locally

```bash
npm install
cp .env.example .env      # database is needed only from sprint 1 features onward
npm test                  # scanner and scoring tests (offline)
npm run dev               # http://localhost:3000
```

## Environments

Code moves DEV -> QA -> UAT -> PROD on branches `dev`, `qa`, `uat`, `main`, each with its own Vercel deployment and Neon database branch. See CONTRIBUTING.md for the change process.

## Guardrails

Public DNS records and public pages only: no logins, no scraping behind authentication, no vendor API calls on prospects' data. The detected stack is internal context: outreach never names or criticises another vendor.
