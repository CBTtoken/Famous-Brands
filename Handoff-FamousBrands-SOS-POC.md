# Handoff: Famous Brands Shop Operations POC

## Context

Famous Brands has given a go-ahead for a proof of concept. If it proves out, it rolls out across their franchise network (Africa's largest restaurant franchisor, ~20 brands including Debonairs, Steers, Wimpy, Fishaways, Mugg & Bean, roughly 3000 restaurants) as the preferred system for shop owners. This is not a side project, it is the one that opens every other door in this portfolio. Treat it at that standard from day one, not as a throwaway POC we tidy up later.

One web app, role-based, not two separate systems. A store owner or their central ordering person assigns who sees and does what. Two modules at launch, built so a third and fourth slot in later without rework.

**Known in-store systems already in use at Famous Brands sites**, relevant because this platform must be API-friendly and not fight them:
- **Munch** (munch.cloud) — cloud POS and restaurant management platform, Famous Brands holds a 45.5% stake in it directly. This is likely the single most important future integration target, since Famous Brands itself is invested in it.
- **Aura** (aurapos.com, "Aura Franchise" tier) — South African built multi-site restaurant POS, used by some franchise groups.
- **OPUS** — confirmed in use in-store by Dewald, exact vendor/product not yet identified. Do not guess at an integration spec for this one, flag it as a confirm-with-client item.

This POC does not need to integrate with any of these on day one. It needs to be built so that it could, without a rebuild. That means clean API boundaries from the start, not a monolith with integration bolted on later.

## The non-negotiables for this build

These come from house rules already proven on other projects in this portfolio and apply in full here, this audience (shop floor staff, area managers, often on a shared or cheap phone, English as a second language for many) is exactly the audience those rules were written for:

- Use their word, not ours. A checklist item label is written as the task, not the system's internal name for it.
- Numbered choices wherever a choice is offered on a phone screen, typing the number works exactly like tapping.
- Read back anything that fails silently (phone numbers, emails) before accepting it.
- Save state at every step. A supervisor can leave a checklist mid-way and resume exactly where they left off.
- No screen added to fix a wording problem, fix the words first.
- Every operation reports what it actually did. If a photo upload fails, say so, don't show success and drop it quietly.
- No fabricated proof, no placeholder data, no invented counts, ever, including in this POC.
- Short sentences, short screens, one idea per screen, professional and kind tone, no em dashes anywhere in any copy the system shows.

## Module 1: Store Supervisor Checklist App

**Who uses it:** shop floor supervisors/managers doing the checklist, and an admin (Dewald or a Famous Brands ops contact) configuring what gets checked.

**Admin side, build this first since nothing else works without it:**
- Create and edit checklist templates, grouped by what they check (opening checks, closing checks, health & safety, maintenance, whatever categories emerge)
- Each checklist item has a type: photo required, simple checkbox/tick, or free text entry
- Items can be flagged critical, urgent, important, or be-aware (matches the tiering in the notes), this tier drives whether a push notification fires and to whom
- Admin sets who gets notified for which tier, and whether it is a push notification, and can adjust this without a developer

**Supervisor side:**
- Sign-in captures a geo-timestamp (where and when this person started their shift/session)
- Each checklist item, when completed, captures its own geo-timestamp separately from sign-in, since a checklist can span a shift
- Photo capture happens in-flow (camera opens inside the task, not a separate upload step)
- Progress saves at every item, a supervisor can be interrupted and resume exactly where they left off
- Clear indicator at all times: what's done, what's next, how much is left

**Reporting:**
- A detailed report view per shop, per date range, per checklist, showing who did what, when, where, and the photo/text evidence attached
- This report is the one Famous Brands will actually look at to judge whether the POC works, so it needs to be legible to someone who has never seen the system, not just a data dump

## Module 2: Stock, Ordering & Shop Condition

**Scope:** every physical item a shop needs, from a salt pot to the rubbish bin out back, front of shop to the back door. Not food. This connects directly to the supplier research already done for the Debonairs smalls list (see the project's existing supplier findings), this module is where that becomes usable rather than a spreadsheet.

**Core behaviours:**
- A shop's full item list, each item has a status: broken, stolen, worn/wear-and-tear, or fine
- Marking an item broken/stolen/worn can trigger a reorder suggestion, tied to whichever supplier/vendor is assigned to that item (multi-vendor by design, a store owner decides who supplies what)
- Covers both a brand-new shop building its full starter list, and an existing shop topping up or replacing
- Health & safety checks live here too, since many of them are physical-condition checks (fire extinguisher present and in date, bins present and usable, etc.), not a separate third module
- Same save-state, same photo-in-flow, same geo-timestamp discipline as Module 1

## The S.O.S layer (Shop Operational Status)

This is not a third module, it is the roll-up view that sits across both. From the notes, it has three components:
1. **Performance** — how the shop is doing against its checklists and stock condition over time
2. **Report to Famous Brands** — the exportable/shareable view that goes up to the franchisor
3. **Quality Ratio** — some form of pass rate or condition score, needs a confirmed formula from Dewald before CC builds the calculation, don't invent a weighting

This is the number Famous Brands will look at to decide whether to roll this out wider. It deserves its own clean screen, not a tab buried in Module 1 or 2.

## Role-based access

Minimum roles for the POC: shop floor supervisor, shop manager, area manager, admin. A store owner or their central ordering person must be able to assign who can do what (which checklist, which ordering authority) without a developer involved. Build the permission model properly now, retrofitting roles later is expensive.

## Technical foundation

- **CC decides and proceeds:** framework choices, database schema, component structure, how the API layer is shaped internally.
- **Build this on the Xneelo Cloud + Coolify stack**, not Vercel/Supabase, matching the direction already set for every new build in this portfolio. If there's a reason to deviate for this specific project, say so and recommend, don't default back to Vercel out of habit.
- **Check first whether anything reusable already exists** in the DigitalFlyer SA / Growth codebase or elsewhere in the portfolio, role-based auth, a checklist builder, stock tracking, push notification plumbing. Reuse and improve, never a second parallel implementation of something that already works. Report what you found and what you reused, don't just silently build fresh.
- API-first: every piece of functionality (checklist completion, stock status change, S.O.S scoring) should be callable via API, not just through the UI, since the explicit requirement is to be able to link other systems in later.
- Mobile first, must work properly on a cheap Android phone on mobile data, but needs to look proper in a browser too since admin/reporting will often be used on a laptop.
- Photo storage: plan for real volume from day one (every checklist item across every shop, every day), not a quick local-storage hack.

## What needs Dewald before CC builds it

1. **Quality Ratio formula** for S.O.S, don't invent a weighting.
2. **OPUS identity** — what system is this exactly, is any integration expected for the POC or just architectural readiness.
3. Confirm whether this is a brand-new app or whether it should live inside the existing DigitalFlyer SA Growth shell, this changes the technical starting point materially.
4. Who are the actual POC test users (which shop, which Famous Brands contact signs off), since the acceptance criteria below assume a real pilot shop exists.

## Out of scope for this POC

- Multi-vendor supplier ordering automation itself (that's the ordering/supplier side already scoped separately), this handoff is the checklist and stock-tracking foundation it will plug into later
- Actual API integration with Munch, Aura, or OPUS, architecture only, not live integration
- Payment processing of any kind
- Food/ingredient stock (explicitly excluded, physical items only)

## Acceptance criteria

- A supervisor can complete a full checklist on a phone, including a photo item, a tick item, and a free-text item, with geo-timestamps captured correctly at sign-in and per item, and the whole thing survives being interrupted and resumed
- Admin can create a new checklist template, including setting photo/tick/text per item and critical/urgent/important/be-aware tiering, without a developer
- A critical-tier item triggers a push notification to whoever admin configured, and this is provably true, not just visually implied
- Stock module can register an item as broken/stolen/worn, and this is visible in a report
- S.O.S screen shows all three components (Performance, Report to Famous Brands, Quality Ratio) even if Quality Ratio is a placeholder pending the formula above
- A detailed report, per shop and date range, is legible and exportable in a form Famous Brands could actually be shown
- Role-based access genuinely restricts what each role can see and do, tested by trying to do something outside the assigned role, not just hidden in the UI

## How to report back

One report at the end, per the usual format. Update MODULES.md, CHANGELOG.md, and WHERE-WE-ARE.md. List anything made dead and deleted. Flag anything stale, contradictory, or unsafe found along the way, including anything in the existing codebase this POC touches. Confirm sweep is green before calling it done.
