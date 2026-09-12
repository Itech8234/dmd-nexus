# Y-COMPS — Yobe Campaign Operations & Polling Unit Monitoring Platform

Field coordination, GIS monitoring, incident-management and real-time
communication platform for Dr. Muhammad Dawud's YPP campaign operations
in Yobe State.

Covers all 7 phases of the original project proposal to a working,
tested degree — see "Known gaps before you rely on this in production"
below for the honest list of what still needs attention before an
election-day deployment. Every feature described here has been exercised
against a live server (Django checks, the automated test suite, and
direct HTTP/WebSocket calls against `runserver`/`daphne`), not just
written and assumed to work.

## What's built

- **Custom user model + RBAC** (`accounts`): Super Admin, Campaign Admin, LGA
  Coordinator, Ward Coordinator, Field Official, with geographic scoping
  (a coordinator only sees their LGA/Ward) enforced at the queryset level.
- **User management**: admins/campaign admins can onboard new users
  (field officials, coordinators) directly from the dashboard's Officials
  screen — `POST /api/v1/users/` sets the password, and auto-creates the
  matching `Official` profile when the role is Field Official. Read access
  is available to coordinators too; only Super Admin/Campaign Admin can
  create or edit accounts. A user can never elevate their own role via
  `/me/` — that endpoint uses a separate, role-read-only serializer.
- **Electoral geography** (`geography`): State → LGA → Ward → Polling Unit,
  with `operational_status`, GPS coordinates, and a `/polling-units/map/` and
  `/polling-units/coverage_summary/` endpoint for the GIS map + KPI tiles.
- **Officials & assignments** (`officials`): one active official per polling
  unit (DB-level constraint), assignment history preserved.
- **Offline-first reports** (`reports`): every report carries a
  `client_generated_id` set on-device; the API is idempotent on
  `(official, client_generated_id)`, so retrying a submission after a dropped
  connection never creates a duplicate. Attachments are prioritized
  (metadata → image → other media) so large media never blocks the report
  itself, and photo attachments are correctly marked `submitted` (not
  `saved_offline`) the moment they land on the server.
- **Incident management** (`incidents`): full lifecycle (New → Reviewing →
  Assigned → Investigating → Resolved → Closed) via `/incidents/{id}/add_update/`.
- **Real-time chat** (`chatops`): full REST API (conversations, idempotent
  direct-message lookup, idempotent message send, unread counts) plus a
  Django Channels WebSocket consumer at `ws/chat/<conversation_id>/?token=...`
  for live delivery. Sending a message — over REST or the live socket —
  notifies every other conversation member (`NotificationType.MESSAGE`),
  so someone not actively watching the thread still finds out; a retried
  `client_generated_id` never double-notifies.
- **Report-overdue detection** (`geography/tasks.py`): a Celery beat task
  (every 15 min) that scans polling units against
  `YCOMPS_REPORT_OVERDUE_HOURS`, flips `operational_status` to
  `REPORT_OVERDUE`, and notifies campaign admins + the relevant LGA
  coordinator.
- **Notifications** (`notifications`): `notifications.services.notify()`
  writes the `Notification` row and pushes it in real time over
  `ws/notifications/?token=...` (one group per user); DB write always
  succeeds even if the WebSocket push fails (e.g. Redis outage), and
  `GET /api/v1/notifications/` lets clients catch up on anything missed.
  The dashboard has a live notification bell (dropdown, mark-read/mark-all,
  WebSocket push with a 60s polling fallback).
- **Live operations feed**: `ws/operations/?token=...` is a broadcast-only
  "something changed" signal (report submitted, incident submitted, SMS
  submission approved, overdue check ran) with no per-object payload — by
  design, so it needs no per-connection scoping logic. The dashboard
  listens and debounce-refreshes its map/KPIs/tables, confirmed against a
  real WebSocket client receiving a live push the moment a report posts.
- **Audit log** (`auditlog`): signal handlers on `Assignment`, `Report`,
  `Incident`, and `IncidentUpdate` write an `AuditLog` row automatically;
  request middleware attributes the acting user via a thread-local.
- **Admin Command Centre dashboard** (`dashboard`): a live, server-served,
  multi-screen frontend (Django templates + vanilla JS, no Node build
  step — deliberately, for portability) at `/` (login) and `/app/`
  (command centre). Talks directly to the DRF API with a JWT stored in
  `localStorage`, including a silent-refresh-then-retry on token expiry.
  Screens: **Command Centre** (KPI tiles, a Leaflet operations map — dark
  CartoDB basemap, colour-coded by `operational_status` — a live report
  feed, SMS-review queue, recent incidents), **Polling Units** (searchable
  table), **Reports** (searchable full list at `/reports/?search=...`),
  **Incidents** (filterable, with a one-click lifecycle-advance button),
  **Officials** (assignments + the user-onboarding form +
  message-this-official shortcut), **Analytics** (real KPIs, a 14-day
  report bar-chart, reports-by-LGA, incidents by severity, and an LGA
  coverage breakdown — all computed from live data at
  `/api/v1/dashboard/summary/` and `/api/v1/analytics/`, nothing
  fabricated), **Chat** (conversation list + live-updating thread), and
  **Audit Logs** (read-only, privileged view of `auditlog`). All
  server-originated strings (report narratives, notification bodies,
  chat messages, official names) are HTML-escaped before rendering to
  prevent stored-XSS. Self-hosted Lucide icon sprite, no CDN icon
  dependency at runtime.
- **Field Official PWA** (`field`): installable mobile app at `/field/`
  (login) and `/field/app/` (assigned location, submit report, report
  incident, **Sync now** button, **Chat with HQ**, submission history, Low
  Data Mode toggle). Every submission —
  including an attached photo — is written to an IndexedDB queue *before*
  any network attempt, so "submit" always succeeds instantly from the
  official's point of view, then synced against the same idempotent
  report/incident endpoints the moment connectivity is available (`online`
  event + a 30s retry timer as a fallback, since `online` doesn't fire
  reliably on every device), with a manual **Sync now** trigger for when
  an official wants to push the queue immediately. The field app sends a
  stable `X-YCOMPS-Device-ID` header on every request so the backend can
  record per-device sync/ledger entries (`syncengine.SyncRecord`).
  Photos are compressed client-side via canvas
  before queueing (more aggressively under Low Data Mode) and uploaded as
  a separate multipart request once the parent report has synced — if the
  photo upload fails but the report succeeded, only the photo retries
  (the report is never resent, since it's already safely idempotent-landed).
  Officials can also message the HQ user assigned to their polling unit
  through a phone-optimised chat thread (REST + WebSocket), with messages
  XSS-escaped on display. A service worker caches the app shell so the app
  itself opens with zero signal. `field/db.js` is the offline queue;
  `field/app.js` is the sync engine, and merges the local queue with the
  official's server-side history (skipped under Low Data Mode to save
  bandwidth) so a synced item never just disappears from view.
- **Sync ledger** (`syncengine`): server-side record of offline-origin
  submissions, for the "successful synchronization ≥99%" KPI.
- JWT auth (`/api/v1/auth/token/`, `/token/refresh/`, `/me/`), DRF browsable
  API, django-admin for internal ops.
- **SMS emergency-reporting fallback** (`smsgateway`, proposal §14): a
  gateway-agnostic inbound webhook at `/api/v1/sms/inbound/` (shared-secret
  header, not JWT — SMS gateways can't hold a session) accepts a compact
  command format (`REPORT <PU_CODE> <ACTIVE|RECENT|OFFLINE> <notes>` /
  `INCIDENT <PU_CODE> <LOW|MED|HIGH|CRIT> <description>`), verifies the
  sender's phone number against a registered field official, and — if
  valid — queues a `PendingSmsSubmission` for admin review rather than
  writing a Report/Incident directly (SMS is a fallback intake channel,
  not a trusted direct-write path). Unknown senders, unparseable text, and
  unknown polling-unit codes are all logged and notify admins without
  ever creating a submission. Reviewed items use the same idempotent
  create path as the app/API. The command centre dashboard has a review
  panel (Approve/Reject) wired to this. Outbound acknowledgment SMS uses
  a provider-agnostic stub (`smsgateway/client.py`) that logs instead of
  sending until real gateway credentials (Africa's Talking, Termii,
  Twilio, etc.) are configured.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then edit values

# Fast path (no Postgres needed, e.g. on Termux):
export USE_SQLITE=1
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_demo_data      # optional demo geography
python manage.py runserver
```

Visit `http://127.0.0.1:8000/admin/` or `http://127.0.0.1:8000/api/v1/`.
`createsuperuser` gives that account the `super_admin` role automatically
(a custom manager override), so it works immediately against the
dashboard and all privileged API endpoints — no manual role fixup needed.

### Running for real (Postgres + Channels)

```bash
# .env: USE_SQLITE=0, set DB_* to a real Postgres instance, REDIS_URL running
python manage.py migrate
daphne ycomps.asgi:application   # serves both HTTP and WebSocket
celery -A ycomps worker -l info  # background tasks (overdue checks, notifications)
```

`PollingUnit.latitude/longitude` are plain decimal fields for portability;
switch to `django.contrib.gis` + PostGIS (`PointField`) once you need spatial
queries (radius search, boundary polygons) — the field names are chosen so
that migration is a straightforward field-type swap.

## Key API endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/auth/token/` | Login, returns JWT access/refresh |
| `GET /api/v1/auth/me/` | Current user profile |
| `GET /api/v1/polling-units/map/` | Slim feed for the GIS operations map |
| `GET /api/v1/polling-units/coverage_summary/` | Counts by status, for dashboard KPI tiles |
| `POST /api/v1/reports/` | Submit a field report (idempotent, offline-safe) |
| `POST /api/v1/incidents/` | Submit an incident (idempotent, offline-safe) |
| `POST /api/v1/incidents/{id}/add_update/` | Advance incident lifecycle |
| `ws://.../ws/chat/{conversation_id}/?token=...` | Real-time chat |
| `GET /api/v1/notifications/` | List current user's notifications |
| `POST /api/v1/notifications/{id}/mark_read/` | Mark one notification read |
| `ws://.../ws/notifications/?token=...` | Real-time personal notification stream |
| `/field/` , `/field/app/` | Field official PWA (login, main app) |
| `/app/` | Admin command centre dashboard |
| `POST /api/v1/sms/inbound/` | SMS gateway webhook (shared-secret auth) |
| `GET/POST /api/v1/sms-pending/{id}/approve\|reject/` | Review queued SMS submissions |
| `POST /api/v1/users/` | Onboard a new user (Super Admin/Campaign Admin only) |
| `GET/POST /api/v1/conversations/`, `/direct/` | List conversations / find-or-create a 1:1 chat |
| `GET/POST /api/v1/messages/` | Chat history + idempotent send |
| `ws://.../ws/operations/?token=...` | Live map/KPI refresh signal (broadcast, no per-object data) |
| `POST /api/v1/report-attachments/` | Upload a report photo (multipart) |
| `GET /api/v1/dashboard/summary/` | Command-centre KPI aggregate (coordinator+) |
| `GET /api/v1/analytics/` | Reports-over-time / by-LGA / incident + sync analytics (coordinator+) |
| `GET /api/v1/audit-logs/` | Read-only audit log (Super Admin/Campaign Admin) |
| `GET /api/v1/assignments/assignment_options/` | Official + polling-unit candidates for the Assign form (coordinator+) |
| `GET /healthz/` | DB-backed liveness check for the load balancer |

## Importing the real polling-unit list

```bash
python manage.py import_polling_units /path/to/yobe_pu_list.csv      # import
python manage.py import_polling_units /path/to/yobe_pu_list.csv --dry-run  # validate only
```

The importer normalises common INEC CSV header variants, is idempotent, and
bumps `data_version`/`source_note` when you import a newer release without
touching live `operational_status`.

## Not yet built / known limitations before an election-day deployment

- **The authoritative Yobe polling-unit list is not loaded.**
  `seed_demo_data` creates placeholder polling units for development only,
  and the new `import_polling_units` management command imports the real
  INEC RA/PU list from a CSV, but someone still needs to **source the actual
  Yobe dataset** (the header-normalising importer at
  `geography/management/commands/import_polling_units.py` handles the
  standard INEC column layouts and is idempotent + data-versioned). Nothing
  in this system works usefully for a real election until that CSV is
  imported.
- **SMS outbound is provider-ready but not on a live account.**
  `smsgateway/client.py` now ships real Africa's Talking / Termii / Twilio
  backends (stdlib HTTP, no SDK) selectable via `SMS_GATEWAY_BACKEND`, but
  you still need to set the credentials in `.env` and, if you want field
  activity to actually page people, buy SMS credit. With no backend
  configured it safely logs instead of sending.
- **PostGIS upgrade** if/when spatial queries are needed (radius search
  around a location, boundary-polygon lookups). Migration path: install
  `binutils libproj-dev gdal-bin` on the DB host, switch
  `DATABASES.default.ENGINE` to `django.contrib.gis.db.backends.postgis`,
  add `django.contrib.gis` to `INSTALLED_APPS`, and change
  `PollingUnit.latitude`/`longitude` to a single
  `location = gis_models.PointField(null=True, blank=True)` — the
  decimal fields were named/typed specifically so this is a contained
  model change plus one data-migration, not a rewrite.
- **No load testing or penetration testing on real infra.** 58 automated
  tests cover the guarantees that matter most (idempotency, RBAC scoping,
  notification correctness, the SMS approval flow, incident/chat/assignment
  permission hardening) and a CI pipeline (`Github` Actions) runs the whole
  suite plus JS syntax checks on every push — that's meaningful
  correctness coverage, not a substitute for a security review or a load
  test ahead of an event with a hard concurrency spike (election day).
- **Nothing is actually deployed.** The Docker Compose stack is written
  and its pieces (collectstatic, `--deploy` checks) have been validated
  individually, but there is no live server, domain, or TLS certificate
  yet — `docker compose up` on real infrastructure is the next concrete
  step, not something this repo can do for you.
- **No training materials for non-technical users.** This README is
  developer-facing. Field officials, coordinators, and campaign admins
  will need a plain-language guide (screenshots, not endpoint tables)
  before onboarding — the UI is built and tested, but nobody's written
  the "how to submit your first report" one-pager yet.
- The dashboard's Officials screen shows active assignments and a full
  **Assign / End** workflow (see below), but not a roster of unassigned or
  inactive officials — an admin can still browse every field official via
  `/api/v1/officials/`.

## Running the tests

```bash
export USE_SQLITE=1
python manage.py test
```

58 tests cover the guarantees that matter most for this system: report/
incident/message idempotency (retry-safe offline sync), geographic RBAC
scoping (a field official or coordinator can't see beyond their scope),
the overdue-detection task and its notification, the one-active-official-
per-polling-unit database constraint, chat notification correctness
(including that a retried message never double-notifies), user-management
permission boundaries (a coordinator can view but not create accounts,
and nobody can elevate their own role via `/me/`), attachment sync-status
correctness, the full SMS fallback flow (bad secret, unknown sender,
malformed message, valid submission, approve/reject, assignment-mismatch
flagging), and the audit-era hardening:

- incident reporter forcing + assignment validation + idempotency,
  incident lifecycle permissions (add_update / destroy are coordinator+
  only) and their notifications;
- the 409 conflict on duplicate active assignments and the
  `assignment_options` candidate endpoint;
- chat membership validation (a non-member can't read or post to a
  conversation);
- the read-only privileged audit-log API;
- the real-data dashboard summary + analytics endpoints;
- the `import_polling_units` CSV importer (idempotent, data-versioned).

## Continuous integration

`.github/workflows/ci.yml` runs on every push/PR: installs
`requirements.txt`, `manage.py check`, `makemigrations --check --dry-run`,
the full `manage.py test` suite (SQLite, no external services), and
`node --check` on both frontend bundles.

## Deployment (Docker)

```bash
cp .env.example .env   # fill in real SECRET_KEY, DB_PASSWORD, etc.
docker compose up --build
```

This runs Postgres, Redis, the Daphne ASGI server (HTTP + WebSocket),
a Celery worker, Celery beat (for the overdue-report check), and — new —
an **nginx** reverse proxy as separate services. nginx serves
`/static/` and `/media/` directly from the shared volumes (run
`collectstatic` at container start via the web command so the volumes are
populated) and proxies everything else — including the `/ws/` WebSocket
upgrade path — to Daphne. The `web` service is now `expose`d (not
published) and only nginx is mapped to port 80. Run `docker compose exec
web python manage.py createsuperuser` once the stack is up. For
production, terminate TLS in front of nginx (the DigitalOcean load
balancer, certbot, or your DO Spaces-backed edge) and move secrets into
your platform's secret manager rather than a committed `.env`.

The stack also exposes a `/healthz/` endpoint (a simple DB-backed liveness
check) that your load balancer's health check can point at.

## Frontend design

Both frontends share one design system (`dashboard/static/dashboard/styles.css`,
imported by the field app too) grounded in a live operations-room brief
rather than generic SaaS defaults: near-black slate panels, an adire-indigo
accent (a nod to the Northern Nigerian textile dye tradition) instead of
the usual purple/terracotta, Space Grotesk for headers, IBM Plex Sans for
UI text, and IBM Plex Mono reserved only for real data (PU codes,
timestamps, counters). Icons are a self-hosted Lucide (ISC-licensed) SVG
sprite at `templates/shared/icon_sprite.html`, included once per page and
referenced by `<use href="#icon-name">` everywhere — no icon-font or CDN
dependency at runtime. The operations map uses a dark CartoDB basemap
rather than default light OSM tiles, which would clash badly against a
dark command-room interface. The field app replaces plain `<select>`
dropdowns with large, thumb-friendly colour-coded chip selectors for
report status / incident severity, and confirms every submission with a
toast rather than a silent screen change.

## Project structure

```
accounts/      custom User, RBAC/scoping permissions, JWT auth, /me
geography/     State/LGA/Ward/PollingUnit, GIS map + coverage endpoints
officials/     Official profiles, Assignments (1 active official/PU)
reports/       offline-safe field Reports + prioritized Attachments
incidents/     Incidents + lifecycle Updates
chatops/       Conversations, Messages, WebSocket consumer
notifications/ Notification model + real-time push service
auditlog/      AuditLog model + middleware + read-only API
syncengine/    SyncRecord ledger for offline-submission tracking
smsgateway/    SMS emergency-reporting fallback (inbound webhook + review queue)
dashboard/     Admin Command Centre (server-served, no build step)
field/         Field Official PWA (offline-first, IndexedDB queue)
nginx/         Reverse-proxy config for the Docker Compose stack
docs/          Implementation audit + architecture/deployment/API/offline/security guides
```

## Documentation

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system design,
[`docs/IMPLEMENTATION_AUDIT.md`](docs/IMPLEMENTATION_AUDIT.md) for a
section-by-section account of what was built versus the original 57-section
brief, [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the DigitalOcean +
Docker walkthrough, [`docs/API.md`](docs/API.md) for the endpoint reference,
[`docs/OFFLINE_SYNC.md`](docs/OFFLINE_SYNC.md) for how offline-first works
end to end, and [`docs/SECURITY.md`](docs/SECURITY.md) for the security
model applied during the audit.
