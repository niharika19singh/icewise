"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapLibreMap,
  Marker,
  AttributionControl,
  setWorkerUrl,
  type StyleSpecification,
  type GeoJSONSource,
  type ExpressionSpecification,
} from "maplibre-gl";
import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import { buildGraticule } from "@/components/command-center/graticule";
import { PIN_COLORS } from "@/components/command-center/routeStyle";
import type { MissionPoint } from "@/components/command-center/MissionPlanner";
import type { SeaIceGeoJSON } from "@/components/command-center/types";
import { ICE_BANDS, greatCircle, circlePolygon, type ForecastIceberg } from "./environment";

// Same same-origin worker fix and satellite basemap as AntarcticMap.tsx (see
// the comments there). This preview is non-interactive: it shows where the
// configured mission sits among real environment data, not a computed route.
setWorkerUrl("/maplibre-gl-worker.mjs");

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

// Weddell Sea overview used until both mission points are valid.
const WEDDELL_CENTER: [number, number] = [-42, -73.5];
const WEDDELL_ZOOM = 3.6;
// Tilted "looking out over the sea" camera, as in the design reference.
const PITCH = 52;

export type PreviewLayers = { seaIce: boolean; icebergs: boolean; forecast: boolean; directLine: boolean };
type Bounds = [[number, number], [number, number]];
type Insets = { top: number; bottom: number; left: number; right: number };

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

// Ice-condition band colors (same bands as the legend), stepped on the real
// NSIDC concentration value (0..1).
const SEA_ICE_COLOR: ExpressionSpecification = [
  "step",
  ["get", "ice_concentration"],
  ICE_BANDS[3].color,
  ICE_BANDS[2].min,
  ICE_BANDS[2].color,
  ICE_BANDS[1].min,
  ICE_BANDS[1].color,
  ICE_BANDS[0].min,
  ICE_BANDS[0].color,
];

function icebergData(icebergs: ForecastIceberg[]) {
  const positions: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: icebergs.map((b) => ({
      type: "Feature",
      properties: { id: b.id },
      geometry: { type: "Point", coordinates: [b.lon, b.lat] },
    })),
  };
  const tracks: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: icebergs
      .filter((b) => b.forecast.length > 0)
      .map((b) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[b.lon, b.lat], ...b.forecast.map((p) => [p.lon, p.lat])] },
      })),
  };
  const uncertainty: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: icebergs.flatMap((b) => {
      const last = b.forecast[b.forecast.length - 1];
      return last ? [{ type: "Feature" as const, properties: {}, geometry: circlePolygon(last, last.uncertaintyKm) }] : [];
    }),
  };
  return { positions, tracks, uncertainty };
}

function makePin(kind: "START" | "DESTINATION", color: string, labelColor: string) {
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.innerHTML = `
    <div style="position:relative;width:22px;height:22px">
      <span style="position:absolute;inset:-12px;border-radius:9999px;border:1px solid ${color}55;box-shadow:0 0 22px ${color}66"></span>
      <span style="position:absolute;inset:-5px;border-radius:9999px;border:1px solid ${color}aa"></span>
      <span style="position:absolute;inset:3px;border-radius:9999px;border:2px solid ${color};background:${color}33"></span>
      <span style="position:absolute;inset:8px;border-radius:9999px;background:${color};box-shadow:0 0 10px ${color}"></span>
    </div>
    <div style="position:absolute;left:6px;bottom:32px;white-space:nowrap;font-family:var(--font-display);text-shadow:0 0 6px #05080a,0 1px 3px #05080a">
      <div style="font-size:14px;letter-spacing:0.06em;font-weight:600;color:${labelColor}">${kind}</div>
      <div data-coords style="font-size:12px;color:#edf2f2"></div>
    </div>`;
  return el;
}

function setPin(
  map: MapLibreMap,
  ref: React.MutableRefObject<Marker | null>,
  point: MissionPoint | null,
  kind: "START" | "DESTINATION",
) {
  if (!point) {
    ref.current?.remove();
    ref.current = null;
    return;
  }
  if (!ref.current) {
    const el =
      kind === "START"
        ? makePin(kind, PIN_COLORS.start, "#c3f2f4")
        : makePin(kind, PIN_COLORS.destination, "#ffb4a8");
    ref.current = new Marker({ element: el }).setLngLat([point.lon, point.lat]).addTo(map);
  }
  ref.current.setLngLat([point.lon, point.lat]);
  const coords = ref.current.getElement().querySelector("[data-coords]");
  if (coords) coords.textContent = `${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`;
}

function setVisible(map: MapLibreMap, ids: string[], visible: boolean) {
  for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

export default function MissionRoutePreview({
  start,
  destination,
  seaIce,
  icebergs,
  layers,
  insets,
}: {
  start: MissionPoint | null;
  destination: MissionPoint | null;
  seaIce: SeaIceGeoJSON | null;
  icebergs: ForecastIceberg[] | null;
  layers: PreviewLayers;
  // Fractions of the map size covered by overlaid panels, kept clear when framing.
  insets: Insets;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const startPinRef = useRef<Marker | null>(null);
  const destPinRef = useRef<Marker | null>(null);
  const boundsRef = useRef<Bounds | null>(null);
  const insetsRef = useRef(insets);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    insetsRef.current = insets;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: WEDDELL_CENTER,
      zoom: WEDDELL_ZOOM,
      pitch: PITCH,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.on("error", (e) => console.error("[maplibre]", e.error));
    map.on("load", () => {
      map.setSky({
        "sky-color": "#07131a",
        "horizon-color": "#4b7f8c",
        "fog-color": "#0b1d26",
        "sky-horizon-blend": 0.7,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.35,
        "atmosphere-blend": 0,
      });
      map.addSource("graticule", { type: "geojson", data: buildGraticule() });
      map.addLayer({
        id: "graticule-lines",
        type: "line",
        source: "graticule",
        paint: { "line-color": "#8fd9e0", "line-opacity": 0.22, "line-width": 1, "line-dasharray": [1, 2] },
      });
      map.addSource("sea-ice", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "sea-ice-layer",
        type: "circle",
        source: "sea-ice",
        paint: {
          "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 3, 4, 6, 26],
          "circle-color": SEA_ICE_COLOR,
          "circle-opacity": 0.55,
          "circle-blur": 0.6,
          "circle-pitch-alignment": "map",
        },
      });
      map.addSource("berg-uncertainty", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "berg-uncertainty",
        type: "fill",
        source: "berg-uncertainty",
        paint: { "fill-color": "#8fd9e0", "fill-opacity": 0.14, "fill-outline-color": "#8fd9e0" },
      });
      map.addSource("berg-tracks", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "berg-tracks",
        type: "line",
        source: "berg-tracks",
        paint: { "line-color": "#f5c26b", "line-width": 1.6, "line-opacity": 0.9, "line-dasharray": [2, 1.5] },
      });
      map.addSource("bergs", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "bergs-glow",
        type: "circle",
        source: "bergs",
        paint: { "circle-radius": 9, "circle-color": "#c3f2f4", "circle-opacity": 0.25, "circle-blur": 1 },
      });
      map.addLayer({
        id: "bergs",
        type: "circle",
        source: "bergs",
        paint: {
          "circle-radius": 3.6,
          "circle-color": "#f4fbfc",
          "circle-stroke-color": "#05080a",
          "circle-stroke-width": 1,
        },
      });
      map.addSource("direct-line", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "direct-line-glow",
        type: "line",
        source: "direct-line",
        paint: { "line-color": "#5fd3ea", "line-width": 10, "line-opacity": 0.3, "line-blur": 6 },
      });
      map.addLayer({
        id: "direct-line",
        type: "line",
        source: "direct-line",
        paint: { "line-color": "#c3f2f4", "line-width": 2, "line-dasharray": [3, 2] },
      });
      setLoaded(true);
    });
    // MapLibre tracks container resizes itself; re-frame the mission after one.
    map.on("resize", () => frameMission(map, boundsRef.current, insetsRef.current, false));
    return () => {
      startPinRef.current?.remove();
      destPinRef.current?.remove();
      startPinRef.current = null;
      destPinRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !seaIce) return;
    (map.getSource("sea-ice") as GeoJSONSource | undefined)?.setData(seaIce);
  }, [seaIce, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !icebergs) return;
    const d = icebergData(icebergs);
    (map.getSource("bergs") as GeoJSONSource | undefined)?.setData(d.positions);
    (map.getSource("berg-tracks") as GeoJSONSource | undefined)?.setData(d.tracks);
    (map.getSource("berg-uncertainty") as GeoJSONSource | undefined)?.setData(d.uncertainty);
  }, [icebergs, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    setVisible(map, ["sea-ice-layer"], layers.seaIce);
    setVisible(map, ["bergs", "bergs-glow"], layers.icebergs);
    setVisible(map, ["berg-tracks", "berg-uncertainty"], layers.forecast);
    setVisible(map, ["direct-line", "direct-line-glow"], layers.directLine);
  }, [layers.seaIce, layers.icebergs, layers.forecast, layers.directLine, loaded]);

  const sLat = start?.lat;
  const sLon = start?.lon;
  const dLat = destination?.lat;
  const dLon = destination?.lon;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const s = sLat !== undefined && sLon !== undefined ? { lat: sLat, lon: sLon } : null;
    const d = dLat !== undefined && dLon !== undefined ? { lat: dLat, lon: dLon } : null;
    const line: FeatureCollection =
      s && d
        ? {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: greatCircle(s, d) } }],
          }
        : EMPTY;
    (map.getSource("direct-line") as GeoJSONSource | undefined)?.setData(line);
    setPin(map, startPinRef, s, "START");
    setPin(map, destPinRef, d, "DESTINATION");

    if (s && d) {
      boundsRef.current = [
        [Math.min(s.lon, d.lon), Math.min(s.lat, d.lat)],
        [Math.max(s.lon, d.lon), Math.max(s.lat, d.lat)],
      ];
      frameMission(map, boundsRef.current, insetsRef.current, true);
      return;
    }
    boundsRef.current = null;
    const only = s ?? d;
    map.easeTo({
      center: only ? [only.lon, only.lat] : WEDDELL_CENTER,
      zoom: only ? 4.4 : WEDDELL_ZOOM,
      pitch: PITCH,
      duration: 1000,
    });
  }, [sLat, sLon, dLat, dLon, loaded]);

  return (
    <div className="absolute inset-0">
      {/* maplibre-gl.css sets the map container to position:relative, so it
          fills this absolutely positioned wrapper instead of being one. */}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

// Frames the mission in the part of the map not covered by overlays, then
// tilts the camera: framing is computed flat and pitched afterwards, which
// pushes the destination side up and away like a view from the bridge.
function frameMission(map: MapLibreMap, bounds: Bounds | null, insets: Insets, animate: boolean) {
  if (!bounds) return;
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const cam = map.cameraForBounds(bounds, {
    padding: { top: h * insets.top, bottom: h * insets.bottom, left: w * insets.left, right: w * insets.right },
    maxZoom: 5.6,
  });
  if (!cam) return;
  map.easeTo({ ...cam, pitch: PITCH, bearing: 0, duration: animate ? 1200 : 0 });
}
