"use client";

import { useState } from "react";
import AntarcticMap from "./AntarcticMap";
import MissionPlanner, { type MissionFields, type PickTarget, type MissionPoint } from "./MissionPlanner";
import type { VesselRequest } from "./replay";
import MissionReplay from "./MissionReplay";
import { StrategyDot } from "./RouteIntelligence";
import { routeStrategyColorFor, routeStrategyDisplayName } from "./routeStyle";
import type { RouteNotices } from "./routeNotices";
import type { MissionEventKind } from "./MissionEventLog";
import {
  isRouteOption,
  type RouteResponse,
  type LayerVisibility,
  type OperatorError,
  type SeaIceGeoJSON,
} from "./types";

// "Where is the vessel going?" — the map IS the product here. A dominant,
// near-full-bleed map with the real start/destination/3-strategy geometry,
// and a slim column for the two things a navigator actually needs beside
// it: the mission inputs, and each strategy's real headline numbers. No
// iceberg/sea-ice detail panels, no scenario-status tiles, no layer
// controls — those belong to the full Command Center, not this view.
export default function MissionOverviewView({
  route,
  routeLoading,
  routeError,
  recalculatedRoute,
  seaIce,
  selectedRouteOptionId,
  onSelectRouteOption,
  selectedIcebergId,
  onSelectIceberg,
  missionFields,
  onMissionFieldsChange,
  pickTarget,
  onPickTargetChange,
  onGenerateRoute,
  onResetDemo,
  isDemoMission,
  missionDirty,
  routeNotices,
  vessel,
  onPickPoint,
  draftStart,
  draftDestination,
  onMissionEvent,
}: {
  route: RouteResponse | null;
  routeLoading: boolean;
  routeError: OperatorError | null;
  recalculatedRoute: RouteResponse | null;
  seaIce: SeaIceGeoJSON | null;
  selectedRouteOptionId: string | null;
  onSelectRouteOption: (id: string | null) => void;
  selectedIcebergId: string | null;
  onSelectIceberg: (id: string | null) => void;
  missionFields: MissionFields;
  onMissionFieldsChange: (fields: MissionFields) => void;
  pickTarget: PickTarget;
  onPickTargetChange: (target: PickTarget) => void;
  onGenerateRoute: () => void;
  onResetDemo: () => void;
  isDemoMission: boolean;
  missionDirty: boolean;
  routeNotices: RouteNotices;
  vessel: VesselRequest;
  onPickPoint: (point: MissionPoint) => void;
  draftStart: MissionPoint | null;
  draftDestination: MissionPoint | null;
  onMissionEvent: (label: string, detail?: string, kind?: MissionEventKind) => void;
}) {
  const layerVisibility: LayerVisibility = {
    icebergs: true,
    trajectories: false,
    initialRoute: true,
    adaptiveRoute: false,
    seaIce: false,
  };
  const strategies = (route?.route_options ?? []).filter(isRouteOption);

  // Mission replay time: local to this view (only Mission Overview drives
  // the map's moving vessel/iceberg markers). Reset to a fresh, paused
  // replay whenever a genuinely new route arrives, so switching missions or
  // regenerating never leaves a stale replay position or a still-running
  // playback pointed at data that no longer matches what's on screen. Reset
  // during render (React's documented pattern for "adjusting state when a
  // prop changes") rather than in an effect, which would cost an extra
  // render/commit and briefly show the previous mission's replay position.
  const [prevRouteId, setPrevRouteId] = useState(route?.route_id);
  const [replayTimeHours, setReplayTimeHours] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  if (route?.route_id !== prevRouteId) {
    setPrevRouteId(route?.route_id);
    setReplayTimeHours(0);
    setReplayPlaying(false);
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-[3] flex-col gap-3">
        <AntarcticMap
          heroBasemap
          route={route}
          recalculatedRoute={recalculatedRoute}
          activeModule="routes"
          selectedIcebergId={selectedIcebergId}
          onSelectIceberg={onSelectIceberg}
          layerVisibility={layerVisibility}
          seaIce={seaIce}
          selectedRouteOptionId={selectedRouteOptionId}
          pickTarget={pickTarget}
          onPickPoint={onPickPoint}
          draftStart={draftStart}
          draftDestination={draftDestination}
          replayTimeHours={route ? replayTimeHours : null}
        />
        {route && (
          <MissionReplay
            route={route}
            timeHours={replayTimeHours}
            playing={replayPlaying}
            onTimeChange={setReplayTimeHours}
            onPlayingChange={setReplayPlaying}
            onRouteCompleted={() =>
              onMissionEvent(
                "Route completed",
                `Mission replay reached the route's estimated arrival (+${route.metrics.estimated_time_hours.toFixed(1)}h).`,
              )
            }
          />
        )}
      </div>

      <aside className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto">
        <MissionPlanner
          fields={missionFields}
          onChange={onMissionFieldsChange}
          pickTarget={pickTarget}
          onPickTargetChange={onPickTargetChange}
          onGenerate={onGenerateRoute}
          onResetDemo={onResetDemo}
          isDemoMission={isDemoMission}
          loading={routeLoading}
          error={routeError}
          hasRoute={!!route}
          dirty={missionDirty}
          notices={routeNotices}
          vessel={vessel}
        />

        {route && strategies.length > 0 && (
          <div className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-4 backdrop-blur-md">
            <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">Route Strategies</h3>
            <div className="mt-2 flex flex-col">
              {strategies.map((opt) => {
                const color = routeStrategyColorFor(opt.label, true);
                const name = routeStrategyDisplayName(opt.label);
                const isSelected = opt.route_id === selectedRouteOptionId;
                return (
                  <button
                    key={opt.route_id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectRouteOption(isSelected ? null : opt.route_id)}
                    className={`flex items-center justify-between gap-2 border-b border-line/40 py-2 text-left last:border-b-0 ${
                      isSelected ? "text-ice-bright" : "text-frost hover:text-ice"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-mission">
                      <StrategyDot color={color} />
                      {name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-mist">
                      {opt.metrics.total_distance_km.toFixed(0)} km · {(opt.metrics.mean_risk_score * 100).toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
