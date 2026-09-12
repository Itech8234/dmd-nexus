"use client";

// Shared notification stream hook.
//
// One ReconnectingSocket per consumer page (the shells render exactly one
// NotificationCenter) with reconnect, dedupe and authoritative badge sync.
// The server pushes:
//   {type:"notification", ...item, unread_count}   new notification
//   {type:"badge_update", unread_count}            authoritative total (reads)
//   {type:"notification_event", event, notification_id}  lifecycle (delete/clear)

import { useCallback, useEffect, useRef, useState } from "react";
import { notificationsApi } from "@/lib/api";
import { connectNotificationStream, GenSet, type RealtimeStatus } from "@/lib/rt";
import type { NotificationItem } from "@/types";

export interface NotificationStreamState {
  unread: number;
  status: RealtimeStatus;
  items: NotificationItem[];
  itemsLoaded: boolean;
  onRefresh: () => Promise<void>;
  onMarkAllRead: () => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onClearAll: () => Promise<boolean>;
}

export function useNotificationStream(): NotificationStreamState {
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);

  const socketRef = useRef<ReturnType<typeof connectNotificationStream> | null>(null);
  const dedupeRef = useRef<GenSet | null>(null);
  if (!dedupeRef.current) dedupeRef.current = new GenSet();
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const syncUnread = useCallback(async () => {
    try {
      setUnread(await notificationsApi.unreadCount());
    } catch {
      // Keep the last known badge during API outages; the socket or the next
      // user action will correct it.
    }
  }, []);

  const onRefresh = useCallback(async () => {
    // Refresh both the list and the authoritative badge (used by the panel
    // refresh button, the FCM foreground push and post-reconnect resync).
    try {
      setUnread(await notificationsApi.unreadCount());
    } catch {
      // keep last known badge
    }
    try {
      const res = await notificationsApi.list({ page_size: 60 });
      setItems(res.results || []);
    } catch {
      // Swallow: the empty/error UI is rendered by the panel itself.
      setItems([]);
    } finally {
      setItemsLoaded(true);
    }
  }, []);

  useEffect(() => {
    const socket = connectNotificationStream({
      onStatus: (next) => {
        setStatus(next);
        if (next === "connected") {
          // After a reconnect the server immediately re-sends the badge, and
          // we re-pull the list so nothing that happened while we were down
          // is missed (dedupe keeps the items set stable).
          void syncUnread();
          void onRefresh();
        }
      },
      onNotification: (frame, unreadCount) => {
        const n = frame as unknown as NotificationItem;
        if (!n || !n.id) return;
        if (dedupeRef.current!.seen(`n:${n.id}`)) return;
        setItems((prev) => {
          if (prev.some((x) => x.id === n.id)) return prev;
          const next = [n, ...prev];
          return next.length > 60 ? next.slice(0, 60) : next;
        });
        setUnread(unreadCount !== undefined ? unreadCount : (current) => current + 1);
      },
      onBadgeUpdate: (count) => setUnread(count),
      onNotificationEvent: (event, notificationId) => {
        if (event === "notification_deleted" && notificationId) {
          setItems((prev) => prev.filter((x) => x.id !== notificationId));
          setUnread((current) => Math.max(0, current - 1));
        } else if (event === "notifications_cleared") {
          setItems([]);
          setUnread(0);
        }
      },
    });
    socket.connect();
    socketRef.current = socket;
    setItemsLoaded(false);
    void syncUnread();
    void onRefresh();
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [syncUnread, onRefresh]);

  const onMarkAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    try {
      await notificationsApi.markAllRead();
      return true;
    } catch {
      void syncUnread();
      return false;
    }
  }, [syncUnread]);

  const onRemove = useCallback(
    async (id: string) => {
      const wasUnread = itemsRef.current.some((n) => n.id === id && !n.is_read);
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) setUnread((current) => Math.max(0, current - 1));
      try {
        await notificationsApi.remove(id);
        return true;
      } catch {
        void onRefresh();
        void syncUnread();
        return false;
      }
    },
    [onRefresh, syncUnread],
  );

  const onClearAll = useCallback(async () => {
    setItems([]);
    setUnread(0);
    try {
      await notificationsApi.clearAll();
      return true;
    } catch {
      void onRefresh();
      void syncUnread();
      return false;
    }
  }, [onRefresh, syncUnread]);

  return { unread, status, items, itemsLoaded, onRefresh, onMarkAllRead, onRemove, onClearAll };
}