# CHANGELOG

Newest first.

## 1 October 2026 (later): Dewald's decisions applied

Built on the Handoff 1 work (branch `claude/confident-heisenberg-c70ifu`), now on `claude/famous-brands-sos-poc-9a6ipo`.

**Changed**
- Quality Ratio shows the raw checklist pass rate (answers with no problem, of all answers in the dates) and the stock condition rate (items with no open problem, of the shop's list, today), each with what it was counted from, labelled "formula to be confirmed". Never combined into one score. On S.O.S, per shop, on Report to Famous Brands and in the API (`quality_ratio`).

**Added**
- Demo accounts (migration `0003_demo_groups.sql`): a platform admin makes one labelled DEMO shop group with a demo shop, four demo sign-ins on `.invalid` addresses sharing one chosen password, a ready test checklist (photo, tick, text and a critical item), the client's 46 tasks as drafts, the smalls list and alert rules. Built only through the existing services. A banner shows on every screen inside it. It creates no visits, answers or figures.
- `npm run check:style`: no em dashes in readable text, ported from DigitalFlyer Growth.
- `tests/e2e/demo.ts`: the demo group made and used on a phone, with its critical alert delivered. Three integration tests for the demo group, and the S.O.S test now checks the raw rates against the tables.

**Docs**
- `INFRASTRUCTURE.md`, `WHERE-WE-ARE.md`: the existing "Famous Brands" Coolify project, the DNS record already in place, Allowed IPs empty, and why the cloud session's saved Coolify credential is separate from `setx COOLIFY_TOKEN`.

**DigitalFlyer Growth: what was found and what was reused**

Growth is Next.js 16 on Vercel with Supabase for auth, database and storage. Most of its plumbing is Supabase-specific, so it cannot be lifted into this app. Checked:
- Reused: `scripts/check-house-style.mjs`, the em dash scanner with its self-test, nearly unchanged. Without it, "no em dashes" was a rule with nothing enforcing it.
- Reused: Growth's digest-checked upload (`src/lib/storage/put.ts`) as `putVerified` in `src/lib/storage.ts`. Every photo is read back and its SHA-256 compared with what was sent, retried three times, removed if it never matches, and never recorded. Before this, only the size was compared, which is the check that passed in Growth while photos were unreadable.
- Already covered here, so not copied: Growth's in-memory rate limiter (this app throttles sign-in from the database, which holds across containers); its one-place site address (`site-url.ts`; this app reads `APP_URL` and hardcodes no host).
- Kept for later, when another system starts posting to this app: Growth's single webhook signature checker (`src/lib/webhooks/signature.ts`), the pattern to follow for the first Munch, Aura or OPUS callback.
- Not present in Growth, so built here: push notifications, a checklist builder, stock tracking, role-based shop access.

**Tested**
- 42 integration and unit tests against PostgreSQL, including a photo changed by one byte in storage being refused. Browser walks at phone width: 28 of 28 acceptance checks, 4 of 4 offline checks, 7 of 7 demo checks. Typecheck, lint, style check and production build pass.

## 1 October 2026: Handoff 1, the proof of concept foundation

First build, from `docs/source/Handoff-FamousBrands-SOS-POC.md`.

**Added**
- Next.js 16 + PostgreSQL app, packaged as a Docker image for Coolify on Xneelo Cloud.
- Roles: platform admin, admin, area manager, shop manager, shop floor supervisor, plus API keys acting as a role. Store assignments with ordering authority per store. One permission model, enforced in every service.
- Module 1: checklist builder (tick, number with range, photo, date, time, note; four tiers; photo always or on a problem; cadences; due times; per-store and per-role). Check-in and check-out with location, store connection and server time, flag or block per store, reason required on a mismatch. One task per screen, camera inside the task, saved at every step, resume where you stopped, offline outbox. Submitted records locked in the database.
- Module 2: catalogue, suppliers, each shop's item list with quantity, area and chosen supplier; broken, stolen, worn reports with photo; reorder suggestions to the chosen supplier; ordering authority; shop walk item by item; starter list for a new shop with its opening order.
- Alerts: rules per tier to roles or named people, push to phones with every delivery and the push service's answer recorded, in-app list, acknowledgement, scheduled retry.
- S.O.S screen: Performance and shop condition per store, Report to Famous Brands, Quality Ratio placeholder awaiting the formula (replaced the same day by the raw rates, above). Detailed shop report, printable and CSV.
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
