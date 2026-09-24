// Vessel & mission configuration shared between the pre-mission configuration
// page and the Command Center. Everything here is either sent to the real
// routing API (vessel speed / fuel rate / id / name, start, destination) or
// selects between results the API already computes (operational objective).
// Nothing here invents a routing behavior the backend does not have.

import type { MissionFields } from "@/components/command-center/MissionPlanner";
import { DEMO_MISSION, DEMO_VESSEL, type VesselRequest } from "@/components/command-center/replay";
import type { RouteStrategyKind } from "@/components/command-center/routeStyle";

export type VesselProfileId = "research" | "ice-strengthened" | "supply";

export type VesselProfile = {
  id: VesselProfileId;
  name: string;
  shortName: string;
  description: string;
  vesselId: string;
  cruiseSpeedKnots: number;
  fuelRateTonsPerDay: number;
};

// Planning presets, not certified vessel specifications. The routing API uses
// exactly two of these numbers (backend/routing/icewise/metrics.py):
//   estimated_time_hours = distance_nm / cruise_speed_knots
//   estimated_fuel_tons  = estimated_time_hours / 24 * fuel_consumption_rate_tons_per_day
// The first preset is the existing ICEWISE demo vessel, unchanged.
export const VESSEL_PROFILES: VesselProfile[] = [
  {
    id: "research",
    name: "Antarctic Research Vessel",
    shortName: "Research Vessel",
    description: "General purpose research operations",
    vesselId: DEMO_VESSEL.vessel_id,
    cruiseSpeedKnots: DEMO_VESSEL.cruise_speed_knots,
    fuelRateTonsPerDay: DEMO_VESSEL.fuel_consumption_rate_tons_per_day,
  },
  {
    id: "ice-strengthened",
    name: "Ice-Strengthened Research Vessel",
    shortName: "Ice-Strengthened",
    description: "Extended missions in ice-affected waters",
    vesselId: "ICEWISE-IRV-01",
    cruiseSpeedKnots: 10,
    fuelRateTonsPerDay: 22,
  },
  {
    id: "supply",
    name: "Research Supply Vessel",
    shortName: "Supply Vessel",
    description: "Logistics and station resupply",
    vesselId: "ICEWISE-RSV-01",
    cruiseSpeedKnots: 13,
    fuelRateTonsPerDay: 18,
  },
];

export const SPEED_RANGE = { min: 6, max: 16, step: 0.5 };
export const FUEL_RANGE = { min: 5, max: 40, step: 0.5 };

export function getVesselProfile(id: VesselProfileId): VesselProfile {
  return VESSEL_PROFILES.find((p) => p.id === id) ?? VESSEL_PROFILES[0];
}

// ---------------------------------------------------------------------------
// Operational objective
// ---------------------------------------------------------------------------

export type OperationalObjective = "safety" | "balanced" | "efficiency";

// POST /api/route always computes three strategies on the same engine, varying
// only the path-cost risk weight α (backend/routing/main.py ->
// ROUTE_OPTION_PROFILES). The request cannot set α itself, so an objective does
// not change what the backend computes: it chooses which of those three real
// results the Command Center treats as the active strategy.
export const OBJECTIVES: {
  id: OperationalObjective;
  label: string;
  caption: string;
  strategy: RouteStrategyKind;
  riskWeight: number;
}[] = [
  { id: "safety", label: "Safety First", caption: "Minimise predicted risk", strategy: "safety", riskWeight: 10 },
  { id: "balanced", label: "Balanced", caption: "Risk and distance weighed", strategy: "balanced", riskWeight: 2.5 },
  { id: "efficiency", label: "Efficiency Focused", caption: "Shortest navigable path", strategy: "shortest", riskWeight: 0 },
];

export function getObjective(id: OperationalObjective) {
  return OBJECTIVES.find((o) => o.id === id) ?? OBJECTIVES[1];
}

// ---------------------------------------------------------------------------
// Configuration + persistence (sessionStorage, this browser tab only)
// ---------------------------------------------------------------------------

export type MissionConfig = {
  profileId: VesselProfileId;
  cruiseSpeedKnots: number;
  fuelRateTonsPerDay: number;
  fields: MissionFields;
  objective: OperationalObjective;
};

export const DEFAULT_MISSION_CONFIG: MissionConfig = {
  profileId: VESSEL_PROFILES[0].id,
  cruiseSpeedKnots: VESSEL_PROFILES[0].cruiseSpeedKnots,
  fuelRateTonsPerDay: VESSEL_PROFILES[0].fuelRateTonsPerDay,
  fields: DEMO_MISSION,
  objective: "balanced",
};

export function toVesselRequest(config: MissionConfig): VesselRequest {
  const profile = getVesselProfile(config.profileId);
  return {
    ...DEMO_VESSEL,
    vessel_id: profile.vesselId,
    vessel_name: profile.name,
    cruise_speed_knots: config.cruiseSpeedKnots,
    fuel_consumption_rate_tons_per_day: config.fuelRateTonsPerDay,
  };
}

const CONFIG_KEY = "icewise.missionConfig.v1";
const GENERATE_KEY = "icewise.missionConfig.generatePending";

const isFiniteIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function parseConfig(raw: string | null): MissionConfig | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<MissionConfig> | null;
    if (!c || typeof c !== "object") return null;
    if (!VESSEL_PROFILES.some((p) => p.id === c.profileId)) return null;
    if (!OBJECTIVES.some((o) => o.id === c.objective)) return null;
    if (!isFiniteIn(c.cruiseSpeedKnots, SPEED_RANGE.min, SPEED_RANGE.max)) return null;
    if (!isFiniteIn(c.fuelRateTonsPerDay, FUEL_RANGE.min, FUEL_RANGE.max)) return null;
    const f = c.fields;
    if (!f || !(["startLat", "startLon", "destLat", "destLon"] as const).every((k) => typeof f[k] === "string")) {
      return null;
    }
    return {
      profileId: c.profileId as VesselProfileId,
      cruiseSpeedKnots: c.cruiseSpeedKnots,
      fuelRateTonsPerDay: c.fuelRateTonsPerDay,
      fields: { startLat: f.startLat, startLon: f.startLon, destLat: f.destLat, destLon: f.destLon },
      objective: c.objective as OperationalObjective,
    };
  } catch {
    return null;
  }
}

// Storage can be unavailable (private mode, blocked site data). Every access is
// guarded, and a module-level copy still carries the configuration across the
// client-side navigation into the Command Center when storage is blocked.
let memoryConfig: MissionConfig | null = null;
let memoryGenerationPending = false;

export function loadMissionConfig(): MissionConfig | null {
  try {
    return parseConfig(window.sessionStorage.getItem(CONFIG_KEY)) ?? memoryConfig;
  } catch {
    return memoryConfig;
  }
}

export function saveMissionConfig(config: MissionConfig, requestGeneration: boolean): void {
  memoryConfig = config;
  if (requestGeneration) memoryGenerationPending = true;
  try {
    window.sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    if (requestGeneration) window.sessionStorage.setItem(GENERATE_KEY, "1");
  } catch {
    // Module copy above is the fallback.
  }
}

// One-shot: true exactly once after the configuration page asked the Command
// Center to generate the configured mission.
export function consumeGenerationRequest(): boolean {
  let pending = memoryGenerationPending;
  memoryGenerationPending = false;
  try {
    pending = pending || window.sessionStorage.getItem(GENERATE_KEY) === "1";
    window.sessionStorage.removeItem(GENERATE_KEY);
  } catch {
    // Module flag above is the fallback.
  }
  return pending;
}
