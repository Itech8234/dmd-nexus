"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import type { Report, ReportSyncStatus } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Pagination } from "@/components/ui/Pagination";
import { Select, Input, Field } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { timeAgo, syncTone, SYNC_LABELS, operationalStatusTone, OPERATIONAL_STATUS_LABELS } from "@/lib/format";

export default function ReportsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [pu, setPu] = useState("");

  // Deep-link support: /reports?pu=<polling-unit-id> (used by the map drawer).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("pu");
    if (p) setPu(p);
  }, []);

  const paged = usePagedList<Report>(
    (page, pageSize) =>
      reportsApi.list({
        page,
        page_size: pageSize,
        search: search || undefined,
        sync_status: status || undefined,
        polling_unit: pu || undefined,
      } as never),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, status, pu],
    { pageSize: 50 },
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Field submission feed across Yobe State."
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-surface-line">
          <Field label="Search" htmlFor="r-search">
            <Input
              id="r-search"
              placeholder="Narrative, PU code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All sync statuses</option>
            {Object.values<string>(REPORT_STATUS_KEYS).map((k) => (
              <option key={k} value={k}>{SYNC_LABELS[k as ReportSyncStatus] || k}</option>
            ))}
          </Select>
        </div>

        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={8} />}

        {!paged.loading && !paged.data.length && (
          <EmptyState icon={<FileText size={22} />} title="No reports yet" description="Submissions from the field will appear here." />
        )}

        {!paged.loading && paged.data.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {paged.data.map((r: Report) => (
              <li key={r.id}>
                <button
                  onClick={() => router.push(`/reports/${r.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-sunken/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileText size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {r.category_name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.polling_unit_code} · {r.official_name} · {timeAgo(r.server_received_at)}
                    </span>
                  </span>
                  <span className="hidden sm:block align-middle">
                    <StatusPill tone={operationalStatusTone(r.polling_unit_status)} label={OPERATIONAL_STATUS_LABELS[r.polling_unit_status] || r.polling_unit_status} />
                  </span>
                  <StatusPill tone={syncTone(r.sync_status)} label={SYNC_LABELS[r.sync_status] || r.sync_status} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={paged.page}
          totalPages={paged.totalPages}
          count={paged.count}
          pageSize={50}
          onChange={paged.goTo}
        />
      </Card>
    </div>
  );
}

const REPORT_STATUS_KEYS = ["saved_offline", "synchronizing", "submitted", "failed"];
