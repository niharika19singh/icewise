import type { RouteResponse, RouteOption } from "./types";

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

// The 3 real route options (backend/routing/main.py -> _build_route_options):
// same real risk engine / A* search, each computed independently at a
// different real risk_tolerance_factor. Selecting one highlights its actual
// waypoint geometry on the map — nothing here is reconstructed client-side.
function RouteOptionsList({
  options,
  selectedId,
  onSelect,
}: {
  options: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Route Options</p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-mission text-mist/60">
        Same risk engine, different risk tolerance — select to highlight on map
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {options.map((opt) => {
          const isSelected = opt.route_id === selectedId;
          const isCurrentDefault = opt.label === "Balanced";
          return (
            <button
              key={opt.route_id}
              type="button"
              onClick={() => onSelect(isSelected ? null : opt.route_id)}
              className={`rounded border px-3 py-2 text-left transition-colors ${
                isSelected ? "border-ice bg-ice/10" : "border-line/60 bg-abyss/40 hover:border-ice/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase tracking-mission text-frost">
                  {opt.label}
                  {isCurrentDefault && <span className="ml-1.5 normal-case text-mist">(current default)</span>}
                </span>
                {isSelected && (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-mission text-ice">
                    Selected
                  </span>
                )}
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-mist">
                <span>
                  Dist <span className="text-frost">{opt.metrics.total_distance_km.toFixed(1)} km</span>
                </span>
                <span>
                  Time <span className="text-frost">{opt.metrics.estimated_time_hours.toFixed(1)} h</span>
                </span>
                <span>
                  Fuel{" "}
                  <span className="text-frost">
                    {opt.metrics.estimated_fuel_tons.toFixed(2)} t (${opt.metrics.estimated_fuel_cost_usd.toFixed(0)})
                  </span>
                </span>
                <span>
                  Mean Risk <span className="text-frost">{(opt.metrics.mean_risk_score * 100).toFixed(2)}%</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatSignedPct(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

// The adaptive route's own fuel/risk standing against the unconstrained
// shortest-path baseline the routing engine computes internally
// (backend/routing/icewise/metrics.py -> calculate_route_comparison) — read
// directly off the API response, nothing recalculated client-side. Renders
// nothing until that comparison is actually present.
function AdaptiveRouteImpact({ route }: { route: RouteResponse }) {
  const { fuel_change_pct, risk_reduction_pct } = route.metrics;
  if (fuel_change_pct == null || risk_reduction_pct == null) return null;

  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">
        Adaptive Route Impact
      </p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-mission text-mist/60">
        Vs. unconstrained shortest-path baseline
      </p>
      <div className="mt-2">
        <Stat label="Fuel vs Baseline" value={formatSignedPct(fuel_change_pct)} />
        <Stat label="Risk Reduction vs Baseline" value={formatSignedPct(risk_reduction_pct)} />
      </div>
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
  selectedRouteOptionId,
  onSelectRouteOption,
}: {
  route: RouteResponse;
  recalculatedRoute: RouteResponse | null;
  recalculating: boolean;
  recalculateError: string | null;
  onRecalculate: () => void;
  selectedRouteOptionId: string | null;
  onSelectRouteOption: (id: string | null) => void;
}) {
  return (
    <div className="mt-4 flex flex-col">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Initial Plan</p>
      <div className="mt-2">
        <RoutePlanStats route={route} />
      </div>

      {route.route_options && route.route_options.length > 0 && (
        <RouteOptionsList
          options={route.route_options}
          selectedId={selectedRouteOptionId}
          onSelect={onSelectRouteOption}
        />
      )}

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

          <AdaptiveRouteImpact route={recalculatedRoute} />

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
