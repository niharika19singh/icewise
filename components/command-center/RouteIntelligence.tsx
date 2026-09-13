import type { RouteResponse } from "./types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      <span className="font-mono text-sm text-frost">{value}</span>
    </div>
  );
}

function RoutePlanStats({ route }: { route: RouteResponse }) {
  return (
    <div>
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
  );
}

// Every number here is (initial or recalculated) - (the other) computed from
// the two real API responses. No recommendation is implied by sign or color.
function ComparisonRow({
  label,
  a,
  b,
  unit,
  decimals,
}: {
  label: string;
  a: number;
  b: number;
  unit: string;
  decimals: number;
}) {
  const delta = b - a;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const deltaLabel = `${sign}${Math.abs(delta).toFixed(decimals)}${unit}`;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      <span className="flex items-baseline gap-2 font-mono text-xs text-frost">
        <span className="text-mist">
          {a.toFixed(decimals)}
          {unit} → {b.toFixed(decimals)}
          {unit}
        </span>
        <span>({deltaLabel})</span>
      </span>
    </div>
  );
}

// Real Route Intelligence view for the ROUTES mode: the initial plan's stats,
// a "Recalculate Route" control that calls Niharika's actual routing engine
// via the backend, and — once a recalculated result exists — a side-by-side
// comparison computed purely from the two real API responses.
export default function RouteIntelligence({
  route,
  recalculatedRoute,
  recalculating,
  recalculateError,
  onRecalculate,
}: {
  route: RouteResponse;
  recalculatedRoute: RouteResponse | null;
  recalculating: boolean;
  recalculateError: string | null;
  onRecalculate: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Initial Plan</p>
      <div className="mt-2">
        <RoutePlanStats route={route} />
      </div>

      <button
        type="button"
        onClick={onRecalculate}
        disabled={recalculating}
        className="mt-4 rounded border border-ice/40 bg-ice/5 py-2.5 font-mono text-xs uppercase tracking-mission text-ice transition-colors hover:border-ice hover:bg-ice/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {recalculating ? "Recalculating…" : "Recalculate Route"}
      </button>
      {recalculateError && <p className="mt-2 font-body text-xs text-mist">{recalculateError}</p>}

      {recalculatedRoute && (
        <>
          <div className="mt-5 border-t border-line/60 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Adaptive Re-Route</p>
            <div className="mt-2">
              <RoutePlanStats route={recalculatedRoute} />
            </div>
          </div>

          <div className="mt-5 border-t border-line/60 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">
              Initial Plan | Adaptive Re-Route
            </p>
            <div className="mt-2">
              <ComparisonRow
                label="Distance"
                a={route.metrics.total_distance_km}
                b={recalculatedRoute.metrics.total_distance_km}
                unit=" km"
                decimals={1}
              />
              <ComparisonRow
                label="ETA"
                a={route.metrics.estimated_time_hours}
                b={recalculatedRoute.metrics.estimated_time_hours}
                unit=" h"
                decimals={1}
              />
              <ComparisonRow
                label="Fuel"
                a={route.metrics.estimated_fuel_tons}
                b={recalculatedRoute.metrics.estimated_fuel_tons}
                unit=" t"
                decimals={2}
              />
              <ComparisonRow
                label="Mean Risk"
                a={route.metrics.mean_risk_score * 100}
                b={recalculatedRoute.metrics.mean_risk_score * 100}
                unit="%"
                decimals={2}
              />
              <ComparisonRow
                label="Max Risk"
                a={route.metrics.max_risk_score * 100}
                b={recalculatedRoute.metrics.max_risk_score * 100}
                unit="%"
                decimals={2}
              />
              <ComparisonRow
                label="Safety Index"
                a={route.metrics.safety_index}
                b={recalculatedRoute.metrics.safety_index}
                unit=""
                decimals={1}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
