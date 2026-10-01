# CHANGELOG

Newest first.

## 1 October 2026: Handoff 1, the proof of concept foundation

First build, from `docs/source/Handoff-FamousBrands-SOS-POC.md`.

**Added**
- Next.js 16 + PostgreSQL app, packaged as a Docker image for Coolify on Xneelo Cloud.
- Roles: platform admin, admin, area manager, shop manager, shop floor supervisor, plus API keys acting as a role. Store assignments with ordering authority per store. One permission model, enforced in every service.
- Module 1: checklist builder (tick, number with range, photo, date, time, note; four tiers; photo always or on a problem; cadences; due times; per-store and per-role). Check-in and check-out with location, store connection and server time, flag or block per store, reason required on a mismatch. One task per screen, camera inside the task, saved at every step, resume where you stopped, offline outbox. Submitted records locked in the database.
- Module 2: catalogue, suppliers, each shop's item list with quantity, area and chosen supplier; broken, stolen, worn reports with photo; reorder suggestions to the chosen supplier; ordering authority; shop walk item by item; starter list for a new shop with its opening order.
- Alerts: rules per tier to roles or named people, push to phones with every delivery and the push service's answer recorded, in-app list, acknowledgement, scheduled retry.
- S.O.S screen: Performance and shop condition per store, Report to Famous Brands, Quality Ratio placeholder awaiting the formula. Detailed shop report, printable and CSV.
- API for every feature, event feed for other systems, health check that tests the real capabilities.
- Starter content, loaded only on request: the client's 46 tasks as drafts (no invented ranges or tiers), the 85-line Debonairs smalls list with Catercare prices (the lines not on hold total R99,662.50, exactly the form's subtotal), the researched suppliers.
- Tests: 38 unit and integration tests against PostgreSQL; a 27-check browser walkthrough at phone width; a 4-check offline test in the browser.

**Fixed after an independent code review the same day** (migration `0002_review_fixes.sql`)
- The Docker build no longer needs a database (the pool is created on first use).
- A group admin, or an API key, can no longer reset the password of a platform admin or of anyone who belongs to another group.
- S.O.S no longer counts future days as missed, counts a checklist only from when it was first put in use and the store existed, and keeps retired checklists' past periods.
- Alerts are claimed while sending, so a push can never go out twice.
- The store-connection check reads the address Traefik saw, not one a phone could claim; off unless `TRUST_PROXY=true`.
- Sign-in pauses after 10 wrong passwords for one account, or 30 from one address, in 15 minutes.
- People must choose their own password before the API does anything else for them; changing it signs out their other phones.
- Health check fails only when the database is down, and no longer shows raw errors.
- Race conditions closed: double-decided reorders, double-resolved reports, simultaneous photo retries, double-tap check-in, an answer changing while a checklist is sent.
- Removed people and inactive stores can no longer start checklists on an open visit; only the person walking the shop can record on their walk.
- CSV keeps negative numbers (latitudes) as numbers; malformed ids answer 404, not 500; notification rules save in one transaction.
