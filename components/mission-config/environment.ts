// Environment data for the pre-mission planner. Everything here is derived
// from two real backend datasets, both historical (2020-01-02 replay):
//   GET  /api/sea-ice/geojson       NSIDC sea-ice concentration grid
//   POST /api/prediction/mission    iceberg positions + physics/ML hybrid
//                                   24/48/72 h drift forecasts
// Nothing is estimated, interpolated or defaulted when data is missing.

import type { Polygon } from "geojson";
import type { MissionPoint } from "@/components/command-center/MissionPlanner";
import type { SeaIceGeoJSON } from "@/components/command-center/types";
import { haversineKm } from "@/components/command-center/missionAnalysis";

// Display bands for sea-ice concentration (fraction 0..1), highest first.
export const ICE_BANDS = [
  { id: "high", label: "High", range: "80–100%", min: 0.8, color: "#eaf8fb" },
  { id: "moderate", label: "Moderate", range: "40–80%", min: 0.4, color: "#8fd6ec" },
  { id: "low", label: "Low", range: "10–40%", min: 0.1, color: "#3f9ec4" },
  { id: "open", label: "Open Water", range: "0–10%", min: 0, color: "#1c4f66" },
] as const;

export function iceBand(concentration: number) {
  return ICE_BANDS.find((b) => concentration >= b.min) ?? ICE_BANDS[3];
}

// Iceberg-forecast request window: the Weddell Sea sector around the navigable
// region, sized to the prediction API's prototype limit (15° lat × 30° lon —
// backend/prediction/predict_iceberg.py MAX_REGION_*_SPAN).
export const ENVIRONMENT_REGION = { min_lat: -78, max_lat: -63, min_lon: -60, max_lon: -30 };
// The routing engine's supported navigable region (backend navigability model
// "weddell-sea-conservative-v1", reported in every route response's notes).
export const NAVIGABLE_REGION_LABEL = "62°S – 77.25°S · 30°W – 52°W";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const R_EARTH_KM = 6371;

// Great-circle (spherical interpolation) points between two coordinates, as
// [lon, lat] pairs — the geodesic the direct-line distance refers to.
export function greatCircle(a: MissionPoint, b: MissionPoint, steps = 48): [number, number][] {
  const v = (p: MissionPoint) => [
    Math.cos(toRad(p.lat)) * Math.cos(toRad(p.lon)),
    Math.cos(toRad(p.lat)) * Math.sin(toRad(p.lon)),
    Math.sin(toRad(p.lat)),
  ];
  const v1 = v(a);
  const v2 = v(b);
  const omega = Math.acos(Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2])));
  if (omega < 1e-9) return [[a.lon, a.lat], [b.lon, b.lat]];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const k2 = Math.sin(t * omega) / Math.sin(omega);
    const x = k1 * v1[0] + k2 * v2[0];
    const y = k1 * v1[1] + k2 * v2[1];
    const z = k1 * v1[2] + k2 * v2[2];
    out.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return out;
}

// A geodesic circle of radius `km` around a point, for uncertainty envelopes.
export function circlePolygon(center: MissionPoint, km: number, steps = 40): Polygon {
  const lat1 = toRad(center.lat);
  const lon1 = toRad(center.lon);
  const d = km / R_EARTH_KM;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([toDeg(lon2), toDeg(lat2)]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

// ---------------------------------------------------------------------------
// Iceberg forecasts (POST /api/prediction/mission)
// ---------------------------------------------------------------------------

export type ForecastIceberg = {
  id: string;
  lat: number;
  lon: number;
  forecast: { hours: number; lat: number; lon: number; uncertaintyKm: number }[];
};

export type IcebergForecast = { icebergs: ForecastIceberg[]; model: string | null; horizons: number[] };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Reads the prediction module's documented contract. NO_COVERAGE is a real,
// empty result (not an error); anything unreadable returns null.
export function parseIcebergForecast(data: unknown): IcebergForecast | null {
  if (!isRec(data)) return null;
  if (data.status === "NO_COVERAGE") return { icebergs: [], model: null, horizons: [] };
  if (data.status !== "OK" || !Array.isArray(data.icebergs)) return null;
  const icebergs: ForecastIceberg[] = [];
  const horizons = new Set<number>();
  for (const b of data.icebergs) {
    if (!isRec(b) || typeof b.iceberg_id !== "string" || !isRec(b.current_state)) continue;
    const { latitude, longitude } = b.current_state;
    if (!num(latitude) || !num(longitude)) continue;
    const forecast = (Array.isArray(b.predictions) ? b.predictions : [])
      .filter(
        (p): p is Record<string, number> =>
          isRec(p) && num(p.latitude) && num(p.longitude) && num(p.forecast_hours) && num(p.uncertainty_km),
      )
      .map((p) => ({ hours: p.forecast_hours, lat: p.latitude, lon: p.longitude, uncertaintyKm: p.uncertainty_km }))
      .sort((x, y) => x.hours - y.hours);
    forecast.forEach((p) => horizons.add(p.hours));
    icebergs.push({ id: b.iceberg_id, lat: latitude, lon: longitude, forecast });
  }
  return {
    icebergs,
    model: typeof data.model === "string" ? data.model : null,
    horizons: [...horizons].sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------------------
// Direct-line exposure: what the real datasets show near the straight line
// between the configured start and destination. Not a route risk score.
// ---------------------------------------------------------------------------

export const CORRIDOR_KM = 50;

export type DirectLineExposure = {
  seaIceCells: number;
  maxConcentration: number | null;
  meanConcentration: number | null;
  icebergsNear: number;
  nearest: { id: string; km: number } | null;
  maxUncertaintyKm: number | null;
};

function distanceToLineKm(p: MissionPoint, line: [number, number][]): number {
  let best = Infinity;
  for (const [lon, lat] of line) best = Math.min(best, haversineKm(p, { lat, lon }));
  return best;
}

export function directLineExposure(
  start: MissionPoint,
  destination: MissionPoint,
  seaIce: SeaIceGeoJSON | null,
  forecast: IcebergForecast | null,
): DirectLineExposure {
  // ~5 km sample spacing for corridor-length lines, capped for long ones.
  const steps = Math.min(400, Math.max(24, Math.ceil(haversineKm(start, destination) / 5)));
  const line = greatCircle(start, destination, steps);

  const cells = (seaIce?.features ?? [])
    .filter((f) => distanceToLineKm({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }, line) <= CORRIDOR_KM)
    .map((f) => f.properties.ice_concentration)
    .filter(num);

  let nearest: DirectLineExposure["nearest"] = null;
  let icebergsNear = 0;
  let maxUncertaintyKm: number | null = null;
  for (const b of forecast?.icebergs ?? []) {
    // Closest approach of the berg's recorded position or any forecast position.
    const km = Math.min(distanceToLineKm(b, line), ...b.forecast.map((p) => distanceToLineKm(p, line)));
    if (!nearest || km < nearest.km) nearest = { id: b.id, km };
    if (km <= CORRIDOR_KM) {
      icebergsNear++;
      for (const p of b.forecast) maxUncertaintyKm = Math.max(maxUncertaintyKm ?? 0, p.uncertaintyKm);
    }
  }

  return {
    seaIceCells: cells.length,
    maxConcentration: cells.length ? Math.max(...cells) : null,
    meanConcentration: cells.length ? cells.reduce((a, c) => a + c, 0) / cells.length : null,
    icebergsNear,
    nearest,
    maxUncertaintyKm,
  };
}
