# LeadItNow

LeadItNow finds Indian businesses that already run on Zoho, proves it with evidence, and helps the AInformatIQ Chennai team work them from first contact to a signed MSA.

Product spec: LeadItNow product spec (Claude doc) · Jira: LeadItNow epics · Part of the AInformatIQ product family (TestItNow, BreakItNow, BuilditNow).

## What works today (v0.1)

- **Zoho-signal scanner** (`src/signals/`): checks a domain's DNS (Zoho Mail MX, SPF include) and its public website (home page plus up to 10 same-site pages, robots.txt honoured, 1 request a second) for Zoho Forms, Creator, Books, SalesIQ, Bookings, Desk, Recruit, Sites and PageSense traces.
- **Scoring**: Zoho score (0-100, Confirmed / Likely / Possible), Zoho apps found, Zoho One hint, custom-need flag, fit score and priority.
- **Web page** at `/` and API `POST /api/scan` `{ "domain": "acme.co.in" }`.
- **CLI**: `npm run scan -- acme.co.in other.in`.
- **Data model** in `prisma/schema.prisma` for the MVP (accounts, contacts, signals, deals, activities, tasks, documents, audit log).

Rules and weights live in `src/signals/signals.json`, so they can change without code changes. Rules marked `"verified": false` must be confirmed against known Zoho users before they count at full weight.

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

Public DNS records and public pages only: no logins, no scraping behind authentication, no Zoho API calls on prospects' data. Describe Zoho factually; no Zoho logos.
