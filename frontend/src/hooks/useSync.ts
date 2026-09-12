"use client";

// Flushes the offline queue to the real backend and reflects pending/syncing
// counts. Uses the connectivity context so it only runs while online.

import { useCallback, useEffect, useRef, useState } from "react";
import { listQueue, removeQueued, clearQueue, QueuedItem } from "@/lib/sync-store";
import { incidentsApi, reportsApi } from "@/lib/api";
import { useConnectivity } from "@/lib/connectivity";

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSync() {
  const { online } = useConnectivity();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushing = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const items = await listQueue();
      setPending(items.length);
    } catch {
      setPending(0);
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (!online) return;
    flushing.current = true;
    setSyncing(true);
    try {
      const items = await listQueue();
      for (const item of items) {
        try {
          if (item.object_type === "report") {
            await reportsApi.create({
              ...item.payload,
              client_generated_id: item.client_generated_id,
            } as never);
          } else {
            await incidentsApi.create({
              ...item.payload,
              client_generated_id: item.client_generated_id,
            } as never);
          }
          await removeQueued(item.client_generated_id);
        } catch {
          // Keep the item queued; will retry next flush.
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [online, refreshCount]);

  useEffect(() => {
    if (online) {
      refreshCount();
      const t = setInterval(() => {
        if (online) {
          refreshCount();
          void flush();
        }
      }, 20000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return { pending, syncing, flush, refreshCount, newClientId };
}

export function clearOfflineQueue() {
  void clearQueue();
}

export type { QueuedItem };
