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
- Starter content, loaded only on request: the client's 46 tasks as drafts (no invented ranges or tiers), the 85-line Debonairs smalls list with Catercare prices (totals R99,662.50, matching the order form), the researched suppliers.
- Tests: 34 unit and integration tests against PostgreSQL; a 27-check browser walkthrough at phone width.
