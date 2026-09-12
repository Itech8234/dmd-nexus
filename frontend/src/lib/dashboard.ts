import type { IncidentStatus } from "@/types";
import type { Tone as PillTone } from "@/components/ui/StatusPill";

export function quickStatusLabel(status: IncidentStatus): string {
  const map: Record<IncidentStatus, string> = {
    reported: "Reported",
    assigned: "Assigned",
    investigating: "Investigating",
    resolved: "Resolved",
    closed: "Closed",
  };
  return map[status] || status;
}

export function quickStatusTone(status: IncidentStatus): PillTone {
  const map: Record<IncidentStatus, PillTone> = {
    reported: "danger",
    assigned: "info",
    investigating: "warning",
    resolved: "neutral",
    closed: "neutral",
  };
  return map[status] || "neutral";
}
