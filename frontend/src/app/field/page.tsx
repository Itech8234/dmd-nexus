"use client";

// Field Official home — focused mobile dashboard: assigned location, current
// status, last report, sync state and the primary field actions.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CloudUpload,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Siren,
} from "lucide-react";
import { assignmentsApi, geographyApi, reportsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useConnectivity } from "@/lib/connectivity";
import { useSync } from "@/hooks/useSync";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { OPERATIONAL_STATUS_LABELS, operationalStatusTone, timeAgo } from "@/lib/format";
import type { Assignment, PollingUnit, Report } from "@/types";

export default function FieldHomePage() {
  const { user } = useAuth();
  const { online } = useConnectivity();
  const { pending, syncing, flush } = useSync();
  const { push } = useToast();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [puDetails, setPuDetails] = useState<Record<string, PollingUnit>>({});
  const [lastReport, setLastReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [asg, reps] = await Promise.all([
        assignmentsApi.list({ status: "active", page_size: 20 } as never),
        reportsApi.list({ page_size: 1, ordering: "-created_at" } as never),
      ]);
      const items = asg.results || [];
      setAssignments(items);
      setLastReport(reps.results?.[0] || null);
      // Resolve ward/LGA context for each assigned unit (few — one active
      // official per polling unit, so this is 1-2 calls in practice).
      const details: Record<string, PollingUnit> = {};
      await Promise.all(
        items.map(async (a) => {
          try {
            details[a.polling_unit] = await geographyApi.pollingUnit(a.polling_unit);
          } catch {
            /* context card degrades gracefully */
          }
        }),
      );
      setPuDetails(details);
    } catch {
      /* offline — cards below render queue-only state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const syncNow = async () => {
    setFlushing(true);
    try {
      await flush();
      push("success", pending > 0 ? "Synchronization complete." : "Nothing to synchronize.");
      load();
    } catch {
      push("error", "Synchronization failed — will retry automatically.");
    } finally {
      setFlushing(false);
    }
  };

  const firstPu = assignments.length > 0 ? puDetails[assignments[0].polling_unit] : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-ink">
          Hello, {user?.first_name || user?.username}
        </h1>
        <p className="text-sm text-slate-500">Your assignment and today&apos;s field actions.</p>
      </div>

      {/* Assigned location */}
      <Card bodyClassName="p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <MapPin size={12} /> Assigned location
        </p>
        {loading ? (
          <div className="mt-3 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-sunken" />
          </div>
        ) : assignments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No active assignment yet. Your coordinator will assign you a polling unit.
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-base font-bold text-ink">
              {firstPu?.name || assignments[0].polling_unit_code}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {firstPu ? `${firstPu.lga_name} · ${firstPu.ward_name}` : "Ward context unavailable offline"}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {firstPu && (
                <StatusPill
                  tone={operationalStatusTone(firstPu.operational_status)}
                  label={OPERATIONAL_STATUS_LABELS[firstPu.operational_status] || firstPu.operational_status}
                />
              )}
              {assignments.slice(1).length > 0 && (
                <span className="text-[11px] text-slate-400">+{assignments.slice(1).length} more assignment(s)</span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Last report + sync */}
      <div className="grid grid-cols-2 gap-3">
        <Card bodyClassName="p-4">
          <p className="text-xs font-medium text-slate-500">Last report</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {lastReport ? timeAgo(lastReport.device_captured_at || lastReport.created_at) : "None yet"}
          </p>
        </Card>
        <Card bodyClassName="p-4">
          <p className="text-xs font-medium text-slate-500">Sync state</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
            {syncing ? (
              <>
                <Loader2 size={14} className="animate-spin text-violet-600" /> Syncing…
              </>
            ) : pending > 0 ? (
              <>
                <CloudUpload size={14} className="text-amber-600" /> {pending} queued
              </>
            ) : (
              <>
                <CheckCircle2 size={14} className="text-emerald-600" /> {online ? "Synced" : "Offline"}
              </>
            )}
          </p>
        </Card>
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/field/report"
          className="flex flex-col items-center gap-2 rounded-2xl border border-surface-line bg-white p-5 shadow-card hover:border-brand-300"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:text-blue-400">
            <FileText size={22} />
          </span>
          <span className="text-sm font-semibold text-ink">Submit Report</span>
          <span className="text-center text-[11px] text-slate-500">PU status, narrative, photos</span>
        </Link>

        <Link
          href="/field/incident"
          className="flex flex-col items-center gap-2 rounded-2xl border border-surface-line bg-white p-5 shadow-card hover:border-red-300"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:text-red-400">
            <Siren size={22} />
          </span>
          <span className="text-sm font-semibold text-ink">Report Incident</span>
          <span className="text-center text-[11px] text-slate-500">Describe what you observed</span>
        </Link>
      </div>

      {/* Sync now */}
      <Button
        variant={pending > 0 ? "primary" : "secondary"}
        onClick={syncNow}
        disabled={flushing || syncing}
        className="w-full justify-center"
      >
        {flushing || syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {pending > 0 ? `Sync now (${pending} queued)` : "Sync now"}
      </Button>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 size={17} />
          Works offline
        </div>
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
          Reports and incidents are saved on your device first, then synced when you reconnect. Queued
          submissions are never discarded.
        </p>
      </div>

      <div className="rounded-2xl border border-surface-line bg-white p-4">
        <p className="text-sm font-semibold text-ink">Quick actions</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <Link href="/field/propose-pu" className="rounded-lg bg-surface-sunken py-2.5 font-medium text-slate-700 dark:text-slate-200">Propose PU</Link>
          <Link href="/field/my-pu-requests" className="rounded-lg bg-surface-sunken py-2.5 font-medium text-slate-700 dark:text-slate-200">My PU Reqs</Link>
          <Link href="/field/my-reports" className="rounded-lg bg-surface-sunken py-2.5 font-medium text-slate-700 dark:text-slate-200">My Activity</Link>
          <Link href="/field/chat" className="rounded-lg bg-surface-sunken py-2.5 font-medium text-slate-700 dark:text-slate-200">Chat</Link>
          <Link href="/field/sync" className="rounded-lg bg-surface-sunken py-2.5 font-medium text-slate-700 dark:text-slate-200">Sync Status</Link>
          <Link href="/field/notifications" className="rounded-lg bg-surface-sunken py-2.5 font-medium text-slate-700 dark:text-slate-200">Notifications</Link>
        </div>
      </div>
    </div>
  );
}
