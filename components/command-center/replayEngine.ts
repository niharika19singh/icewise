// Pure, deterministic mission-replay math shared by AntarcticMap.tsx (moving
// vessel/iceberg markers) and MissionReplay.tsx (the time slider). Nothing
// here calls an API; every position/risk value is derived directly from real
// waypoints, predicted_positions and waypoint_risks already on a
// RouteResponse. Mirrors the exact clamped linear-interpolation semantics
// the backend's risk engine already uses (risk_engine.py ->
// _interpolate_position_at_time): before the first real timestamp, use the
// first point; after the last, use the last point (never extrapolate);
// between two real points, interpolate linearly — the same technique, not a
// new one.

import type { IcebergPrediction, RouteWaypoint } from "./types";

export type ReplayPoint = { lat: number; lon: number };

type TimedPoint = { lat: number; lon: number; time_offset_hours: number };

function interpolateSeries(points: TimedPoint[], t: number): ReplayPoint {
  if (points.length === 0) return { lat: 0, lon: 0 };
  if (points.length === 1 || t <= points[0].time_offset_hours) return points[0];
  const last = points[points.length - 1];
  if (t >= last.time_offset_hours) return last;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (p1.time_offset_hours <= t && t <= p2.time_offset_hours) {
      const dt = p2.time_offset_hours - p1.time_offset_hours;
      const fraction = dt <= 1e-6 ? 0 : (t - p1.time_offset_hours) / dt;
      return {
        lat: p1.lat + fraction * (p2.lat - p1.lat),
        lon: p1.lon + fraction * (p2.lon - p1.lon),
      };
    }
  }
  return last;
}

// The vessel's interpolated position along the real route waypoints at
// mission time t (hours since departure). null only when the route has no
// waypoints at all.
export function interpolateVesselPosition(waypoints: RouteWaypoint[], t: number): ReplayPoint | null {
  if (waypoints.length === 0) return null;
  return interpolateSeries(waypoints, t);
}

// An iceberg's interpolated position at mission time t, using its real
// current_position (t=0) plus predicted_positions — the same three real
// data points (0h/24h/48h/72h, whatever the dataset actually has) the risk
// engine itself interpolates between server-side.
export function interpolateIcebergPosition(iceberg: IcebergPrediction, t: number): ReplayPoint {
  return interpolateSeries([iceberg.current_position, ...iceberg.predicted_positions], t);
}

// The real per-waypoint risk score nearest mission time t (linear
// interpolation between the two real scalar values bracketing t, same
// clamping rule as position interpolation). null when the route has no
// waypoint_risks (e.g. an older cached response) — never fabricated.
export function interpolateWaypointRisk(
  waypoints: RouteWaypoint[],
  waypointRisks: number[] | undefined,
  t: number,
): number | null {
  if (!waypointRisks || waypointRisks.length !== waypoints.length || waypoints.length === 0) return null;
  const lastIdx = waypoints.length - 1;
  if (t <= waypoints[0].time_offset_hours) return waypointRisks[0];
  if (t >= waypoints[lastIdx].time_offset_hours) return waypointRisks[lastIdx];

  for (let i = 0; i < lastIdx; i++) {
    const t1 = waypoints[i].time_offset_hours;
    const t2 = waypoints[i + 1].time_offset_hours;
    if (t1 <= t && t <= t2) {
      const dt = t2 - t1;
      const fraction = dt <= 1e-6 ? 0 : (t - t1) / dt;
      return waypointRisks[i] + fraction * (waypointRisks[i + 1] - waypointRisks[i]);
    }
  }
  return waypointRisks[lastIdx];
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Same great-circle formula used throughout this codebase (missionAnalysis.ts,
// AntarcticMap.tsx, backend/routing/icewise/risk_engine.py) — not a new one.
export function haversineKm(a: ReplayPoint, b: ReplayPoint): number {
  const R_EARTH_KM = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// The closest tracked iceberg to the vessel's interpolated position at
// mission time t — distance between two real interpolated positions, both
// derived from real recorded/predicted data at the same t. Not a collision
// probability or confidence estimate (see MissionThreatTimeline.tsx's own
// disclaimer, which this mirrors).
export function closestIcebergAt(
  vesselPos: ReplayPoint,
  icebergs: IcebergPrediction[],
  t: number,
): { icebergId: string; distanceKm: number } | null {
  let best: { icebergId: string; distanceKm: number } | null = null;
  for (const ib of icebergs) {
    const pos = interpolateIcebergPosition(ib, t);
    const distanceKm = haversineKm(vesselPos, pos);
    if (!best || distanceKm < best.distanceKm) best = { icebergId: ib.iceberg_id, distanceKm };
  }
  return best;
}
