"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import AntarcticMap from "./AntarcticMap";
import BottomBar from "./BottomBar";
import RightPanel from "./RightPanel";
import ViewSwitcher, { type PresentationView } from "./ViewSwitcher";
import MissionOverviewView from "./MissionOverviewView";
import NavigationIntelligenceView from "./NavigationIntelligenceView";
import AdaptiveReroutingView from "./AdaptiveReroutingView";
import type { MissionEvent, MissionEventKind } from "./MissionEventLog";
import {
  validateMission,
  SUPPORTED_LAT_MIN,
  SUPPORTED_LAT_MAX,
  type MissionFields,
  type MissionPoint,
  type PickTarget,
} from "./MissionPlanner";
import { describeRouteNotices } from "./routeNotices";
import { REPLAY_TIMESTAMP, DEMO_VESSEL, DEMO_MISSION, type VesselRequest } from "./replay";
import { classifyRouteStrategy, routeStrategyDisplayName } from "./routeStyle";
import {
  loadMissionConfig,
  consumeGenerationRequest,
  toVesselRequest,
  getObjective,
  type OperationalObjective,
} from "@/components/mission-config/missionConfig";
import { isRouteOption, type RouteResponse, type LayerId, type LayerVisibility, type SeaIceGeoJSON, type OperatorError } from "./types";

const BASE_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ROUTE_API_URL = `${BASE_API_URL}/api/route`;
const RECALCULATE_API_URL = `${BASE_API_URL}/api/route/recalculate`;
const SEA_ICE_API_URL = `${BASE_API_URL}/api/sea-ice/geojson`;

// Generous on purpose: a hosted backend that has been idle can take a while to
// answer its first request. The planner tells the operator when it is still waiting.
const REQUEST_TIMEOUT_MS = 90_000;

const DEMO_POINTS = validateMission(DEMO_MISSION);

// The vessel travels with the mission so a recalculation uses the same vessel
// the displayed route was generated for.
type GeneratedMission = { start: MissionPoint; destination: MissionPoint; vessel: VesselRequest };

// ---------------------------------------------------------------------------
// Requests and errors
// ---------------------------------------------------------------------------

// What the API says about a failure, normalised from the shapes it uses:
//   {"detail": {"error": CODE, "detail": "...", "field"?: "..."}}   (HTTPException)
//   {"error": CODE, "detail": "...", "fields"?: [...]}              (schema validation, unhandled 500)
//   {"detail": "..."} or {"detail": [{"msg": ...}]}                 (FastAPI defaults)
type ErrorInfo = { code?: string; detail?: string; field?: string };

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readErrorBody(body: unknown): ErrorInfo {
  if (!isPlainRecord(body)) return {};
  const inner = isPlainRecord(body.detail) ? body.detail : body;
  const code = typeof inner.error === "string" ? inner.error : undefined;
  const field = typeof inner.field === "string" ? inner.field : undefined;

  const parts: string[] = [];
  if (typeof inner.detail === "string") parts.push(inner.detail);
  if (Array.isArray(inner.detail)) {
    for (const item of inner.detail) if (isPlainRecord(item) && typeof item.msg === "string") parts.push(item.msg);
  }
  const fields = Array.isArray(inner.fields) ? inner.fields : Array.isArray(body.fields) ? body.fields : [];
  for (const f of fields) {
    if (isPlainRecord(f) && typeof f.message === "string") {
      parts.push(typeof f.field === "string" ? `${f.field}: ${f.message}` : f.message);
    }
  }
  return { code, field, detail: parts.length > 0 ? parts.join(" ") : undefined };
}

// Everything the frontend can actually distinguish about a failed request:
// unreachable, timed out, an HTTP error status (with whatever the API said),
// or a 2xx it could not use.
class ApiError extends Error {
  constructor(
    public kind: "network" | "timeout" | "http" | "unexpected",
    public status?: number,
    public info: ErrorInfo = {},
  ) {
    super(kind === "http" ? `Routing API returned ${status}` : `Routing API request failed (${kind})`);
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit | undefined,
  isValid: (data: unknown) => data is T,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch {
      // fetch rejects when the server cannot be reached at all (or on timeout).
      throw new ApiError(controller.signal.aborted ? "timeout" : "network");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError("http", res.status, readErrorBody(body));
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new ApiError(controller.signal.aborted ? "timeout" : "unexpected");
    }
    if (!isValid(data)) throw new ApiError("unexpected");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// Shape check for the fields the UI actually reads — guards against an empty or
// foreign 2xx body, not a re-validation of the routing engine's results.
function isRouteResponse(data: unknown): data is RouteResponse {
  if (!isRecord(data)) return false;
  const { waypoints, metrics, icebergs, route_options } = data;
  if (!Array.isArray(waypoints) || waypoints.length === 0) return false;
  if (!waypoints.every((w) => isRecord(w) && Number.isFinite(w.lat) && Number.isFinite(w.lon))) return false;
  if (!isRecord(metrics)) return false;
  const numeric = [
    "total_distance_km",
    "total_distance_nm",
    "estimated_time_hours",
    "estimated_fuel_tons",
    "estimated_fuel_cost_usd",
    "mean_risk_score",
    "max_risk_score",
    "safety_index",
  ];
  if (!numeric.every((k) => typeof metrics[k] === "number")) return false;
  if (!Array.isArray(icebergs)) return false;
  return route_options === undefined || Array.isArray(route_options);
}

function isSeaIceGeoJSON(data: unknown): data is SeaIceGeoJSON {
  return isRecord(data) && Array.isArray(data.features) && isRecord(data.metadata);
}

// Turns any failure into a concise, actionable message for the operator. The
// message is chosen from the failure category and, for HTTP errors, the error
// code the API sent. The API's own detail text is kept separately for the
// "Service details" expander and is never the primary message. For server
// errors (5xx) only the code is kept, since those details can be internal.
function toOperatorError(err: unknown, task: "route" | "recalculate" | "sea-ice"): OperatorError {
  const fallback: Record<typeof task, string> = {
    route: "The routing service could not generate a route for these points. Adjust the start or destination and try again.",
    recalculate: "The route could not be recalculated. Try again.",
    "sea-ice": "Sea-ice data could not be loaded.",
  };

  if (!(err instanceof ApiError)) return { message: fallback[task] };

  switch (err.kind) {
    case "network":
      return {
        message: "Cannot reach the routing service. Check that the backend is running and reachable from this page, then try again.",
      };
    case "timeout":
      return { message: "The routing service did not respond in time. Try again." };
    case "unexpected":
      return { message: "The routing service returned a response this app could not use. Try again." };
    case "http": {
      const { code, detail, field } = err.info;
      const status = err.status ?? 0;

      if (status >= 500) {
        return { message: "The routing service reported an error. Try again in a moment.", detail: code };
      }

      const which = field === "start_point" ? "start point" : field === "destination" ? "destination" : "a point";
      let message: string;
      switch (code) {
        case "NO_ROUTE_FOUND":
          message = "No safe route could be found between these points. Try a different start or destination.";
          break;
        case "OUTSIDE_DOMAIN":
          message = `A point is outside the area the routing service supports (latitude ${SUPPORTED_LAT_MIN}° to ${SUPPORTED_LAT_MAX}°). Move it and try again.`;
          break;
        case "COORDINATE_NOT_NAVIGABLE":
          message = `The routing service reports the ${which} is not navigable. Choose a different location and try again.`;
          break;
        case "IDENTICAL_POINTS":
          message = "Start and destination are the same point. Choose two different points.";
          break;
        case "INVALID_COORDINATE":
          message = "The routing service rejected a coordinate value. Check the latitude and longitude.";
          break;
        case "VALIDATION_ERROR":
          message = "The routing service rejected these inputs. Check the values and try again.";
          break;
        default:
          message = status === 422 ? "The routing service rejected these inputs. Check the values and try again." : fallback[task];
      }
      const text = [code, detail].filter(Boolean).join(" — ");
      return { message, detail: text ? text.slice(0, 300) : undefined };
    }
  }
}

// ---------------------------------------------------------------------------

export default function CommandCenter() {
  // --- Mission (operator input) ---
  const [missionFields, setMissionFields] = useState<MissionFields>(DEMO_MISSION);
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  // Vessel sent with every request: the demo vessel unless a mission was
  // configured on /mission-configuration. The objective (null = none
  // configured, keeping the original behavior) picks which of the backend's
  // three computed strategies becomes the active route once one arrives.
  const [vessel, setVessel] = useState<VesselRequest>(DEMO_VESSEL);
  const [objective, setObjective] = useState<OperationalObjective | null>(null);

  // --- Route lifecycle ---
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<OperatorError | null>(null);
  // The mission the current `route` was actually generated from — recalculation
  // must use this, not whatever is currently typed in the planner.
  const [generatedMission, setGeneratedMission] = useState<GeneratedMission | null>(null);
  const routeRequestIdRef = useRef(0);
  const recalcRequestIdRef = useRef(0);

  // --- Route-specific views. All of these belong to `route`/`generatedMission`
  // and are reset when a new route arrives. ---
  const [selectedIcebergId, setSelectedIcebergId] = useState<string | null>(null);
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<string | null>(null);
  const [recalculatedRoute, setRecalculatedRoute] = useState<RouteResponse | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateError, setRecalculateError] = useState<OperatorError | null>(null);

  // --- Mission event log: a compact, real record of state transitions this
  // session has actually gone through (see the pushMissionEvent call sites
  // below) — never fabricated for visual effect. Bounded to the most recent
  // 30 entries. ---
  const [missionEvents, setMissionEvents] = useState<MissionEvent[]>([]);
  const pushMissionEvent = useCallback((label: string, detail?: string, kind: MissionEventKind = "info") => {
    setMissionEvents((prev) => {
      // React's development-mode StrictMode double-invokes effects (mount ->
      // effect -> cleanup -> effect again), which can call this twice in a
      // row for the same real occurrence (e.g. the sea-ice load effect).
      // Collapsing an exact-duplicate that immediately follows the last
      // entry keeps the log an accurate record of distinct real events
      // rather than an artifact of that double-invocation.
      const last = prev[0];
      if (last && last.label === label && last.detail === detail) return prev;
      return [
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, atIso: new Date().toISOString(), label, detail, kind },
        ...prev,
      ].slice(0, 30);
    });
  }, []);

  // --- Shell / environment ---
  const [presentationView, setPresentationView] = useState<PresentationView>("standard");
  const [activeModule, setActiveModule] = useState("map");
  const [seaIce, setSeaIce] = useState<SeaIceGeoJSON | null>(null);
  const [seaIceError, setSeaIceError] = useState<string | null>(null);
  const [seaIceLoading, setSeaIceLoading] = useState(true);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    icebergs: true,
    trajectories: true,
    initialRoute: true,
    adaptiveRoute: true,
    seaIce: true,
  });

  const handleToggleLayer = (id: LayerId) => {
    setLayerVisibility((v) => ({ ...v, [id]: !v[id] }));
  };

  // Switching modules away from Icebergs clears any selection; selecting an
  // iceberg on the map (from any mode) switches into Icebergs mode to show it.
  const handleModuleSelect = (id: string) => {
    setActiveModule(id);
    if (id !== "icebergs") setSelectedIcebergId(null);
  };
  const handleSelectIceberg = (id: string | null) => {
    setSelectedIcebergId(id);
    if (id) setActiveModule("icebergs");
  };

  // Esc cancels map picking.
  useEffect(() => {
    if (!pickTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickTarget(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickTarget]);

  // Real adaptive re-route: calls Niharika's actual routing engine via the
  // backend's /api/route/recalculate endpoint. No simulated route change.
  // Always uses the mission the current route was generated from. The previous
  // adaptive result is cleared first, so the UI shows either the original route
  // alone, a recalculation in flight, or one fresh result — never a stale one.
  const handleRecalculate = () => {
    if (!generatedMission || routeLoading || recalculating) return;
    const requestId = ++recalcRequestIdRef.current;
    setRecalculating(true);
    setRecalculateError(null);
    setRecalculatedRoute(null);
    pushMissionEvent("Rerouting triggered", "Recalculating against each iceberg's latest recorded observation.");

    requestJson(
      RECALCULATE_API_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...generatedMission.vessel,
          start_point: generatedMission.start,
          destination: generatedMission.destination,
          initial_target_timestamp: REPLAY_TIMESTAMP,
          // Also compute the time-aware option set (see backend/routing/main.py
          // -> _build_time_aware_route_options): opt-in, additive, surfaced in
          // AdaptiveReroutingView alongside the primary static recalculation.
          time_aware: true,
        }),
      },
      isRouteResponse,
    )
      .then((data) => {
        if (requestId === recalcRequestIdRef.current) {
          setRecalculatedRoute(data);
          pushMissionEvent(
            "Adaptive route generated",
            `${data.metrics.total_distance_km.toFixed(1)} km · mean risk ${(data.metrics.mean_risk_score * 100).toFixed(2)}%`,
          );
        }
      })
      .catch((err: unknown) => {
        if (requestId === recalcRequestIdRef.current) {
          setRecalculateError(toOperatorError(err, "recalculate"));
        }
      })
      .finally(() => {
        if (requestId === recalcRequestIdRef.current) setRecalculating(false);
      });
  };

  // Generates a route for the operator's current START / DESTINATION. Only one
  // request runs at a time, and only the newest may write state. Route-specific
  // state (adaptive route, selected option, selected iceberg) is reset once the
  // new route has actually arrived, so a failed request leaves the previous
  // route and its context intact and clearly labelled as such.
  // The configured-mission handoff passes its own values, since state set in
  // the same tick is not visible here yet; the planner uses the current state.
  const generateRoute = (
    fields: MissionFields = missionFields,
    missionVessel: VesselRequest = vessel,
    missionObjective: OperationalObjective | null = objective,
  ) => {
    if (routeLoading) return;
    const validation = validateMission(fields);
    if (!validation.valid || !validation.start || !validation.destination) return;
    const mission: GeneratedMission = {
      start: validation.start,
      destination: validation.destination,
      vessel: missionVessel,
    };

    const requestId = ++routeRequestIdRef.current;
    setPickTarget(null);
    setRouteLoading(true);
    setRouteError(null);

    requestJson(
      ROUTE_API_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mission.vessel,
          start_point: mission.start,
          destination: mission.destination,
          target_timestamp: REPLAY_TIMESTAMP,
        }),
      },
      isRouteResponse,
    )
      .then((data) => {
        if (requestId !== routeRequestIdRef.current) return;
        // Invalidate any in-flight recalculation belonging to the previous mission.
        recalcRequestIdRef.current++;
        setRoute(data);
        setGeneratedMission(mission);
        setRecalculatedRoute(null);
        setRecalculating(false);
        setRecalculateError(null);
        setSelectedIcebergId(null);

        // Configured objective -> the matching real strategy from route_options.
        // Left unselected (the existing default) when no objective is set or
        // that strategy could not be solved for this mission.
        const wanted = missionObjective ? getObjective(missionObjective) : null;
        const matched = wanted
          ? (data.route_options ?? [])
              .filter(isRouteOption)
              .find((o) => classifyRouteStrategy(o.label) === wanted.strategy)
          : undefined;
        setSelectedRouteOptionId(matched?.route_id ?? null);

        pushMissionEvent(
          "Mission generated",
          `${mission.start.lat.toFixed(2)}°, ${mission.start.lon.toFixed(2)}° → ` +
            `${mission.destination.lat.toFixed(2)}°, ${mission.destination.lon.toFixed(2)}° · ${data.algorithm_used}`,
        );
        const failedStrategies = (data.route_options ?? []).filter((o) => !isRouteOption(o));
        if (failedStrategies.length > 0) {
          pushMissionEvent(
            "Hazard threshold triggered",
            `${failedStrategies.map((o) => o.label).join(", ")} — no route found under the current risk threshold`,
            "warn",
          );
        }
        if (wanted) {
          pushMissionEvent(
            matched ? "Operational objective applied" : "Operational objective unavailable",
            matched
              ? `${wanted.label} → ${routeStrategyDisplayName(matched.label)} strategy set as the active route`
              : `${wanted.label}: that strategy has no route for this mission — showing the default route`,
            matched ? "info" : "warn",
          );
        }
      })
      .catch((err: unknown) => {
        if (requestId === routeRequestIdRef.current) setRouteError(toOperatorError(err, "route"));
      })
      .finally(() => {
        if (requestId === routeRequestIdRef.current) setRouteLoading(false);
      });
  };

  // A map click while "Pick on Map" is active writes the clicked point into
  // the planner fields (rounded to 4 decimals, ~10 m), then ends picking.
  const handlePickPoint = (point: MissionPoint) => {
    const lat = point.lat.toFixed(4);
    const lon = point.lon.toFixed(4);
    setMissionFields((f) =>
      pickTarget === "start" ? { ...f, startLat: lat, startLon: lon } : { ...f, destLat: lat, destLon: lon },
    );
    setPickTarget(null);
  };

  const handleGenerateRoute = () => generateRoute();

  // Deep link from the Mission Planner's navigation (?view=overview|intelligence|rerouting).
  // Declared before the handoff below so a configured-mission handoff still
  // opens Mission Overview. Client-only, read once on mount.
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "overview" || view === "intelligence" || view === "rerouting") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresentationView(view);
    }
  }, []);

  // Handoff from /mission-configuration: adopt the configured vessel, mission
  // and objective and, when the operator pressed Generate Mission there, run
  // the normal generation for it and open Mission Overview. Client-only
  // (sessionStorage), so it runs after mount rather than as initial state.
  useEffect(() => {
    const config = loadMissionConfig();
    if (!config) return;
    const configuredVessel = toVesselRequest(config);
    /* eslint-disable react-hooks/set-state-in-effect */
    setMissionFields(config.fields);
    setVessel(configuredVessel);
    setObjective(config.objective);
    /* eslint-enable react-hooks/set-state-in-effect */
    pushMissionEvent(
      "Mission configuration loaded",
      `${configuredVessel.vessel_name} · ${configuredVessel.cruise_speed_knots.toFixed(1)} kn · ` +
        `${configuredVessel.fuel_consumption_rate_tons_per_day.toFixed(1)} t/day · ${getObjective(config.objective).label}`,
    );
    if (consumeGenerationRequest()) {
      setPresentationView("overview");
      generateRoute(config.fields, configuredVessel, config.objective);
    }
    // Mount-only handoff; generateRoute is only called here with explicit arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetDemo = () => {
    setMissionFields(DEMO_MISSION);
    setPickTarget(null);
  };

  // Real NSIDC sea-ice concentration grid (historical, 2020-01-02) — fetched
  // from the same routing server. No mock fallback on failure; retryable.
  const loadSeaIce = useCallback(() => {
    requestJson(SEA_ICE_API_URL, undefined, isSeaIceGeoJSON)
      .then((data) => {
        setSeaIce(data);
        setSeaIceError(null);
        pushMissionEvent(
          "Forecast/risk state updated",
          `NSIDC sea-ice grid loaded — ${data.metadata.cell_count} cells, ${data.metadata.timestamp.slice(0, 10)}`,
        );
      })
      .catch((err: unknown) => setSeaIceError(toOperatorError(err, "sea-ice").message))
      .finally(() => setSeaIceLoading(false));
  }, [pushMissionEvent]);

  useEffect(() => {
    loadSeaIce();
  }, [loadSeaIce]);

  const handleRetrySeaIce = () => {
    setSeaIceLoading(true);
    setSeaIceError(null);
    loadSeaIce();
  };

  // Draft markers mirror the planner's valid inputs, but are hidden once they
  // coincide with the mission that produced the current route (the generated
  // route's own start/destination markers already show those points).
  const draft = validateMission(missionFields);
  const samePoint = (a: MissionPoint | null, b: MissionPoint | undefined) =>
    !!a && !!b && a.lat === b.lat && a.lon === b.lon;
  const draftStart = samePoint(draft.start, generatedMission?.start) ? null : draft.start;
  const draftDestination = samePoint(draft.destination, generatedMission?.destination)
    ? null
    : draft.destination;

  // True when the planner's inputs no longer match the mission behind the route
  // currently drawn on the map (only meaningful once a route exists).
  const missionDirty =
    !!generatedMission &&
    (!samePoint(draft.start, generatedMission.start) || !samePoint(draft.destination, generatedMission.destination));

  // Snapped-point and warning text, straight from the route response.
  const routeNotices = describeRouteNotices(route, generatedMission);

  const isDemoMission =
    samePoint(draft.start, DEMO_POINTS.start ?? undefined) &&
    samePoint(draft.destination, DEMO_POINTS.destination ?? undefined);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-abyss bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,_rgba(13,27,34,0.75),_rgba(5,8,10,0)_60%)] text-frost">
      <TopBar />

      <div className="flex shrink-0 items-center px-4 pt-3">
        <ViewSwitcher active={presentationView} onSelect={setPresentationView} />
      </div>

      {presentationView === "standard" && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 pb-2">
          <Sidebar active={activeModule} onSelect={handleModuleSelect} />

          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
            <AntarcticMap
              heroBasemap
              route={route}
              recalculatedRoute={recalculatedRoute}
              activeModule={activeModule}
              selectedIcebergId={selectedIcebergId}
              onSelectIceberg={handleSelectIceberg}
              layerVisibility={layerVisibility}
              seaIce={seaIce}
              selectedRouteOptionId={selectedRouteOptionId}
              pickTarget={pickTarget}
              onPickPoint={handlePickPoint}
              draftStart={draftStart}
              draftDestination={draftDestination}
            />
            <BottomBar
              route={route}
              seaIce={seaIce}
              seaIceError={!!seaIceError}
              routeLoading={routeLoading}
              routeError={!!routeError}
              missionDirty={missionDirty}
            />
          </div>

          <RightPanel
            route={route}
            routeLoading={routeLoading}
            routeError={routeError}
            activeModule={activeModule}
            selectedIcebergId={selectedIcebergId}
            onDeselectIceberg={() => setSelectedIcebergId(null)}
            recalculatedRoute={recalculatedRoute}
            recalculating={recalculating}
            recalculateError={recalculateError}
            onRecalculate={handleRecalculate}
            layerVisibility={layerVisibility}
            onToggleLayer={handleToggleLayer}
            seaIce={seaIce}
            seaIceLoading={seaIceLoading}
            seaIceError={seaIceError}
            onRetrySeaIce={handleRetrySeaIce}
            selectedRouteOptionId={selectedRouteOptionId}
            onSelectRouteOption={setSelectedRouteOptionId}
            missionFields={missionFields}
            onMissionFieldsChange={setMissionFields}
            pickTarget={pickTarget}
            onPickTargetChange={setPickTarget}
            onGenerateRoute={handleGenerateRoute}
            onResetDemo={handleResetDemo}
            isDemoMission={isDemoMission}
            missionDirty={missionDirty}
            routeNotices={routeNotices}
            vessel={vessel}
            missionEvents={missionEvents}
          />
        </div>
      )}

      {presentationView === "overview" && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 pb-2">
          <MissionOverviewView
            route={route}
            routeLoading={routeLoading}
            routeError={routeError}
            recalculatedRoute={recalculatedRoute}
            seaIce={seaIce}
            selectedRouteOptionId={selectedRouteOptionId}
            onSelectRouteOption={setSelectedRouteOptionId}
            selectedIcebergId={selectedIcebergId}
            onSelectIceberg={handleSelectIceberg}
            missionFields={missionFields}
            onMissionFieldsChange={setMissionFields}
            pickTarget={pickTarget}
            onPickTargetChange={setPickTarget}
            onGenerateRoute={handleGenerateRoute}
            onResetDemo={handleResetDemo}
            isDemoMission={isDemoMission}
            missionDirty={missionDirty}
            routeNotices={routeNotices}
            vessel={vessel}
            onPickPoint={handlePickPoint}
            draftStart={draftStart}
            draftDestination={draftDestination}
            onMissionEvent={pushMissionEvent}
          />
        </div>
      )}

      {presentationView === "intelligence" && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 pb-2">
          <NavigationIntelligenceView
            route={route}
            recalculatedRoute={recalculatedRoute}
            seaIce={seaIce}
            selectedRouteOptionId={selectedRouteOptionId}
            onSelectRouteOption={setSelectedRouteOptionId}
            selectedIcebergId={selectedIcebergId}
            onSelectIceberg={handleSelectIceberg}
          />
        </div>
      )}

      {presentationView === "rerouting" && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 pb-2">
          <AdaptiveReroutingView
            route={route}
            recalculatedRoute={recalculatedRoute}
            recalculating={recalculating}
            recalculateError={recalculateError}
            onRecalculate={handleRecalculate}
            seaIce={seaIce}
            selectedIcebergId={selectedIcebergId}
            onSelectIceberg={handleSelectIceberg}
          />
        </div>
      )}

      <footer className="shrink-0 px-4 pb-2">
        <p className="font-mono text-[9px] uppercase leading-tight tracking-mission text-mist/50">
          Antarctic Research Vessel · Support System
        </p>
      </footer>
    </div>
  );
}
