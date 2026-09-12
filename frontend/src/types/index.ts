// ---------------------------------------------------------------------------
// Y-COMPS API types — mirrors the Django DRF serializers (the source of truth).
// ---------------------------------------------------------------------------

export type Role =
  | "super_admin"
  | "campaign_admin"
  | "lga_coordinator"
  | "ward_coordinator"
  | "field_official";

export type OnlineStatus = "online" | "offline" | "unknown";

export interface User {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  role: Role;
  scoped_lga: string | null;
  scoped_ward: string | null;
  is_active_field_user: boolean;
  online_status: OnlineStatus;
}

export interface UserAdmin extends User {
  is_active: boolean;
  created_at: string;
  password?: string;
}

export type OperationalStatus =
  | "active_reporting"
  | "recently_reported"
  | "report_overdue"
  | "incident_reported"
  | "awaiting_assignment"
  | "official_offline";

export interface PollingUnit {
  id: string;
  ward: string;
  ward_name: string;
  lga_name: string;
  official_code: string;
  name: string;
  location_description: string;
  latitude: string | null;
  longitude: string | null;
  operational_status: OperationalStatus;
  data_version: number;
  source_note: string;
  assigned_official: { official_id: string; name: string } | null;
  latest_report_at: string | null;
  updated_at: string;
}

export interface PollingUnitMapItem {
  id: string;
  official_code: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  operational_status: OperationalStatus;
  ward_name?: string;
  lga_name?: string;
  location_description?: string;
}

export interface LGA {
  id: string;
  state: string;
  name: string;
  code: string;
}

export interface Ward {
  id: string;
  lga: string;
  name: string;
  code: string;
}

export interface State {
  id: string;
  name: string;
  code: string;
}

export interface Official {
  id: string;
  user: string;
  full_name: string;
  official_reference: string;
  id_verified: boolean;
  notes: string;
  created_at: string;
}

export interface AssignedOfficialRef {
  id: string;
  name: string;
  official_reference: string;
}

export interface Assignment {
  id: string;
  official: string;
  official_name: string;
  official_reference: string;
  polling_unit: string;
  polling_unit_code: string;
  status: "active" | "ended" | "suspended";
  assigned_by: string | null;
  assigned_at: string;
  ended_at: string | null;
}

export interface AssignmentOptionOfficial {
  id: string;
  official_reference: string;
  full_name: string;
}

export interface AssignmentOptionPU {
  id: string;
  official_code: string;
  name: string;
  ward_name: string;
  lga_name: string;
  assigned_official: { id: string; name: string } | null;
}

export type ReportSyncStatus = "saved_offline" | "synchronizing" | "submitted" | "failed";

export interface ReportAttachment {
  id: string;
  report: string;
  file: string;
  priority: number;
  sync_status: ReportSyncStatus;
  uploaded_at: string;
}

export interface Report {
  id: string;
  client_generated_id: string;
  polling_unit: string;
  polling_unit_code: string;
  official: string;
  official_name: string;
  category: string;
  category_name: string;
  operational_status: string;
  polling_unit_status: OperationalStatus;
  narrative: string;
  device_captured_at: string;
  server_received_at: string;
  sync_status: ReportSyncStatus;
  attachments: ReportAttachment[];
  created_at: string;
}

export interface ReportCategory {
  id: string;
  name: string;
  description: string;
}

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus =
  | "reported"
  | "assigned"
  | "investigating"
  | "resolved"
  | "closed";

export interface IncidentUpdate {
  id: string;
  incident: string;
  author: string;
  author_name: string;
  note: string;
  new_status: IncidentStatus;
  created_at: string;
}

export interface Incident {
  id: string;
  client_generated_id: string;
  polling_unit: string;
  polling_unit_code: string;
  reporter: string;
  category: string;
  category_name?: string | null;
  severity: IncidentSeverity;
  description: string;
  status: IncidentStatus;
  assigned_admin: string | null;
  resolution: string;
  device_captured_at: string;
  created_at: string;
  updated_at: string;
  updates: IncidentUpdate[];
}

export interface IncidentCategory {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  incident_count?: number;
  created_at?: string;
}

/** Geo feed item for the map's incident layer (from /incidents/map/). */
export interface IncidentMapItem {
  id: string;
  polling_unit: string;
  polling_unit_code: string;
  polling_unit_name: string;
  latitude: string | null;
  longitude: string | null;
  category_name: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  description: string;
  created_at: string;
}

// --- Polling unit requests (field proposals awaiting admin review) ---

export type PuRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface PollingUnitRequest {
  id: string;
  ward: string;
  ward_name: string;
  lga: string;
  lga_name: string;
  official_code: string;
  name: string;
  location_description: string;
  latitude: string | null;
  longitude: string | null;
  source_note: string;
  status: PuRequestStatus;
  submitted_by: string | null;
  submitted_by_name: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string;
  reviewed_at: string | null;
  review_note: string;
  created_polling_unit: string | null;
  created_polling_unit_code: string;
}

export interface PuRequestMapItem {
  id: string;
  official_code: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  status: PuRequestStatus;
}

export type NotificationType =
  | "new_incident"
  | "system_alert"
  | "assignment_changed"
  | "report_overdue"
  | "message"
  | "report_submitted"
  | "pu_request_submitted"
  | "pu_request_decided";

export interface NotificationItem {
  id: string;
  notification_type: NotificationType;
  title: string;
  body: string;
  related_object_type: string;
  related_object_id: string;
  is_read: boolean;
  created_at: string;
  /** Authoritative unread badge total, included on WS pushes. */
  unread_count?: number;
}

export interface ConversationMember {
  id: string;
  user: string;
  user_name: string;
  username: string;
  joined_at: string;
  last_read_at: string | null;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  title: string;
  created_at: string;
  members: ConversationMember[];
  member_policy?: "manual" | "auto_all";
  last_message: {
    body: string;
    sender_name: string;
    created_at: string;
    has_attachment?: boolean;
    attachment_url?: string;
    attachment_name?: string;
  } | null;
  unread_count: number;
  /** For direct conversations — the display name of the other member. */
  partner_name?: string;
}

export interface Message {
  id: string;
  client_generated_id: string;
  conversation: string;
  sender: string;
  sender_name: string;
  body: string;
  attachment: string | null;
  attachment_url?: string | null;
  created_at: string;
  delivered_at: string;
}

export interface AuditLog {
  id: string;
  actor: string | null;
  actor_name: string;
  action: string;
  object_type: string;
  object_id: string;
  /** JSONField server-side: arrives as an object (or occasionally a string). */
  detail: Record<string, unknown> | string | null;
  ip_address: string;
  result: string;
  created_at: string;
}

export interface DashboardSummary {
  total_polling_units: number;
  assigned_officials: number;
  active_officials: number;
  reports_received: number;
  pending_reports: number;
  overdue_reports: number;
  open_incidents: number;
  critical_incidents: number;
  reporting_coverage: number;
  reporting_coverage_pu_count: number;
  /** Cross-dashboard messaging state (chat + notification bell widgets). */
  unread_messages_total?: number;
  unread_by_conversation?: Record<string, number>;
  unread_notifications?: number;
  total_conversations?: number;
}

export interface Analytics {
  reports_per_day: Record<string, number>;
  reports_by_lga: Record<string, number>;
  incidents_by_severity: Record<string, number>;
  incidents_by_status: Record<string, number>;
  lga_summary: {
    lga: string;
    total_polling_units: number;
    assigned_polling_units: number;
    reports: number;
    open_incidents: number;
    coverage: number;
  }[];
  sync: {
    total: number;
    succeeded: number;
    failed: number;
    duplicate: number;
    success_rate: number;
  } | null;
  total_polling_units: number;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface SmsPendingSubmission {
  id: string;
  official: string;
  polling_unit_code: string;
  message_type: "report" | "incident";
  parsed_payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export type SmsParseResult = "parsed" | "unparseable" | "unknown_sender" | "unknown_polling_unit";

export interface SmsInboundMessage {
  id: string;
  sender_phone: string;
  body: string;
  gateway_provider: string;
  matched_official: string | null;
  official_name: string;
  parse_result: SmsParseResult;
  parse_note: string;
  received_at: string;
}

export interface GenericDetail {
  detail?: string;
  [key: string]: unknown;
}
