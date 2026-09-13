"use client";

import Panel from "./Panel";
import RevealOnMount from "./RevealOnMount";
import type { RouteResponse } from "@/components/command-center/types";

type Direction = "lowerIsBetter" | "higherIsBetter";

function ComparisonBar({
  label,
  initial,
  adaptive,
  unit,
  decimals,
  direction,
  delay,
}: {
  label: string;
  initial: number;
  adaptive: number;
  unit: string;
  decimals: number;
  direction: Direction;
  delay: number;
}) {
  const maxVal = Math.max(initial, adaptive, 1e-9);
  const initialPct = (initial / maxVal) * 100;
  const adaptivePct = (adaptive / maxVal) * 100;

  const delta = adaptive - initial;
  const increased = delta > 1e-9;
  const decreased = delta < -1e-9;
  const isCost = direction === "lowerIsBetter" ? increased : decreased;
  const deltaColor = delta === 0 ? "text-mist" : isCost ? "text-vessel" : "text-ice";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const pctDelta = initial !== 0 ? (Math.abs(delta) / Math.abs(initial)) * 100 : null;

  return (
    <RevealOnMount delay={delay}>
      <div className="py-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-mission text-mist">{label}</span>
          <span className={`font-mono text-xs ${deltaColor}`}>
            {sign}
            {Math.abs(delta).toFixed(decimals)}
            {unit}
            {pctDelta !== null && ` (${sign}${pctDelta.toFixed(1)}%)`}
          </span>
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-mist">Initial</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-frost/10">
              <div className="h-full rounded-full bg-frost/50" style={{ width: `${initialPct}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-xs text-frost">
              {initial.toFixed(decimals)}
              {unit}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-ice">Adaptive</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-frost/10">
              <div
                className={`h-full rounded-full ${isCost ? "bg-vessel" : "bg-ice"}`}
                style={{ width: `${adaptivePct}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-xs text-frost">
              {adaptive.toFixed(decimals)}
              {unit}
            </span>
          </div>
        </div>
      </div>
    </RevealOnMount>
  );
}

export default function AdaptiveRoutePerformance({
  route,
  recalculatedRoute,
  recalculating,
  recalculateError,
}: {
  route: RouteResponse;
  recalculatedRoute: RouteResponse | null;
  recalculating: boolean;
  recalculateError: string | null;
}) {
  return (
    <section className="border-b border-line px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <RevealOnMount>
          <p className="font-mono text-xs uppercase tracking-mission-wide text-ice">Adaptive Route Performance</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-frost sm:text-4xl">
            Initial Plan <span className="text-mist">vs.</span> Adaptive Re-Route
          </h2>
          <p className="mt-4 max-w-2xl font-body text-sm leading-relaxed text-mist">
            The adaptive re-route is computed by Niharika&apos;s real routing engine against each iceberg&apos;s
            latest recorded observation — not a simulated third alternative.
          </p>
        </RevealOnMount>

        <Panel className="mt-8 px-6 py-2">
          {recalculatedRoute ? (
            <>
              <ComparisonBar
                label="Distance"
                initial={route.metrics.total_distance_km}
                adaptive={recalculatedRoute.metrics.total_distance_km}
                unit=" km"
                decimals={1}
                direction="lowerIsBetter"
                delay={0}
              />
              <ComparisonBar
                label="ETA"
                initial={route.metrics.estimated_time_hours}
                adaptive={recalculatedRoute.metrics.estimated_time_hours}
                unit=" h"
                decimals={1}
                direction="lowerIsBetter"
                delay={0.05}
              />
              <ComparisonBar
                label="Fuel"
                initial={route.metrics.estimated_fuel_tons}
                adaptive={recalculatedRoute.metrics.estimated_fuel_tons}
                unit=" t"
                decimals={2}
                direction="lowerIsBetter"
                delay={0.1}
              />
              <ComparisonBar
                label="Mean Risk"
                initial={route.metrics.mean_risk_score * 100}
                adaptive={recalculatedRoute.metrics.mean_risk_score * 100}
                unit="%"
                decimals={2}
                direction="lowerIsBetter"
                delay={0.15}
              />
              <ComparisonBar
                label="Max Risk"
                initial={route.metrics.max_risk_score * 100}
                adaptive={recalculatedRoute.metrics.max_risk_score * 100}
                unit="%"
                decimals={2}
                direction="lowerIsBetter"
                delay={0.2}
              />
              <ComparisonBar
                label="Safety Index"
                initial={route.metrics.safety_index}
                adaptive={recalculatedRoute.metrics.safety_index}
                unit=""
                decimals={1}
                direction="higherIsBetter"
                delay={0.25}
              />
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="font-body text-sm text-frost/80">
                {recalculating
                  ? "Calling the real routing engine for an adaptive re-route…"
                  : recalculateError
                    ? "Adaptive re-route unavailable."
                    : "Loading adaptive re-route from the real routing engine…"}
              </p>
              {recalculateError && <p className="mt-2 font-mono text-xs text-mist">{recalculateError}</p>}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
