// Route robustness under forecast uncertainty.
//
// Re-evaluates each of the routing engine's three real route strategies with
// the engine's OWN time-aware risk model (backend/routing/icewise/risk_engine.py),
// changing exactly one thing: the iceberg position uncertainty σ is multiplied
// by an uncertainty factor k (1.0× / 1.5× / 2.0×).
//
//   iceberg risk   P_i  = confidence · exp(−d² / 2σ²)             (per berg, at the waypoint ETA)
//                  σ(t) = max(0.5, k · (σ₀ + 0.05 · t))           (k = 1 is the engine's own σ)
//                  R_berg = 1 − Π(1 − P_i)
//   sea-ice risk   R_ice  = 0.5 · concentration  (nearest NSIDC cell within 0.2°, else 0.05)
//   total          R      = 1 − (1 − R_berg)(1 − R_ice)
//
// At k = 1.0 this must reproduce the engine's reported per-waypoint risk
// (`waypoint_risks`); analyseStrategy().engineDeviation measures that. Distances, ETAs and
// fuel are the engine's own per-strategy metrics — never recomputed here.

import type { IcebergPrediction, RouteOption, RouteWaypoint, SeaIceGeoJSON } from "@/components/command-center/types";

// Constants copied from the backend so the model is identical (see file header).
const R_EARTH_KM = 6371.0; // risk_engine.py
const SIGMA_FLOOR_KM = 0.5; // risk_engine.py: max(0.5, …)
const SIGMA_GROWTH_KM_PER_H = 0.05; // risk_engine.py: σ_0 + 0.05·t
const SEA_ICE_RISK_WEIGHT = 0.5; // RiskEngine(sea_ice_risk_weight=0.5)
const DEFAULT_ICE_CONCENTRATION = 0.05; // EnvironmentalData.default_ice_concentration
const ICE_NEIGHBOUR_RADIUS_DEG = 0.2; // RiskEngine._ICE_NEIGHBOUR_RADIUS_DEG

export const UNCERTAINTY_LEVELS = [
  { k: 1.0, label: "Normal" },
  { k: 1.5, label: "Stress Test" },
  { k: 2.0, label: "High" },
] as const;
export type UncertaintyFactor = (typeof UNCERTAINTY_LEVELS)[number]["k"];

const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// risk_engine.py -> _interpolate_position_at_time: linear between forecast
// points, clamped to the first/last known position.
function positionAt(berg: IcebergPrediction, t: number): RouteWaypoint {
  const pts = [berg.current_position, ...berg.predicted_positions];
  if (t <= pts[0].time_offset_hours) return pts[0];
  const last = pts[pts.length - 1];
  if (t >= last.time_offset_hours) return last;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.time_offset_hours <= t && t <= b.time_offset_hours) {
      const dt = b.time_offset_hours - a.time_offset_hours;
      if (dt <= 1e-6) return a;
      const f = (t - a.time_offset_hours) / dt;
      return { lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon), time_offset_hours: t };
    }
  }
  return last;
}

export function sigmaKm(berg: IcebergPrediction, t: number, k: number): number {
  return Math.max(SIGMA_FLOOR_KM, k * (berg.spatial_uncertainty_km + SIGMA_GROWTH_KM_PER_H * t));
}

function icebergRisk(wp: RouteWaypoint, bergs: IcebergPrediction[], k: number): number {
  let clear = 1;
  for (const berg of bergs) {
    const conf = Math.max(0.1, Math.min(1, berg.confidence_score));
    const pos = positionAt(berg, wp.time_offset_hours);
    const sigma = sigmaKm(berg, wp.time_offset_hours, k);
    const d = haversineKm(wp.lat, wp.lon, pos.lat, pos.lon);
    clear *= 1 - conf * Math.exp(-(d * d) / (2 * sigma * sigma));
  }
  return Math.min(1, Math.max(0, 1 - clear));
}

// risk_engine.py -> sea_ice_observation_at / get_sea_ice_concentration.
export function makeSeaIceLookup(seaIce: SeaIceGeoJSON | null) {
  const cells = (seaIce?.features ?? []).map((f) => ({
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    c: f.properties.ice_concentration,
  }));
  return (lat: number, lon: number): number => {
    let best = ICE_NEIGHBOUR_RADIUS_DEG * ICE_NEIGHBOUR_RADIUS_DEG;
    let value: number | null = null;
    for (const cell of cells) {
      const dsq = (lat - cell.lat) ** 2 + (lon - cell.lon) ** 2;
      if (dsq < best) {
        best = dsq;
        value = cell.c;
      }
    }
    return value ?? DEFAULT_ICE_CONCENTRATION;
  };
}

export type RouteEvaluation = {
  k: number;
  waypointRisks: number[];
  maxHazard: number; // max total waypoint risk (engine's max_risk_score definition)
  meanHazard: number; // mean total waypoint risk (engine's mean_risk_score definition)
  maxIcebergRisk: number; // max iceberg-only component
  envelopeHours: number; // time spent inside any iceberg's 1σ uncertainty radius
};

export function evaluateRoute(
  waypoints: RouteWaypoint[],
  bergs: IcebergPrediction[],
  seaIceAt: (lat: number, lon: number) => number,
  k: number,
): RouteEvaluation {
  const iceRisk = waypoints.map((wp) => Math.min(1, SEA_ICE_RISK_WEIGHT * seaIceAt(wp.lat, wp.lon)));
  const bergRisk = waypoints.map((wp) => icebergRisk(wp, bergs, k));
  const total = waypoints.map((_, i) => Math.min(1, Math.max(0, 1 - (1 - bergRisk[i]) * (1 - iceRisk[i]))));

  // Inside the uncertainty envelope: within σ_k(t) of some berg's position at the waypoint ETA.
  const inside = waypoints.map((wp) =>
    bergs.some((b) => {
      const pos = positionAt(b, wp.time_offset_hours);
      return haversineKm(wp.lat, wp.lon, pos.lat, pos.lon) <= sigmaKm(b, wp.time_offset_hours, k);
    }),
  );
  let envelopeHours = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dt = waypoints[i + 1].time_offset_hours - waypoints[i].time_offset_hours;
    envelopeHours += (dt * (Number(inside[i]) + Number(inside[i + 1]))) / 2;
  }

  return {
    k,
    waypointRisks: total,
    maxHazard: total.length ? Math.max(...total) : 0,
    meanHazard: total.length ? total.reduce((a, r) => a + r, 0) / total.length : 0,
    maxIcebergRisk: bergRisk.length ? Math.max(...bergRisk) : 0,
    envelopeHours,
  };
}

// Closest approach (km) between the route and any berg's position at each waypoint ETA.
export function minClearanceKm(waypoints: RouteWaypoint[], bergs: IcebergPrediction[]): number | null {
  let best: number | null = null;
  for (const wp of waypoints) {
    for (const b of bergs) {
      const pos = positionAt(b, wp.time_offset_hours);
      const d = haversineKm(wp.lat, wp.lon, pos.lat, pos.lon);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

export type StrategyAnalysis = {
  option: RouteOption;
  levels: RouteEvaluation[]; // one per UNCERTAINTY_LEVELS entry, same order
  clearanceKm: number | null;
  // Largest |recomputed − engine| per-waypoint risk at 1.0×; null if the
  // engine did not report waypoint risks for this strategy.
  engineDeviation: number | null;
  // Increase in max hazard from 1.0× to 2.0× (fraction, e.g. 0.12 = 12 points).
  sensitivity: number;
};

export function analyseStrategy(
  option: RouteOption,
  bergs: IcebergPrediction[],
  seaIceAt: (lat: number, lon: number) => number,
): StrategyAnalysis {
  const levels = UNCERTAINTY_LEVELS.map((l) => evaluateRoute(option.waypoints, bergs, seaIceAt, l.k));
  const reported = option.waypoint_risks;
  const engineDeviation =
    reported && reported.length === levels[0].waypointRisks.length
      ? Math.max(...reported.map((r, i) => Math.abs(r - levels[0].waypointRisks[i])))
      : null;
  return {
    option,
    levels,
    clearanceKm: minClearanceKm(option.waypoints, bergs),
    engineDeviation,
    sensitivity: levels[levels.length - 1].maxHazard - levels[0].maxHazard,
  };
}

// ---------------------------------------------------------------------------
// Icebergs outside the routing corridor
// ---------------------------------------------------------------------------
// The route response carries only the icebergs inside the routing corridor
// (main.py -> _relevant_icebergs: within 1° of the mission box). Every other
// berg's forecast comes from POST /api/prediction/mission. This returns an
// upper bound on the risk any one of those could add at uncertainty factor k:
// the nearest of its recorded/forecast positions to any waypoint, with the
// largest σ it could have on this route — conservative on both counts.

export type OutsideBerg = { id: string; positions: { lat: number; lon: number; uncertaintyKm: number }[] };

export function outsideCorridorBound(
  waypoints: RouteWaypoint[],
  outside: OutsideBerg[],
  k: number,
  confidence = 0.9, // adapter default used by the routing engine
): number {
  if (!waypoints.length) return 0;
  const tMax = waypoints[waypoints.length - 1].time_offset_hours;
  let worst = 0;
  for (const berg of outside) {
    const sigma0 = Math.max(...berg.positions.map((p) => p.uncertaintyKm));
    const sigma = Math.max(SIGMA_FLOOR_KM, k * (sigma0 + SIGMA_GROWTH_KM_PER_H * tMax));
    for (const wp of waypoints) {
      for (const p of berg.positions) {
        const d = haversineKm(wp.lat, wp.lon, p.lat, p.lon);
        worst = Math.max(worst, confidence * Math.exp(-(d * d) / (2 * sigma * sigma)));
      }
    }
  }
  return worst;
}
