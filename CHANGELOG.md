# Changelog

## 2026-11-05 — v0.1.0 project start

- Project scaffold: Next.js (App Router, TypeScript), Prisma schema for the MVP data model, Vitest.
- Zoho-signal scanner: DNS (Zoho Mail MX, SPF include) and public website checks (Forms, Creator, Books, SalesIQ, Bookings, Desk, Recruit, Sites, PageSense), rules in `src/signals/signals.json`.
- Scoring: Zoho score and label, apps detected, Zoho One hint, custom-need flag, fit score, priority.
- Scan page at `/`, API `POST /api/scan`, CLI `npm run scan`.
- README, MANUAL, CONTRIBUTING (Jira + CHANGELOG + MANUAL change process).
