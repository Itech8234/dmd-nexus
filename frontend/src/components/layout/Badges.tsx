"use client";

import { Wifi, WifiOff, CloudUpload, Loader2 } from "lucide-react";
import { useConnectivity } from "@/lib/connectivity";
import { useSync } from "@/hooks/useSync";

export function ConnectionBadge() {
  const { online } = useConnectivity();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        online ? "bg-emerald-50 text-emerald-700 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:text-red-300"
      }`}
      title={online ? "Connected" : "Offline — changes queued locally"}
    >
      {online ? <Wifi size={13} /> : <WifiOff size={13} />}
      {online ? "Online" : "Offline"}
    </span>
  );
}

export function SyncBadge() {
  const { pending, syncing } = useSync();
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:text-blue-300">
        <Loader2 size={13} className="animate-spin" /> Syncing
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 dark:text-amber-300">
        <CloudUpload size={13} /> {pending} queued
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-100">
      <CloudUpload size={13} /> Synced
    </span>
  );
}
