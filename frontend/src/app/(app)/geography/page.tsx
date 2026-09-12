"use client";

// Geography — LGAs and Wards administration. Read surfaces backed by the real
// geography API; per-LGA operational figures come from /analytics/ (real
// computed coverage/reports/incidents), honouring the viewer's scope.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Map as MapIcon } from "lucide-react";
import { dashboardApi, geographyApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import type { Analytics, LGA, Ward } from "@/types";

type Tab = "lgas" | "wards";

export default function GeographyPage() {
  const [tab, setTab] = useState<Tab>("lgas");

  const tabs: { id: Tab; label: string; icon: typeof MapIcon }[] = [
    { id: "lgas", label: "LGAs", icon: MapIcon },
    { id: "wards", label: "Wards", icon: Layers },
  ];

  return (
    <div>
      <PageHeader title="Geography" description="Local government areas, wards and their operational standing." />
      <div className="mb-6 flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 border border-surface-line hover:bg-surface-sunken"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "lgas" ? <LgaTable /> : <WardTable />}
    </div>
  );
}

function LgaTable() {
  const [lgas, setLgas] = useState<LGA[] | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [lgaList, a] = await Promise.all([
        geographyApi.lgas(),
        dashboardApi.analytics() as Promise<Analytics>,
      ]);
      setLgas(Array.isArray(lgaList) ? lgaList : []);
      setAnalytics(a);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statsByName = useMemo(() => {
    const map = new Map<string, Analytics["lga_summary"][number]>();
    (analytics?.lga_summary || []).forEach((row) => map.set(row.lga, row));
    return map;
  }, [analytics]);

  if (error && !lgas) return <ErrorState onRetry={load} />;
  if (!lgas) return <SkeletonRows rows={8} />;
  if (lgas.length === 0)
    return (
      <EmptyState
        icon={<MapIcon size={22} />}
        title="No LGAs recorded"
        description="Geographic seed data has not been imported yet."
      />
    );

  return (
    <Card bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-line text-left text-xs text-slate-500">
              <th className="px-4 py-2.5 font-medium">LGA</th>
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 text-right font-medium">Polling units</th>
              <th className="px-4 py-2.5 text-right font-medium">Assigned</th>
              <th className="px-4 py-2.5 text-right font-medium">Coverage</th>
              <th className="px-4 py-2.5 text-right font-medium">Reports</th>
              <th className="px-4 py-2.5 text-right font-medium">Open incidents</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-line">
            {lgas.map((l) => {
              const s = statsByName.get(l.name);
              return (
                <tr key={l.id} className="hover:bg-surface-sunken/40">
                  <td className="px-4 py-2.5 font-medium text-ink">{l.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{l.code || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{s?.total_polling_units ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{s?.assigned_polling_units ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={
                        s && s.coverage >= 60
                          ? "font-semibold text-emerald-600 dark:text-emerald-400"
                          : "font-semibold text-amber-600 dark:text-amber-400"
                      }
                    >
                      {s ? `${s.coverage}%` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{s?.reports ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{s?.open_incidents ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/polling-units?lga=${l.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                      Units
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WardTable() {
  const [lgas, setLgas] = useState<LGA[]>([]);
  const [lgaId, setLgaId] = useState("");
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    geographyApi
      .lgas()
      .then((res) => setLgas(Array.isArray(res) ? res : []))
      .catch(() => setLgas([]));
  }, []);

  const load = useCallback(async () => {
    if (!lgaId) {
      setWards([]);
      return;
    }
    setError(false);
    try {
      const res = await geographyApi.wards(lgaId);
      setWards(Array.isArray(res) ? res : []);
    } catch {
      setError(true);
      setWards([]);
    }
  }, [lgaId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card bodyClassName="p-4">
        <Field label="Filter by LGA" htmlFor="ward-lga">
          <Select id="ward-lga" value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
            <option value="">Select an LGA…</option>
            {lgas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card bodyClassName="p-0">
        {error && <ErrorState onRetry={load} />}
        {!lgaId && !wards && (
          <EmptyState
            icon={<Layers size={22} />}
            title="Select an LGA"
            description="Choose a local government area to list its wards."
          />
        )}
        {wards && wards.length === 0 && lgaId && !error && (
          <EmptyState icon={<Layers size={22} />} title="No wards in this LGA" />
        )}
        {wards && wards.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {wards.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Layers size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{w.name}</p>
                  <p className="truncate text-xs text-slate-500">{w.code ? `Code ${w.code}` : "Registration area"}</p>
                </div>
                <Link
                  href={`/polling-units?ward=${w.id}`}
                  className="rounded-lg border border-surface-line px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
                >
                  Polling units
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
