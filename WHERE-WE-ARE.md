# WHERE WE ARE

**Last updated:** 1 October 2026, after Handoff 1.

One page. What is true today, what is waiting on somebody, and what is next.

---

## In one line

The proof of concept is built and tested end to end on a test database, but not yet deployed. It is waiting on GitHub access, a DNS record and a go-ahead to install it on the HelpLift box.

---

## What works (tested)

- **Every acceptance criterion in the handoff has a passing test**: 38 automated tests against PostgreSQL, a 27-check walk in a real browser at phone width, and an offline test. An independent code review found two serious and eleven smaller problems; all are fixed and tested. See `HANDOFF_1_REPORT.md` for each criterion and its proof.
- Supervisor on a phone: check in (location, connection, server time), one task per screen, camera inside the task, saves every step, resumes after an interruption, out-of-range readings demand a photo and a reason, submitted records are locked in the database.
- Admin builds checklists and decides who hears about which tier, without a developer.
- A critical problem pushes to the configured people. The push service's own answer (201 Created) is stored per phone.
- Stock: broken, stolen and worn reports with photo, reorder suggestions to the chosen supplier, ordering authority, shop walk, starter list for a new shop.
- S.O.S screen, Report to Famous Brands, detailed shop report (print to PDF, download for Excel).
- Roles are enforced by the server: a supervisor asking the API for people, reports, S.O.S or another store is refused.

## What is not live

- **Not deployed.** `INFRASTRUCTURE.md` has the exact steps for the HelpLift box, fully isolated from HelpLift.
- **Not pushed to GitHub.** The Claude GitHub App is not installed on `CBTtoken/Famous-Brands`, so the work sits on branch `claude/confident-heisenberg-c70ifu` in the build session only.
- **Push alerts on a real phone are not proven yet.** Proven against a stand-in push service that decrypts the message. A real phone needs the HTTPS address.

---

## Waiting on Dewald

In the order it blocks things.

1. **GitHub access.** Install the Claude GitHub App on `CBTtoken/Famous-Brands` (github.com/apps/claude/installations/select_target).
2. **The temporary address.** One A record in Xneelo's DNS: `sos-poc.digitalflyer.co.za` (or another name) pointing at `154.65.106.166`. Camera, location and push all need HTTPS, which sslip.io addresses cannot get.
3. **Go-ahead to install on the HelpLift box**, and either a Coolify API token or 20 minutes to click through `INFRASTRUCTURE.md` together.
4. **Quality Ratio formula.** The screen shows the inputs and no score until this is agreed.
5. **OPUS.** What it is (tills, stock, or training?). Research could not identify it. The API is ready for it either way.
6. **Pilot shop and sign-off contact** at Famous Brands, and which phone the supervisor uses.
7. **Gerhard's CONFIRM items** in the 46 tasks (ranges, number of ovens and fridges, licence list, long-term interval). They load as drafts with the ranges empty until then.
8. **Which smalls are franchise-locked** to Catercare (Supplier-Findings open item 1). Every item says "not confirmed" until then.
9. **POPIA staff agreement** before any real employee is added. The app records location at check-in and per answer, during the shift only.

## Decided in this handoff

- **New app, its own repo**, not inside the DigitalFlyer Growth shell. Dewald chose this. The Growth codebase was not reachable from the build session, so nothing could be reused from it. HelpLift's patterns and standing rules were followed instead.
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

1. Deploy to the HelpLift box (after the three waiting items above), then prove push on a real Android phone and a real iPhone (Home Screen install).
2. Walk the whole flow on the pilot supervisor's own phone, in the shop.
3. Load Gerhard's tasks, fill in the CONFIRMs together, set tiers, publish.
4. Quality Ratio, once the formula is agreed.
