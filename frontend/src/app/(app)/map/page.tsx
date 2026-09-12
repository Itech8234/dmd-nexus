"use client";

// Live operations map — real Leaflet rendering of the backend's
// /polling-units/map/ feed with server-side LGA/ward/search filters,
// client-side status chips, a PU detail drawer and WebSocket-driven refresh.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Check, CloudOff, RefreshCw, Search } from "lucide-react";
import { geographyApi, incidentsApi, puRequestsApi } from "@/lib/api";
import { operationsSocketUrl } from "@/lib/ws";
import { usePrefs } from "@/lib/prefs";
import { useConnectivity } from "@/lib/connectivity";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { OPERATIONAL_STATUS_LABELS, timeAgo, SEVERITY_LABELS } from "@/lib/format";
import { STATUS_COLORS } from "@/lib/map-status";
import { PUDrawer } from "@/components/map/PUDrawer";
import type { IncidentMapItem, LGA, OperationalStatus, PollingUnitMapItem, PuRequestMapItem, Ward } from "@/types";

const OperationsMap = dynamic(() => import("@/components/map/OperationsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>
  ),
});

const ALL_STATUSES = Object.keys(OPERATIONAL_STATUS_LABELS) as OperationalStatus[];

const SEVERITY_COLORS: Record<string, string> = {
  low: "#64748b",
  medium: "#f59e0b",
  high: "#dc2626",
  critical: "#7c3aed",
};

/** Map layers the user can toggle from the sidebar panel. */
const MAP_LAYERS = [
  { id: "pollingUnits", label: "Polling Units", default: true },
  { id: "incidents", label: "Incidents", default: true },
  { id: "pendingUnits", label: "Proposed Polling Units", default: true },
  { id: "securityAlerts", label: "Security Alerts", default: true },
  { id: "operationalLocations", label: "Operational Locations", default: false },
] as const;

type LayerId = (typeof MAP_LAYERS)[number]["id"];

function MapPageInner() {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");
  const { lowData } = usePrefs();
  const { online } = useConnectivity();

  const [items, setItems] = useState<PollingUnitMapItem[]>([]);
  const [pending, setPending] = useState<PuRequestMapItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentMapItem[]>([]);
  const [lgas, setLgas] = useState<LGA[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [lgaId, setLgaId] = useState("");
  const [wardId, setWardId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Set<OperationalStatus>>(new Set());
  const [enabledLayers, setEnabledLayers] = useState<Set<LayerId>>(
    () => new Set(MAP_LAYERS.filter((l) => l.default).map((l) => l.id)),
  );
  const [selected, setSelected] = useState<PollingUnitMapItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Debounce the search box before it hits the server.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [feed, pendingFeed, incidentsFeed] = await Promise.all([
        geographyApi.mapFeed({
          ward__lga: lgaId || undefined,
          ward: wardId || undefined,
          search: search || undefined,
        }),
        puRequestsApi.mapFeed(),
        incidentsApi.mapFeed(),
      ]);
      setItems(feed);
      setPending(pendingFeed);
      setIncidents(incidentsFeed);
      setUpdatedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [lgaId, wardId, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter options come from the real geography API.
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
    setWardId("");
  }, [lgaId]);

  // Live updates via the operations feed — skipped in Low Data Mode and while
  // offline (the connection badge already communicates connectivity).
  // Attempts to reconnect automatically via the ReconnectingSocket.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lowData || !online) return;
    let ws: WebSocket | null = null;
    let reconnecting: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      if (closed) return;
      try {
        ws = new WebSocket(operationsSocketUrl());
      } catch {
        reconnecting = setTimeout(open, 2000);
        return;
      }
      ws.onopen = () => {
        // Fresh connection: pull the latest feed so anything that happened
        // while we were down shows up without waiting for the next event.
        void load();
      };
      ws.onmessage = () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => void load(), 1500);
      };
      ws.onclose = () => {
        if (closed) return;
        if (reconnecting) clearTimeout(reconnecting);
        reconnecting = setTimeout(open, 2000);
      };
    };
    open();

    return () => {
      closed = true;
      ws?.close();
      if (reconnecting) clearTimeout(reconnecting);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [load, lowData, online]);

  // Client-side status filtering (each feed item carries its own status).
  const filtered = useMemo(
    () => (statuses.size === 0 ? items : items.filter((p) => statuses.has(p.operational_status))),
    [items, statuses],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    filtered.forEach((p) => {
      c[p.operational_status] = (c[p.operational_status] || 0) + 1;
    });
    return c;
  }, [filtered]);

  const toggleStatus = (s: OperationalStatus) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleLayer = (id: LayerId) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const severityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    incidents.forEach((i) => {
      c[i.severity] = (c[i.severity] || 0) + 1;
    });
    return c;
  }, [incidents]);

  // If all layers are off, fall back to every layer so the map isn't blank.
  const resolvedLayers = useMemo(() => {
    if (enabledLayers.size === 0) return new Set(MAP_LAYERS.map((l) => l.id));
    return enabledLayers;
  }, [enabledLayers]);

  return (
    <div>
      <PageHeader
        title="Live Map"
        description="Geographic view of polling-unit status across Yobe — real backend data, live updates."
        actions={
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {updatedAt && <span>Updated {timeAgo(updatedAt.toISOString())}</span>}
            {!online && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <CloudOff size={13} /> Offline
              </span>
            )}
            <button
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-lg border border-surface-line px-3 py-2 font-medium text-slate-600 hover:bg-surface-sunken"
              aria-label="Refresh map data"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        }
      />

      <Card bodyClassName="p-4" className="mb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="map-search">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="map-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="PU name or code…"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="LGA" htmlFor="map-lga">
            <Select id="map-lga" value={lgaId} onChange={(e) => setLgaId(e.target.value)}>
              <option value="">All LGAs</option>
              {lgas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ward" htmlFor="map-ward">
            <Select id="map-ward" value={wardId} onChange={(e) => setWardId(e.target.value)} disabled={!lgaId}>
              <option value="">All wards</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="map-status-chips">
            <div id="map-status-chips" className="flex flex-wrap gap-1.5 pt-1">
              {ALL_STATUSES.map((s) => {
                const active = statuses.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? "border-transparent text-white"
                        : "border-surface-line text-slate-600 hover:bg-surface-sunken"
                    }`}
                    style={active ? { background: STATUS_COLORS[s] } : undefined}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: active ? "#fff" : STATUS_COLORS[s] }}
                    />
                    {OPERATIONAL_STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <Card bodyClassName="p-1.5">
            {error && !items.length ? (
              <ErrorState onRetry={load} title="Couldn't load the map feed" />
            ) : loading && !items.length ? (
              <SkeletonRows rows={8} />
            ) : (
              <div className="h-[560px] min-h-[380px] contain-layout overflow-hidden">
                <OperationsMap
                  items={filtered}
                  pendingItems={pending}
                  incidents={incidents}
                  layers={resolvedLayers}
                  focusId={focus}
                  onSelect={(p) => setSelected(p)}
                  className="h-full w-full"
                />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Map Layers" bodyClassName="p-4">
            <div className="space-y-1.5">
              {MAP_LAYERS.map((layer) => {
                const active = enabledLayers.has(layer.id);
                return (
                  <button
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    aria-pressed={active}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-sunken"
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                        active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white"
                      }`}
                    >
                      {active && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className={`text-sm ${active ? "font-medium text-ink" : "text-slate-500"}`}>
                      {layer.label}
                    </span>
                    <span className="ml-auto text-[10px] font-semibold text-slate-400">
                      {layer.id === "incidents" ? incidents.length : layer.id === "pendingUnits" ? pending.length : layer.id === "pollingUnits" ? filtered.length : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Legend" bodyClassName="p-5">
            <div className="space-y-2">
              {ALL_STATUSES.map((s) => (
                <div key={s} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                  <span className="text-slate-600 dark:text-slate-300">{OPERATIONAL_STATUS_LABELS[s]}</span>
                  <span className="ml-auto font-semibold text-ink">{counts[s] || 0}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 border-t border-surface-line pt-2 mt-2 text-sm">
                <span className="h-3 w-3 rounded-full border-2 border-dashed" style={{ background: "#f59e0b" }} />
                <span className="text-slate-600 dark:text-slate-300">Proposed (pending review)</span>
                <span className="ml-auto font-semibold text-ink">{pending.length}</span>
              </div>
              <div className="mt-3 border-t border-surface-line pt-3">
                <p className="text-xs font-medium text-ink">Incident severity</p>
                <div className="mt-2 space-y-1.5">
                  {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
                    <div key={sev} className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                      <span className="text-slate-600 capitalize dark:text-slate-300">{SEVERITY_LABELS[sev as keyof typeof SEVERITY_LABELS] || sev}</span>
                      <span className="ml-auto font-semibold text-ink">{severityCounts[sev] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-surface-line pt-3 text-sm">
                <span className="font-medium text-ink">Shown</span>
                <span className="font-mono font-bold text-ink">{filtered.length}</span>
              </div>
            </div>
          </Card>

          {lowData && (
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-500">
                <strong className="text-ink">Low Data Mode</strong> is on — live map refreshes are paused.
                Use Refresh for the latest feed.
              </p>
            </Card>
          )}
        </div>
      </div>

      <PUDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <MapPageInner />
    </Suspense>
  );
}