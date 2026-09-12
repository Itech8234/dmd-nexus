"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Siren, User, MapPin, Loader2 } from "lucide-react";
import { geographyApi, incidentsApi, officialsApi, reportsApi } from "@/lib/api";
import type { PollingUnit, Official, Report, Incident } from "@/types";

interface Result {
  id: string;
  kind: "polling_unit" | "official" | "report" | "incident";
  title: string;
  subtitle: string;
  href: string;
  icon: typeof MapPin;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const out: Result[] = [];
      const [pus, officials, reports, incidents] = await Promise.allSettled([
        geographyApi.pollingUnits({ search: q, page_size: 5 } as never),
        officialsApi.list({ search: q, page_size: 5 } as never),
        reportsApi.list({ search: q, page_size: 5 } as never),
        incidentsApi.list({ search: q, page_size: 5 } as never),
      ]);
      if (pus.status === "fulfilled") {
        (pus.value.results || []).forEach((p: PollingUnit) =>
          out.push({
            id: p.id,
            kind: "polling_unit",
            title: p.name,
            subtitle: `${p.lga_name} • ${p.official_code}`,
            href: `/map?focus=${p.id}`,
            icon: MapPin,
          }),
        );
      }
      if (officials.status === "fulfilled") {
        (officials.value.results || []).forEach((o: Official) =>
          out.push({
            id: o.id,
            kind: "official",
            title: o.full_name,
            subtitle: o.official_reference,
            href: `/officials/${o.id}`,
            icon: User,
          }),
        );
      }
      if (reports.status === "fulfilled") {
        (reports.value.results || []).forEach((r: Report) =>
          out.push({
            id: r.id,
            kind: "report",
            title: `${r.category_name} — ${r.polling_unit_code}`,
            subtitle: r.official_name,
            href: `/reports/${r.id}`,
            icon: FileText,
          }),
        );
      }
      if (incidents.status === "fulfilled") {
        (incidents.value.results || []).forEach((i: Incident) =>
          out.push({
            id: i.id,
            kind: "incident",
            title: `${i.category} — ${i.polling_unit_code}`,
            subtitle: i.status,
            href: `/incidents/${i.id}`,
            icon: Siren,
          }),
        );
      }
      setResults(out.slice(0, 12));
    } finally {
      setLoading(false);
    }
  }, []);

  const debounced = useMemo(
    () =>
      ((cb: (q: string) => void, wait: number) => {
        let t: ReturnType<typeof setTimeout>;
        return (q: string) => {
          clearTimeout(t);
          t = setTimeout(() => cb(q), 300);
        };
      })(run, 300),
    [run],
  );

  useEffect(() => {
    debounced(query);
  }, [query, debounced]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-24 p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-pop animate-scale-in overflow-hidden">
        <div className="flex items-center gap-3 border-b border-surface-line px-4">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                router.push(results[0].href);
                onClose();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search polling units, officials, reports, incidents…  (Esc to close)"
            className="h-13 w-full py-4 text-sm text-ink placeholder:text-slate-400 focus:outline-none"
          />
          {loading && <Loader2 size={16} className="animate-spin text-slate-400" />}
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 && !loading && query.trim() !== "" && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No matches found.</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => {
                router.push(r.href);
                onClose();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-slate-500 shrink-0">
                <r.icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                <span className="block truncate text-xs text-slate-500">{r.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
