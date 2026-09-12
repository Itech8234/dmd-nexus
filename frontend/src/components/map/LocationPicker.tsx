"use client";

// LocationPicker — click-to-pick mini map for PU proposals. Real Leaflet and
// real tiles; the marker only exists once the user picks (or captures) a
// coordinate, mirroring how the proposal flow treats GPS as mandatory data.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/lib/theme";
import type { CircleMarker, Map as LeafletMap, TileLayer } from "leaflet";

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const YOBE_CENTER: [number, number] = [12.1, 11.1];

const tileUrlFor = (dark: boolean) =>
  dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

interface LocationPickerProps {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  className?: string;
}

export default function LocationPicker({ lat, lng, onChange, className = "" }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const onChangeRef = useRef(onChange);
  const { resolved } = useTheme();
  onChangeRef.current = onChange;

  // Mount once — Leaflet must run client-side only.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: YOBE_CENTER, zoom: 10 });
      tileRef.current = L.tileLayer(tileUrlFor(resolved === "dark"), {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (e) => {
        onChangeRef.current(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
      });
      mapRef.current = map;
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marker follows the controlled lat/lng.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (cancelled || !map) return;
      const numLat = Number(lat);
      const numLng = Number(lng);
      if (!lat || !lng || Number.isNaN(numLat) || Number.isNaN(numLng)) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      const pos: [number, number] = [numLat, numLng];
      if (!markerRef.current) {
        markerRef.current = L.circleMarker(pos, {
          radius: 7,
          weight: 2,
          color: resolved === "dark" ? "#0b1020" : "#ffffff",
          fillColor: "#f59e0b",
          fillOpacity: 0.95,
        }).addTo(map);
      } else {
        markerRef.current.setLatLng(pos);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // Theme-aware basemap.
  useEffect(() => {
    tileRef.current?.setUrl(tileUrlFor(resolved === "dark"));
  }, [resolved]);

  const hasPin = !!(lat && lng);
  return (
    <div className={`relative ${className}`} data-has-pin={hasPin ? "true" : "false"}>
      <div
        ref={containerRef}
        className="h-full w-full rounded-lg"
        role="application"
        aria-label="Tap the map to set the proposed polling unit location"
      />
      {!hasPin && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-full bg-surface-panel/90 px-3 py-1 text-[11px] text-slate-500 shadow-card">
            Tap the map to drop the location pin
          </span>
        </div>
      )}
    </div>
  );
}