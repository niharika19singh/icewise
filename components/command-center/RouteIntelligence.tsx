import ErrorNotice from "./ErrorNotice";
import WhyThisRoute from "./WhyThisRoute";
import MissionThreatTimeline from "./MissionThreatTimeline";
import { routeStrategyColorFor, routeStrategyDisplayName } from "./routeStyle";
import { isRouteOption, type RouteResponse, type RouteOptionResult, type OperatorError } from "./types";

// Small colored SVG dot — the route strategy's color is the primary visual
// identifier for each row, per a real SVG icon rather than an emoji.
// Exported so WhyThisRoute.tsx and MissionThreatTimeline.tsx reuse the same
// dot instead of duplicating the SVG.
export function StrategyDot({ color }: { color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 8 8" className="h-2.5 w-2.5 shrink-0">
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      <span className="min-w-0 text-right font-mono text-sm text-frost [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

export function RoutePlanStats({ route }: { route: RouteResponse }) {
  return (
    <div>
      <Stat label="Route ID" value={route.route_id} />
      <Stat label="Algorithm" value={route.algorithm_used} />
      <Stat
        label="Distance"
        value={`${route.metrics.total_distance_km.toFixed(1)} km / ${route.metrics.total_distance_nm.toFixed(1)} nm`}
      />
      <Stat label="Est. Transit" value={`${route.metrics.estimated_time_hours.toFixed(1)} h`} />
      <Stat
        label="Est. Fuel"
        value={`${route.metrics.estimated_fuel_tons.toFixed(2)} t ($${route.metrics.estimated_fuel_cost_usd.toFixed(0)})`}
      />
      <Stat label="Mean Risk" value={`${(route.metrics.mean_risk_score * 100).toFixed(2)}%`} />
      <Stat label="Max Risk" value={`${(route.metrics.max_risk_score * 100).toFixed(2)}%`} />
      <Stat label="Safety Index" value={route.metrics.safety_index.toFixed(1)} />
      <Stat label="Waypoints" value={String(route.metrics.waypoint_count)} />
    </div>
  );
}

// Route Comparison: the 3 real route options (backend/routing/main.py ->
// _build_route_options) — same real risk engine / A* search, each computed
// independently at a different real risk_tolerance_factor. Selecting one
// highlights its actual waypoint geometry on the map — nothing here is
// reconstructed client-side. Distance, time and risk are read directly off
// each option's own `metrics`; only the color/display-name per strategy
// (routeStyle.ts) is a fixed, cosmetic mapping — never the numbers.
//
// Each card is two lines rather than one strict 4-column row: the 340px
// right panel is too narrow to fit a full strategy name plus three numeric
// columns on one line without truncating the name. Route + Risk (the
// headline comparison figure) share the top line; Distance/Est. Time/Est.
// Fuel sit on a smaller line below — all four values from the spec are still
// shown, just not force-fit into aligned table columns.
function RouteOptionsList({
  options,
  selectedId,
  onSelect,
  neon,
}: {
  options: RouteOptionResult[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  neon: boolean;
}) {
  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Route Comparison</p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-mission text-mist/60">
        Same risk engine, different risk tolerance — select to highlight on map
      </p>

      <div className="mt-3 flex items-baseline justify-between px-2.5 font-mono text-[9px] uppercase tracking-mission text-mist/50">
        <span>Route</span>
        <span>Risk</span>
      </div>

      <div className="mt-1.5 flex flex-col gap-1.5">
        {options.map((opt) => {
          const color = routeStrategyColorFor(opt.label, neon);
          const name = routeStrategyDisplayName(opt.label);

          // The backend reports a strategy it could not solve in-band, without a
          // route. Show that honestly instead of a selectable route.
          if (!isRouteOption(opt)) {
            return (
              <div
                key={opt.label}
                className="rounded border border-line/60 bg-abyss/40 py-2 pl-2.5 pr-3"
                style={{ borderLeftColor: color, borderLeftWidth: 3, opacity: 0.75 }}
              >
                <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-mission text-frost">
                  <StrategyDot color={color} />
                  {name}
                </span>
                <p className="mt-1 font-body text-[11px] leading-snug text-vessel">
                  {opt.error === "NO_ROUTE_FOUND"
                    ? "No safe route was found for this strategy."
                    : "This strategy could not be computed."}
                </p>
                {opt.detail && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-mission text-mist/70">
                      Service details
                    </summary>
                    <p className="mt-1 break-words font-mono text-[10px] leading-snug text-mist/70">
                      {opt.error} — {opt.detail.slice(0, 300)}
                    </p>
                  </details>
                )}
              </div>
            );
          }

          const isSelected = opt.route_id === selectedId;
          const isCurrentDefault = opt.label === "Balanced";
          return (
            <button
              key={opt.route_id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : opt.route_id)}
              style={{
                borderLeftColor: color,
                borderLeftWidth: 3,
                boxShadow: isSelected ? `0 0 0 1px ${color}66, 0 0 16px -6px ${color}` : undefined,
              }}
              className={`rounded border py-2 pl-2.5 pr-3 text-left transition-colors ${
                isSelected ? "border-line bg-abyss/70" : "border-line/60 bg-abyss/40 hover:bg-abyss/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-mono text-xs uppercase tracking-mission text-frost">
                  <StrategyDot color={color} />
                  <span className="truncate">{name}</span>
                  {isCurrentDefault && (
                    <span className="shrink-0 normal-case text-mist/60">(default)</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs font-medium" style={{ color }}>
                  {opt.metrics.mean_risk_score.toFixed(3)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-mist">
                <span>
                  {opt.metrics.total_distance_km.toFixed(1)} km · {opt.metrics.estimated_time_hours.toFixed(1)} h
                </span>
                <span className="normal-case text-mist/60">
                  Est. Fuel {opt.metrics.estimated_fuel_tons.toFixed(2)} t (${opt.metrics.estimated_fuel_cost_usd.toFixed(0)})
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
  busy,
  neon = false,
}: {
  route: RouteResponse;
  recalculatedRoute: RouteResponse | null;
  recalculating: boolean;
  recalculateError: OperatorError | null;
  onRecalculate: () => void;
  selectedRouteOptionId: string | null;
  onSelectRouteOption: (id: string | null) => void;
  // A new route is being generated — recalculating the old one would be wasted.
  busy: boolean;
  // Neon route palette, matching the Command Center hero map.
  neon?: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Original Route</p>
      <div className="mt-2">
        <RoutePlanStats route={route} />
      </div>

      {route.route_options && route.route_options.length > 0 && (
        <RouteOptionsList
          options={route.route_options}
          selectedId={selectedRouteOptionId}
          onSelect={onSelectRouteOption}
          neon={neon}
        />
      )}

      <WhyThisRoute route={route} selectedRouteOptionId={selectedRouteOptionId} neon={neon} />
      <MissionThreatTimeline route={route} selectedRouteOptionId={selectedRouteOptionId} />

      <button
        type="button"
        onClick={onRecalculate}
        disabled={recalculating || busy}
        className="mt-4 rounded border border-ice/40 bg-ice/5 py-2.5 font-mono text-xs uppercase tracking-mission text-ice transition-all hover:border-ice hover:bg-ice/10 hover:shadow-glow-ice-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {recalculating ? "Recalculating…" : "Recalculate Route"}
      </button>
      {recalculating && (
        <p role="status" className="mt-2 font-mono text-[10px] leading-snug tracking-mission text-ice">
          Recalculating — the original route stays on the map.
        </p>
      )}
      {recalculateError && <ErrorNotice error={recalculateError} className="mt-2" />}

      {recalculatedRoute && (
        <>
          <div className="mt-5 border-t border-line/60 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Adaptive Route (Recalculated)</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-mission text-mist/60">
              Replay update — each iceberg&apos;s latest recorded observation in the dataset
            </p>
            <div className="mt-2">
              <RoutePlanStats route={recalculatedRoute} />
            </div>
          </div>

          <AdaptiveRouteImpact route={recalculatedRoute} />

          <div className="mt-5 border-t border-line/60 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">
              Original Route | Adaptive Route
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
                label="Transit"
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
