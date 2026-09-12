// Typed wrappers over the Django DRF API. All values come from the real backend.

import { apiFetch, apiUpload } from "./http";
import type {
  Analytics,
  Assignment,
  AssignmentOptionOfficial,
  AssignmentOptionPU,
  AuditLog,
  Conversation,
  DashboardSummary,
  Incident,
  IncidentCategory,
  IncidentMapItem,
  Message,
  NotificationItem,
  Official,
  Paginated,
  PollingUnit,
  PollingUnitMapItem,
  Report,
  ReportCategory,
  SmsInboundMessage,
  SmsPendingSubmission,
  State,
  LGA,
  Ward,
  PollingUnitRequest,
  PuRequestMapItem,
  User,
  UserAdmin,
} from "@/types";

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
}

// Option/reference endpoints (states, LGAs, wards, categories) are bare
// arrays server-side, but normalise defensively in case a paginated
// envelope sneaks in — the field forms do `list.map(...)` directly.
async function asArray<T>(p: Promise<T[] | Paginated<T>>): Promise<T[]> {
  const res = await p;
  if (Array.isArray(res)) return res;
  return res.results || [];
}

// --- Auth ---
export const authApi = {
  login: (username: string, password: string) =>
    apiFetch<{ access: string; refresh: string }>("/auth/token/", {
      method: "POST",
      body: { username, password },
    }),
  me: () => apiFetch<User>("/auth/me/"),
};

// --- Users ---
export const usersApi = {
  list: (filters: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<UserAdmin>>(`/users/${qs(filters)}`),
  get: (id: string) => apiFetch<UserAdmin>(`/users/${id}/`),
  create: (payload: Record<string, unknown>) =>
    apiFetch<UserAdmin>("/users/", { method: "POST", body: payload }),
  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch<UserAdmin>(`/users/${id}/`, { method: "PATCH", body: payload }),
};

// --- Geography ---
export const geographyApi = {
  states: () => apiFetch<State[]>("/states/"),
  lgas: (stateId?: string) => apiFetch<LGA[]>(`/lgas/${qs({ state: stateId })}`),
  wards: (lgaId?: string) => apiFetch<Ward[]>(`/wards/${qs({ lga: lgaId })}`),
  pollingUnits: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<PollingUnit>>(`/polling-units/${qs(params)}`),
  pollingUnit: (id: string) => apiFetch<PollingUnit>(`/polling-units/${id}/`),
  // The map action returns a bare JSON array (not a DRF paginated response);
  // accept params for server-side LGA/ward/status/search filtering.
  mapFeed: async (
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<PollingUnitMapItem[]> => {
    const res = await apiFetch<PollingUnitMapItem[] | Paginated<PollingUnitMapItem>>(
      `/polling-units/map/${qs(params)}`,
    );
    if (Array.isArray(res)) return res;
    return res.results || [];
  },
  coverage: () => apiFetch<Record<string, number>>("/polling-units/coverage_summary/"),
};

// --- Officials & assignments ---
export const officialsApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<Official>>(`/officials/${qs(params)}`),
  get: (id: string) => apiFetch<Official>(`/officials/${id}/`),
};

export const assignmentsApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<Assignment>>(`/assignments/${qs(params)}`),
  create: (payload: { official: string; polling_unit: string; status?: string }) =>
    apiFetch<Assignment>("/assignments/", { method: "POST", body: payload }),
  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Assignment>(`/assignments/${id}/`, { method: "PATCH", body: payload }),
  options: () =>
    apiFetch<{ officials: AssignmentOptionOfficial[]; polling_units: AssignmentOptionPU[] }>(
      "/assignments/assignment_options/",
    ),
  end: (id: string) =>
    apiFetch<Assignment>(`/assignments/${id}/`, {
      method: "PATCH",
      body: { status: "ended", ended_at: new Date().toISOString() },
    }),
};

// --- Reports ---
export const reportsApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<Report>>(`/reports/${qs(params)}`),
  get: (id: string) => apiFetch<Report>(`/reports/${id}/`),
  create: (payload: Record<string, unknown> & { client_generated_id: string }) =>
    apiFetch<Report>("/reports/", { method: "POST", body: payload }),
  categories: () => apiFetch<ReportCategory[]>("/report-categories/"),
};

// --- Incidents ---
export const incidentsApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<Incident>>(`/incidents/${qs(params)}`),
  get: (id: string) => apiFetch<Incident>(`/incidents/${id}/`),
  create: (payload: Record<string, unknown> & { client_generated_id: string }) =>
    apiFetch<Incident>("/incidents/", { method: "POST", body: payload }),
  addUpdate: (id: string, payload: { note?: string; new_status?: string }) =>
    apiFetch<Incident>(`/incidents/${id}/add_update/`, { method: "POST", body: payload }),
  categories: (includeInactive = false) =>
    apiFetch<IncidentCategory[]>(`/incident-categories/${qs({ include_inactive: includeInactive ? "1" : undefined })}`),
  createCategory: (payload: { name: string; description?: string; is_active?: boolean }) =>
    apiFetch<IncidentCategory>("/incident-categories/", { method: "POST", body: payload }),
  updateCategory: (id: string, payload: Partial<{ name: string; description: string; is_active: boolean }>) =>
    apiFetch<IncidentCategory>(`/incident-categories/${id}/`, { method: "PATCH", body: payload }),
  deleteCategory: (id: string) =>
    apiFetch<unknown>(`/incident-categories/${id}/`, { method: "DELETE" }),
  // Geo feed for the operations map's incident layer.
  mapFeed: async (params: Record<string, string | number | boolean | undefined> = {}): Promise<IncidentMapItem[]> => {
    const res = await apiFetch<IncidentMapItem[] | Paginated<IncidentMapItem>>(`/incidents/map/${qs(params)}`);
    if (Array.isArray(res)) return res;
    return res.results || [];
  },
};

// --- Chat ---
export const chatApi = {
  conversations: () => apiFetch<Paginated<Conversation>>("/conversations/"),
  contacts: () => apiFetch<User[]>("/conversations/contacts/"),
  direct: (userId: string) =>
    apiFetch<Conversation>("/conversations/direct/", { method: "POST", body: { user_id: userId } }),
  messages: (conversationId: string) =>
    apiFetch<Paginated<Message>>(`/messages/${qs({ conversation: conversationId })}`),
  send: (conversationId: string, body: string, clientGeneratedId: string) =>
    apiFetch<Message>("/messages/", {
      method: "POST",
      body: { conversation: conversationId, body, client_generated_id: clientGeneratedId },
    }),
  /** Upload a picture attachment to an existing message (multipart). */
  sendWithImage: (conversationId: string, body: string, clientGeneratedId: string, file: File) => {
    const form = new FormData();
    form.append("conversation", conversationId);
    form.append("body", body);
    form.append("client_generated_id", clientGeneratedId);
    form.append("attachment", file);
    return apiUpload<Message>("/messages/", form);
  },
  markRead: (conversationId: string) =>
    apiFetch<unknown>(`/conversations/${conversationId}/mark_read/`, { method: "POST", body: {} }),
  /** Admin: create (or reuse) the "all officials" broadcast group. */
  broadcast: (title: string) =>
    apiFetch<Conversation>("/conversations/broadcast/", { method: "POST", body: { title } }),
  /** Admin: reconcile an AUTO_ALL group's members with active users. */
  syncMembers: (conversationId: string) =>
    apiFetch<{ synced: boolean; total_members: number; added: number; removed: number }>(
      `/conversations/${conversationId}/sync_members/`,
      { method: "POST", body: {} },
    ),
  /** Unread counts for bells/badges on every dashboard. */
  summary: () =>
    apiFetch<{
      unread_messages_total: number;
      unread_by_conversation: Record<string, number>;
      unread_notifications: number;
      total_conversations: number;
    }>("/conversations/summary/"),
};

// --- FCM push devices (notification-tray delivery) ---
export const notificationDevicesApi = {
  register: (payload: { fcm_token: string; platform?: string; device_id?: string }) =>
    apiFetch<unknown>("/notification-devices/register/", { method: "POST", body: payload }),
  remove: (fcmToken: string) =>
    apiFetch<unknown>("/notification-devices/delete-token/", {
      method: "POST",
      body: { fcm_token: fcmToken },
    }),
  list: () => apiFetch<unknown[]>("/notification-devices/"),
};

// --- Notifications ---
export const notificationsApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<NotificationItem>>(`/notifications/${qs(params)}`),
  /** Authoritative unread total (used to (re)sync badge state). */
  unreadCount: async (): Promise<number> => {
    const res = await apiFetch<{ unread_count: number }>("/notifications/unread_count/");
    return Number(res.unread_count) || 0;
  },
  markRead: (id: string) =>
    apiFetch<NotificationItem>(`/notifications/${id}/mark_read/`, { method: "POST", body: {} }),
  markAllRead: () =>
    apiFetch<unknown>("/notifications/mark_all_read/", { method: "POST", body: {} }),
  /** Permanently delete one notification (destructive — confirm first). */
  remove: (id: string) =>
    apiFetch<unknown>(`/notifications/${id}/`, { method: "DELETE" }),
  /** Permanently delete every notification (destructive — confirm first). */
  clearAll: () =>
    apiFetch<unknown>("/notifications/clear_all/", { method: "POST", body: {} }),
};

// --- Analytics / dashboard ---
export const dashboardApi = {
  summary: () => apiFetch<DashboardSummary>("/dashboard/summary/"),
  analytics: () => apiFetch<Analytics>("/analytics/"),
};

// --- Audit logs ---
export const auditApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<AuditLog>>(`/audit-logs/${qs(params)}`),
};

// --- SMS pending ---
export const smsApi = {
  pending: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<SmsPendingSubmission>>(`/sms-pending/${qs(params)}`),
  approve: (id: string) =>
    apiFetch<unknown>(`/sms-pending/${id}/approve/`, { method: "POST", body: {} }),
  reject: (id: string, note?: string) =>
    apiFetch<unknown>(`/sms-pending/${id}/reject/`, {
      method: "POST",
      body: note ? { note } : {},
    }),
  /** Raw inbound SMS log (the full emergency-reporting audit trail). */
  inbound: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<SmsInboundMessage>>(`/sms-messages/${qs(params)}`),
  /** Admin self-test for the outbound SMS gateway. */
  testSend: (payload: { phone?: string; message?: string }) =>
    apiFetch<{ sent: boolean; to: string; result: Record<string, unknown> }>("/sms/test-send/", {
      method: "POST",
      body: payload,
    }),
};

// --- Polling unit requests (field proposals) ---
export const puRequestsApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiFetch<Paginated<PollingUnitRequest>>(`/pu-requests/${qs(params)}`),
  get: (id: string) => apiFetch<PollingUnitRequest>(`/pu-requests/${id}/`),
  create: (payload: {
    ward: string;
    official_code: string;
    name: string;
    location_description?: string;
    latitude: string | number;
    longitude: string | number;
    source_note?: string;
  }) => apiFetch<PollingUnitRequest>("/pu-requests/", { method: "POST", body: payload }),
  withdraw: (id: string) =>
    apiFetch<PollingUnitRequest>(`/pu-requests/${id}/`, { method: "DELETE" }),
  approve: (id: string) =>
    apiFetch<PollingUnitRequest>(`/pu-requests/${id}/approve/`, { method: "POST", body: {} }),
  reject: (id: string, note: string) =>
    apiFetch<PollingUnitRequest>(`/pu-requests/${id}/reject/`, { method: "POST", body: { note } }),
  // Pending proposals with coordinates, for the operations map overlay.
  mapFeed: async (params: Record<string, string | number | boolean | undefined> = {}): Promise<PuRequestMapItem[]> => {
    const res = await apiFetch<PuRequestMapItem[] | Paginated<PuRequestMapItem>>(
      `/pu-requests/map/${qs(params)}`,
    );
    if (Array.isArray(res)) return res;
    return res.results || [];
  },
};

export { apiUpload };
