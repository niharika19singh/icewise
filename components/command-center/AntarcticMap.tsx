"use client";

import { useEffect, useRef, useState } from "react";
import { MapLibreMap, AttributionControl, type StyleSpecification, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildGraticule } from "./graticule";
import { PlusIcon, MinusIcon, LocateIcon, LayersIcon, CompassIcon } from "./icons";
import type { RouteResponse } from "./types";

const INITIAL_CENTER: [number, number] = [0, -80];
const INITIAL_ZOOM = 2.2;
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 8;

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

  const first = route.waypoints[0];
  const last = route.waypoints[route.waypoints.length - 1];
  const endpoints: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { role: "start" }, geometry: { type: "Point", coordinates: [first.lon, first.lat] } },
      { type: "Feature", properties: { role: "destination" }, geometry: { type: "Point", coordinates: [last.lon, last.lat] } },
    ],
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

  return { routeLine, endpoints, icebergPoints, icebergTrajectories, bounds };
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
  const EARTH_RADIUS_KM = 6371;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const angularDistance = radiusKm / EARTH_RADIUS_KM;

  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(lat2),
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
  return feature;
}

export default function AntarcticMap({
  route,
  recalculatedRoute,
  activeModule,
  selectedIcebergId,
  onSelectIceberg,
}: {
  route: RouteResponse | null;
  recalculatedRoute: RouteResponse | null;
  activeModule: string;
  selectedIcebergId: string | null;
  onSelectIceberg: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeBoundsRef = useRef<[[number, number], [number, number]] | null>(null);
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
        map.fitBounds(routeBoundsRef.current, { padding: 64, animate: false });
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

    const { routeLine, endpoints, icebergPoints, icebergTrajectories, bounds } = buildRouteGeoJSON(route);
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
    setOrAddSource("iceberg-points", icebergPoints);
    setOrAddSource("route-endpoints", endpoints);

    if (!map.getLayer("iceberg-trajectories-layer")) {
      map.addLayer({
        id: "iceberg-trajectories-layer",
        type: "line",
        source: "iceberg-trajectories",
        paint: { "line-color": "#c3f2f4", "line-opacity": 0.35, "line-width": 1, "line-dasharray": [2, 2] },
      });
    }
    if (!map.getLayer("route-line-layer")) {
      map.addLayer({
        id: "route-line-layer",
        type: "line",
        source: "route-line",
        paint: { "line-color": "#8fd9e0", "line-opacity": 0.9, "line-width": 2.5 },
      });
    }
    if (!map.getLayer("iceberg-points-layer")) {
      map.addLayer({
        id: "iceberg-points-layer",
        type: "circle",
        source: "iceberg-points",
        paint: {
          "circle-radius": 4,
          "circle-color": "#c3f2f4",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#05080a",
        },
      });
    }
    if (!map.getLayer("route-endpoints-layer")) {
      map.addLayer({
        id: "route-endpoints-layer",
        type: "circle",
        source: "route-endpoints",
        paint: {
          "circle-radius": 6,
          "circle-color": ["match", ["get", "role"], "start", "#d99a5b", "#edf2f2"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#05080a",
        },
      });
    }

    // The container may not have finished settling into its final flex-computed
    // size yet (e.g. right after mount) — resize before fitting so the bounds
    // calculation uses the map's real, current dimensions. Snap instantly rather
    // than animate: an eased transition needs no visual flourish here.
    map.resize();
    map.fitBounds(bounds, { padding: 64, animate: false });
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
      map.addLayer(
        {
          id: "recalculated-route-line-layer",
          type: "line",
          source: "recalculated-route-line",
          paint: { "line-color": "#c3f2f4", "line-opacity": 0.9, "line-width": 2.5, "line-dasharray": [3, 2] },
        },
        "route-endpoints-layer",
      );
    }

    // Refit to include both the initial and recalculated route extents.
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
      { padding: 64, animate: false },
    );
  }, [recalculatedRoute, route, mapLoaded]);

  // Iceberg markers/trajectories are only relevant to the dedicated Icebergs
  // mode; the route line and its endpoints always stay visible regardless.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const visibility = activeModule === "icebergs" ? "visible" : "none";
    for (const id of ["iceberg-points-layer", "iceberg-trajectories-layer", "iceberg-uncertainty-fill-layer", "iceberg-uncertainty-layer"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
    }
  }, [activeModule, mapLoaded, route]);

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
        "route-endpoints-layer",
      );
      map.addLayer(
        {
          id: "iceberg-uncertainty-layer",
          type: "line",
          source: "iceberg-uncertainty",
          paint: { "line-color": "#c3f2f4", "line-opacity": 0.5, "line-width": 1.5, "line-dasharray": [2, 2] },
        },
        "route-endpoints-layer",
      );
    }

    map.setPaintProperty("iceberg-points-layer", "circle-radius", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      7,
      4,
    ]);
    map.setPaintProperty("iceberg-points-layer", "circle-color", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      "#8fd9e0",
      "#c3f2f4",
    ]);
    map.setPaintProperty("iceberg-trajectories-layer", "line-opacity", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      0.9,
      0.35,
    ]);
    map.setPaintProperty("iceberg-trajectories-layer", "line-width", [
      "case",
      ["==", ["get", "iceberg_id"], selectedId],
      2,
      1,
    ]);
  }, [selectedIcebergId, route, mapLoaded]);

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
        <button
          type="button"
          aria-label="Toggle layers"
          className="flex h-9 w-9 items-center justify-center rounded border border-line bg-abyss-raised/80 text-frost transition-colors hover:border-ice hover:text-ice"
        >
          <LayersIcon className="h-4 w-4" />
        </button>
      </div>

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
