# Y-COMPS API Reference

Base path: `/api/v1`. All endpoints require a JWT
(`Authorization: Bearer <access>`) unless noted. Pagination: `?page=N`
(default 50). Filtering via `django-filter` (`?field=value`), search via
`?search=`, ordering via `?ordering=field` (prefix `-` for desc).

## Auth

| Method & path | Notes |
|---|---|
| `POST /auth/token/` | Login `{username, password}` → `{access, refresh}` |
| `POST /auth/token/refresh/` | Rotate refresh → new access |
| `GET /auth/me/` | Current user (read-only serializer) |
| `POST /users/` | Create user (Super/Campaign Admin). Field role auto-creates `Official` |

## Geography

| Method & path | Notes |
|---|---|
| `GET /states/`, `/lgas/?state=`, `/wards/?lga=` | Read-only for coordinators+ |
| `GET /polling-units/?search=&ward=&ward__lga=&operational_status=` | Search + order |
| `GET /polling-units/map/` | Slim GIS feed (lat/lng + status) |
| `GET /polling-units/coverage_summary/` | Counts by `operational_status` |
| `GET /healthz/` | DB-backed liveness (no auth) |

## Officials & assignments

| Method & path | Notes |
|---|---|
| `GET/POST /officials/` | Read coordinator+, write privileged |
| `GET/POST /assignments/` | One active official per PU; duplicate active → **409**; creates an `ASSIGNMENT_CHANGED` notification |
| `GET /assignments/assignment_options/` | Coordinator+; returns assignable field officials + scoped polling units (with current active official), for the dashboard Assign form |
| `PATCH /assignments/{id}/` | Coordinator+; set `status=ended` (and `ended_at`) to free a polling unit |

## Reports

| Method & path | Notes |
|---|---|
| `GET/POST /reports/` | Field officials are create/read-own; privileged can modify. Idempotent on `(official, client_generated_id)` |
| `GET /report-categories/`, `POST ...` | Read all, write privileged |
| `GET/POST /report-attachments/` | Multipart; sync_status handling |

## Incidents

| Method & path | Notes |
|---|---|
| `GET/POST /incidents/` | Field officials are create/read-own (reporter forced, assignment validated, idempotent on `(reporter, client_generated_id)`) |
| `POST /incidents/{id}/add_update/` | Coordinator+; advance status; notifies assigned admin |
| `PUT/DELETE /incidents/{id}/` | Coordinator+ |

## Chatops

| Method & path | Notes |
|---|---|
| `GET/POST /conversations/` | Member-scoped; `members` + `member_ids` |
| `POST /conversations/direct/` | Find-or-create 1:1 `{user_id}` (idempotent) |
| `POST /conversations/{id}/mark_read/` | Mark conversation read |
| `GET/POST /messages/?conversation=` | Member-scoped; idempotent on `(conversation, client_generated_id)`; membership enforced |

## Notifications

| Method & path | Notes |
|---|---|
| `GET /notifications/` | Current user's notifications (+ unread) |
| `POST /notifications/{id}/mark_read/` | Mark one read |
| `POST /notifications/mark_all_read/` | Mark all read |

## Audit log (privileged)

| Method & path | Notes |
|---|---|
| `GET /audit-logs/?ordering=-created_at` | Read-only, Super/Campaign Admin |

## Dashboard / analytics (coordinator+)

| Method & path | Notes |
|---|---|
| `GET /dashboard/summary/` | KPI aggregate (total PUs, assigned, reports, pending, overdue, open/critical incidents, coverage) |
| `GET /analytics/` | Reports/day (14d), reports by LGA, incidents by severity/status, LGA coverage table, sync stats |

## SMS fallback

| Method & path | Notes |
|---|---|
| `POST /sms/inbound/` | Gateway webhook; `X-YCOMPS-SMS-SECRET` header (not JWT) |
| `GET /sms-pending/?status=pending` | Review queue (privileged) |
| `POST /sms-pending/{id}/approve/` / `reject/` | Create underlying report/incident or reject |

## Real-time (WebSocket, `?token=...`)

| Path | Purpose |
|---|---|
| `/ws/notifications/` | Personal `user_{id}` push stream |
| `/ws/chat/{conversation_id}/` | Live chat thread |
| `/ws/operations/` | Broadcast-only "something changed" feed |
