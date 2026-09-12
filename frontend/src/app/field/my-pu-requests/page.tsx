"use client";

// Field Official's view of their own polling unit proposals: status of each,
// the reviewer's note when decided, and withdraw for still-pending ones.

import Link from "next/link";
import { MapPinPlus } from "lucide-react";
import { puRequestsApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import { useConnectivity } from "@/lib/connectivity";
import type { PuRequestStatus } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { apiErrorMessage } from "@/lib/http";
import { timeAgo } from "@/lib/format";

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

type Row = {
  id: string;
  official_code: string;
  name: string;
  status: PuRequestStatus;
  ward_name: string;
  lga_name: string;
  submitted_at: string;
  review_note: string;
};

export default function MyPURequestsPage() {
  const { online } = useConnectivity();
  const { push } = useToast();
  const paged = usePagedList<Row>(
    (page, pageSize) => puRequestsApi.list({ page, page_size: pageSize } as never),
    [],
    { pageSize: 30 },
  );

  const withdraw = async (row: Row) => {
    try {
      await puRequestsApi.withdraw(row.id);
      push("success", `Proposal #${row.official_code} withdrawn.`);
      paged.reload();
    } catch (err) {
      push("error", apiErrorMessage(err, "Couldn't withdraw this proposal."));
    }
  };

  return (
    <div>
      <PageHeader
        title="My PU Requests"
        description="Proposals you've submitted for new polling units."
        actions={
          <Link
            href="/field/propose-pu"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700"
          >
            <MapPinPlus size={15} /> Propose PU
          </Link>
        }
      />
      <Card bodyClassName="p-0">
        {!online && (
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            You&apos;re offline — showing the last loaded state.
          </p>
        )}
        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={5} />}
        {!paged.loading && !paged.data.length && (
          <EmptyState
            icon={<MapPinPlus size={22} />}
            title="No proposals yet"
            description="Propose a new polling unit when you find a community without one."
            action={
              <Link href="/field/propose-pu">
                <Button size="sm">Propose a polling unit</Button>
              </Link>
            }
          />
        )}

        {!paged.loading && paged.data.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {paged.data.map((r) => (
              <li key={r.id} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:text-amber-400">
                    <MapPinPlus size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      #{r.official_code} — {r.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.ward_name}, {r.lga_name} · submitted {timeAgo(r.submitted_at)}
                    </span>
                  </span>
                  <StatusPill tone={STATUS_TONE[r.status]} label={STATUS_LABELS[r.status]} />
                  {r.status === "pending" && (
                    <Button variant="secondary" size="sm" onClick={() => withdraw(r)}>
                      Withdraw
                    </Button>
                  )}
                </div>
                {r.status === "rejected" && r.review_note && (
                  <p className="mt-2 ml-12 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium">Reviewer note:</span> {r.review_note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={paged.page}
          totalPages={paged.totalPages}
          count={paged.count}
          pageSize={30}
          onChange={paged.goTo}
        />
      </Card>
    </div>
  );
}