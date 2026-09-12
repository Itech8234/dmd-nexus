"use client";

// Field notifications — mobile-first card list backed by the shared
// real-time stream. Rows deep-link into the field screens they describe.

import { useRouter } from "next/navigation";
import { Bell, Trash2, Siren, UserPlus, FileText, MessageSquare, AlertTriangle, MapPinPlus, CheckCircle2 } from "lucide-react";
import type { NotificationItem, NotificationType } from "@/types";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { fieldNotificationActionUrl, notificationActionLabel } from "@/lib/notification-nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonRows, EmptyState } from "@/components/ui/States";
import { timeAgo } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

const icons: Record<NotificationType, typeof Siren> = {
  new_incident: Siren,
  system_alert: AlertTriangle,
  assignment_changed: UserPlus,
  report_overdue: AlertTriangle,
  message: MessageSquare,
  report_submitted: FileText,
  pu_request_submitted: MapPinPlus,
  pu_request_decided: CheckCircle2,
};

export default function FieldNotificationsPage() {
  const router = useRouter();
  const { push } = useToast();
  const stream = useNotificationStream();

  const open = (n: NotificationItem) => {
    // The row click implies "read".
    if (!n.is_read) void stream.onMarkAllRead();
    router.push(fieldNotificationActionUrl(n));
  };

  const remove = (n: NotificationItem) => {
    void stream.onRemove(n.id).then((ok) => {
      if (!ok) push("error", "Couldn't delete the notification.");
    });
  };

  return (
    <div>
      <PageHeader title="Notifications" />
      <div className="space-y-2">
        {!stream.itemsLoaded ? (
          <SkeletonRows rows={5} />
        ) : stream.items.length === 0 ? (
          <EmptyState
            icon={<Bell size={22} />}
            title="No notifications available"
            description="New alerts, assignments and messages will appear here in real time."
          />
        ) : (
          stream.items.map((n) => {
            const Icon = icons[n.notification_type] || Bell;
            return (
              <div
                key={n.id}
                className={`rounded-2xl border border-surface-line bg-white shadow-card ${!n.is_read ? "border-brand-200 bg-brand-50/40" : ""}`}
              >
                <button
                  onClick={() => open(n)}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${!n.is_read ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <span className="truncate">{n.title}</span>
                      {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                    </p>
                    <p className="text-xs text-slate-500">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {timeAgo(n.created_at)} <span className="text-brand-500">· {notificationActionLabel(n)}</span>
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => remove(n)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
