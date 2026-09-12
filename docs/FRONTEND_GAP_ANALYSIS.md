# Frontend Gap Analysis — Next.js App vs Backend Capability

> Scope: `frontend/` (Next.js 14 App Router) compared against the live
> Django REST + Channels backend and Django Admin, audited before the
> completion phase. Every item below maps to a **real** backend endpoint —
> no fabricated surfaces were added to close gaps.

## 1. Verified working (no action)

| Area | Evidence |
|---|---|
| Auth (JWT login/refresh, route guards, role-aware shells) | `auth/token/`, `auth/me/`, `Protected`, `AdminShell`, `FieldShell` |
| Command Centre KPIs + live WS reload | `/dashboard/summary/`, `/analytics/`, `ws/operations` |
| Reports (list/detail, offline-safe create) | `/reports/`, idempotent `client_generated_id` |
| Incidents (list/detail, lifecycle updates) | `/incidents/`, `add_update/` |
| Officials (list/detail) | `/officials/` |
| Assignments (create via options, end, 409 conflict handling) | `/assignments/`, `assignment_options/` |
| Chat (REST + WS, unread, direct conversations) | `/conversations/`, `/messages/`, `ws/chat/<id>` |
| Notifications (WS bell, mark read/all) | `/notifications/`, `ws/notifications` |
| Audit logs (privileged) | `/audit-logs/` |
| SMS review queue (approve/reject) | `/sms-pending/` |
| Offline queue (IndexedDB), connectivity + sync badges, PWA shell (manifest, sw, icons) | `sync-store.ts`, `useSync.ts`, `sw.js` |
| Analytics (reports/day, severity/status, LGA coverage, sync stats) | `/analytics/` |

## 2. Gaps → implemented in this phase

| # | Gap | Backend capability used | Implementation |
|---|-----|--------------------------|----------------|
| G1 | **Map is a fake CSS-grid placeholder** (normalised dots, no tiles, no pan/zoom, no clustering) | `/polling-units/map/` (accepts `?ward__lga=`, `?ward=`, `?operational_status=`, `?search=`), `/polling-units/{id}/`, `/reports/?polling_unit=`, `/incidents/?polling_unit=` | Real Leaflet map with CartoDB light/dark basemaps, circle markers coloured by operational status, grid clustering for large datasets, server-side filters, PU side drawer (detail + recent reports/incidents + actions), `?focus=` deep-link, debounced WS refresh |
| G2 | **No light/dark theme** | — (client concern) | Theme provider (system/light/dark, persisted, no-flash boot script), token-driven dark surfaces in Tailwind, toggles in both shells + settings |
| G3 | **No geography management UI** | `/lgas/`, `/wards/?lga=`, `/polling-units/` (search/filter/paginate), `/analytics/` LGA summary | `/geography` (LGAs + Wards tabs) and `/polling-units` browser + `/polling-units/[id]` detail page |
| G4 | **Users management read-only** | `/users/` list/create/**PATCH** (`role`, `is_active`, contact fields, password) — privileged | `/users` page: search, role/status filters, create, edit, activate/deactivate, password reset |
| G5 | **No Ctrl/Cmd+K palette binding** | existing search APIs | Keyboard binding + enhanced palette with quick actions |
| G6 | **Command Centre not complete** (no LGA performance table, quick actions, freshness, sync health) | `/analytics/` (`lga_summary`, `sync`), existing KPIs | Full command-centre layout per brief §7/§64/§66 |
| G7 | **Field home lacks assigned-location context** | `/assignments/?status=active` (own), `/reports/?official=&ordering=-created_at` | Field home: assigned PU card (PU/ward/LGA), last report, sync state, SYNC NOW |
| G8 | **No Low Data Mode** | — (client concern) | Low-data toggle (persisted): suppresses WS-driven refetches, map auto-refresh and non-essential polling; surfaced in header |
| G9 | **No roles/permissions reference** | Fixed RBAC in `accounts` | Read-only RBAC matrix page under Governance |
| G10 | **Nav lacks grouping** (Operations/People/Geography/Communication/Analytics/Governance) | — | Grouped, role-aware sidebar |
| G11 | **Sync ledger not visible** | `/analytics/` sync block | Analytics sync-reliability card (privileged) |

## 3. Backend gaps discovered (documented, NOT faked)

| Missing backend capability | Impact | Resolution |
|---|---|---|
| Data import/export endpoints (PU dataset import, report/incident export) | Governance §49 of brief cannot be implemented honestly | Out of scope for frontend work; requires backend addition. Deliberately **not** simulated. |
| Map feed omits ward/lga per item | Drawer needs one extra `/polling-units/{id}/` fetch (acceptable, cached) | Handled client-side |
| No typing-indicator/presence endpoint for chat | Typing indicator not implemented (brief allows "where backend supports it") | Presence approximated by `online_status` on users; no fake typing UI |
| `GET /users/` has no `?search=` | Users page filters client-side on the (admin-scoped) result set | Acceptable: coordinator+ only, bounded dataset; documented |

## 4. Constraints honoured

- No fake data, demo markers, mock APIs, or dead buttons — every surface consumes the existing backend.
- Frontend visibility mirrors backend authorisation (`IsPrivileged`, `IsCoordinatorOrAbove`, geographic scoping); the UI never assumes a capability the server would reject.
- Existing business logic (idempotency keys, sync statuses, lifecycle transitions, scoping) is preserved end-to-end.
