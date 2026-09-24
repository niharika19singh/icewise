import LayerControls from "./LayerControls";
import IcebergIntelligence from "./IcebergIntelligence";
import RouteIntelligence, { RoutePlanStats } from "./RouteIntelligence";
import SeaIceIntelligence from "./SeaIceIntelligence";
import MissionPlanner, { type MissionFields, type PickTarget } from "./MissionPlanner";
import type { VesselRequest } from "./replay";
import MissionEventLog, { type MissionEvent } from "./MissionEventLog";
import type { RouteNotices } from "./routeNotices";
import type { RouteResponse, LayerId, LayerVisibility, SeaIceGeoJSON, OperatorError } from "./types";

export default function RightPanel({
  route,
  routeLoading,
  routeError,
  activeModule,
  selectedIcebergId,
  onDeselectIceberg,
  recalculatedRoute,
  recalculating,
  recalculateError,
  onRecalculate,
  layerVisibility,
  onToggleLayer,
  seaIce,
  seaIceLoading,
  seaIceError,
  onRetrySeaIce,
  selectedRouteOptionId,
  onSelectRouteOption,
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
  missionEvents,
}: {
  route: RouteResponse | null;
  routeLoading: boolean;
  routeError: OperatorError | null;
  activeModule: string;
  selectedIcebergId: string | null;
  onDeselectIceberg: () => void;
  recalculatedRoute: RouteResponse | null;
  recalculating: boolean;
  recalculateError: OperatorError | null;
  onRecalculate: () => void;
  layerVisibility: LayerVisibility;
  onToggleLayer: (id: LayerId) => void;
  seaIce: SeaIceGeoJSON | null;
  seaIceLoading: boolean;
  seaIceError: string | null;
  onRetrySeaIce: () => void;
  selectedRouteOptionId: string | null;
  onSelectRouteOption: (id: string | null) => void;
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
  missionEvents: MissionEvent[];
}) {
  const icebergsMode = activeModule === "icebergs";
  const routesMode = activeModule === "routes";
  const seaIceMode = activeModule === "sea-ice";

  let header: string;
  if (icebergsMode) header = selectedIcebergId ? `Iceberg ${selectedIcebergId}` : "Iceberg Intelligence";
  else if (routesMode) header = "Route Intelligence";
  else if (seaIceMode) header = "Sea Ice Intelligence";
  else if (route) header = "Route Overview";
  else header = "Mission Status";

  // Route-derived panels (not sea ice, not the empty state) describe `route`.
  // Flag them when that route is out of date, so they are never read as the
  // answer for the inputs currently typed in the planner.
  const describesRoute = !!route && !seaIceMode;
  const routeNote = !describesRoute
    ? null
    : routeLoading
      ? "Updating…"
      : missionDirty
        ? "Inputs edited"
        : null;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto">
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
      <div
        aria-busy={routeLoading && describesRoute}
        className={`shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-5 backdrop-blur-md transition-opacity ${
          routeLoading && describesRoute ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">{header}</h3>
          {routeNote && (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-mission text-vessel">{routeNote}</span>
          )}
        </div>

        {icebergsMode ? (
          route ? (
            <IcebergIntelligence
              route={route}
              selectedIcebergId={selectedIcebergId}
              onDeselect={onDeselectIceberg}
            />
          ) : (
            <PlaceholderBody loading={routeLoading} failed={!!routeError} />
          )
        ) : routesMode ? (
          route ? (
            <RouteIntelligence
              route={route}
              recalculatedRoute={recalculatedRoute}
              recalculating={recalculating}
              recalculateError={recalculateError}
              onRecalculate={onRecalculate}
              selectedRouteOptionId={selectedRouteOptionId}
              onSelectRouteOption={onSelectRouteOption}
              busy={routeLoading}
              neon
            />
          ) : (
            <PlaceholderBody loading={routeLoading} failed={!!routeError} />
          )
        ) : seaIceMode ? (
          <SeaIceIntelligence
            seaIce={seaIce}
            loading={seaIceLoading}
            error={seaIceError}
            onRetry={onRetrySeaIce}
            usedInRouting={route?.sea_ice_integrated}
          />
        ) : route ? (
          <div className="mt-4">
            <RoutePlanStats route={route} />
          </div>
        ) : (
          <PlaceholderBody loading={routeLoading} failed={!!routeError} />
        )}
      </div>

      <LayerControls
        visibility={layerVisibility}
        onToggle={onToggleLayer}
        activeModule={activeModule}
        hasAdaptiveRoute={!!recalculatedRoute}
        hasSeaIce={!!seaIce}
      />

      <div className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-5 backdrop-blur-md">
        <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">Mission Event Log</h3>
        <MissionEventLog events={missionEvents} />
      </div>
    </aside>
  );
}

function PlaceholderBody({ loading, failed }: { loading: boolean; failed: boolean }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-frost/20"
      >
        <span className="h-5 w-5 border border-frost/30" />
      </span>
      <p className="font-body text-sm text-frost/80">
        {loading ? "Generating route…" : failed ? "Route unavailable" : "No route generated yet"}
      </p>
      <p className="max-w-[220px] font-body text-xs leading-relaxed text-mist">
        {loading
          ? "Running the routing engine for the selected mission."
          : failed
            ? "The last request failed — see the Mission Planner above."
            : "Set a start and destination above, then press Generate Route. Iceberg, route and sea-ice details appear here."}
      </p>
    </div>
  );
}
