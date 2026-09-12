# Django Admin → React Feature Parity Audit

> Functional reference: Django Admin (`/admin/`). Visual target: the Y-COMPS
> React admin application — Django Admin is **not** the design reference.
>
> Legend: ✅ done · 🟡 partial · ❌ missing · ⛔ intentionally admin-only /
> not exposed (judgement call, with reason)

| # | Model / module | Django Admin capability | React equivalent | Status | Required React implementation |
|---|----------------|--------------------------|------------------|--------|-------------------------------|
| 1 | `accounts.User` | List, filter (role, active), create, edit, deactivate, password reset | Settings → Users tab: list + create only | 🟡 | Dedicated `/users` page: paginated table, search, role/status filters, create, edit (role, scoped LGA/ward, contact, active), password reset. Privilege escalation guarded server-side (only Super Admin creates Super Admins) and mirrored in UI. |
| 2 | `accounts.Role` (TextChoices) | N/A — fixed choices | — | ⛔ | Fixed enumeration enforced by backend. Provide a read-only **Roles & Permissions** reference page documenting the real RBAC matrix instead of editable roles. |
| 3 | `officials.Official` | List, create, edit, verify flag, notes | `/officials` list + `/officials/[id]` detail | ✅ | Done: list, detail (profile, assignments, reports, incidents). |
| 4 | `officials.Assignment` | List, create, end/edit, history | `/assignments` page: create modal (options endpoint), end action, history table | ✅ | Done. 409 duplicate-active conflict surfaced from backend. |
| 5 | `geography.State` | List/edit | Yobe is the single state; shown via geography context | ⛔/✅ | Read-only display within Geography pages; no write UI needed (seed data). |
| 6 | `geography.LGA` | List, edit, filter | ❌ (map only) | ❌ | **Geography → LGAs tab**: table with name/code + per-LGA operational stats from `/analytics/` (coverage, reports, open incidents). |
| 7 | `geography.Ward` | List, edit, filter by LGA | ❌ | ❌ | **Geography → Wards tab**: LGA-scoped ward table. |
| 8 | `geography.PollingUnit` | List, search, filter (ward, LGA, status), coordinates, status edit | ❌ (map feed only) | ❌ | **Geography → Polling Units tab** (`/polling-units`): paginated, searchable, filterable table; `/polling-units/[id]` detail (location, assigned official, latest report, status, map link); status changes remain backend/Celery-owned (task-driven) so no manual status editing in React. |
| 9 | `reports.Report` | List, filter, view, edit privileged | `/reports` list + `/reports/[id]` detail | ✅ | Done, incl. sync status, attachments, client-generated id. |
| 10 | `reports.ReportAttachment` | Inline view/download | Report detail gallery | ✅ | Done. |
| 11 | `reports.ReportCategory` | List/edit | Category dropdown sourced from API | ✅ | Done (read for forms; category management is seed data → ⛔ write UI). |
| 12 | `incidents.Incident` | List, filter, status transitions via updates | `/incidents` + `/incidents/[id]` lifecycle timeline + `add_update` | ✅ | Done. |
| 13 | `incidents.IncidentCategory` | List/edit | Category dropdown sourced from API | ✅ | Done (read). |
| 14 | `chatops.Conversation` / `Message` | List, inspect | `/chat` (admin) + `/field/chat` (field) with WebSocket live delivery, unread counts, direct conversation launcher | ✅ | Done. Offline composition + idempotent send mirrors backend `client_generated_id`. |
| 15 | `notifications.Notification` | List | `/notifications` + `/field/notifications`, live WS bell, mark read / mark all | ✅ | Done. |
| 16 | `auditlog.AuditLog` | List, filter | `/audit` page (privileged) | ✅ | Done: search + action filter + pagination. |
| 17 | `syncengine.SyncRecord` | List, filter | Analytics sync panel (success rate, failed, duplicates) | 🟡 | Show per-record ledger table under Analytics (privileged) for failure triage. |
| 18 | `smsgateway.InboundSmsMessage` | List, filter by parse result | ❌ raw log | ⛔ | Raw webhook log is technical; the actionable surface is the pending queue below. Documented, not exposed. |
| 19 | `smsgateway.PendingSmsSubmission` | Review queue, approve/reject | Settings → SMS Queue tab with approve/reject | ✅ | Done. |
| 20 | Dashboard KPI aggregate (`/dashboard/summary/`) | n/a (API only) | Command Centre KPI tiles | ✅ | Upgraded: LGA performance table, quick actions, freshness stamps, sync health. |
| 21 | GIS map feed (`/polling-units/map/`) | n/a (API only) | Placeholder grid | ❌→✅ | **Real Leaflet map**: tile basemap (light/dark), status-coloured markers, clustering, server-side LGA/ward/status/search filters, PU side drawer with actions. |
| 22 | Celery overdue task | n/a | Status surfaced via KPIs (overdue) | ✅ | Done. |
| 23 | Data import/export | ❌ none in backend | — | ⛔ | **Backend gap** — no import/export endpoints exist. Do not fabricate; documented in FRONTEND_GAP_ANALYSIS.md. |
| 24 | Django Admin site settings/auth backend config | Technical | — | ⛔ | Infrastructure; stays in Django Admin by design. |

**Judgement calls (⛔)**: raw SMS webhook log, category/seed-data write UIs,
user role escalation for non-super-admins, and internal infrastructure stay
out of the React app. The React app must not expose actions the backend
would reject — the UI mirrors, never bypasses, server authorisation.
