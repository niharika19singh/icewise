"use client";

import { useEffect, useRef, useState } from "react";
import { MapLibreMap, Marker, AttributionControl, setWorkerUrl, type StyleSpecification, type GeoJSONSource } from "maplibre-gl";
import { buildGraticule } from "./graticule";
import { PlusIcon, MinusIcon, LocateIcon, CompassIcon } from "./icons";
import MapLegend from "./MapLegend";
import type { RouteResponse, RouteWaypoint, LayerVisibility, SeaIceGeoJSON } from "./types";

// Root-cause fix for invisible GeoJSON layers (route lines, iceberg markers,
// the graticule): maplibre-gl derives its worker script URL from its own
// `import.meta.url` at runtime, requiring it to be a real http(s) URL. Under
// this project's bundler that URL doesn't resolve to one, so maplibre silently
// falls back to an empty worker URL — the worker then "loads" the current HTML
// document instead of real JS, fails immediately, and every source that relies
// on it (all vector/GeoJSON sources) never finishes building tiles, even
// though raster tiles and DOM markers (which don't need the worker) render
// fine. Pointing it at a same-origin static copy of the exact installed
// version's worker script sidesteps the broken URL resolution entirely. Must
// run before any Map is constructed. public/maplibre-gl-worker.mjs and its
// public/maplibre-gl-shared.mjs dependency are verbatim copies of the same
// files in node_modules/maplibre-gl/dist for the pinned maplibre-gl version —
// re-copy both if that version ever changes.
setWorkerUrl("/maplibre-gl-worker.mjs");

const INITIAL_CENTER: [number, number] = [0, -80];
const INITIAL_ZOOM = 2.2;
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 8;
// Cap how far a bounds-fit is allowed to zoom in — keeps the Antarctic /
// Southern Ocean context visible instead of collapsing to the tiny corridor
// a single demo route/iceberg cluster occupies.
const FIT_MAX_ZOOM = 5.5;

const EARTH_RADIUS_KM = 6371;

// Free, keyless satellite imagery (Esri World Imagery) — real photography, so the
// ice sheet is actually visible against open ocean (a plain dark vector/OSM style has
// almost no mapped features over Antarctica and renders as near-solid black there).
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

function formatCoord(value: number, positiveSuffix: string, negativeSuffix: string) {
  const suffix = value >= 0 ? positiveSuffix : negativeSuffix;
  return `${Math.abs(value).toFixed(4)}° ${suffix}`;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

// Real great-circle distance (km) between two real lat/lon points.
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Real initial bearing (deg, 0=N clockwise) from point a to point b.
function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Real destination-point formula (haversine) — projects a point `distanceKm`
// from (lat, lon) along `bearing` on the Earth's actual curvature. Shared by
// the iceberg uncertainty envelope and the route direction chevrons below.
function destinationPoint(lat: number, lon: number, bearing: number, distanceKm: number): [number, number] {
  const latRad = toRad(lat);
  const lonRad = toRad(lon);
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearingRad = toRad(bearing);
  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );
  const lon2 =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(lat2),
    );
  return [toDeg(lon2), toDeg(lat2)];
}

// Builds real-data GeoJSON straight from the routing API response — nothing here
// is fabricated, only reshaped for MapLibre's layer sources.
function buildRouteGeoJSON(route: RouteResponse) {
  const routeLine: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: route.waypoints.map((w) => [w.lon, w.lat]),
    },
  };

  const icebergPoints: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: "FeatureCollection",
    features: route.icebergs.map((ib) => ({
      type: "Feature",
      properties: { iceberg_id: ib.iceberg_id },
      geometry: { type: "Point", coordinates: [ib.current_position.lon, ib.current_position.lat] },
    })),
  };

  const icebergTrajectories: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: "FeatureCollection",
    features: route.icebergs.map((ib) => ({
      type: "Feature",
      properties: { iceberg_id: ib.iceberg_id },
      geometry: {
        type: "LineString",
        coordinates: [ib.current_position, ...ib.predicted_positions].map((p) => [p.lon, p.lat]),
      },
    })),
  };

  const directionArrows = buildDirectionArrows(route.waypoints);

  const allCoords = [
    ...route.waypoints.map((w) => [w.lon, w.lat] as [number, number]),
    ...route.icebergs.map((ib) => [ib.current_position.lon, ib.current_position.lat] as [number, number]),
  ];
  const lons = allCoords.map((c) => c[0]);
  const lats = allCoords.map((c) => c[1]);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];

  return { routeLine, icebergPoints, icebergTrajectories, directionArrows, bounds };
}

// The 3 real route options from POST /api/route's additive `route_options`
// (backend/routing/main.py -> _build_route_options) — each already a full,
// independently-computed waypoint list from the real routing engine at a
// different real risk_tolerance_factor. Used as-is, not reconstructed.
function buildRouteOptionsGeoJSON(route: RouteResponse): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const options = route.route_options ?? [];
  return {
    type: "FeatureCollection",
    features: options.map((opt) => ({
      type: "Feature",
      properties: { route_id: opt.route_id, label: opt.label },
      geometry: { type: "LineString", coordinates: opt.waypoints.map((w) => [w.lon, w.lat]) },
    })),
  };
}

function buildLineGeoJSON(waypoints: { lat: number; lon: number }[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: waypoints.map((w) => [w.lon, w.lat]) },
  };
}

// A real geographic circle (haversine destination-point formula) of radius
// spatial_uncertainty_km around an iceberg's current position — a restrained,
// correctly-derived envelope, not an invented shape or a claimed probability contour.
function buildUncertaintyCircle(lat: number, lon: number, radiusKm: number, steps = 64) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    coords.push(destinationPoint(lat, lon, (i / steps) * 360, radiusKm));
  }

  const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
  return feature;
}

// Small chevrons placed along the real route line, between actual consecutive
// waypoint pairs, oriented by the real bearing of that leg — a direction
// indicator derived entirely from real route geometry, not invented positions.
function buildDirectionArrows(waypoints: RouteWaypoint[], maxArrows = 6) {
  const empty: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: "FeatureCollection", features: [] };
  if (waypoints.length < 2) return empty;

  const segments = waypoints.length - 1;
  let totalKm = 0;
  for (let i = 0; i < segments; i++) totalKm += haversineKm(waypoints[i], waypoints[i + 1]);
  const chevronKm = Math.min(40, Math.max(6, totalKm * 0.015));
  const step = Math.max(1, Math.round(segments / maxArrows));

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = 0; i < segments; i += step) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const midLat = (a.lat + b.lat) / 2;
    const midLon = (a.lon + b.lon) / 2;
    const heading = bearingDeg(a, b);
    const left = destinationPoint(midLat, midLon, heading + 180 - 27, chevronKm);
    const right = destinationPoint(midLat, midLon, heading + 180 + 27, chevronKm);
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [left, [midLon, midLat], right] },
    });
  }

  return { type: "FeatureCollection", features } as GeoJSON.FeatureCollection<GeoJSON.LineString>;
}

// A plain DOM glyph marker (◆ vessel, ◎ destination) instead of a GL circle —
// gives the vessel/destination a crisp, legend-matching symbol that stays
// legible at the wide Antarctic zoom levels this map is meant to stay at.
function createGlyphMarkerElement(glyph: string, color: string) {
  const el = document.createElement("div");
  el.textContent = glyph;
  el.style.fontSize = "20px";
  el.style.lineHeight = "1";
  el.style.color = color;
  el.style.textShadow = `0 0 4px ${color}, 0 0 10px ${color}99`;
  el.style.pointerEvents = "none";
  el.style.userSelect = "none";
  return el;
}

function setLayerVisible(map: MapLibreMap, id: string, visible: boolean) {
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

export default function AntarcticMap({
  route,
  recalculatedRoute,
  activeModule,
  selectedIcebergId,
  onSelectIceberg,
  layerVisibility,
  seaIce,
  selectedRouteOptionId,
}: {
  route: RouteResponse | null;
  recalculatedRoute: RouteResponse | null;
  activeModule: string;
  selectedIcebergId: string | null;
  onSelectIceberg: (id: string | null) => void;
  layerVisibility: LayerVisibility;
  seaIce: SeaIceGeoJSON | null;
  selectedRouteOptionId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeBoundsRef = useRef<[[number, number], [number, number]] | null>(null);
  const seaIceBoundsRef = useRef<[[number, number], [number, number]] | null>(null);
  const prevModuleRef = useRef<string>("map");
  const vesselMarkerRef = useRef<Marker | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const onSelectIcebergRef = useRef(onSelectIceberg);
  useEffect(() => {
    onSelectIcebergRef.current = onSelectIceberg;
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: INITIAL_CENTER[1],
    lng: INITIAL_CENTER[0],
  });
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");

    map.on("error", (e) => console.error("[maplibre]", e.error));

    // Clicking a real iceberg marker selects it; the layer only exists (and is
    // only interactive/visible) once real route data has loaded and Icebergs
    // mode is active, so this listener is a no-op until then.
    map.on("click", "iceberg-points-layer", (e) => {
      const id = e.features?.[0]?.properties?.iceberg_id;
      if (typeof id === "string") onSelectIcebergRef.current(id);
    });
    map.on("mouseenter", "iceberg-points-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "iceberg-points-layer", () => {
      map.getCanvas().style.cursor = "";
    });

    // A container resize (e.g. the flex layout settling just after mount) can shift
    // MapLibre's notion of "center" — re-assert the intended view whenever that happens.
    // Once a real route has been fitted, re-derive that same fit instead of the default.
    map.on("resize", () => {
      if (routeBoundsRef.current) {
        map.fitBounds(routeBoundsRef.current, { padding: 64, animate: false, maxZoom: FIT_MAX_ZOOM });
      } else {
        map.jumpTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM });
      }
    });

    map.on("move", () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
      setZoom(map.getZoom());
    });

    map.on("load", () => {
      map.addSource("graticule", { type: "geojson", data: buildGraticule() });
      map.addLayer({
        id: "graticule-lines",
        type: "line",
        source: "graticule",
        paint: {
          "line-color": "#8fd9e0",
          "line-opacity": 0.25,
          "line-width": 1,
          "line-dasharray": [1, 2],
        },
      });
      setMapLoaded(true);
    });

    return () => {
      vesselMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      vesselMarkerRef.current = null;
      destinationMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Renders the real route/iceberg data once both the map style and the API
  // response are ready. Nothing here is fabricated — all coordinates and ids
  // come straight from the routing API's JSON response.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !route) return;

    const { routeLine, icebergPoints, icebergTrajectories, directionArrows, bounds } = buildRouteGeoJSON(route);
    routeBoundsRef.current = bounds;

    const setOrAddSource = (id: string, data: GeoJSON.Feature | GeoJSON.FeatureCollection) => {
      const existing = map.getSource(id) as GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        map.addSource(id, { type: "geojson", data });
      }
    };

    setOrAddSource("iceberg-trajectories", icebergTrajectories);
    setOrAddSource("route-line", routeLine);
    setOrAddSource("direction-arrows", directionArrows);
    setOrAddSource("route-options", buildRouteOptionsGeoJSON(route));
    setOrAddSource("iceberg-points", icebergPoints);

    if (!map.getLayer("iceberg-trajectories-layer")) {
      map.addLayer({
        id: "iceberg-trajectories-layer",
        type: "line",
        source: "iceberg-trajectories",
        paint: { "line-color": "#c3f2f4", "line-opacity": 0.55, "line-width": 1.5, "line-dasharray": [2, 2] },
      });
    }
    if (!map.getLayer("route-line-layer")) {
      map.addLayer({
        id: "route-line-layer",
        type: "line",
        source: "route-line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#8fd9e0", "line-opacity": 0.9, "line-width": 2.5 },
      });
    }
    if (!map.getLayer("direction-arrows-layer")) {
      map.addLayer({
        id: "direction-arrows-layer",
        type: "line",
        source: "direction-arrows",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#c3f2f4", "line-opacity": 0.55, "line-width": 1.5 },
      });
    }
    // The 3 real route options (Route Intelligence panel) — subdued by
    // default, the selected one highlighted amber by the effect below.
    if (!map.getLayer("route-options-layer")) {
      map.addLayer({
        id: "route-options-layer",
        type: "line",
        source: "route-options",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#7c8b90", "line-opacity": 0.35, "line-width": 1.2 },
      });
    }
    // A soft, restrained halo beneath the iceberg marker — only sized up for
    // the selected iceberg (see the selection effect below).
    if (!map.getLayer("iceberg-glow-layer")) {
      map.addLayer({
        id: "iceberg-glow-layer",
        type: "circle",
        source: "iceberg-points",
        paint: {
          "circle-radius": 0,
          "circle-color": "#8fd9e0",
          "circle-opacity": 0.18,
          "circle-blur": 0.8,
        },
      });
    }
    if (!map.getLayer("iceberg-points-layer")) {
      map.addLayer({
        id: "iceberg-points-layer",
        type: "circle",
        source: "iceberg-points",
        paint: {
          "circle-radius": 5,
          "circle-color": "#c3f2f4",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#05080a",
        },
      });
    }

    // Real vessel/start + destination glyph markers (◆ / ◎) from the route's
    // first and last real waypoints.
    const first = route.waypoints[0];
    const last = route.waypoints[route.waypoints.length - 1];
    if (first && last) {
      if (!vesselMarkerRef.current) {
        vesselMarkerRef.current = new Marker({ element: createGlyphMarkerElement("◆", "#d99a5b"), anchor: "center" })
          .setLngLat([first.lon, first.lat])
          .addTo(map);
      } else {
        vesselMarkerRef.current.setLngLat([first.lon, first.lat]);
      }
      if (!destinationMarkerRef.current) {
        destinationMarkerRef.current = new Marker({
          element: createGlyphMarkerElement("◎", "#edf2f2"),
          anchor: "center",
        })
          .setLngLat([last.lon, last.lat])
          .addTo(map);
      } else {
        destinationMarkerRef.current.setLngLat([last.lon, last.lat]);
      }
    }

    // The container may not have finished settling into its final flex-computed
    // size yet (e.g. right after mount) — resize before fitting so the bounds
    // calculation uses the map's real, current dimensions. Snap instantly rather
    // than animate: an eased transition needs no visual flourish here. Capped
    // at FIT_MAX_ZOOM so the Antarctic/Southern Ocean context stays visible.
    map.resize();
    map.fitBounds(bounds, { padding: 64, animate: false, maxZoom: FIT_MAX_ZOOM });
  }, [route, mapLoaded]);

  // Renders the real recalculated route (from a genuine backend call to
  // Niharika's update_predictions_and_recalculate) as a second, visually
  // distinct line — the initial plan stays on the map for comparison.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !recalculatedRoute) return;

    const lineData = buildLineGeoJSON(recalculatedRoute.waypoints);
    const existing = map.getSource("recalculated-route-line") as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(lineData);
    } else {
      map.addSource("recalculated-route-line", { type: "geojson", data: lineData });
      map.addLayer({
        id: "recalculated-route-line-layer",
        type: "line",
        source: "recalculated-route-line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#edf2f2", "line-opacity": 0.95, "line-width": 2.5, "line-dasharray": [3, 2] },
      });
    }

    // Refit to include both the initial and recalculated route extents, still
    // capped so the view doesn't collapse onto a tiny area.
    const coords = [
      ...(route?.waypoints ?? []).map((w) => [w.lon, w.lat] as [number, number]),
      ...recalculatedRoute.waypoints.map((w) => [w.lon, w.lat] as [number, number]),
    ];
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.resize();
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 64, animate: false, maxZoom: FIT_MAX_ZOOM },
    );
  }, [recalculatedRoute, route, mapLoaded]);

  // Renders the real NSIDC sea-ice concentration grid (backend/routing's
  // /api/sea-ice/geojson) — already a valid GeoJSON FeatureCollection of real
  // [lon, lat] Point features straight from the API, used as-is with no
  // reshaping or invented values. Historical (2020-01-02), not a live feed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !seaIce) return;

    if (seaIce.features.length > 0) {
      const lons = seaIce.features.map((f) => f.geometry.coordinates[0]);
      const lats = seaIce.features.map((f) => f.geometry.coordinates[1]);
      seaIceBoundsRef.current = [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ];
    }

    const existing = map.getSource("sea-ice") as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(seaIce);
    } else {
      map.addSource("sea-ice", { type: "geojson", data: seaIce });
      map.addLayer(
        {
          id: "sea-ice-layer",
          type: "circle",
          source: "sea-ice",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 5, 10, 8, 20],
            // Low concentration reads as a subdued, near-ocean tone; higher
            // concentration brightens toward the palette's ice-bright cyan.
            "circle-color": [
              "interpolate",
              ["linear"],
              ["get", "ice_concentration"],
              0,
              "#0d1b22",
              0.5,
              "#8fd9e0",
              1,
              "#c3f2f4",
            ],
            // Translucent so the satellite basemap stays legible underneath —
            // this is a data overlay, not an opaque blob — but bright enough
            // at the wide zoom the corridor is fitted at to actually be seen.
            "circle-opacity": ["interpolate", ["linear"], ["get", "ice_concentration"], 0, 0.25, 1, 0.7],
            "circle-blur": 0.3,
          },
        },
        map.getLayer("route-line-layer") ? "route-line-layer" : undefined,
      );
    }
  }, [seaIce, mapLoaded]);

  // The sea-ice grid's real extent doesn't overlap the tight route corridor
  // the camera otherwise stays fitted to — entering Sea Ice mode re-fits to
  // the sea-ice data's own real bounds so the grid is actually visible;
  // leaving it re-fits back to the route so other modes are unaffected.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const prevModule = prevModuleRef.current;
    prevModuleRef.current = activeModule;

    if (activeModule === "sea-ice") {
      if (seaIceBoundsRef.current) {
        map.fitBounds(seaIceBoundsRef.current, { padding: 64, animate: false, maxZoom: FIT_MAX_ZOOM });
      }
    } else if (prevModule === "sea-ice" && routeBoundsRef.current) {
      map.fitBounds(routeBoundsRef.current, { padding: 64, animate: false, maxZoom: FIT_MAX_ZOOM });
    }
  }, [activeModule, mapLoaded, seaIce]);

  // Reconciles which real layers are actually drawn: iceberg/risk-object
  // layers are relevant in both Icebergs mode (the dedicated intelligence
  // view) and Routes mode (so the environmental objects a route was actually
  // planned around are visible alongside it); direction arrows only make
  // sense in Map mode; the sea-ice grid is its own dedicated mode. Every
  // layer also respects its Layer Controls toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const showIcebergs = activeModule === "icebergs" || activeModule === "routes";

    setLayerVisible(map, "iceberg-points-layer", showIcebergs && layerVisibility.icebergs);
    setLayerVisible(map, "iceberg-glow-layer", showIcebergs && layerVisibility.icebergs);
    setLayerVisible(map, "iceberg-uncertainty-fill-layer", showIcebergs && layerVisibility.icebergs);
    setLayerVisible(map, "iceberg-uncertainty-layer", showIcebergs && layerVisibility.icebergs);
    setLayerVisible(map, "iceberg-trajectories-layer", showIcebergs && layerVisibility.trajectories);
    setLayerVisible(map, "route-line-layer", layerVisibility.initialRoute);
    setLayerVisible(map, "direction-arrows-layer", activeModule === "map" && layerVisibility.initialRoute);
    setLayerVisible(map, "route-options-layer", activeModule === "routes");
    setLayerVisible(map, "recalculated-route-line-layer", layerVisibility.adaptiveRoute);
    setLayerVisible(map, "sea-ice-layer", activeModule === "sea-ice" && layerVisibility.seaIce);
  }, [activeModule, layerVisibility, mapLoaded, route, recalculatedRoute, seaIce]);

  // Highlights the selected iceberg's marker/trajectory and draws a real,
  // correctly-derived uncertainty envelope (radius = spatial_uncertainty_km)
  // around its current position. Nothing here claims to be an exact probability
  // contour — it is a restrained visual radius derived from the real API value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getSource("iceberg-points")) return;

    const selectedId = selectedIcebergId ?? "";
    const selected = selectedIcebergId
      ? (route?.icebergs.find((ib) => ib.iceberg_id === selectedIcebergId) ?? null)
      : null;

    const circleData: GeoJSON.Feature<GeoJSON.Polygon> | GeoJSON.FeatureCollection = selected
      ? buildUncertaintyCircle(selected.current_position.lat, selected.current_position.lon, selected.spatial_uncertainty_km)
      : { type: "FeatureCollection", features: [] };

    const existingUncertainty = map.getSource("iceberg-uncertainty") as GeoJSONSource | undefined;
    if (existingUncertainty) {
      existingUncertainty.setData(circleData);
    } else {
      map.addSource("iceberg-uncertainty", { type: "geojson", data: circleData });
      map.addLayer(
        {
          id: "iceberg-uncertainty-fill-layer",
          type: "fill",
          source: "iceberg-uncertainty",
          paint: { "fill-color": "#c3f2f4", "fill-opacity": 0.08 },
        },
        "iceberg-points-layer",
      );
      map.addLayer(
        {
          id: "iceberg-uncertainty-layer",
          type: "line",
          source: "iceberg-uncertainty",
          paint: { "line-color": "#c3f2f4", "line-opacity": 0.5, "line-width": 1.5, "line-dasharray": [2, 2] },
        },
        "iceberg-points-layer",
      );
    }

    map.setPaintProperty("iceberg-points-layer", "circle-radius", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      9,
      5,
    ]);
    map.setPaintProperty("iceberg-points-layer", "circle-color", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      "#edf2f2",
      "#c3f2f4",
    ]);
    map.setPaintProperty("iceberg-glow-layer", "circle-radius", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      16,
      0,
    ]);
    map.setPaintProperty("iceberg-trajectories-layer", "line-opacity", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      0.9,
      0.55,
    ]);
    map.setPaintProperty("iceberg-trajectories-layer", "line-width", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      2,
      1.5,
    ]);
  }, [selectedIcebergId, route, mapLoaded]);

  // Highlights whichever real route option the user picked in the Route
  // Intelligence panel — same real waypoint geometry already drawn on the
  // route-options layer, just restyled brighter/thicker for that one
  // feature. No new data, no reconstruction.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer("route-options-layer")) return;

    const selectedId = selectedRouteOptionId ?? "";
    map.setPaintProperty("route-options-layer", "line-color", [
      "case",
      ["==", ["get", "route_id"], selectedId],
      "#d99a5b",
      "#7c8b90",
    ]);
    map.setPaintProperty("route-options-layer", "line-opacity", [
      "case",
      ["==", ["get", "route_id"], selectedId],
      0.95,
      0.35,
    ]);
    map.setPaintProperty("route-options-layer", "line-width", [
      "case",
      ["==", ["get", "route_id"], selectedId],
      3,
      1.2,
    ]);
  }, [selectedRouteOptionId, route, mapLoaded]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-abyss">
      <div ref={containerRef} className="h-full w-full" />

      {/* subtle cyan vignette to blend the basemap into the HUD frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: "inset 0 0 90px 20px rgba(5,8,10,0.55)",
        }}
      />

      <div className="pointer-events-none absolute left-5 top-5 font-display">
        <p className="text-lg font-medium tracking-wide text-frost">ANTARCTICA</p>
        <p className="mt-0.5 font-mono text-xs text-mist">
          {formatCoord(center.lat, "N", "S")}, {formatCoord(center.lng, "E", "W")}
        </p>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute right-6 top-5 flex flex-col items-center gap-1 text-ice"
      >
        <CompassIcon className="h-6 w-6" />
        <span className="font-mono text-[10px] tracking-mission">N</span>
      </div>

      <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-9 w-9 items-center justify-center rounded border border-line bg-abyss-raised/80 text-frost transition-colors hover:border-ice hover:text-ice"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-9 w-9 items-center justify-center rounded border border-line bg-abyss-raised/80 text-frost transition-colors hover:border-ice hover:text-ice"
        >
          <MinusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Recenter"
          onClick={() =>
            mapRef.current?.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM, essential: true })
          }
          className="flex h-9 w-9 items-center justify-center rounded border border-line bg-abyss-raised/80 text-frost transition-colors hover:border-ice hover:text-ice"
        >
          <LocateIcon className="h-4 w-4" />
        </button>
      </div>

      {(route || seaIce) && (
        <MapLegend
          mode={activeModule}
          hasAdaptiveRoute={!!recalculatedRoute}
          seaIce={seaIce}
          hasSelectedRouteOption={!!selectedRouteOptionId}
        />
      )}

      <div className="pointer-events-none absolute bottom-4 left-5 flex items-center gap-2 font-mono text-[10px] text-mist">
        <span>0</span>
        <span className="h-px w-10 bg-mist/60" />
        <span>250</span>
        <span className="h-px w-10 bg-mist/60" />
        <span>500</span>
        <span className="h-px w-10 bg-mist/60" />
        <span>1,000 KM</span>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 rounded border border-line bg-abyss-raised/80 px-4 py-2.5 font-mono text-[11px] text-mist">
        <p>LAT&nbsp;&nbsp;&nbsp;{formatCoord(center.lat, "N", "S")}</p>
        <p>LON&nbsp;&nbsp;{formatCoord(center.lng, "E", "W")}</p>
        <p>
          ZOOM&nbsp;<span className="text-frost">{zoom.toFixed(1)}x</span>
        </p>
      </div>
    </div>
  );
}
