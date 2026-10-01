# WHERE WE ARE

**Last updated:** 1 October 2026, after Dewald's decisions on the Handoff 1 questions.

One page. What is true today, what is waiting on somebody, and what is next.

---

## In one line

The proof of concept is built, on GitHub and tested end to end, with Dewald's decisions applied. It is not deployed yet: the one thing in the way is that Coolify rejects the token saved in the cloud build environment.

---

## What works (tested)

- **Every acceptance criterion in the handoff has a passing test**: 38 automated tests against PostgreSQL, a 27-check walk in a real browser at phone width, and an offline test. An independent code review found two serious and eleven smaller problems; all are fixed and tested. See `HANDOFF_1_REPORT.md` for each criterion and its proof.
- Supervisor on a phone: check in (location, connection, server time), one task per screen, camera inside the task, saves every step, resumes after an interruption, out-of-range readings demand a photo and a reason, submitted records are locked in the database.
- Admin builds checklists and decides who hears about which tier, without a developer.
- A critical problem pushes to the configured people. The push service's own answer (201 Created) is stored per phone.
- Stock: broken, stolen and worn reports with photo, reorder suggestions to the chosen supplier, ordering authority, shop walk, starter list for a new shop.
- S.O.S screen, Report to Famous Brands, detailed shop report (print to PDF, download for Excel). Quality Ratio shows the raw checklist pass rate and stock condition rate, labelled "formula to be confirmed", never combined.
- Demo accounts: one button for the platform admin makes a labelled DEMO shop group with four demo sign-ins, a ready test checklist and the smalls list. Walked in a real browser at phone width, including a critical alert reaching the demo shop manager's phone (`tests/e2e/demo.ts`).
- Roles are enforced by the server: a supervisor asking the API for people, reports, S.O.S or another store is refused.

## What is not live

- **Not deployed.** `INFRASTRUCTURE.md` has the exact steps for the existing "Famous Brands" Coolify project, fully isolated from HelpLift.
- **On GitHub, not merged.** Branch `claude/famous-brands-sos-poc-9a6ipo` carries everything (it builds on `claude/confident-heisenberg-c70ifu`). `main` still has only the source documents.
- **Push alerts on a real phone are not proven yet.** Proven against a stand-in push service that decrypts the message. A real phone needs the HTTPS address.

---

## Waiting on Dewald

In the order it blocks things.

1. **The Coolify token in the cloud environment.** `setx COOLIFY_TOKEN` sets it on the Windows machine only. The cloud session uses its own saved credential, **FamousBrands** (environment menu, Edit), and Coolify answered "Unauthenticated" to it on 1 October. Put the same token there. Never paste it into a chat.
2. **Pilot shop and sign-off contact** at Famous Brands, and which phone the supervisor uses. Until then the POC is shown with the demo accounts.
3. **Quality Ratio formula.** Until then the two raw rates are shown side by side.
4. **OPUS.** What it is (tills, stock, or training?). Decided: API connection points only for the POC, connected later, the same as Munch and Aura.
5. **Gerhard's CONFIRM items** in the 46 tasks (ranges, number of ovens and fridges, licence list, long-term interval). They load as drafts with the ranges empty until then.
6. **Which smalls are franchise-locked** to Catercare (Supplier-Findings open item 1). Every item says "not confirmed" until then.
7. **POPIA staff agreement** before any real employee is added. The app records location at check-in and per answer, during the shift only.
8. **HelpLift's "This VM is shared" section** exists only on Dewald's machine. Commit and push it so every session can read it.

## Decided by Dewald, 1 October 2026

1. Standalone app, not inside DF_Growth, with its own database and photo storage, in the existing "Famous Brands" Coolify project.
2. Reuse DF_Growth's tools and mechanisms wherever they fit, and report what was reused (see `CHANGELOG.md`).
3. Quality Ratio: no formula yet. Show the raw checklist pass rate and stock condition rate, labelled "formula to be confirmed". No invented weighting.
4. OPUS, Munch, Aura: API connection points only for the POC, connected later.
5. Pilot shop and sign-off contact not known yet: clearly labelled demo accounts.
6. Live address `sos-poc.digitalflyer.co.za`, already in Xneelo DNS. Borrowed, so never hardcoded.
7. Coolify's Allowed IPs list stays empty. The token is the security boundary.

## Decided in Handoff 1

- **New app, its own repo**, not inside the DigitalFlyer Growth shell. Dewald chose this. HelpLift's patterns and standing rules were followed; DF_Growth was checked once it was connected (see `CHANGELOG.md`).
- **Plain PostgreSQL, not self-hosted Supabase.** One small database container instead of a dozen Supabase services on a box that already carries HelpLift's production data. Simpler to move. The trade: no Supabase row level security, so permissions are enforced in one service layer and proven by tests.
- **Push alerts, not WhatsApp or email**, for the POC. The alert queue already allows another channel.

## Known gaps, honestly stated

- The offline outbox covers checklist answers and photos. The shop walk and item reports need signal and say so if there is none.
- Two-figure comparisons from Gerhard's spec (sales against deposits, this month against last) are recorded as typed figures. Automatic comparison between two answers is not built.
- No alert yet for a shop closing its day with checklists unfinished. Missed checklists show on S.O.S.
- No wall tag (NFC) or QR check-in yet. Location and store connection are recorded. Web NFC works on Android Chrome only, so a QR fallback would be needed.
- People cannot reset their own password. An admin sets a new one.
- No email channel.

## What is next

1. Deploy to the "Famous Brands" Coolify project once the token is accepted, then check `/api/health` on `sos-poc.digitalflyer.co.za`.
2. Make the demo group, and prove push on a real Android phone and a real iPhone (Home Screen install).
3. Walk the whole flow on the pilot supervisor's own phone, in the shop, once the pilot is known.
4. Load Gerhard's tasks, fill in the CONFIRMs together, set tiers, publish.
5. Quality Ratio, once the formula is agreed.
