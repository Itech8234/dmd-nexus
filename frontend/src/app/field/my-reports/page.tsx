"use client";

import { FileText, Inbox } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import type { Report } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { SkeletonRows, EmptyState, ErrorState } from "@/components/ui/States";
import { timeAgo, syncTone, SYNC_LABELS } from "@/lib/format";

export default function FieldActivityPage() {
  const paged = usePagedList<Report>(
    (page, pageSize) => reportsApi.list({ page, page_size: pageSize } as never),
    [],
    { pageSize: 50 },
  );

  return (
    <div>
      <PageHeader title="My Activity" description="Your submitted reports and incidents." />
      <div className="space-y-4">
        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={6} />}
        {!paged.loading && paged.data.length === 0 && (
          <EmptyState
            icon={<Inbox size={22} />}
            title="Nothing submitted yet"
            description="Your field reports and incidents will appear here."
          />
        )}
        {!paged.loading &&
          paged.data.map((r: Report) => (
            <div key={r.id} className="rounded-2xl border border-surface-line bg-white p-4 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FileText size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.category_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    #{r.polling_unit_code} · {timeAgo(r.device_captured_at)}
                  </p>
                </div>
                <StatusPill tone={syncTone(r.sync_status)} label={SYNC_LABELS[r.sync_status] || r.sync_status} />
              </div>
              {r.narrative && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{r.narrative}</p>}
            </div>
          ))}
      </div>
    </div>
  );
}
