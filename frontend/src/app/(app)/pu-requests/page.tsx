"use client";

// Admin surface for field proposals of new polling units: filter, review and
// approve/reject. Rows link to the detail page for the full review flow.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, MapPinPlus } from "lucide-react";
import { puRequestsApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import type { PuRequestStatus } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import { Pagination } from "@/components/ui/Pagination";
import { Input, Field, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { timeAgo } from "@/lib/format";

const STATUS_KEYS: PuRequestStatus[] = ["pending", "approved", "rejected", "withdrawn"];

const STATUS_LABELS: Record<PuRequestStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<PuRequestStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

export default function PURequestsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const paged = usePagedList<PollingUnitRequestRow>(
    (page, pageSize) =>
      puRequestsApi.list({
        page,
        page_size: pageSize,
        search: search || undefined,
        status: status || undefined,
      } as never),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, status],
    { pageSize: 50 },
  );

  return (
    <div>
      <PageHeader
        title="PU Requests"
        description="Field proposals for new polling units, awaiting review."
        actions={
          <Link
            href="/pu-requests/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700"
          >
            <MapPinPlus size={15} /> New proposal
          </Link>
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-surface-line">
          <Field label="Search" htmlFor="pur-search">
            <Input
              id="pur-search"
              placeholder="Code or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={6} />}
        {!paged.loading && !paged.data.length && (
          <EmptyState
            icon={<ClipboardCheck size={22} />}
            title="No proposals yet"
            description="Requests submitted from the field will appear here for review."
          />
        )}

        {!paged.loading && paged.data.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {paged.data.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => router.push(`/pu-requests/${r.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-sunken/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:text-amber-400">
                    <MapPinPlus size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      #{r.official_code} — {r.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.ward_name}, {r.lga_name} · {r.submitted_by_name || "Unknown"} ·{" "}
                      {timeAgo(r.submitted_at)}
                    </span>
                  </span>
                  <StatusPill tone={STATUS_TONE[r.status]} label={STATUS_LABELS[r.status]} />
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

type PollingUnitRequestRow = {
  id: string;
  official_code: string;
  name: string;
  status: PuRequestStatus;
  ward_name: string;
  lga_name: string;
  submitted_by_name: string;
  submitted_at: string;
};