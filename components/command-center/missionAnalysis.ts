// Pure derivations for "Why This Route" and "Mission Threat Timeline" —
// nothing here calls the API or holds state; every value is computed
// directly from a real RouteResponse (and, for the timeline, real
// IcebergPrediction data already attached to it). No risk score, confidence,
// severity or collision probability is invented anywhere in this file.

import { classifyRouteStrategy } from "./routeStyle";
import {
  isRouteOption,
  type IcebergPrediction,
  type RouteOption,
  type RouteOptionResult,
  type RouteWaypoint,
} from "./types";

// The strategy "Why This Route" / "Mission Threat Timeline" describe: the
// operator's explicit pick from Route Comparison, else the real "Balanced"
// entry (the same risk_tolerance_factor the backend's default VesselProfile
// uses for the primary route — see backend/routing/main.py ->
// ROUTE_OPTION_PROFILES), else null when neither is available.
export function pickActiveStrategy(
  routeOptions: RouteOptionResult[] | undefined,
  selectedRouteOptionId: string | null,
): RouteOption | null {
  const real = (routeOptions ?? []).filter(isRouteOption);
  if (selectedRouteOptionId) {
    const picked = real.find((o) => o.route_id === selectedRouteOptionId);
    if (picked) return picked;
  }
  return real.find((o) => classifyRouteStrategy(o.label) === "balanced") ?? null;
}

export type RouteTradeoff = {
  routeId: string;
  label: string;
  distanceDeltaKm: number;
  timeDeltaHours: number;
  fuelDeltaTons: number;
  meanRiskDeltaPct: number;
};

// active - other for every field, so a positive delta means the active/
// selected strategy is higher on that measure than the compared one. Every
// number is read straight off the two real route_options entries' own
// `metrics` — nothing recomputed or estimated.
export function computeTradeoffs(active: RouteOption, options: RouteOptionResult[]): RouteTradeoff[] {
  return options
    .filter(isRouteOption)
    .filter((o) => o.route_id !== active.route_id)
    .map((o) => ({
      routeId: o.route_id,
      label: o.label,
      distanceDeltaKm: active.metrics.total_distance_km - o.metrics.total_distance_km,
      timeDeltaHours: active.metrics.estimated_time_hours - o.metrics.estimated_time_hours,
      fuelDeltaTons: active.metrics.estimated_fuel_tons - o.metrics.estimated_fuel_tons,
      meanRiskDeltaPct: (active.metrics.mean_risk_score - o.metrics.mean_risk_score) * 100,
    }));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Same great-circle formula the routing API itself uses server-side
// (backend/routing/icewise/risk_engine.py -> haversine_distance_km) and the
// map already uses client-side (AntarcticMap.tsx) — not a new calculation.
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R_EARTH_KM = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type ThreatEvent = {
  icebergId: string;
  waypointIndex: number;
  etaHours: number;
  distanceKm: number;
};

// One event per corridor iceberg: its closest real recorded/predicted
// position to the route's real waypoint geometry, matched to the nearest
// waypoint by real timestamp (no interpolation of either dataset) — the
// strongest defensible timeline the two datasets actually support, since
// neither the prediction dataset nor the risk engine expose a collision
// probability, confidence, severity or exact encounter time. Sorted
// chronologically by the matched waypoint's ETA.
export function buildThreatTimeline(waypoints: RouteWaypoint[], icebergs: IcebergPrediction[]): ThreatEvent[] {
  if (waypoints.length === 0) return [];

  const events: ThreatEvent[] = [];
  for (const berg of icebergs) {
    const positions = [berg.current_position, ...berg.predicted_positions];
    let best: { waypointIndex: number; distanceKm: number } | null = null;

    for (const pos of positions) {
      let nearestIndex = 0;
      let nearestDt = Infinity;
      waypoints.forEach((wp, i) => {
        const dt = Math.abs(wp.time_offset_hours - pos.time_offset_hours);
        if (dt < nearestDt) {
          nearestDt = dt;
          nearestIndex = i;
        }
      });
      const distanceKm = haversineKm(waypoints[nearestIndex], pos);
      if (!best || distanceKm < best.distanceKm) {
        best = { waypointIndex: nearestIndex, distanceKm };
      }
    }

    if (best) {
      events.push({
        icebergId: berg.iceberg_id,
        waypointIndex: best.waypointIndex,
        etaHours: waypoints[best.waypointIndex].time_offset_hours,
        distanceKm: best.distanceKm,
      });
    }
  }

  events.sort((a, b) => a.etaHours - b.etaHours || a.distanceKm - b.distanceKm);
  return events;
}
