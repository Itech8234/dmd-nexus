"use client";

// Notifications — full management view.
// Real-time via the shared notification stream (reconnect + dedupe), with
// mark-read / mark-all-read / delete / clear-all, confirmations for the
// destructive actions, navigation to the related object, and proper
// loading / empty / error states.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2, Siren, UserPlus, MessageSquare, FileText, AlertTriangle, MapPinPlus, CheckCircle2 } from "lucide-react";
import type { NotificationItem, NotificationType } from "@/types";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { notificationActionLabel, notificationActionUrl } from "@/lib/notification-nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
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

const iconColors: Record<NotificationType, string> = {
  new_incident: "bg-red-50 text-red-600 dark:text-red-400",
  system_alert: "bg-amber-50 text-amber-600 dark:text-amber-400",
  assignment_changed: "bg-emerald-50 text-emerald-600 dark:text-emerald-400",
  report_overdue: "bg-orange-50 text-orange-600 dark:text-orange-400",
  message: "bg-blue-50 text-blue-600 dark:text-blue-400",
  report_submitted: "bg-indigo-50 text-indigo-600 dark:text-indigo-400",
  pu_request_submitted: "bg-fuchsia-50 text-fuchsia-600 dark:text-fuchsia-400",
  pu_request_decided: "bg-teal-50 text-teal-600 dark:text-teal-400",
};

export default function NotificationsPage() {
  const router = useRouter();
  const { push } = useToast();
  const stream = useNotificationStream();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /* The hook owns initial + reconnect loading; this effect exists so the
       page re-renders when items change through the live stream. */
  }, [stream.items]);

  const navigate = (n: NotificationItem) => {
    if (!n.is_read) void stream.onMarkAllRead();
    router.push(notificationActionUrl(n));
  };

  const requestDelete = (id: string) => {
    if (confirmingId !== id) {
      setConfirmingId(id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingId(null), 2500);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingId(null);
    setDeleting(true);
    void stream
      .onRemove(id)
      .then((ok) => {
        if (ok) push("success", "Notification deleted.");
        else push("error", "Couldn't delete the notification.");
      })
      .finally(() => setDeleting(false));
  };

  const clearAll = () => {
    setConfirmClearOpen(false);
    setDeleting(true);
    void stream
      .onClearAll()
      .then((ok) => {
        if (ok) push("success", "All notifications cleared.");
        else push("error", "Couldn't clear notifications.");
      })
      .finally(() => setDeleting(false));
  };

  const hasUnread = stream.items.some((n) => !n.is_read);
return (
    <div>
      <PageHeader
        title="Notifications"
        description="Alerts, incidents, assignments and messages — live."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void stream.onMarkAllRead()} disabled={!hasUnread}>
              <CheckCheck size={15} /> Mark all read
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmClearOpen(true)}
              disabled={stream.items.length === 0}
            >
              <Trash2 size={15} /> Clear all
            </Button>
          </>
        }
      />

      <Card bodyClassName="p-0">
        {!stream.itemsLoaded ? (
          <SkeletonRows rows={8} />
        ) : stream.items.length === 0 ? (
          <EmptyState
            icon={<Bell size={22} />}
            title="No notifications available"
            description="New alerts, incidents and messages will appear here in real time."
          />
        ) : (
          <ul className="divide-y divide-surface-line">
            {stream.items.map((n) => {
              const Icon = icons[n.notification_type] || Bell;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => navigate(n)}
                    className={`flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-surface-sunken/50 ${!n.is_read ? "bg-brand-50/40" : ""}`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColors[n.notification_type] || "bg-slate-100 text-slate-500"}`}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{n.title}</span>
                        {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{n.body}</span>
                      <span className="block mt-0.5 text-[10px] text-slate-400">
                        {timeAgo(n.created_at)} <span className="text-brand-500">· {notificationActionLabel(n)}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2 px-5 py-1">
                    <button
                      onClick={() => void stream.onMarkAllRead()}
                      disabled={!n.is_read && !hasUnread}
                      className="rounded px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-surface-sunken hover:text-brand-600"
                    >
                      Mark read
                    </button>
                    <button
                      onClick={() => requestDelete(n.id)}
                      disabled={deleting}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium ${
                        confirmingId === n.id
                          ? "bg-red-50 text-red-600 dark:text-red-400"
                          : "text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:text-red-400"
                      }`}
                    >
                      <Trash2 size={11} />
                      {confirmingId === n.id ? "Click again to delete" : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title="Clear all notifications?"
      >
        <p className="text-sm text-ink">
          This permanently deletes <strong>{stream.items.length}</strong> notification{stream.items.length === 1 ? "" : "s"}.
          This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirmClearOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={clearAll} disabled={deleting}>
            <Trash2 size={14} /> Delete all
          </Button>
        </div>
      </Modal>
    </div>
  );
}