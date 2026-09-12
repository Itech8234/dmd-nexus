"use client";

// Command Centre — live operational overview for Admin/Super Admin (coordinators
// get the same page scoped to their area by the backend). Every figure comes
// from /dashboard/summary/ and /analytics/; live updates ride the real
// ws/operations feed.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Activity,
  CheckCircle2,
  CloudOff,
  FileText,
  MapPin,
  RefreshCw,
  Server,
  Siren,
  UserPlus,
  Users,
} from "lucide-react";
import { dashboardApi, geographyApi, incidentsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { useConnectivity } from "@/lib/connectivity";
import type { Analytics, DashboardSummary, Incident, PollingUnitMapItem } from "@/types";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { quickStatusLabel, quickStatusTone } from "@/lib/dashboard";
import { operationsSocketUrl } from "@/lib/ws";
import { timeAgo } from "@/lib/format";

function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "bg-brand-50 text-brand-700 dark:text-brand-300",
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <Card bodyClassName="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-ink font-mono animate-fade-in">{value}</p>
          {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { lowData } = usePrefs();
  const { online } = useConnectivity();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [mapFeed, setMapFeed] = useState<PollingUnitMapItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [s, a, m, i] = await Promise.all([
        dashboardApi.summary(),
        dashboardApi.analytics(),
        geographyApi.mapFeed(),
        incidentsApi.list({ page_size: 5 } as never),
      ]);
      setSummary(s);
      setAnalytics(a);
      setMapFeed(m);
      setIncidents(i.results || []);
      setUpdatedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates over the operations feed — the backend broadcasts a bare
  // event name and we re-fetch the already-scoped REST aggregates.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lowData || !online) return;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(operationsSocketUrl());
      ws.onmessage = () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => void load(), 2000);
      };
    } catch {
      /* WS optional */
    }
    return () => {
      ws?.close();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [load, lowData, online]);

  if (loading && !summary) return <SkeletonRows rows={10} />;
  if (error && !summary) return <ErrorState onRetry={load} title="Couldn't load command centre" />;

  const days = analytics?.reports_per_day
    ? Object.entries(analytics.reports_per_day)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([label, value]) => ({ label, value }))
    : [];

  const lgaRank = analytics?.lga_summary
    ? [...analytics.lga_summary].sort((a, b) => b.coverage - a.coverage)
    : [];

  const geoLocated = mapFeed.filter((p) => p.latitude && p.longitude).length;

  const isPrivileged = user?.role === "super_admin" || user?.role === "campaign_admin";

  const quickActions: { href: string; label: string; icon: typeof MapPin }[] = [
    { href: "/assignments", label: "Assign official", icon: UserPlus },
    { href: "/map", label: "Open map", icon: MapPin },
    { href: "/reports", label: "Review reports", icon: FileText },
    { href: "/incidents", label: "Review incidents", icon: Siren },
    { href: "/chat", label: "Open chat", icon: Activity },
    ...(isPrivileged ? [{ href: "/users", label: "Manage users", icon: Users as typeof MapPin }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Command Centre</h1>
          <p className="text-sm text-slate-500">Live operational overview across Yobe State.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {updatedAt && <span>Updated {timeAgo(updatedAt.toISOString())}</span>}
          {!online && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <CloudOff size={13} /> Offline
            </span>
          )}
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-surface-line px-3 py-2 font-medium text-slate-600 hover:bg-surface-sunken"
            aria-label="Refresh command centre"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {quickActions.map((a) => (
          <Link
            key={a.href + a.label}
            href={a.href}
            className="flex items-center gap-2 rounded-lg border border-surface-line bg-white px-3.5 py-2 text-xs font-medium text-slate-600 shadow-card transition-shadow hover:shadow-lift hover:text-ink"
          >
            <a.icon size={14} className="text-brand-600" /> {a.label}
          </Link>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Polling Units"
          value={summary?.total_polling_units ?? 0}
          sub={`${geoLocated} geo-located`}
          icon={<MapPin size={18} />}
        />
        <Kpi
          label="Officials Assigned"
          value={summary?.assigned_officials ?? 0}
          sub={`${summary?.active_officials ?? 0} active now`}
          icon={<Users size={18} />}
          tone="bg-emerald-50 text-emerald-700 dark:text-emerald-300"
        />
        <Kpi
          label="Reports Received"
          value={summary?.reports_received ?? 0}
          sub={`${summary?.pending_reports ?? 0} pending sync · ${summary?.overdue_reports ?? 0} overdue`}
          icon={<FileText size={18} />}
          tone="bg-blue-50 text-blue-700 dark:text-blue-300"
        />
        <Kpi
          label="Open Incidents"
          value={summary?.open_incidents ?? 0}
          sub={`${summary?.critical_incidents ?? 0} critical`}
          icon={<Siren size={18} />}
          tone="bg-red-50 text-red-700 dark:text-red-300"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority column */}
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Latest Incidents"
            bodyClassName="p-0"
            actions={
              <Link href="/incidents" className="text-xs font-medium text-brand-600">
                View all
              </Link>
            }
          >
            {incidents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No incidents to show.</p>
            ) : (
              incidents.map((inc) => (
                <Link
                  key={inc.id}
                  href={`/incidents/${inc.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface-sunken/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:text-red-400">
                    <Siren size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{inc.category}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {inc.polling_unit_code} · {inc.description.slice(0, 60)}
                    </span>
                  </span>
                  <StatusPill tone={quickStatusTone(inc.status)} label={quickStatusLabel(inc.status)} />
                </Link>
              ))
            )}
          </Card>

          <Card title="LGA performance" bodyClassName="p-0">
            {lgaRank.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No LGA data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-line text-left text-xs text-slate-500">
                      <th className="px-5 py-2.5 font-medium">LGA</th>
                      <th className="px-5 py-2.5 text-right font-medium">Units</th>
                      <th className="px-5 py-2.5 text-right font-medium">Assigned</th>
                      <th className="px-5 py-2.5 text-right font-medium">Reports</th>
                      <th className="px-5 py-2.5 text-right font-medium">Open incidents</th>
                      <th className="px-5 py-2.5 text-right font-medium">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-line">
                    {lgaRank.map((l) => (
                      <tr key={l.lga} className="hover:bg-surface-sunken/40">
                        <td className="px-5 py-2.5 font-medium text-ink">{l.lga}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600">{l.total_polling_units}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600">{l.assigned_polling_units}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600">{l.reports}</td>
                        <td className="px-5 py-2.5 text-right text-slate-600">{l.open_incidents}</td>
                        <td className="px-5 py-2.5 text-right">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              l.coverage >= 60
                                ? "bg-emerald-50 text-emerald-700 dark:text-emerald-300"
                                : "bg-amber-50 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {l.coverage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Drill-down column */}
        <div className="space-y-6">
          <Card title="Live Map" bodyClassName="p-5">
            <div className="flex items-center gap-3 rounded-xl border border-surface-line bg-surface-sunken/50 p-4">
              <Activity size={18} className="text-brand-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{geoLocated} units geo-located</p>
                <p className="text-xs text-slate-500">Open the interactive operations map</p>
              </div>
              <Link
                href="/map"
                className="rounded-lg bg-brand-600 p-2 text-white hover:bg-brand-700 dark:hover:bg-brand-500"
                aria-label="Open map"
              >
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </Card>

          <Card
            title="Reports — last 14 days"
            bodyClassName="p-5"
            actions={
              <Link href="/reports" className="text-xs font-medium text-brand-600">
                View
              </Link>
            }
          >
            {days.length === 0 ? (
              <p className="text-sm text-slate-500">No data yet.</p>
            ) : (
              <div className="flex items-end gap-1.5 h-28">
                {days.map((d, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-brand-500/70 transition-colors hover:bg-brand-600"
                    style={{
                      height: `${Math.max(5, (d.value / Math.max(1, ...days.map((x) => x.value))) * 100)}%`,
                    }}
                    title={`${d.label}: ${d.value}`}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Coverage" bodyClassName="p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <p className="text-sm text-ink">
                <span className="font-bold">{summary?.reporting_coverage ?? 0}%</span> of polling units reporting
              </p>
            </div>
          </Card>

          {analytics?.sync && (
            <Card title="Sync health" bodyClassName="p-5">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-violet-600" />
                <p className="text-sm text-ink">
                  <span className="font-bold">{analytics.sync.success_rate}%</span> sync success
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-surface-sunken p-2">
                  <dt className="text-slate-500">Succeeded</dt>
                  <dd className="mt-0.5 font-mono font-bold text-ink">{analytics.sync.succeeded}</dd>
                </div>
                <div className="rounded-lg bg-surface-sunken p-2">
                  <dt className="text-slate-500">Failed</dt>
                  <dd className="mt-0.5 font-mono font-bold text-red-600 dark:text-red-400">{analytics.sync.failed}</dd>
                </div>
                <div className="rounded-lg bg-surface-sunken p-2">
                  <dt className="text-slate-500">Duplicates</dt>
                  <dd className="mt-0.5 font-mono font-bold text-ink">{analytics.sync.duplicate}</dd>
                </div>
              </dl>
            </Card>
          )}

          {lowData && (
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-500">
                <strong className="text-ink">Low Data Mode</strong> is on — live refreshes are paused. Use Refresh
                for the latest data.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
