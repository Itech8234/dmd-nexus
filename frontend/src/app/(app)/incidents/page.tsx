"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Siren } from "lucide-react";
import { incidentsApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import type { Incident } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { severityTone, SEVERITY_LABELS, timeAgo } from "@/lib/format";
import { quickStatusLabel, quickStatusTone } from "@/lib/dashboard";

export default function IncidentsPage() {
  const router = useRouter();
  const [pu, setPu] = useState("");

  // Deep-link support: /incidents?pu=<polling-unit-id> (used by the map drawer).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("pu");
    if (p) setPu(p);
  }, []);

  const paged = usePagedList<Incident>(
    (page, pageSize) =>
      incidentsApi.list({ page, page_size: pageSize, polling_unit: pu || undefined } as never),
    [pu],
    { pageSize: 50 },
  );

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="Security and operational incidents reported from the field."
      />

      <Card bodyClassName="p-0">
        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={8} />}
        {!paged.loading && !paged.data.length && (
          <EmptyState icon={<Siren size={22} />} title="No incidents yet" />
        )}

        {!paged.loading && paged.data.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {paged.data.map((inc: Incident) => (
              <li key={inc.id}>
                <button
                  onClick={() => router.push(`/incidents/${inc.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-sunken/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:text-red-400">
                    <Siren size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {inc.category}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {inc.polling_unit_code} · {timeAgo(inc.created_at)}
                    </span>
                  </span>
                  <StatusPill tone={severityTone(inc.severity)} label={SEVERITY_LABELS[inc.severity]} />
                  <StatusPill tone={quickStatusTone(inc.status)} label={quickStatusLabel(inc.status)} />
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
