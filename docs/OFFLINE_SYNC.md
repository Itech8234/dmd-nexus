# Y-COMPS Offline-First Sync (End to End)

The core guarantee: a field official on patchy connectivity can create a
report/incident and the system never loses or duplicates it. This document
traces the full path.

## The queue (client)

When an official submits, `field/static/field/db.js` (`QueueDB`) writes the
item to **IndexedDB first, unconditionally**. The submit button always
"works" instantly from the user's point of view, online or not. Each item
stores:

- `client_generated_id` — a UUID created on-device
- `object_type` — `report` or `incident`
- `payload` — the REST body
- optional `attachment_base64` + `attachment_mime` (a compressed photo)

`field/static/field/app.js` (`runSync`) then attempts to flush the queue:

- triggered by the `online` event,
- on a 30-second retry timer (because `online` doesn't fire reliably on every
  device), and
- on the manual **Sync now** button.

Each queued item is marked `synchronizing`, POSTed to `/api/v1/reports/` or
`/api/v1/incidents/`, and only removed from the queue after a `200/201`
response (and after the photo, if any, uploads successfully). If the report
succeeds but the photo upload fails, the report is **not** resent — only the
photo retries, because the report is already idempotently on the server.

## Idempotency (server)

`reports/serializers.py`, `incidents/serializers.py`, and
`chatops/serializers.py` all implement create-with-dedup:

```python
# report example (reports/serializers.py)
existing = Report.objects.filter(official=official, client_generated_id=client_id).first()
if existing:
    return existing
```

There is also a DB-level **unique constraint** on
`(official, client_generated_id)` for reports, `(reporter, client_generated_id)`
for incidents, and `(conversation, client_generated_id)` for messages. The
serializer wraps the create in a try/`IntegrityError` and re-queries on the
race so a simultaneous resubmit still returns the existing object rather than
raising 500. Net result: retransmitting the same UUID after a dropped
connection returns the **same** object with the **same** id — never a
duplicate and never an error.

## The sync ledger (`syncengine`)

The field app sends a stable `X-YCOMPS-Device-ID` header on every request
(`field/static/field/app.js`). When a report/incident is created with that
header, `reports/serializers.py` `_record_sync` writes a `SyncRecord` row
(status `succeeded`/`duplicate`/`failed`, device, timing). This powers the
"successful synchronization ≥99%" KPI surfaced in `dashboard/api.py`
`AnalyticsView`. The device id is persisted in `localStorage` so it is stable
across reloads but unique per device.

## Reconciliation (client view)

After syncing, `renderSubmissions` merges the local queue with the official's
**server-side history** (`GET /reports/?official=...`, `GET /incidents/`), so a
report that synced on this device (or a previous one) doesn't vanish from view
once `QueueDB.remove` clears it. This background fetch is skipped in **Low
Data Mode** to save bandwidth — reports still queue and sync normally, the
official just doesn't pull history.

## Offline chat

Field chat (`field/static/field/app.js`) currently attempts REST/WebSocket
deliveries while online and toasts when offline (the offline message queue is
deliberately scoped to reports/incidents for now). The conversation is
deduped on the server, so retrying a send that actually landed is safe.

## Low Data Mode

Persisted per device. It:
- reduces photo max width `1280 → 640` and JPEG quality `0.75 → 0.45`,
- skips the server-history fetch in the submissions view,
- keeps chat quiet (no background polling loop).
Reports and incidents still queue and sync normally.
