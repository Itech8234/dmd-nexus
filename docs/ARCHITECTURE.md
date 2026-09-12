# Y-COMPS Architecture

Y-COMPS (Yobe Campaign Operations & Polling Unit Monitoring Platform) is a
Django 5 backend serving two Django-template + vanilla-JS frontends (an admin
command centre and a field-official PWA), with real-time push via Django
Channels/WebSockets and background jobs via Celery. There is **no Node build
step** anywhere in the stack.

## Runtime topology

```
Internet / field SIM
        │
        ▼
   [ nginx ]  (reverse proxy, serves /static + /media from volumes)
        │  http + ws upgrade
        ▼
   [ Daphne ASGI ]  ── HTTP: DRF API + Django templates
        │            ── WS:   /ws/notifications, /ws/chat/*, /ws/operations
        │
   ┌────┴────────────┬──────────────────┐
   ▼                 ▼                  ▼
Postgres          Redis             Celery worker (+ beat)
(PostGIS-ready)  (channels layer,   (overdue-report scan,
                  celery broker)      notifications, SMS)
```

- `daphne` serves HTTP **and** WebSockets in one process.
- nginx terminates the public port, proxies `/ws/` with upgrade headers, and
  serves `/static/` + `/media/` from shared Docker volumes.
- Celery beat runs the 15-minute overdue-report scan; the worker runs it.
- Redis backs both the Channels layer and Celery.

## Application layout

| App | Responsibility |
|---|---|
| `accounts` | Custom `User` (roles), RBAC + geographic scoping permissions, JWT auth, `/me`, user admin |
| `geography` | State → LGA → Ward → PollingUnit, operational status, GIS map/coverage endpoints, overdue task |
| `officials` | `Official` profiles, `Assignment` (one active official per PU, DB-enforced) |
| `reports` | Offline-safe `Report`s + prioritized `Attachment`s |
| `incidents` | `Incident` lifecycle + `IncidentUpdate` trail |
| `chatops` | `Conversation`/`Message`, in-app chat + WebSocket |
| `notifications` | `Notification` rows + real-time push service |
| `auditlog` | Append-only `AuditLog` + attribution middleware + read-only API |
| `syncengine` | `SyncRecord` ledger for offline-origin submissions |
| `smsgateway` | SMS inbound webhook + pending-review queue |
| `dashboard` | Admin command centre (templates + JS), summary/analytics APIs |
| `field` | Field PWA (IndexedDB queue, service worker, offline-first) |

## Key design decisions

1. **Offline-first with idempotency.** Every report, incident, and chat message
   carries a client-generated UUID. Create endpoints dedupe on
   `(owner, client_generated_id)` behind an explicit `IntegrityError`
   fallback, so a retried submission after a dropped connection never
   duplicates. This is the backbone of the offline workflow.
2. **Geo-scoped RBAC at the queryset level.** `scope_queryset_to_user()`
   applies LGA/field filtering for coordinators; privileged roles are
   unscoped; field officials are narrowed to their own records upstream.
   A coordinator with no scope sees nothing, not everything.
3. **Broadcast-only operations feed.** `ws/operations/` carries no per-object
   data — just a "something changed" signal — so it needs no per-connection
   scoping. Clients debounce-refresh their local views.
4. **Server-served, buildless frontends.** Django templates render the shell;
   vanilla JS consumes the DRF API. No build step means the repo deploys
   anywhere Django runs, including low-bandwidth campaign offices.
5. **Notifications are DB-first.** `notify()` writes the `Notification` row
   (source of truth) then best-effort pushes over WebSocket. A Redis outage
   never loses a notification; clients poll to catch up.

## Frontends

- **Dashboard (`/`, `/app/`)** — command centre with KPI tiles, Leaflet
  operations map (dark CartoDB basemap), live report feed, incident table,
  SMS review queue, polling-units/reports/incidents/officials/analytics/chat/
  audit-logs screens. JWT in `localStorage`, silent refresh on 401.
- **Field (`/field/`, `/field/app/`)** — installable PWA. Submissions are
  written to an IndexedDB queue before any network attempt, then synced via
  the idempotent endpoints. Low Data Mode reduces photo size and skips
  background fetches. Sends `X-YCOMPS-Device-ID` for per-device ledger
  records. Includes a phone-optimised chat with HQ.
- Both escape server-originated strings before `innerHTML` to prevent
  stored XSS.

## Concurrency & streaming

- WebSockets: per-user notification group (`user_{id}`), per-conversation
  chat group, and a global `operations_feed` group.
- REST message creation also broadcasts to the conversation group, so an
  offline-queued message synced later still appears live for connected peers.

See `docs/DEPLOYMENT.md` for running the full stack and
`docs/OFFLINE_SYNC.md` for the end-to-end offline flow.
