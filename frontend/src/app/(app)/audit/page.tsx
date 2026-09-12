"use client";

import { ShieldCheck } from "lucide-react";
import { auditApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import type { AuditLog } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { formatDateTime } from "@/lib/format";

/** JSONField detail can be an object — flatten it for the one-line view. */
function detailText(detail: AuditLog["detail"]): string {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default function AuditPage() {
  const paged = usePagedList<AuditLog>(
    (page, pageSize) => auditApi.list({ page, page_size: pageSize } as never),
    [],
    { pageSize: 50 },
  );

  return (
    <div>
      <PageHeader title="Audit Logs" description="A trace of administrative actions for accountability." />
      <Card bodyClassName="p-0">
        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={8} />}
        {!paged.loading && !paged.data.length && (
          <EmptyState icon={<ShieldCheck size={22} />} title="No audit events yet" />
        )}
        {!paged.loading && paged.data.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {paged.data.map((a: AuditLog) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <ShieldCheck size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{a.actor_name || "System"}</span>
                    <span className="text-slate-500"> · {a.action}</span>
                    <span className="text-slate-400"> · {a.object_type}</span>
                  </p>
                  {detailText(a.detail) && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">{detailText(a.detail)}</p>
                  )}
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {formatDateTime(a.created_at)} · {a.ip_address || "—"}
                  </p>
                </div>
                <StatusPill tone={a.result === "success" ? "success" : "danger"} label={a.result} />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={paged.page} totalPages={paged.totalPages} count={paged.count} pageSize={50} onChange={paged.goTo} />
      </Card>
    </div>
  );
}
