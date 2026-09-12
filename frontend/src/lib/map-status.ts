// Shared operational-status palette for map surfaces (Leaflet markers,
// legends, clusters). Kept in a dependency-free module so both the eagerly
// loaded map page and the dynamically imported Leaflet component can use it.
import type { OperationalStatus } from "@/types";

export const STATUS_COLORS: Record<OperationalStatus, string> = {
  active_reporting: "#10b981",
  recently_reported: "#3b82f6",
  report_overdue: "#dc2626",
  incident_reported: "#d946ef",
  awaiting_assignment: "#f59e0b",
  official_offline: "#94a3b8",
};