import LayerControls from "./LayerControls";
import IcebergIntelligence from "./IcebergIntelligence";
import RouteIntelligence from "./RouteIntelligence";
import type { RouteResponse } from "./types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      <span className="font-mono text-sm text-frost">{value}</span>
    </div>
  );
}

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
}: {
  route: RouteResponse | null;
  routeLoading: boolean;
  routeError: string | null;
  activeModule: string;
  selectedIcebergId: string | null;
  onDeselectIceberg: () => void;
  recalculatedRoute: RouteResponse | null;
  recalculating: boolean;
  recalculateError: string | null;
  onRecalculate: () => void;
}) {
  const icebergsMode = activeModule === "icebergs";
  const routesMode = activeModule === "routes";

  let header = "Selected Object";
  if (icebergsMode) header = selectedIcebergId ? `Iceberg ${selectedIcebergId}` : "Iceberg Intelligence";
  else if (routesMode) header = "Route Intelligence";
  else if (route) header = "Route Overview";

  return (
    <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto">
      <div className="rounded-lg border border-line bg-abyss-raised/60 p-5">
        <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">{header}</h3>

        {icebergsMode ? (
          route ? (
            <IcebergIntelligence
              route={route}
              selectedIcebergId={selectedIcebergId}
              onDeselect={onDeselectIceberg}
            />
          ) : (
            <PlaceholderBody loading={routeLoading} error={routeError} />
          )
        ) : routesMode ? (
          route ? (
            <RouteIntelligence
              route={route}
              recalculatedRoute={recalculatedRoute}
              recalculating={recalculating}
              recalculateError={recalculateError}
              onRecalculate={onRecalculate}
            />
          ) : (
            <PlaceholderBody loading={routeLoading} error={routeError} />
          )
        ) : route ? (
          <div className="mt-4 flex flex-col">
            <Stat label="Route ID" value={route.route_id} />
            <Stat label="Algorithm" value={route.algorithm_used} />
            <Stat
              label="Distance"
              value={`${route.metrics.total_distance_km.toFixed(1)} km / ${route.metrics.total_distance_nm.toFixed(1)} nm`}
            />
            <Stat label="ETA" value={`${route.metrics.estimated_time_hours.toFixed(1)} h`} />
            <Stat
              label="Fuel"
              value={`${route.metrics.estimated_fuel_tons.toFixed(2)} t ($${route.metrics.estimated_fuel_cost_usd.toFixed(0)})`}
            />
            <Stat label="Mean Risk" value={`${(route.metrics.mean_risk_score * 100).toFixed(2)}%`} />
            <Stat label="Max Risk" value={`${(route.metrics.max_risk_score * 100).toFixed(2)}%`} />
            <Stat label="Safety Index" value={route.metrics.safety_index.toFixed(1)} />
            <Stat label="Waypoints" value={String(route.metrics.waypoint_count)} />
          </div>
        ) : (
          <PlaceholderBody loading={routeLoading} error={routeError} />
        )}
      </div>

      <LayerControls />
    </aside>
  );
}

function PlaceholderBody({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-frost/20"
      >
        <span className="h-5 w-5 border border-frost/30" />
      </span>
      <p className="font-body text-sm text-frost/80">
        {loading ? "Fetching real route data…" : error ? "Route unavailable" : "No object selected"}
      </p>
      <p className="max-w-[220px] font-body text-xs leading-relaxed text-mist">
        {error ?? "Click on an iceberg, route or area to view details."}
      </p>
    </div>
  );
}
