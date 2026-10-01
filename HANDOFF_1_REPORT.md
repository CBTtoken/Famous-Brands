# HANDOFF 1 REPORT: S.O.S proof of concept

**1 October 2026.** Built from `docs/source/Handoff-FamousBrands-SOS-POC.md`, with Gerhard's task list and the supplier research as inputs.

## What was asked, and the proof

| Acceptance criterion (from the handoff) | Status | Proof |
|---|---|---|
| A supervisor completes a full checklist on a phone, photo, tick and text items, geo-timestamps at sign-in and per item, survives interruption and resume | Done | Browser walk at Pixel 5 size: check-in confirmed "At the store", three items saved, page left and reopened, resumes at task 4 with "3 of 4 done", submitted. Integration test checks each answer's own latitude and server time. Also survives losing signal: `tests/e2e/offline.ts`. Screenshots `docs/screenshots/02` to `09`, `19`. |
| Admin creates a checklist with photo, tick, text and tiers, without a developer | Done | Checklist builder (`/setup/checklists`), screenshot 16. Six answer kinds (tick, number with range, photo, date, time, note), four tiers, photo always or only on a problem. |
| A critical item triggers a push to whoever admin configured, provably | Done, on a stand-in push service | The browser walk records a critical fridge reading. The area manager's registered phone receives the push: the stand-in service checks the VAPID signature, **decrypts the payload** ("Critical: Walk-in fridge temperature ... 11°C is above the maximum of 5°C"), and answers 201. The 201 is stored against that phone (`push_deliveries`), shown on the alert. A shop manager with no phone set up is recorded as "no phone set up", never as sent. **Still to do:** the same on a real Android phone and iPhone once the HTTPS address exists. |
| Stock can register an item broken, stolen or worn, visible in a report | Done | From the phone: "Mobile refuse bin 240 L" reported broken with photo. Appears on the shop report, S.O.S and the stock screen, with a reorder suggestion to its supplier. Screenshots 10, 12, 15. |
| S.O.S shows Performance, Report to Famous Brands and Quality Ratio (placeholder allowed) | Done | Screenshot 11. Updated later on 1 October to Dewald's decision: Quality Ratio shows the raw checklist pass rate and stock condition rate, each with what it was counted from, labelled "formula to be confirmed", never combined into one score. |
| A detailed report per shop and date range, legible and exportable | Done | `/reports/store/:id`: visits, every checklist task with answer, problem, note, photo, time and a map link, items reported. Print or save as PDF; download for Excel (CSV, formulas neutralised). Screenshots 12, 13. |
| Role-based access genuinely restricts, tested by trying | Done | With a supervisor's own session over HTTP: people list 403, shop report 403, S.O.S 403, create checklist 403, another store's items 404, check in at another store 404, `/setup` refused. Integration tests add: shop manager cannot see a store outside her assignment, another group's admin cannot see this group, only someone with ordering authority can mark a reorder ordered, an API key acts only within its role. A cross-site request carrying a valid admin cookie is blocked. |

Run the proof again: `npm test`, then `tests/e2e/walkthrough.ts` against a running server (instructions at the top of the file).

## What was built

See `CHANGELOG.md` for the list and `MODULES.md` for where each part lives. In short:

- One role-based web app: platform admin, admin, area manager, shop manager, supervisor, and API keys that act as a role. Store assignment and ordering authority per store, set by the owner without a developer.
- Module 1, Module 2 and the S.O.S layer as specified.
- API first: every feature has an endpoint (`docs/API.md`), the screens use the same API, and an event feed lets Munch, Aura or OPUS follow along later.
- Built for real photo volume: shrunk on the phone to about 250 KB, stored behind a driver (server volume now, any S3 bucket later), checked after storing, retry-safe.
- Records are evidence: the database itself refuses to change a submitted answer, a check-in, a photo or the event log.

## Reuse: what was found and used

- **DigitalFlyer Growth codebase:** not reachable from the first build session. Checked later on 1 October once it was connected: see `CHANGELOG.md` for what was found and reused.
- **HelpLift:** same stack versions (Next.js 16.2.10, React 19.2.4, Tailwind 4), same palette, the standing rules in `BUILDING-FOR-THIS-MARKET.md` (numbered choices, read-back of phone and email, save every step, report what happened, no invented numbers, no em dashes), the notification-queue pattern, the migration discipline, and the document set (`CLAUDE.md`, `WHERE-WE-ARE.md`, `INFRASTRUCTURE.md`, `MODULES.md`, `CHANGELOG.md`). HelpLift's code is Supabase-specific (auth, RLS, storage), so it was followed as a pattern, not copied.
- **DF-WhatsApp:** not relevant to this build. Untouched.

## Decisions made, and why

- **PostgreSQL in its own container instead of self-hosted Supabase.** The handoff said Xneelo + Coolify, not Vercel or hosted Supabase. Self-hosting another Supabase means about a dozen services on the box that holds HelpLift's production data. One Postgres container is lighter, safer next to HelpLift, and simpler to move. Cost: no row level security, so permissions live in one service layer and are proven by tests that try to break them.
- **Default check-in mode is "flag", not "block"**, per the client overview: a dead router at 06:50 must not stop a shift. Block is a per-store switch.
- **The 46 tasks load as drafts**, with no tiers and no invented ranges. Which tasks are critical is the client's decision.

## Independent code review

A separate reviewer read the whole codebase for security and correctness before handing over. It found two serious problems, both fixed and covered by new tests:

1. **The Docker image would not have built**: the app needed a database address at build time.
2. **A group admin could have reset the platform admin's password**, because the platform admin was also an admin member of the first group. Accounts that reach beyond one group can now only be changed by a platform admin, and API keys can never change people.

Eleven medium and low findings were also fixed (see `CHANGELOG.md`): future days counted as missed on S.O.S, a push that could be sent twice, a spoofable store-connection check, no sign-in limit, and several race conditions. The reviewer's "checked and not a problem" list included cross-group ids, CSRF, storage paths and the cron secret.

## Made dead and deleted

Nothing. This is a new repository. The source documents moved from the repo root into `docs/source/` unchanged.

## Stale, contradictory or unsafe, found along the way

1. **The handoff names three answer types**; the client's own functional spec uses five (tick, number, photo, date, note), and one task needs a time ("opened by 09:00"). Built six, a superset.
2. **The client's functional spec, Part 3, costs Vercel and Supabase** for the live system. That contradicts the handoff's direction (Xneelo + Coolify). The handoff was followed. Part 3 needs updating before it goes back to the client.
3. **The client overview says not to use the Debonairs brand** in the software. The app is named S.O.S, carries no brand logo, and brand is a free-text field per store. The order form's item names contain "Debonairs" because that is what they are called; they are data, not branding.
4. **Order form subtotal checked**: the priced lines that are not on hold add up to exactly R99,662.50, the subtotal on the form. The 19 lines marked "on hold" on the form (stock at the FB distribution centre or head office, R12,404.68 at their listed prices) are in the catalogue with that note, so a new shop's opening order includes them unless they are taken off the starter list.
5. **The supplier findings recommend BobGo collection**; nothing here books couriers. Out of scope, as the handoff says.
6. **HelpLift's own `INFRASTRUCTURE.md`** still says "Two-factor login: [status, update once confirmed enabled]" for the Coolify dashboard that this app will also live behind. Worth confirming before a second production-adjacent app shares it.

## Waiting on Dewald

See `WHERE-WE-ARE.md`. The top three: GitHub app access to this repo, the DNS record for the temporary address, and the go-ahead (or a Coolify token) to install on the HelpLift box.

## Sweep

- `npm run lint`: clean.
- `npx tsc --noEmit`: clean.
- `npm test`: 38 of 38 pass.
- `npm run build`: passes.
- Browser walkthrough: 27 of 27 checks pass. Offline test: 4 of 4 (answer kept on the phone with no signal, sent when signal returns, phone time kept, server time stamped on arrival). Sign-in refuses the 11th wrong password.
- No em dashes in any copy or document.
- Docker image: the build stage was checked by building with no environment and no database, and the runtime stage by running the standalone bundle, migrations and bootstrap on their own. The image itself was not built (no Docker daemon in the build session); the first Coolify deploy is its first real build.
