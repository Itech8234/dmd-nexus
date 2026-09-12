"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Layers, Gauge, ShieldCheck } from "lucide-react";
import { dashboardApi } from "@/lib/api";
import type { Analytics } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { SimpleBarChart, DonutChart, Card } from "@/components/ui";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { SEVERITY_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/format";

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await dashboardApi.analytics());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <SkeletonRows rows={10} />;
  if (error && !data) return <ErrorState onRetry={load} />;

  const daily = data?.reports_per_day
    ? Object.entries(data.reports_per_day)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([label, value]) => ({ label, value }))
    : [];

  const byLga = data?.reports_by_lga
    ? Object.entries(data.reports_by_lga)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    : [];

  const severitySegments = Object.entries(data?.incidents_by_severity || {}).map(([k, v], i) => ({
    label: (SEVERITY_LABELS as Record<string, string>)[k] || k,
    value: v,
    color: ["#dc2626", "#ea580c", "#f59e0b", "#3b82f6"][i % 4],
  }));

  const statusSegments = Object.entries(data?.incidents_by_status || {}).map(([k, v], i) => ({
    label: (INCIDENT_STATUS_LABELS as Record<string, string>)[k] || k,
    value: v,
    color: ["#2563eb", "#8b5cf6", "#f59e0b", "#10b981", "#64748b"][i % 5],
  }));

  return (
    <div>
      <PageHeader title="Analytics" description="Operational metrics across the campaign." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Reports per day (last 14)" bodyClassName="p-5">
          <SimpleBarChart data={daily} />
        </Card>

        <Card title="Reports by LGA" bodyClassName="p-5">
          <SimpleBarChart data={byLga} />
        </Card>

        <Card title="Incidents by severity" bodyClassName="p-5">
          <DonutChart segments={severitySegments} />
        </Card>

        <Card title="Incidents by status" bodyClassName="p-5">
          <DonutChart segments={statusSegments} />
        </Card>

        {data?.sync && (
          <Card title="Sync health" bodyClassName="p-5">
            <div className="space-y-3">
              <Metric label="Total submissions" value={data.sync.total} icon={<ShieldCheck size={15} />} />
              <Metric label="Success rate" value={`${Math.round(data.sync.success_rate)}%`} icon={<Gauge size={15} />} />
              <Metric label="Failed" value={data.sync.failed} icon={<BarChart3 size={15} />} />
              <Metric label="Duplicates" value={data.sync.duplicate} icon={<Layers size={15} />} />
            </div>
          </Card>
        )}

        <Card title="LGA summary" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-line text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">LGA</th>
                <th className="px-4 py-2 font-medium text-right">Units</th>
                <th className="px-4 py-2 font-medium text-right">Reports</th>
                <th className="px-4 py-2 font-medium text-right">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-line">
              {(data?.lga_summary || []).map((l) => (
                <tr key={l.lga} className="hover:bg-surface-sunken/40">
                  <td className="px-4 py-2.5 font-medium text-ink">{l.lga}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{l.total_polling_units}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{l.reports}</td>
                  <td className="px-4 py-2.5 text-right">{l.coverage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-surface-line px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-slate-600">
        <span className="text-slate-400">{icon}</span>
        {label}
      </span>
      <span className="font-mono text-lg font-bold text-ink">{value}</span>
    </div>
  );
}
