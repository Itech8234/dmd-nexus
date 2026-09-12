import type {
  OperationalStatus,
  IncidentSeverity,
  IncidentStatus,
  ReportSyncStatus,
  PuRequestStatus,
} from "@/types";

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(value?: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  const now = Date.now();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateOnly(value);
}

export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  active_reporting: "Active / Reporting",
  recently_reported: "Recently Reported",
  report_overdue: "Report Overdue",
  incident_reported: "Incident Reported",
  awaiting_assignment: "Awaiting Assignment",
  official_offline: "Official Offline",
};

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  reported: "Reported",
  assigned: "Assigned",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
};

export const SYNC_LABELS: Record<ReportSyncStatus, string> = {
  saved_offline: "Offline",
  synchronizing: "Syncing",
  submitted: "Submitted",
  failed: "Failed",
};

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  campaign_admin: "Campaign Admin",
  lga_coordinator: "LGA Coordinator",
  ward_coordinator: "Ward Coordinator",
  field_official: "Field Official",
};

// Semantic color helpers used across components. These return Tailwind
// utility strings keyed off a status so a single source of truth exists.
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "violent";

export const STATUS_TONES: Record<
  string,
  { text: string; bg: string; dot: string }
> = {
  success: { text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  warning: { text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50", dot: "bg-amber-500" },
  danger: { text: "text-red-700 dark:text-red-300", bg: "bg-red-50", dot: "bg-red-500" },
  info: { text: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50", dot: "bg-blue-500" },
  neutral: { text: "text-slate-600 dark:text-slate-300", bg: "bg-slate-100", dot: "bg-slate-400" },
  violent: { text: "text-fuchsia-700 dark:text-fuchsia-300", bg: "bg-fuchsia-50", dot: "bg-fuchsia-500" },
};

export function operationalStatusTone(status: OperationalStatus): Tone {
  switch (status) {
    case "active_reporting":
    case "recently_reported":
      return "success";
    case "report_overdue":
      return "danger";
    case "incident_reported":
      return "violent";
    case "official_offline":
      return "neutral";
    case "awaiting_assignment":
      return "warning";
    default:
      return "neutral";
  }
}

export function severityTone(severity: IncidentSeverity): Tone {
  switch (severity) {
    case "critical":
    case "high":
      return "danger";
    case "medium":
      return "warning";
    default:
      return "info";
  }
}

export function incidentStatusTone(status: IncidentStatus): Tone {
  switch (status) {
    case "resolved":
    case "closed":
      return "neutral";
    case "reported":
      return "danger";
    case "assigned":
      return "info";
    default:
      return "warning";
  }
}

export function syncTone(status: ReportSyncStatus): Tone {
  switch (status) {
    case "submitted":
      return "success";
    case "synchronizing":
      return "violent";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

export const PU_REQUEST_STATUS_LABELS: Record<PuRequestStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function puRequestStatusTone(status: PuRequestStatus): Tone {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "withdrawn":
      return "neutral";
    default:
      return "warning";
  }
}
