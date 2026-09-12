# Y-COMPS Security Model

This is the security posture applied (and hardened) during the audit. It is
not a substitute for a professional pentest, but it fixes the highest-value
problem classes for a system with unattended field devices and a public
surface.

## Authentication

- All API endpoints use **JWT** (`rest_framework_simplejwt`), defaulting to
  `IsAuthenticated`. Short-lived access tokens (8h) + rotating refresh
  tokens (14d).
- WebSockets authenticate with `?token=` via `accounts/jwt_ws_auth.py`, which
  requires a valid token **and** `is_active=True` — an inactive/deactivated
  user cannot hold an open socket.
- The SMS inbound webhook is the one intentionally non-JWT endpoint (an SMS
  gateway can't hold a session); it is protected by a shared-secret header
  and compared with `hmac.compare_digest` to avoid timing leaks.

## Authorization (RBAC + geographic scoping)

Roles: `super_admin`, `campaign_admin`, `lga_coordinator`, `ward_coordinator`,
`field_official`.

- `IsPrivileged` — super admin + campaign admin only (user create/edit, report
  modify/delete, audit-log read, etc.).
- `IsCoordinatorOrAbove` — adds LGA/ward coordinators.
- `scope_queryset_to_user()` filters every scoped queryset by the user's LGA
  or ward. **A coordinator with no scope configured sees nothing** (safer than
  seeing everything).

Hardening applied during the audit:

| Area | Fix |
|---|---|
| Coordinator scope | `accounts/permissions.py` now returns `.none()` for unscoped coordinators |
| Field-official reports | serializer forces `official` = the caller's own `Official` and rejects unassigned polling units |
| Field-official incidents | serializer forces `reporter` to the caller's official + validates active assignment |
| Incident lifecycle | `add_update` / destroy / update are coordinator-and-above only |
| Report/incident/attachment | update/destroy are privileged-only; field officials are read+create |
| Assignment create | coordinator+; duplicate active assignment → HTTP 409 |
| Chat | a non-member cannot read or post to a conversation (+ N+1 unread fix) |
| User management | only super/campaign admins can create accounts; `/me/` uses a read-only serializer so nobody can self-elevate |

## Stored XSS

Both frontends render **server-originated** strings (report narratives,
incident descriptions, notification titles/bodies, chat messages, official
names, SMS payloads). A compromised or malicious field account could store
markup that executes in an admin's browser if injected raw. Added an `esc()`
HTML-escaper in `dashboard/static/dashboard/app.js` and
`field/static/field/app.js` and applied it to **every** such interpolation —
nothing from the server is emitted into `innerHTML` unescaped.

## Infra / transport

- `SECURE_PROXY_SSL_HEADER` honours `X-Forwarded-Proto` so HTTPS + HSTS work
  behind the DO load balancer; `DEBUG=0` enables SSL redirect, secure
  cookies, and HSTS.
- `X_FRAME_OPTIONS=DENY`, `SECURE_CONTENT_TYPE_NOSNIFF`, browser XSS filter on.
- nginx serves `/static/` + `/media/` with immutable/`Cache-Control` headers
  and proxies `/ws/` with correct upgrade headers.
- Throttling: `300/min` per authenticated user, `30/min` anonymous.

## Secret handling

- `.env` is git-ignored; `.env.example` documents every variable.
- `SMS_WEBHOOK_SECRET` and `DJANGO_SECRET_KEY` must be strong random values in
  production; the repo ships insecure defaults that fail `--deploy` checks
  until overridden.

## Notifications / audit

- Notifications are written to the DB before any best-effort WebSocket push
  (a Redis outage never loses one).
- `auditlog` middleware auto-attributes the acting user; the read-only
  `GET /api/v1/audit-logs/` gives privileged users an append-only trail.

## Remaining recommendations (out of repo scope)

- Load test election-day concurrency; add a WAF (DO firewall / Cloudflare).
- Move media to DO Spaces and pin storage credentials in a secret manager.
- Run `python manage.py check --deploy` on the production host and drive it
  through the DO load balancer with a real TLS cert.
- A CI pipeline (`.github/workflows/ci.yml`) runs the test suite + JS syntax
  checks on every push; extend it later with a dependency-vulnerability scan
  (e.g. `pip-audit`) and a migration sanity job.
- The outbound SMS backends (`smsgateway/client.py`) read their credentials
  from `.env`; keep those values in a secret manager / the DO App
  environment, never in git (`.env` is already git-ignored).

