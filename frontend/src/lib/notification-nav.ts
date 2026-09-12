// Notification → navigation mapping.
//
// Notifications carry (notification_type, related_object_type,
// related_object_id). This module builds a robust destination URL from those
// instead of hardcoding links in each notification row. Every handler must be
// defensive: a dangling related_object_id still produces a sensible location.

import type { NotificationItem } from "@/types";

export function notificationActionUrl(n: Pick<NotificationItem, "notification_type" | "related_object_type" | "related_object_id">): string {
  const type = n.notification_type;
  const rel = n.related_object_type;
  const id = n.related_object_id || "";

  const enc = (part: string) => encodeURIComponent(part);
  const incident = (i: string) => (i ? `/incidents/${enc(i)}` : "/incidents");
  const pu = (p: string) => (p ? `/polling-units/${enc(p)}` : "/map");
  const conversation = (c: string) => (c ? `/chat?conversation=${enc(c)}` : "/chat");
  const report = (r: string) => (r ? `/reports/${enc(r)}` : "/reports");
  const puRequest = (r: string) => (r ? `/pu-requests/${enc(r)}` : "/pu-requests");

  switch (type) {
    case "new_incident":
    case "system_alert":
      // System alerts point at incidents/reports/polling units.
      switch (rel) {
        case "incident":
          return incident(id);
        case "report":
          return report(id);
        case "polling_unit":
          return pu(id);
        case "pu_request":
          return puRequest(id);
        default:
          return "/dashboard";
      }
    case "assignment_changed":
      return rel === "polling_unit" ? pu(id) : "/assignments";
    case "report_overdue":
      return rel === "polling_unit" ? pu(id) : "/reports";
    case "message":
      return conversation(id);
    case "report_submitted":
      return report(id);
    case "pu_request_submitted":
    case "pu_request_decided":
      return puRequest(id);
    default:
      return "/notifications";
  }
}

/** Human-readable hint shown under the action, e.g. "Open incident", "Open chat". */
export function notificationActionLabel(n: Pick<NotificationItem, "notification_type" | "related_object_type">): string {
  const type = n.notification_type;
  const rel = n.related_object_type;
  if (type === "message" || rel === "conversation") return "Open chat";
  if (rel === "incident") return "View incident";
  if (rel === "report") return "View report";
  if (rel === "polling_unit") return "View polling unit";
  if (rel === "pu_request") return "View request";
  if (rel === "assignment") return "View assignment";
  if (type === "system_alert") return "View details";
  return "Open";
}

/**
 * Field-app route mapping. The PWA has its own thin screens (my reports,
 * my requests, chat), so notifications deep-link into those instead of the
 * command-centre routes.
 */
export function fieldNotificationActionUrl(n: Pick<NotificationItem, "notification_type" | "related_object_type" | "related_object_id">): string {
  const type = n.notification_type;
  const rel = n.related_object_type;
  const id = n.related_object_id || "";
  const conversation = (c: string) => (c ? `/field/chat?conversation=${encodeURIComponent(c)}` : "/field/chat");
  if (type === "message" || rel === "conversation") return conversation(id);
  if (rel === "incident" || rel === "report" || type === "report_submitted") return "/field/my-reports";
  if (rel === "pu_request") return "/field/my-pu-requests";
  if (rel === "polling_unit" || rel === "assignment") return "/field/report";
  return "/field/notifications";
}