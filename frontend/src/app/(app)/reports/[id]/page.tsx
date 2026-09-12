"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, MapPin } from "lucide-react";
import { reportsApi } from "@/lib/api";
import type { Report } from "@/types";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { formatDateTime, syncTone, SYNC_LABELS, operationalStatusTone, OPERATIONAL_STATUS_LABELS } from "@/lib/format";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setReport(await reportsApi.get(params.id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !report) return <SkeletonRows rows={8} />;
  if (error && !report) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-slate-500 hover:bg-surface-sunken">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-ink">{report?.category_name}</h1>
          <p className="text-sm text-slate-500">Report · {report?.polling_unit_code}</p>
        </div>
        {report && (
          <div className="ml-auto">
            <StatusPill tone={syncTone(report.sync_status)} label={SYNC_LABELS[report.sync_status] || report.sync_status} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Details" bodyClassName="p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Detail label="Polling Unit" value={report?.polling_unit_code} />
              <Detail label="Official" value={report?.official_name} />
              <Detail label="Category" value={report?.category_name} />
              <Detail
                label="Operational status"
                value={report && `${OPERATIONAL_STATUS_LABELS[report.polling_unit_status] || report.polling_unit_status}`}
              />
              <Detail label="Device captured" value={formatDateTime(report?.device_captured_at)} />
              <Detail label="Server received" value={formatDateTime(report?.server_received_at)} />
            </dl>
          </Card>

          <Card title="Narrative" bodyClassName="p-5">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{report?.narrative || "No narrative."}</p>
          </Card>

          {report && report.attachments.length > 0 && (
            <Card title={`Attachments (${report.attachments.length})`} bodyClassName="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {report.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.file}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-surface-line p-3 text-xs text-slate-600 hover:bg-surface-sunken"
                  >
                    <FileText size={15} className="text-slate-400 shrink-0" />
                    <span className="truncate">Attachment</span>
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Polling Unit" bodyClassName="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <MapPin size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">#{report?.polling_unit_code}</p>
                <p className="text-xs text-slate-500 mt-0.5">Status link pending full geography integration.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{value || "—"}</dd>
    </div>
  );
}
