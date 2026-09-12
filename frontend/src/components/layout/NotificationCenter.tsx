"use client";

// NotificationCenter — the notification bell + dropdown panel shared by the
// admin and field shells.
//
// - The badge state comes from the shared notification stream (one
//   ReconnectingSocket, reconnect + dedupe handled in the hook), so it
//   updates instantly when a notification arrives or is read.
// - Opening the panel marks everything as read (the bell clears immediately,
//   no page refresh) — matching the platform's mark-all-read logic.
// - Items navigate via lib/notification-nav (robust, no hardcoded links).
// - Mark all read / delete / clear all with confirmation.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Trash2,
  Loader2,
  Inbox,
  ExternalLink,
  Siren,
  AlertTriangle,
  UserPlus,
  MessageSquare,
  FileText,
  MapPinPlus,
  CheckCircle2,
} from "lucide-react";
import type { NotificationItem, NotificationType } from "@/types";
import { timeAgo } from "@/lib/format";
import { notificationActionLabel, notificationActionUrl } from "@/lib/notification-nav";
import type { RealtimeStatus } from "@/lib/rt";
import { useToast } from "@/components/ui/Toast";

const typeIcons: Record<NotificationType, typeof Siren> = {
  new_incident: Siren,
  system_alert: AlertTriangle,
  assignment_changed: UserPlus,
  report_overdue: AlertTriangle,
  message: MessageSquare,
  report_submitted: FileText,
  pu_request_submitted: MapPinPlus,
  pu_request_decided: CheckCircle2,
};

const typeColors: Record<NotificationType, string> = {
  new_incident: "bg-red-50 text-red-600 dark:text-red-400",
  system_alert: "bg-amber-50 text-amber-600 dark:text-amber-400",
  assignment_changed: "bg-emerald-50 text-emerald-600 dark:text-emerald-400",
  report_overdue: "bg-orange-50 text-orange-600 dark:text-orange-400",
  message: "bg-blue-50 text-blue-600 dark:text-blue-400",
  report_submitted: "bg-indigo-50 text-indigo-600 dark:text-indigo-400",
  pu_request_submitted: "bg-fuchsia-50 text-fuchsia-600 dark:text-fuchsia-400",
  pu_request_decided: "bg-teal-50 text-teal-600 dark:text-teal-400",
};

export interface NotificationCenterStream {
  unread: number;
  items: NotificationItem[];
  itemsLoaded: boolean;
  status: RealtimeStatus;
  onMarkAllRead: () => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onClearAll: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
}
export function NotificationCenter({
  unread,
  items,
  itemsLoaded,
  status,
  onMarkAllRead,
  onRemove,
  onClearAll,
  onRefresh,
}: NotificationCenterStream) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Opening the panel marks everything read so the badge disappears
  // immediately (the list keeps the items, now styled as read).
  useEffect(() => {
    if (!open) return;
    if (unread <= 0) return;
    setMarkingAll(true);
    onMarkAllRead().finally(() => setMarkingAll(false));
  }, [open, unread, onMarkAllRead]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navigate = (n: NotificationItem) => {
    setOpen(false);
    // The row click implies "read": mark everything read as we navigate.
    if (unread > 0) void onMarkAllRead();
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
    void onRemove(id).then((ok) => {
      if (!ok) push("error", "Couldn't delete the notification.");
    });
  };

  const requestClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingClear(false);
    setClearing(true);
    void onClearAll()
      .then((ok) => {
        if (!ok) push("error", "Couldn't clear notifications.");
      })
      .finally(() => setClearing(false));
  };
return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : setOpen(true))}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-surface-sunken hover:text-brand-700"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && !open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full z-50 mt-1 flex max-h-[min(560px,85vh)] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-surface-line bg-white shadow-pop animate-scale-in">
            <div className="flex items-center justify-between gap-2 border-b border-surface-line px-4 py-2.5">
              <p className="text-sm font-semibold text-ink">
                Notifications
                {unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1">
                {!itemsLoaded ? (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Loader2 size={11} className="animate-spin" /> Loading
                  </span>
                ) : status === "reconnecting" ? (
                  <span className="flex items-center gap-1 text-[10px] text-amber-600">
                    <Loader2 size={11} className="animate-spin" /> Reconnecting
                  </span>
                ) : null}
                <button
                  onClick={() => void onMarkAllRead()}
                  disabled={unread === 0 || markingAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-surface-sunken disabled:opacity-40"
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
                <button
                  onClick={requestClear}
                  disabled={items.length === 0 || clearing}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
                    confirmingClear
                      ? "bg-red-50 text-red-600 dark:text-red-400"
                      : "text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:text-red-400"
                  } disabled:opacity-40`}
                >
                  <Trash2 size={12} />
                  {confirmingClear ? "Confirm?" : "Clear all"}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!itemsLoaded ? (
                <div className="px-4 py-8 text-center">
                  <Loader2 size={18} className="mx-auto mb-2 animate-spin text-slate-400" />
                  <p className="text-xs text-slate-400">Loading notifications…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-sunken text-slate-400">
                    <Inbox size={20} />
                  </div>
                  <p className="text-sm font-medium text-ink">No notifications available</p>
                  <p className="text-xs text-slate-500">New alerts and messages will appear here in real time.</p>
                </div>
              ) : (
                <ul className="divide-y divide-surface-line">
                  {items.map((n) => {
                    const Icon = typeIcons[n.notification_type] || Bell;
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => navigate(n)}
                          className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface-sunken/60 ${!n.is_read ? "bg-brand-50/40" : ""}`}
                        >
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${typeColors[n.notification_type] || "bg-slate-100 text-slate-500"}`}>
                            <Icon size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-ink">{n.title}</span>
                            <span className="block truncate text-[11px] text-slate-500">{n.body}</span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {timeAgo(n.created_at)}
                              <span className="text-brand-500"> · {notificationActionLabel(n)}</span>
                            </span>
                          </span>
                          {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                        </button>
                        <div className="flex items-center justify-between px-3.5 py-0.5">
                          <button
                            onClick={() => requestDelete(n.id)}
                            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              confirmingId === n.id
                                ? "bg-red-50 text-red-600 dark:text-red-400"
                                : "text-slate-400 hover:bg-slate-100 hover:text-red-500"
                            }`}
                            aria-label="Delete notification"
                          >
                            <Trash2 size={11} />
                            {confirmingId === n.id ? "Delete?" : "Delete"}
                          </button>
                          {confirmingId === n.id && (
                            <span className="text-[9px] text-slate-400">click again to confirm</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-surface-line px-4 py-2">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/notifications");
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
              >
                View all notifications
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}