# API

Everything the screens do goes through this API, so another system (Munch, Aura, OPUS, a reporting tool) can do the same without a rebuild.

## Calling it

- **People:** the `sos_session` cookie from `POST /api/v1/auth/login`. Calls that change something must come from the app's own site (Origin check).
- **Other systems:** `Authorization: Bearer sos_...`, a key created under Setup, Other systems. A key acts with one role inside one shop group and can be revoked at any time.
- Every error has the same shape, with a plain message meant for a person:
  `{ "error": { "code": "forbidden", "message": "Your role does not allow this." } }`
- A store, checklist or record outside your reach answers **404**, never confirming it exists. A role that cannot do something answers **403**.
- Times are ISO 8601 UTC from the server. Dates and periods are in store time (Africa/Johannesburg).

## Endpoints

### Session
| | |
|---|---|
| `POST /auth/login` `{login, password}` | Email or phone (any SA format) |
| `POST /auth/logout` | |
| `GET /me` | Person, groups and roles, open visit |
| `POST /me/password` `{current, next}` | |
| `POST /session/org` `{org_id}` | Which group the screens work in |

### Groups, stores, people (admin)
| | |
|---|---|
| `GET/POST /organisations` | Platform admin creates groups |
| `GET/POST /organisations/:org/stores` | `?mine=1` lists only the caller's stores |
| `PUT /stores/:store` | |
| `GET/POST /organisations/:org/people` | |
| `PATCH /organisations/:org/people/:user` | Role, active, contact details |
| `PUT /organisations/:org/people/:user/assignments` | `{assignments:[{store_id, can_order}]}` |
| `POST /organisations/:org/people/:user/password` | Admin sets a new first password |

### Checklists
| | |
|---|---|
| `GET/POST /organisations/:org/checklists` | Templates |
| `GET/PUT /checklists/:id` | Items with an `id` are updated, without are added, missing are retired |
| `POST /checklists/:id/status` | `{status: draft/published/retired}` |
| `POST /organisations/:org/library` | `{what: checklists/catalogue/suppliers}` loads starter content, reports added and skipped |

### A shift
| | |
|---|---|
| `GET/POST /visits` | Check in: `{store_id, geo:{lat,lng,accuracy_m}, client_time, reason?}`. Answers `needs_reason` when location or connection do not match |
| `POST /visits/:id/checkout` | |
| `GET /visits/:id/checklists` | What is due for this person, this period |
| `POST /runs` `{template_id}` | Start, or resume the one already started this period |
| `GET /runs/:id` | Items, answers, progress, next unanswered |
| `PUT /runs/:id/items/:item` | One answer, with its own geo and phone time |
| `POST /runs/:id/submit` | Locks it for good |
| `POST /photos` | Multipart: `photo, store_id, client_id, lat, lng, accuracy_m, captured_at`. Retry-safe by `client_id` |
| `GET /photos/:id` | |

### Stock and shop condition
| | |
|---|---|
| `GET/POST /organisations/:org/suppliers`, `PUT .../suppliers/:id` | |
| `GET/POST /organisations/:org/catalogue`, `PUT .../catalogue/:id` | |
| `GET/POST /stores/:store/items` | The shop's own list, quantity, area, supplier |
| `POST /stores/:store/starter-list` `{suggest_order}` | New shop: list plus opening order |
| `POST /condition-reports` | `{store_item_id, condition, qty, photo_id, note, walk_id?, geo}` |
| `GET /stores/:store/condition-reports?open=1` | |
| `POST /condition-reports/:id/resolve` `{note}` | |
| `POST /walks`, `GET /walks/:id`, `POST /walks/:id/submit` | Shop walk, item by item |
| `GET /stores/:store/reorders?status=open` | |
| `POST /reorders/:id` `{decision: ordered/dismissed, note}` | Needs ordering authority |

### Alerts
| | |
|---|---|
| `GET /alerts?open=1&store=` | With delivery counts |
| `POST /alerts/:id/acknowledge` | |
| `GET /alerts/:id/deliveries` | Each person, each phone, the push service's status code |
| `GET/PUT /organisations/:org/notification-rules` | Which tier reaches which role or person |
| `PUT /organisations/:org/alert-tiers` | Tiers for check-in mismatch and stock reports |
| `GET/POST/DELETE /push/subscriptions`, `POST /push/test` | |
| `POST /notifications/process` | Scheduler only, `x-cron-secret` header |

### Reports and S.O.S
| | |
|---|---|
| `GET /organisations/:org/sos?from&to&store` | Performance, shop condition, Quality Ratio status |
| `GET /stores/:store/report?from&to&checklist&format=csv` | The detailed report, JSON or CSV |

### Integration
| | |
|---|---|
| `GET/POST /organisations/:org/api-keys`, `DELETE .../api-keys/:id` | The key is shown once |
| `GET /organisations/:org/events?after=0&limit=100` | Everything that happened, in order. Keep `next_after` and ask again |
| `GET /api/health` | Database, photo storage and push keys, tested for real |

All paths above are under `/api/v1` except `/api/health`.
