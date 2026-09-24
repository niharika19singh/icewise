import { StrategyDot } from "./RouteIntelligence";
import { routeStrategyColorFor, routeStrategyDisplayName } from "./routeStyle";
import { computeTradeoffs, pickActiveStrategy, type RouteTradeoff } from "./missionAnalysis";
import type { RouteResponse } from "./types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      <span className="min-w-0 text-right font-mono text-sm text-frost [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

function formatSigned(value: number, unit: string, decimals: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(decimals)}${unit}`;
}

function TradeoffRow({ tradeoff, neon }: { tradeoff: RouteTradeoff; neon: boolean }) {
  const color = routeStrategyColorFor(tradeoff.label, neon);
  const name = routeStrategyDisplayName(tradeoff.label);
  return (
    <div
      className="rounded border border-line/60 bg-abyss/40 py-2 pl-2.5 pr-3"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-mission text-mist">
          <StrategyDot color={color} />
          vs {name}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-frost">
          {formatSigned(tradeoff.meanRiskDeltaPct, " pp risk", 2)}
        </span>
      </div>
      <div className="mt-1 font-mono text-[10px] normal-case text-mist">
        {formatSigned(tradeoff.distanceDeltaKm, " km", 1)} · {formatSigned(tradeoff.timeDeltaHours, " h", 1)} ·{" "}
        {formatSigned(tradeoff.fuelDeltaTons, " t fuel", 2)}
      </div>
    </div>
  );
}

// Explains the currently active strategy (the operator's explicit pick from
// Route Comparison, else the real "Balanced" default) using only the real
// metrics attached to route.route_options — every distance/time/fuel/risk
// figure below is read directly off the API response or is a plain
// subtraction between two of its own numbers. Renders nothing when the
// backend did not send route_options (recalculated/adaptive results, or an
// older API response) — there is nothing honest to compare in that case.
export default function WhyThisRoute({
  route,
  selectedRouteOptionId,
  neon = false,
}: {
  route: RouteResponse;
  selectedRouteOptionId: string | null;
  // Neon route palette (Command Center hero map); default keeps the standard colors.
  neon?: boolean;
}) {
  const active = pickActiveStrategy(route.route_options, selectedRouteOptionId);
  if (!active) return null;

  const color = routeStrategyColorFor(active.label, neon);
  const name = routeStrategyDisplayName(active.label);
  const tradeoffs = computeTradeoffs(active, route.route_options ?? []);

  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Why This Route</p>
      <p className="mt-1 flex items-center gap-2 font-mono text-xs uppercase tracking-mission text-frost">
        <StrategyDot color={color} />
        {name}
      </p>

      <div className="mt-2">
        <Stat label="Distance" value={`${active.metrics.total_distance_km.toFixed(1)} km`} />
        <Stat label="Mean Risk" value={`${(active.metrics.mean_risk_score * 100).toFixed(2)}%`} />
        <Stat label="Est. ETA" value={`+${active.metrics.estimated_time_hours.toFixed(1)} h`} />
      </div>

      {tradeoffs.length > 0 && (
        <>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-mission text-mist/60">
            Vs. the other strategies — same risk engine, different risk tolerance
          </p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {tradeoffs.map((t) => (
              <TradeoffRow key={t.routeId} tradeoff={t} neon={neon} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
