"use client";

// Side drawer for a polling unit selected on the operations map. All data is
// fetched from the real backend: PU detail, recent reports and incidents.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Siren, User, MessageSquare, MapPin, Loader2 } from "lucide-react";
import { chatApi, geographyApi, incidentsApi, officialsApi, reportsApi } from "@/lib/api";
import { Drawer } from "@/components/ui/Overlay";
import { StatusPill } from "@/components/ui/StatusPill";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import {
  OPERATIONAL_STATUS_LABELS,
  operationalStatusTone,
  formatDateTime,
  timeAgo,
} from "@/lib/format";
import { quickStatusLabel, quickStatusTone } from "@/lib/dashboard";
import type { Incident, PollingUnit, PollingUnitMapItem, Report } from "@/types";

export function PUDrawer({ item, onClose }: { item: PollingUnitMapItem | null; onClose: () => void }) {
  const router = useRouter();
  const [pu, setPu] = useState<PollingUnit | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(false);
    try {
      const [detail, reps, incs] = await Promise.all([
        geographyApi.pollingUnit(id),
        reportsApi.list({ polling_unit: id, page_size: 5 } as never),
        incidentsApi.list({ polling_unit: id, page_size: 5 } as never),
      ]);
      setPu(detail);
      setReports(reps.results || []);
      setIncidents(incs.results || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (item) {
      setPu(null);
      setReports([]);
      setIncidents([]);
      void load(item.id);
    }
  }, [item, load]);

  const openChat = async () => {
    if (!pu?.assigned_official || chatBusy) return;
    setChatBusy(true);
    try {
      const official = await officialsApi.get(pu.assigned_official.official_id);
      const conv = await chatApi.direct(official.user);
      router.push(`/chat?c=${conv.id}`);
    } catch {
      /* stay on the map; the action simply won't complete */
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <Drawer
      open={!!item}
      onClose={onClose}
      title={item ? `#${item.official_code}` : ""}
      footer={
        item && (
          <div className="flex w-full flex-wrap gap-2">
            <Link
              href={`/reports?pu=${item.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-surface-line px-3 py-2 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
            >
              <FileText size={14} /> All reports
            </Link>
            <Link
              href={`/incidents?pu=${item.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-surface-line px-3 py-2 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
            >
              <Siren size={14} /> Incidents
            </Link>
            {pu?.assigned_official && (
              <Link
                href={`/officials/${pu.assigned_official.official_id}`}
                className="flex items-center gap-1.5 rounded-lg border border-surface-line px-3 py-2 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
              >
                <User size={14} /> Official
              </Link>
            )}
            {pu?.assigned_official && (
              <button
                onClick={openChat}
                disabled={chatBusy}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-500 disabled:opacity-60"
              >
                {chatBusy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                Message official
              </button>
            )}
          </div>
        )
      }
    >
      {error && <ErrorState onRetry={() => item && load(item.id)} title="Couldn't load this polling unit" />}
      {loading && !pu && <SkeletonRows rows={7} />}
      {pu && !loading && <DrawerBody pu={pu} reports={reports} incidents={incidents} />}
    </Drawer>
  );
}

function DrawerBody({ pu, reports, incidents }: { pu: PollingUnit; reports: Report[]; incidents: Incident[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-ink">{pu.name}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin size={12} />
          {pu.lga_name} · {pu.ward_name}
        </p>
        <p className="mt-1 font-mono text-xs text-slate-400">
          {pu.latitude ?? "—"}, {pu.longitude ?? "—"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <StatusPill
          tone={operationalStatusTone(pu.operational_status)}
          label={OPERATIONAL_STATUS_LABELS[pu.operational_status] || pu.operational_status}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-surface-line p-3">
          <dt className="text-[11px] font-medium text-slate-500">Assigned official</dt>
          <dd className="mt-1 font-medium text-ink">{pu.assigned_official?.name || "Unassigned"}</dd>
        </div>
        <div className="rounded-lg border border-surface-line p-3">
          <dt className="text-[11px] font-medium text-slate-500">Last report</dt>
          <dd className="mt-1 font-medium text-ink">
            {pu.latest_report_at ? timeAgo(pu.latest_report_at) : "None yet"}
          </dd>
        </div>
      </dl>

      {pu.location_description && (
        <div>
          <p className="text-[11px] font-medium text-slate-500">Location description</p>
          <p className="mt-1 text-sm text-ink-soft">{pu.location_description}</p>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-ink">Recent reports</p>
        {reports.length === 0 ? (
          <p className="rounded-lg border border-surface-line px-3 py-3 text-xs text-slate-500">
            No reports recorded for this unit yet.
          </p>
        ) : (
          <ul className="divide-y divide-surface-line rounded-lg border border-surface-line">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-sunken/60">
                  <FileText size={14} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{r.category_name || "Report"}</span>
                    <span className="block text-[11px] text-slate-500">{timeAgo(r.device_captured_at || r.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-ink">Incidents</p>
        {incidents.length === 0 ? (
          <p className="rounded-lg border border-surface-line px-3 py-3 text-xs text-slate-500">
            No incidents recorded for this unit.
          </p>
        ) : (
          <ul className="divide-y divide-surface-line rounded-lg border border-surface-line">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link href={`/incidents/${i.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-sunken/60">
                  <Siren size={14} className="shrink-0 text-red-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{i.category}</span>
                    <span className="block text-[11px] text-slate-500">{formatDateTime(i.created_at)}</span>
                  </span>
                  <StatusPill tone={quickStatusTone(i.status)} label={quickStatusLabel(i.status)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-400">Record updated {timeAgo(pu.updated_at)}</p>
    </div>
  );
}