# Changelog

## 2026-11-05 — v0.2.0 broader positioning

- Scanner now looks for general need signals (no online ordering, marketplace-only selling, not mobile-friendly, no HTTPS, outdated site, free webmail, basic contact) instead of Zoho-specific signals.
- Technology in use (email provider, website platform, store, payments, business apps) recorded as stack context, capped at 5 points, never used in outreach.
- Manual signals: referral, IT job post, growth news.
- Need score with High / Medium / Low labels, service-line hints, strong-intent boost; fit score covers 10-500 staff and retail/e-commerce.
- Schema: role DIRECTOR, signal category, account need score and stack, deal service line and `indiaOriginated` flag.

## 2026-11-05 — v0.1.0 project start

- Project scaffold: Next.js (App Router, TypeScript), Prisma schema for the MVP data model, Vitest.
- Zoho-signal scanner: DNS (Zoho Mail MX, SPF include) and public website checks (Forms, Creator, Books, SalesIQ, Bookings, Desk, Recruit, Sites, PageSense), rules in `src/signals/signals.json`.
- Scoring: Zoho score and label, apps detected, Zoho One hint, custom-need flag, fit score, priority.
- Scan page at `/`, API `POST /api/scan`, CLI `npm run scan`.
- README, MANUAL, CONTRIBUTING (Jira + CHANGELOG + MANUAL change process).
