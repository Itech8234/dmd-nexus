# Y-COMPS Implementation Audit

This document maps the original 57-section project brief to what is actually
implemented, and records the security/correctness fixes and feature additions
landed in this audit. Everything listed is exercised by the automated test
suite (54 tests) or validated by `manage.py check` and live HTTP
verification.

## Scope & finding summary

The brief proposes a field-coordination, GIS-monitoring, incident-management
and real-time-communication platform. The delivered system implements all
seven phases to a working, tested degree. This audit focused on the highest
risk areas for a system with unattended field devices and a public API:

1. **IDOR / privilege escalation** in create/update/delete paths.
2. **Role/scope enforcement** for coordinators and field officials.
3. **Offline idempotency** (retry-safe sync) as a database guarantee.
4. **Stored XSS** in dashboards that render field-entered text.
5. **Complete the backend surface** the brief calls for (analytics, audit
   log API, notifications, ordering) and make the frontends production-grade.

## Backend hardening applied

### Access control (`accounts/`)
- `permissions.py`: an **unscoped coordinator now gets `.none()`** instead of
  full access (was a privilege-escalation risk).
- `jwt_ws_auth.py`: WebSocket auth now **rejects inactive users**.
- `serializers.py`: **only super admins can create super-admin accounts**;
  `/me/` stays read-only so nobody self-elevates.

### Reports (`reports/`)
- Field officials are forced to their own `Official` and must have an
  **active assignment** to the polling unit; ownership is enforced for
  attachments too.
- Create is idempotent on `(official, client_generated_id)` with an
  `IntegrityError` race fallback; `ReportCategoryViewSet` and report
  update/destroy are privileged-only.
- Added `SearchFilter` (`narrative`, PU code/name) and ordering; added a note
  notification on new reports (`_notify_new_report`) and a sync ledger
  record (`_record_sync` → `SyncRecord`) when `X-YCOMPS-Device-ID` is sent.
- Serializer now exposes `polling_unit_code`, `official_name`,
  `polling_unit_status`, `category_name` for the dashboard Reports screen.

### Incidents (`incidents/`)
- Field officials are forced to their own `reporter` with assignment
  validation; create is idempotent on `(reporter, client_generated_id)` with
  a new DB unique constraint (`0002`) + `IntegrityError` fallback.
- `add_update` is **coordinator-and-above only**; update/destroy privileged;
  ordering added. New incidents notify admins + the relevant LGA coordinator
  (`NEW_INCIDENT`), critical incidents are flagged.

### Chatops (`chatops/`)
- Message create now **validates conversation membership** (a non-member gets
  400) and is idempotent on `(conversation, client_generated_id)` with a new
  DB unique constraint (`0003`).
- Fixed the `unread_count` N+1 (iterates the already-prefetched members
  instead of a per-object query).

### Officials (`officials/`)
- `OfficialViewSet` uses action-based permissions (read coordinator+,
  write privileged).
- `AssignmentViewSet` catches the one-active-official DB constraint and
  returns **HTTP 409** with a clear message; new assignments notify the
  official (`ASSIGNMENT_CHANGED`); serializer exposes `official_reference`.

### Geography, settings, SMS
- Added ordering/search to `PollingUnitViewSet`.
- `settings.py`: `SECURE_PROXY_SSL_HEADER` (for the DO load balancer behind
  nginx) and a proper `LOGGING` config (console + rotating file).
- `smsgateway/views.py`: webhook secret compared with `hmac.compare_digest`.

## New backend features completed

- **Audit log API** (`auditlog/`): read-only `AuditLogViewSet`
  (`GET /api/v1/audit-logs/`), privileged-only, with actor-name resolution.
- **Dashboard analytics** (`dashboard/api.py`): `DashboardSummaryView`
  (KPIs) and `AnalyticsView` (reports/day, reports-by-LGA, incidents by
  severity/status, LGA coverage table, sync stats) — all real-data, all
  geographic-scope-aware.
- **Healthcheck**: `GET /healthz/` DB-backed liveness for the load balancer.

## Frontend productionisation

### Dashboard (`dashboard/`)
- Added an **`esc()`** helper and escaped every server-originated string
  across KPI tiles, map popups, activity feed, incident tables, notification
  bell, SMS review queue, polling-units, officials, chat list, and message
  bubbles (stored-XSS fix).
- New **Reports**, **Analytics**, and **Audit Logs** screens wired into the
  sidebar + screen loaders; added missing Lucide icons to the sprite.
- Analytics screen renders a 14-day bar chart, per-LGA report counts,
  incident severity breakdowns, and the LGA coverage table from the new API.

### Field PWA (`field/`)
- Sends a stable **`X-YCOMPS-Device-ID`** header (feeds `syncengine`).
- Added **Sync now** button and **Chat with HQ** (message the user assigned
  to your polling unit) with XSS-escaped message bubbles; `esc()` added for
  toasts.
- Chat additions styled in `field/static/field/styles.css`.

## Infrastructure

- Added an **nginx** service to `docker-compose.yml`: serves `/static/` +
  `/media/` from shared volumes, proxies `/ws/` with upgrade headers; `web`
  (Daphne) is now internal (`expose`d) and runs `collectstatic` at start so
  the volumes get populated. Config at `nginx/nginx.conf`.
- Added the missing **`.env.example`** and linked it from the README.

## Test suite

58 tests pass. Coverage includes everything from the earlier audit pass plus
new additions in this follow-up: the `import_polling_units` CSV importer
(idempotency, code normalisation, dry-run, missing-column failure), the
`assignment_options` candidate endpoint (scope + active-official flag, and
that field officials can't read it), and the pluggable SMS backends
(unconfigured real backend raises loudly). `manage.py check` is clean and
`makemigrations --check --dry-run` reports no pending migrations.

## This follow-up's additions

- **`import_polling_units` command** (`geography/management/commands/`):
  idempotent, header-normalising CSV importer for the real INEC RA/PU list
  (see the README "Importing the real polling-unit list" section).
- **Pluggable outbound SMS** (`smsgateway/client.py`): stdlib-HTTP backends
  for Africa's Talking / Termii / Twilio, selected by `SMS_GATEWAY_BACKEND`;
  unconfigured real backends raise `SmsConfigurationError` instead of
  silently doing nothing.
- **CI pipeline** (`.github/workflows/ci.yml`): check, migration drift,
  full test suite, and `node --check` on both frontends.
- **Dashboard assignment UI**: an Assign form (official + polling-unit
  selects fed by `assignment_options`) and per-row End actions on the
  Officials screen; human-readable 409 conflict handling.

## Remaining gaps (unchanged from the brief)

See the README "Not yet built / known limitations" section: the real Yobe
INEC PU list still needs to be **sourced** (the importer is ready), the SMS
backends need live credentials and credit, PostGIS is a documented upgrade
path for spatial queries, and there is no load/penetration test on real
infrastructure yet.
