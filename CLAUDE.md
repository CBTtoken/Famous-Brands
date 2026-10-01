# CLAUDE.md

Read at the start of every session in this repository. Keeps work consistent across sessions, machines and whoever runs them.

## Project

**S.O.S, Shop Operational Status.** A proof of concept for Famous Brands: one role-based web app for franchise shops, with two modules and a roll-up.

- **Module 1, Store Supervisor Checklist.** Check in with a geo-timestamp, work checklists one task per screen (tick, number with range, photo, date, time, note), tiers drive push alerts, records cannot be edited after submission.
- **Module 2, Stock and Shop Condition.** Every physical item a shop needs (never food), its condition (fine, broken, stolen, worn), reorder suggestions to the supplier the owner chose, the standard starter list for a new shop.
- **S.O.S layer.** Performance, Report to Famous Brands, Quality Ratio (the two raw rates side by side, labelled "formula to be confirmed", until the formula is agreed).

The brief is `docs/source/Handoff-FamousBrands-SOS-POC.md`. The client's own task list and reasoning are in `docs/source/Store_Supervision_*.docx`. Supplier research is `docs/source/Supplier-Findings-v1.md`. Read `WHERE-WE-ARE.md` before starting anything.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind 4. Same versions as HelpLift.
- A standalone app with its own database and photo storage, not inside the DigitalFlyer Growth shell (Dewald, 1 October 2026). Reuse Growth's tools and mechanisms where they fit, and say what was reused.
- PostgreSQL 16 through `pg`. **No Supabase, no Vercel.** Hosted on Xneelo Cloud + Coolify (see `INFRASTRUCTURE.md`).
- Own session auth (argon2id, hashed session tokens, httpOnly cookie). API keys for other systems.
- Web Push (VAPID, `web-push`) for alerts. Every delivery attempt is recorded.
- Photos behind `src/lib/storage.ts`: `local` (a Coolify persistent volume) or `s3` (any S3-compatible bucket). A setting, not a rewrite.

## Architecture rules

- **One permission model**, `src/lib/core/authz.ts`. Every service function checks the actor itself. Pages and API routes both call services, so the API cannot do what the screen hides. A store outside someone's reach reads as "not found".
- **API first.** Every feature is a service in `src/lib/services/` with a route under `src/app/api/v1/`. The screens use the same API. See `docs/API.md`.
- **Records are evidence.** Triggers in the database stop answers, runs, visits, photos and events from being changed after the fact. Never weaken a trigger to make a feature easier.
- **Server time is the time.** Phone times are stored beside it as `client_*`, never instead of it.
- **Store time zone** (`APP_TIME_ZONE`, Africa/Johannesburg) for every "today", "this week".
- Every schema change is a new numbered file in `db/migrations`. Never edit one that has run anywhere. `node scripts/migrate.mjs` applies them; the container runs it on every start.

## Non-negotiables (house rules, `BUILDING-FOR-THIS-MARKET.md` in HelpLift)

- Their word, not ours. A task label is the task as the client wrote it.
- Number every choice on a phone screen. Typing the number works like tapping (`NumberedChoices`).
- Read back phone numbers and email addresses before saving them.
- Save state at every step. A checklist and a shop walk resume exactly where they stopped.
- Every operation reports what it actually did, including what it skipped.
- **No fabricated proof, no placeholder data, no invented numbers.** Unconfirmed ranges stay empty and marked. The Quality Ratio shows the raw checklist pass rate and stock condition rate, never a combined score, until Dewald gives the formula.
- Short sentences, professional and kind, **no em dashes** in any copy.

## Verification

- `npm run lint`, `npx tsc --noEmit`, `npm run check:style` (no em dashes in readable text, ported from DigitalFlyer Growth), `npm run build` must pass.
- `npm test` runs unit and integration tests against a real PostgreSQL (`sos_test`). It resets that database.
- `tests/e2e/walkthrough.ts` walks the acceptance criteria in a real browser against a running server, then `tests/e2e/offline.ts` and `tests/e2e/demo.ts` against the same server. Show the proof, do not just claim success.

## Guardrails

- Plan before changing files. If an approach fails twice, stop and ask.
- Do not silently refactor unrelated code. Flag it.
- Nothing internal in `public/`: it is served publicly.
- Never commit `.env*` files or secrets.
