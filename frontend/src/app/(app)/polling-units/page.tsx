"use client";

// Polling unit browser — searchable, filterable, paginated table over the
// real /polling-units/ endpoint. Accepts ?lga= / ?ward= deep links from the
// Geography pages.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { geographyApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Pagination } from "@/components/ui/Pagination";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { OPERATIONAL_STATUS_LABELS, operationalStatusTone, timeAgo } from "@/lib/format";
import type { LGA, OperationalStatus, PollingUnit, Ward } from "@/types";

const STATUSES = Object.keys(OPERATIONAL_STATUS_LABELS) as OperationalStatus[];

export default function PollingUnitsPage() {
  const router = useRouter();
  const [lgas, setLgas] = useState<LGA[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [lgaId, setLgaId] = useState("");
  const [wardId, setWardId] = useState("");
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Deep links: /polling-units?lga=<id> or ?ward=<id>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get("lga");
    const w = params.get("ward");
    if (l) setLgaId(l);
    if (w) setWardId(w);
  }, []);

  useEffect(() => {
    geographyApi
      .lgas()
      .then((res) => setLgas(Array.isArray(res) ? res : []))
      .catch(() => setLgas([]));
  }, []);

  useEffect(() => {
    if (!lgaId) {
      setWards([]);
      return;
    }
    geographyApi
      .wards(lgaId)
      .then((res) => setWards(Array.isArray(res) ? res : []))
      .catch(() => setWards([]));
  }, [lgaId]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const paged = usePagedList<PollingUnit>(
    (page, pageSize) =>
      geographyApi.pollingUnits({
        page,
        page_size: pageSize,
        search: search || undefined,
        ward__lga: lgaId || undefined,
        ward: wardId || undefined,
        operational_status: status || undefined,
      } as never),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, lgaId, wardId, status],
    { pageSize: 50 },
  );

  const activeFilters = useMemo(
    () => [lgaId, wardId, status, search].filter(Boolean).length,
    [lgaId, wardId, status, search],
  );

  return (
    <div>
      <PageHeader
        title="Polling Units"
        description="Electoral geography registry — location, status and assignment per unit."
        actions={
          activeFilters > 0 ? (
            <button
              onClick={() => {
                setLgaId("");
                setWardId("");
                setStatus("");
                setSearchInput("");
              }}
              className="rounded-lg border border-surface-line px-3 py-2 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
            >
              Clear filters ({activeFilters})
            </button>
          ) : undefined
        }
      />

      <Card bodyClassName="p-4" className="mb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="pu-search">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="pu-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name or official code…"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="LGA" htmlFor="pu-lga">
            <Select
              id="pu-lga"
              value={lgaId}
              onChange={(e) => {
                setLgaId(e.target.value);
                setWardId("");
              }}
            >
              <option value="">All LGAs</option>
              {lgas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ward" htmlFor="pu-ward">
            <Select id="pu-ward" value={wardId} onChange={(e) => setWardId(e.target.value)} disabled={!lgaId}>
              <option value="">All wards</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="pu-status">
            <Select id="pu-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OPERATIONAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card bodyClassName="p-0">
        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={10} />}
        {!paged.loading && !paged.data.length && !paged.error && (
          <EmptyState
            icon={<MapPin size={22} />}
            title="No polling units found"
            description="No units match the current filters."
          />
        )}
        {!paged.loading && paged.data.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-line text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Polling unit</th>
                    <th className="px-4 py-2.5 font-medium">Ward / LGA</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Assigned official</th>
                    <th className="px-4 py-2.5 font-medium">Last report</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-line">
                  {paged.data.map((pu) => (
                    <tr
                      key={pu.id}
                      onClick={() => router.push(`/polling-units/${pu.id}`)}
                      className="cursor-pointer hover:bg-surface-sunken/50"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">#{pu.official_code}</td>
                      <td className="px-4 py-2.5 font-medium text-ink">{pu.name}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {pu.ward_name}
                        <span className="text-slate-400"> · {pu.lga_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill
                          tone={operationalStatusTone(pu.operational_status)}
                          label={OPERATIONAL_STATUS_LABELS[pu.operational_status] || pu.operational_status}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{pu.assigned_official?.name || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {pu.latest_report_at ? timeAgo(pu.latest_report_at) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-xs font-medium text-brand-600">View</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-surface-line px-5 py-3">
              <Pagination
                page={paged.page}
                totalPages={paged.totalPages}
                count={paged.count}
                pageSize={50}
                onChange={paged.goTo}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
