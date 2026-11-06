# Changelog

## 2026-11-06 — Neon Singapore

- Linked to Neon project `polished-cell-49111239` with `neon init` (`neon.ts`, `@neon/config`, `@neon/env`; `.neon` is git-ignored).
- dev, qa and uat now use the Neon Singapore branches; Vercel functions moved to Singapore (sin1) to sit next to the database; prod moves when its Singapore string is ready (LDITNW-11).

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
