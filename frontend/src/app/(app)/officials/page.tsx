"use client";

import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { officialsApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import type { Official } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";

export default function OfficialsPage() {
  const router = useRouter();
  const paged = usePagedList<Official>(
    (page, pageSize) => officialsApi.list({ page, page_size: pageSize } as never),
    [],
    { pageSize: 50 },
  );

  return (
    <div>
      <PageHeader
        title="Officials"
        description="Verified field officials registered across Yobe State."
      />
      <Card bodyClassName="p-0">
        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={8} />}
        {!paged.loading && !paged.data.length && (
          <EmptyState icon={<Users size={22} />} title="No officials yet" />
        )}

        {!paged.loading && paged.data.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {paged.data.map((o: Official) => (
              <li key={o.id}>
                <button
                  onClick={() => router.push(`/officials/${o.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-sunken/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-semibold text-xs">
                    {(o.full_name?.[0] || "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{o.full_name}</span>
                    <span className="block truncate text-xs text-slate-500">{o.official_reference}</span>
                  </span>
                  <StatusPill
                    tone={o.id_verified ? "success" : "warning"}
                    label={o.id_verified ? "Verified" : "Unverified"}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={paged.page} totalPages={paged.totalPages} count={paged.count} pageSize={50} onChange={paged.goTo} />
      </Card>
    </div>
  );
}
