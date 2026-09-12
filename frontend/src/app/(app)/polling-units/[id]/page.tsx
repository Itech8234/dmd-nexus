"use client";

// Polling unit detail — location record, assignment, and the unit's recent
// reports/incidents, all from the real backend.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Map, MapPin, MessageSquare, User } from "lucide-react";
import { chatApi, geographyApi, incidentsApi, officialsApi, reportsApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import {
  OPERATIONAL_STATUS_LABELS,
  operationalStatusTone,
  formatDateTime,
  timeAgo,
} from "@/lib/format";
import { quickStatusLabel, quickStatusTone } from "@/lib/dashboard";
import type { Incident, PollingUnit, Report } from "@/types";

export default function PollingUnitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [pu, setPu] = useState<PollingUnit | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [detail, reps, incs] = await Promise.all([
        geographyApi.pollingUnit(params.id),
        reportsApi.list({ polling_unit: params.id, page_size: 5 } as never),
        incidentsApi.list({ polling_unit: params.id, page_size: 5 } as never),
      ]);
      setPu(detail);
      setReports(reps.results || []);
      setIncidents(incs.results || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const messageOfficial = async () => {
    if (!pu?.assigned_official || chatBusy) return;
    setChatBusy(true);
    try {
      const official = await officialsApi.get(pu.assigned_official.official_id);
      const conv = await chatApi.direct(official.user);
      router.push(`/chat?c=${conv.id}`);
    } catch {
      /* ignore — action is best-effort */
    } finally {
      setChatBusy(false);
    }
  };

  if (loading && !pu) return <SkeletonRows rows={9} />;
  if (error && !pu) return <ErrorState onRetry={load} title="Couldn't load this polling unit" />;
  if (!pu) return null;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/polling-units")}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-ink"
      >
        <ArrowLeft size={15} /> All polling units
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-slate-400">#{pu.official_code}</p>
          <h1 className="text-xl font-bold text-ink">{pu.name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin size={14} /> {pu.lga_name} · {pu.ward_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            tone={operationalStatusTone(pu.operational_status)}
            label={OPERATIONAL_STATUS_LABELS[pu.operational_status] || pu.operational_status}
          />
          <Link
            href={`/map?focus=${pu.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-surface-line px-3 py-2 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
          >
            <Map size={14} /> Locate on map
          </Link>
          {pu.assigned_official && (
            <Button onClick={messageOfficial} loading={chatBusy}>
              <MessageSquare size={14} /> Message official
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Location record" bodyClassName="p-5" className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Coordinates</dt>
              <dd className="mt-1 font-mono text-ink">
                {pu.latitude ?? "—"}, {pu.longitude ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Assigned official</dt>
              <dd className="mt-1 font-medium text-ink">
                {pu.assigned_official ? (
                  <Link href={`/officials/${pu.assigned_official.official_id}`} className="flex items-center gap-1.5 text-brand-600 hover:underline">
                    <User size={13} /> {pu.assigned_official.name}
                  </Link>
                ) : (
                  <span className="text-slate-500">Unassigned</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Last report</dt>
              <dd className="mt-1 font-medium text-ink">
                {pu.latest_report_at ? timeAgo(pu.latest_report_at) : "None yet"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Record updated</dt>
              <dd className="mt-1 font-medium text-ink">{timeAgo(pu.updated_at)}</dd>
            </div>
            {pu.location_description && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500">Location description</dt>
                <dd className="mt-1 text-ink-soft">{pu.location_description}</dd>
              </div>
            )}
            {pu.source_note && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500">Source note</dt>
                <dd className="mt-1 text-ink-soft">{pu.source_note}</dd>
              </div>
            )}
          </dl>
        </Card>

        <div className="space-y-5">
          <Card title="Recent reports" bodyClassName="p-0">
            {reports.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">No reports recorded for this unit yet.</p>
            ) : (
              <ul className="divide-y divide-surface-line">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/reports/${r.id}`} className="block px-5 py-3 hover:bg-surface-sunken/60">
                      <span className="block truncate text-sm font-medium text-ink">{r.category_name || "Report"}</span>
                      <span className="block text-xs text-slate-500">{timeAgo(r.device_captured_at || r.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Incidents" bodyClassName="p-0">
            {incidents.length === 0 ? (
              <EmptyState icon={null} title="No incidents recorded" />
            ) : (
              <ul className="divide-y divide-surface-line">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <Link href={`/incidents/${i.id}`} className="block px-5 py-3 hover:bg-surface-sunken/60">
                      <span className="block truncate text-sm font-medium text-ink">{i.category}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        {formatDateTime(i.created_at)}
                        <StatusPill tone={quickStatusTone(i.status)} label={quickStatusLabel(i.status)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
