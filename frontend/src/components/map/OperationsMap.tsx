"use client";

// OperationsMap
// -----------------------------------------------------------------------------
// Real GIS map for polling units.
//
// Features:
// - Leaflet + MarkerCluster
// - Next.js client-side safe dynamic loading
// - CARTO basemaps
// - Operational status markers
// - Pending polling-unit proposals
// - Marker clustering
// - Dark/light theme support
// - Focus/fly-to support
// - Proper TypeScript types
// -----------------------------------------------------------------------------

import { useEffect, useRef } from "react";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { useTheme } from "@/lib/theme";

import type {
  IncidentMapItem,
  OperationalStatus,
  PollingUnitMapItem,
  PuRequestMapItem,
} from "@/types";

import type {
  CircleMarker,
  DivIcon,
  Map as LeafletMap,
  Marker,
  TileLayer,
} from "leaflet";

// leaflet.markercluster does not expose a TS type export in this project setup.
// Use a lightweight local structural type instead.
type MarkerClusterGroup = {
  clearLayers(): void;
  addLayer(layer: unknown): void;
  getAllChildMarkers(): Marker[];
};


// -----------------------------------------------------------------------------
// Status colors
// -----------------------------------------------------------------------------

export const STATUS_COLORS: Record<
  OperationalStatus,
  string
> = {
  active_reporting: "#10b981",
  recently_reported: "#3b82f6",
  report_overdue: "#dc2626",
  incident_reported: "#d946ef",
  awaiting_assignment: "#f59e0b",
  official_offline: "#94a3b8",
};


// Severity palette for the incident overlay layer.
const SEVERITY_COLORS: Record<
  string,
  string
> = {
  low: "#64748b",
  medium: "#f59e0b",
  high: "#dc2626",
  critical: "#7c3aed",
};


// -----------------------------------------------------------------------------
// CARTO configuration
// -----------------------------------------------------------------------------

const CARTO_API_KEY =
  process.env.NEXT_PUBLIC_CARTO_API_KEY || "";

const KEY_SUFFIX = CARTO_API_KEY
  ? `?key=${CARTO_API_KEY}`
  : "";

const TILE_URLS = CARTO_API_KEY
  ? {
      light:
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" +
        KEY_SUFFIX,

      dark:
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png" +
        KEY_SUFFIX,
    }
  : {
      light:
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",

      dark:
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    };


const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';


// -----------------------------------------------------------------------------
// Default Yobe map position
// -----------------------------------------------------------------------------

const YOBE_CENTER: [number, number] = [
  12.1,
  11.1,
];

const YOBE_ZOOM = 7;


// -----------------------------------------------------------------------------
// Leaflet loader
//
// Important:
//
// leaflet.markercluster is an old UMD plugin.
//
// In Next.js, dynamically importing Leaflet and MarkerCluster separately can
// result in:
//
//   L.markerClusterGroup is not a function
//
// We attach the same Leaflet instance to window before importing the plugin.
// -----------------------------------------------------------------------------

let leafletPromise:
  | Promise<typeof import("leaflet")>
  | null = null;


async function getLeaflet() {
  if (leafletPromise) {
    return leafletPromise;
  }

  leafletPromise = (async () => {
    const leafletModule =
      await import("leaflet");

    const L =
      leafletModule.default ??
      leafletModule;

    if (typeof window !== "undefined") {
      (
        window as unknown as {
          L: typeof L;
        }
      ).L = L;
    }

    await import("leaflet.markercluster");

    return L;
  })();

  return leafletPromise;
}


// -----------------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------------

function isValidCoordinate(
  value: unknown
): boolean {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number !== 0
  );
}


function isValidLatitude(
  value: unknown
): boolean {
  if (!isValidCoordinate(value)) {
    return false;
  }

  const number = Number(value);

  return (
    number >= -90 &&
    number <= 90
  );
}


function isValidLongitude(
  value: unknown
): boolean {
  if (!isValidCoordinate(value)) {
    return false;
  }

  const number = Number(value);

  return (
    number >= -180 &&
    number <= 180
  );
}


function getStatusLabel(
  status: OperationalStatus
) {
  return status
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}


// -----------------------------------------------------------------------------
// Polling Unit Icon
// -----------------------------------------------------------------------------

function makePuIcon(
  L: typeof import("leaflet"),
  status: OperationalStatus,
  isDark: boolean
): DivIcon {
  const color =
    STATUS_COLORS[status] ||
    "#94a3b8";

  const background =
    isDark
      ? "#0b1020"
      : "#ffffff";

  return L.divIcon({
    className: "pu-marker",

    iconSize: [28, 28],

    iconAnchor: [14, 14],

    popupAnchor: [0, -16],

    html: `
      <span
        style="
          display:flex;
          align-items:center;
          justify-content:center;

          width:28px;
          height:28px;

          border-radius:50%;

          background:${background};

          border:2.5px solid ${color};

          box-shadow:
            0 2px 6px ${color}55;

          position:relative;
        "
      >

        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"

          fill="none"

          stroke="${color}"

          stroke-width="2"

          stroke-linecap="round"

          stroke-linejoin="round"
        >

          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />

          <polyline
            points="14 2 14 8 20 8"
          />

          <line
            x1="9"
            y1="13"
            x2="15"
            y2="19"
          />

          <line
            x1="15"
            y1="13"
            x2="9"
            y2="19"
          />

        </svg>


        <span
          style="
            position:absolute;

            bottom:-3px;
            right:-3px;

            width:8px;
            height:8px;

            border-radius:50%;

            background:${color};

            border:2px solid ${background};
          "
        ></span>

      </span>
    `,
  });
}


// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface OperationsMapProps {
  items: PollingUnitMapItem[];

  /**
   * Pending polling-unit proposals.
   */
  pendingItems?: PuRequestMapItem[];

  /**
   * Incident overlay feed (from /incidents/map/).
   */
  incidents?: IncidentMapItem[];

  /**
   * Which layers are visible. When absent, everything is shown.
   */
  layers?: Set<string>;

  /**
   * Polling unit ID to focus.
   */
  focusId?: string | null;

  onSelect?: (
    item: PollingUnitMapItem
  ) => void;

  onSelectPending?: (
    item: PuRequestMapItem
  ) => void;

  onSelectIncident?: (
    item: IncidentMapItem
  ) => void;

  className?: string;
}


// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function OperationsMap({
  items,

  pendingItems = [],

  incidents = [],

  layers,

  focusId,

  onSelect,

  onSelectPending,

  onSelectIncident,

  className = "",
}: OperationsMapProps) {

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );


  // ---------------------------------------------------------------------------
  // Leaflet instances
  // ---------------------------------------------------------------------------

  const mapRef =
    useRef<LeafletMap | null>(
      null
    );


  const clusterRef =
    useRef<MarkerClusterGroup | null>(
      null
    );


  const tileRef =
    useRef<TileLayer | null>(
      null
    );


  // ---------------------------------------------------------------------------
  // Markers
  // ---------------------------------------------------------------------------

  const markersRef =
    useRef<
      Map<string, Marker>
    >(new Map());


  const pendingMarkersRef =
    useRef<
      Map<string, CircleMarker>
    >(new Map());


  const incidentMarkersRef =
    useRef<
      Map<string, CircleMarker>
    >(new Map());


  // ---------------------------------------------------------------------------
  // Callbacks
  //
  // Using refs prevents rebuilding the entire map when callbacks change.
  // ---------------------------------------------------------------------------

  const onSelectRef =
    useRef(onSelect);

  const onSelectPendingRef =
    useRef(onSelectPending);

  const onSelectIncidentRef =
    useRef(onSelectIncident);


  onSelectRef.current =
    onSelect;

  onSelectPendingRef.current =
    onSelectPending;

  onSelectIncidentRef.current =
    onSelectIncident;


  // ---------------------------------------------------------------------------
  // Map initialization
  // ---------------------------------------------------------------------------

  const didFitRef =
    useRef(false);


  const { resolved } =
    useTheme();


  useEffect(() => {

    let disposed = false;

    let resizeHandler:
      | (() => void)
      | null = null;


    (
      async () => {

        const L =
          await getLeaflet();


        if (
          disposed ||
          !containerRef.current ||
          mapRef.current
        ) {
          return;
        }


        // ---------------------------------------------------------------------
        // Verify MarkerCluster
        // ---------------------------------------------------------------------

        if (
          typeof L.markerClusterGroup !==
          "function"
        ) {
          console.error(
            "Leaflet MarkerCluster failed to load."
          );

          return;
        }


        // ---------------------------------------------------------------------
        // Create map
        // ---------------------------------------------------------------------

        const map =
          L.map(
            containerRef.current,
            {
              center:
                YOBE_CENTER,

              zoom:
                YOBE_ZOOM,

              scrollWheelZoom:
                true,

              attributionControl:
                true,

              preferCanvas:
                true,
            }
          );


        mapRef.current =
          map;


        // ---------------------------------------------------------------------
        // Basemap
        // ---------------------------------------------------------------------

        const tileUrl =
          resolved === "dark"
            ? TILE_URLS.dark
            : TILE_URLS.light;


        tileRef.current =
          L.tileLayer(
            tileUrl,
            {
              attribution:
                TILE_ATTRIBUTION,

              subdomains:
                "abcd",

              maxZoom:
                19,
            }
          ).addTo(map);


        // ---------------------------------------------------------------------
        // Marker cluster
        // ---------------------------------------------------------------------

        const cluster =
          L.markerClusterGroup({

            showCoverageOnHover:
              false,

            maxClusterRadius:
              42,

            spiderfyOnMaxZoom:
              true,


            iconCreateFunction:
              (group) => {

                const children =
                  group.getAllChildMarkers();


                const counts =
                  new Map<
                    string,
                    number
                  >();


                children.forEach(
                  (marker) => {

                    const status =
                      (
                        marker.options as {
                          puStatus?:
                            OperationalStatus;
                        }
                      ).puStatus ||
                      "official_offline";


                    counts.set(
                      status,

                      (
                        counts.get(
                          status
                        ) || 0
                      ) + 1
                    );

                  }
                );


                let dominant =
                  "official_offline";


                let max =
                  0;


                counts.forEach(
                  (
                    count,
                    status
                  ) => {

                    if (
                      count > max
                    ) {

                      max =
                        count;

                      dominant =
                        status;

                    }

                  }
                );


                const color =
                  STATUS_COLORS[
                    dominant as OperationalStatus
                  ] ||
                  "#94a3b8";


                return L.divIcon({

                  html: `
                    <span
                      class="pu-cluster"

                      style="
                        background:${color};
                      "
                    >
                      <span>
                        ${children.length}
                      </span>
                    </span>
                  `,


                  className:
                    "pu-cluster-wrap",


                  iconSize:
                    L.point(
                      36,
                      36
                    ),

                });

              },

          });


        clusterRef.current =
          cluster;


        map.addLayer(
          cluster
        );


        // ---------------------------------------------------------------------
        // Resize
        // ---------------------------------------------------------------------

        resizeHandler =
          () => {

            map.invalidateSize();

          };


        window.addEventListener(
          "resize",

          resizeHandler
        );


        // Give Leaflet time to calculate its container.
        setTimeout(
          () => {

            if (
              !disposed
            ) {

              map.invalidateSize();

            }

          },

          100
        );

      }

    )();


    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------

    return () => {

      disposed = true;


      if (
        resizeHandler
      ) {

        window.removeEventListener(
          "resize",

          resizeHandler
        );

      }


      mapRef.current?.remove();


      mapRef.current =
        null;


      clusterRef.current =
        null;


      tileRef.current =
        null;


      markersRef.current.clear();


      pendingMarkersRef.current.clear();


      incidentMarkersRef.current.clear();

    };


  }, []);


  // ---------------------------------------------------------------------------
  // Theme basemap
  // ---------------------------------------------------------------------------

  useEffect(() => {

    const tile =
      tileRef.current;


    if (!tile) {
      return;
    }


    const url =
      resolved === "dark"
        ? TILE_URLS.dark
        : TILE_URLS.light;


    tile.setUrl(
      url
    );


  }, [resolved]);


  // ---------------------------------------------------------------------------
  // Render all markers
  //
  // This is intentionally ONE unified effect.
  //
  // This prevents:
  //
  // - Duplicate markers
  // - Theme race conditions
  // - Async marker creation conflicts
  // ---------------------------------------------------------------------------

  useEffect(() => {

    let cancelled =
      false;


    (
      async () => {

        const L =
          await getLeaflet();


        if (
          cancelled
        ) {
          return;
        }


        const cluster =
          clusterRef.current;


        const map =
          mapRef.current;


        if (
          !cluster ||
          !map
        ) {
          return;
        }


        // ---------------------------------------------------------------------
        // Clear existing layers
        // ---------------------------------------------------------------------

        cluster.clearLayers();


        markersRef.current.clear();


        pendingMarkersRef.current.clear();


        incidentMarkersRef.current.clear();


        // ---------------------------------------------------------------------
        // Polling units
        // ---------------------------------------------------------------------

        const showPollingUnits =
          !layers ||
          layers.has("pollingUnits");

        const showPendingUnits =
          !layers ||
          layers.has("pendingUnits");

        const showIncidents =
          !layers ||
          layers.has("incidents") ||
          layers.has("securityAlerts");

        const validItems = showPollingUnits
          ? items.filter(
              (item) => {

                return (
                  isValidLatitude(
                    item.latitude
                  ) &&
                  isValidLongitude(
                    item.longitude
                  )
                );

              }
            )
          : [];


        validItems.forEach(
          (item) => {

            const latitude =
              Number(
                item.latitude
              );


            const longitude =
              Number(
                item.longitude
              );


            const icon =
              makePuIcon(
                L,

                item.operational_status,

                resolved ===
                  "dark"
              );


            const marker =
              L.marker(
                [
                  latitude,
                  longitude,
                ],

                {
                  icon,
                }
              );


            // Store status for cluster icon calculation.

            (
              marker.options as {
                puStatus?:
                  OperationalStatus;
              }
            ).puStatus =
              item.operational_status;


            const statusColor =
              STATUS_COLORS[
                item.operational_status
              ] ||
              "#94a3b8";


            const statusLabel =
              getStatusLabel(
                item.operational_status
              );


            // -----------------------------------------------------------------
            // Popup
            // -----------------------------------------------------------------

            marker.bindPopup(

              `
                <div
                  style="
                    min-width:180px;
                    font-family:system-ui,sans-serif;
                  "
                >

                  <div
                    style="
                      font-size:13px;
                      font-weight:700;
                      color:#1e293b;
                      margin-bottom:2px;
                    "
                  >
                    #${item.official_code}
                  </div>


                  <div
                    style="
                      font-size:12px;
                      color:#334155;
                      margin-bottom:4px;
                    "
                  >
                    ${item.name}
                  </div>


                  <div
                    style="
                      display:flex;
                      align-items:center;
                      gap:6px;
                    "
                  >

                    <span
                      style="
                        display:inline-block;

                        width:8px;
                        height:8px;

                        border-radius:50%;

                        background:${statusColor};
                      "
                    ></span>


                    <span
                      style="
                        font-size:11px;

                        color:${statusColor};

                        font-weight:600;
                      "
                    >
                      ${statusLabel}
                    </span>

                  </div>


                  ${
                    item.ward_name
                      ? `
                        <div
                          style="
                            margin-top:4px;

                            font-size:10px;

                            color:#64748b;
                          "
                        >

                          ${item.ward_name}

                          ${
                            item.lga_name
                              ? " · " +
                                item.lga_name
                              : ""
                          }

                        </div>
                      `
                      : ""
                  }

                </div>
              `,

              {
                offset:
                  [0, -4],

                maxWidth:
                  260,
              }

            );


            // -----------------------------------------------------------------
            // Tooltip
            // -----------------------------------------------------------------

            marker.bindTooltip(

              `#${item.official_code} — ${item.name}`,

              {
                direction:
                  "top",

                offset:
                  [0, -16],
              }

            );


            // -----------------------------------------------------------------
            // Click
            // -----------------------------------------------------------------

            marker.on(
              "click",

              () => {

                onSelectRef.current?.(
                  item
                );

              }

            );


            // -----------------------------------------------------------------
            // Add to cluster
            // -----------------------------------------------------------------

            cluster.addLayer(
              marker
            );


            markersRef.current.set(
              item.id,

              marker
            );

          }
        );


        // ---------------------------------------------------------------------
        // Pending polling units
        // ---------------------------------------------------------------------

        if (!showPendingUnits) {
          // skip rendering — layer disabled
        } else pendingItems.forEach(
          (item) => {

            if (
              !isValidLatitude(
                item.latitude
              ) ||
              !isValidLongitude(
                item.longitude
              )
            ) {
              return;
            }


            const latitude =
              Number(
                item.latitude
              );


            const longitude =
              Number(
                item.longitude
              );


            const marker =
              L.circleMarker(

                [
                  latitude,
                  longitude,
                ],

                {
                  radius:
                    7,

                  weight:
                    2,

                  dashArray:
                    "4 3",

                  color:
                    resolved ===
                    "dark"
                      ? "#0b1020"
                      : "#ffffff",

                  fillColor:
                    "#f59e0b",

                  fillOpacity:
                    0.9,
                }

              );


            marker.bindTooltip(

              `Proposed: #${item.official_code} — ${item.name} (pending review)`,

              {
                direction:
                  "top",

                offset:
                  [0, -8],
              }

            );


            marker.on(
              "click",

              () => {

                onSelectPendingRef.current?.(
                  item
                );

              }

            );


            cluster.addLayer(
              marker
            );


            pendingMarkersRef.current.set(
              item.id,

              marker
            );

          }
        );


        // ---------------------------------------------------------------------
        // Incidents overlay
        // ---------------------------------------------------------------------

        if (
          showIncidents
        ) {

          const validIncidents =
            incidents.filter(
              (item) => {

                return (
                  isValidLatitude(
                    item.latitude
                  ) &&
                  isValidLongitude(
                    item.longitude
                  )
                );

              }
            );


          validIncidents.forEach(
            (item) => {

              const latitude =
                Number(
                  item.latitude
                );


              const longitude =
                Number(
                  item.longitude
                );


              const color =
                SEVERITY_COLORS[
                  item.severity
                ] ||
                "#dc2626";


              const marker =
                L.circleMarker(
                  [
                    latitude,
                    longitude,
                  ],

                  {
                    radius:
                      9,

                    weight:
                      2,

                    color:
                      resolved ===
                      "dark"
                        ? "#0b1020"
                        : "#ffffff",

                    fillColor:
                      color,

                    fillOpacity:
                      0.85,
                  }

                );


              marker.bindTooltip(
                `Incident: ${item.polling_unit_code} — ${item.category_name || item.severity} (${item.severity})`,

                {
                  direction:
                    "top",

                  offset:
                    [0, -6],
                }

              );


              marker.on(
                "click",

                () => {

                  onSelectIncidentRef.current?.(
                    item
                  );

                }

              );

               // @ts-expect-error setZIndexOffset exists on CircleMarker at runtime
               marker.setZIndexOffset(800);

              cluster.addLayer(
                marker
              );


              incidentMarkersRef.current.set(
                item.id,

                marker
              );

            }
          );

        }


        // ---------------------------------------------------------------------
        // Fit map once
        // ---------------------------------------------------------------------

        if (
          !didFitRef.current &&
          validItems.length > 0
        ) {

          didFitRef.current =
            true;

          const fitPoints = [
            ...(showPollingUnits
              ? validItems.map(
                  (item) => [
                    Number(item.latitude),
                    Number(item.longitude),
                  ] as [number, number]
                )
              : []),
            ...(showPendingUnits
              ? pendingItems
                  .filter(
                    (item) =>
                      isValidLatitude(item.latitude) &&
                      isValidLongitude(item.longitude)
                  )
                  .map(
                    (item) => [
                      Number(item.latitude),
                      Number(item.longitude),
                    ] as [number, number]
                  )
              : []),
            ...(showIncidents
              ? incidents
                  .filter(
                    (item) =>
                      isValidLatitude(item.latitude) &&
                      isValidLongitude(item.longitude)
                  )
                  .map(
                    (item) => [
                      Number(item.latitude),
                      Number(item.longitude),
                    ] as [number, number]
                  )
              : []),
          ];


          const bounds =
            L.latLngBounds(
              fitPoints
            );


          map.fitBounds(
            bounds.pad(
              0.12
            ),

            {
              animate:
                false,
            }
          );

        }


      }

    )();


    return () => {

      cancelled =
        true;

    };


  }, [

    items,

    pendingItems,

    incidents,

    layers,

    resolved,

  ]);


  // ---------------------------------------------------------------------------
  // Focus polling unit
  // ---------------------------------------------------------------------------

  useEffect(() => {

    if (
      !focusId
    ) {
      return;
    }


    const marker =
      markersRef.current.get(
        focusId
      );


    const map =
      mapRef.current;


    if (
      !marker ||
      !map
    ) {
      return;
    }


    map.flyTo(

      marker.getLatLng(),

      Math.max(
        map.getZoom(),

        12
      ),

      {
        duration:
          0.6,
      }

    );


    marker.openTooltip();


  }, [

    focusId,

    items,

  ]);


  // ---------------------------------------------------------------------------
  // Determine whether map has geographic data
  // ---------------------------------------------------------------------------

  const hasGeo =

    items.some(
      (item) =>

        isValidLatitude(
          item.latitude
        ) &&

        isValidLongitude(
          item.longitude
        )
    )

    ||

    pendingItems.some(
      (item) =>

        isValidLatitude(
          item.latitude
        ) &&

        isValidLongitude(
          item.longitude
        )
    );


  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (

    <div
      className={
        `relative z-0 isolate overflow-hidden contain-layout ${className}`
      }

      data-has-geo={
        hasGeo
          ? "true"
          : "false"
      }
    >

      {/* Map container */}

      <div

        ref={
          containerRef
        }

        className="
          h-full
          w-full
          rounded-xl
          overflow-hidden
        "

        role="
          application
        "

        aria-label="
          Operations map of polling units
          in Yobe State
        "

      />


      {/* Empty state */}

      {
        !hasGeo && (

          <div
            className="
              pointer-events-none

              absolute

              inset-0

              flex

              items-center

              justify-center
            "
          >

            <p
              className="
                rounded-lg

                bg-surface-panel/90

                px-4

                py-3

                text-sm

                text-slate-500

                shadow-card
              "
            >

              No geo-located polling units
              match the current filters.

            </p>

          </div>

        )
      }


    </div>

  );

}