# MODULES

Where each part of the system lives.

| Part | Service (business rules) | API | Screens |
|---|---|---|---|
| Sign-in, sessions, API keys | `src/lib/core/auth.ts` | `api/v1/auth/*`, `me` | `/login`, `/settings/password` |
| Permission model | `src/lib/core/authz.ts` | used by every route | used by every page |
| Groups, stores, people | `src/lib/services/org.ts` | `organisations/*`, `stores/:id` | `/platform`, `/setup/stores`, `/setup/people` |
| Checklist builder | `src/lib/services/templates.ts` | `organisations/:org/checklists`, `checklists/*` | `/setup/checklists` |
| Answer rules (exceptions, photo and note needed) | `src/lib/core/evaluate.ts` (pure, shared by phone and server) | | run player |
| Check-in and out | `src/lib/services/visits.ts`, `src/lib/core/geo.ts` | `visits/*` | `/shift` |
| Doing a checklist | `src/lib/services/runs.ts` | `runs/*` | `/shift/run/:id` |
| Offline outbox | `src/lib/outbox.ts` (browser, IndexedDB) | | run player, `OutboxStatus` |
| Photos | `src/lib/services/photos.ts`, `src/lib/storage.ts` | `photos/*` | camera inside each task |
| Stock and shop condition | `src/lib/services/stock.ts` | `stores/:id/items`, `condition-reports/*`, `walks/*`, `reorders/*`, catalogue, suppliers | `/stock`, `/shift/walk/:id`, `/shift/report-item`, `/setup/catalogue` |
| Alerts and push | `src/lib/services/alerts.ts`, `src/lib/services/push.ts`, `public/sw.js` | `alerts/*`, `push/*`, `notifications/process` | `/alerts`, `/settings`, `/setup/alerts` |
| S.O.S and reports | `src/lib/services/reports.ts`, `src/lib/csv.ts` | `organisations/:org/sos`, `stores/:id/report` | `/sos`, `/reports/*` |
| Integration | `src/lib/services/integration.ts`, `src/lib/core/events.ts` | `api-keys`, `events` | `/setup/integrations` |
| Starter content | `src/lib/library/*`, `src/lib/services/library.ts` | `organisations/:org/library` | buttons under Setup |
| Schema and record locks | `db/migrations/*.sql` | | |
| Time and periods | `src/lib/core/time.ts` | | |

Tests: `tests/evaluate.test.ts` (rules), `tests/integration.test.ts` (every acceptance criterion at service level, against PostgreSQL), `tests/e2e/walkthrough.ts` (real browser at phone width, real HTTP).
