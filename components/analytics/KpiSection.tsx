"use client";

import Panel from "./Panel";
import RevealOnMount from "./RevealOnMount";
import { useCountUp } from "./useCountUp";
import type { RouteResponse } from "@/components/command-center/types";

function Kpi({
  label,
  value,
  unit,
  annotation,
  decimals = 1,
  delay = 0,
}: {
  label: string;
  value: number;
  unit: string;
  annotation: string;
  decimals?: number;
  delay?: number;
}) {
  const animated = useCountUp(value, true, 1100);

  return (
    <RevealOnMount delay={delay}>
      <Panel className="h-full px-5 py-6">
        <p className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</p>
        <p className="mt-3 font-display text-4xl font-medium tabular-nums text-frost drop-shadow-[0_0_18px_rgba(143,217,224,0.25)] sm:text-5xl">
          {animated.toFixed(decimals)}
          <span className="ml-1.5 font-mono text-base font-normal text-ice">{unit}</span>
        </p>
        <p className="mt-3 font-mono text-[11px] text-mist">{annotation}</p>
      </Panel>
    </RevealOnMount>
  );
}

export default function KpiSection({ route }: { route: RouteResponse }) {
  const m = route.metrics;

  return (
    <section className="border-b border-line px-6 py-14 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <RevealOnMount>
          <p className="font-mono text-xs uppercase tracking-mission-wide text-ice">Instrument Readout</p>
          <h2 className="mt-2 font-display text-2xl font-medium tracking-tight text-frost sm:text-3xl">
            Initial plan, at a glance.
          </h2>
        </RevealOnMount>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="Total Distance"
            value={m.total_distance_km}
            unit="km"
            annotation={`${m.total_distance_nm.toFixed(1)} nm`}
            delay={0}
          />
          <Kpi
            label="Estimated ETA"
            value={m.estimated_time_hours}
            unit="h"
            annotation={`${m.waypoint_count} waypoints`}
            delay={0.06}
          />
          <Kpi
            label="Fuel Consumption"
            value={m.estimated_fuel_tons}
            unit="t"
            decimals={2}
            annotation={`$${m.estimated_fuel_cost_usd.toFixed(0)} usd`}
            delay={0.12}
          />
          <Kpi
            label="Mean Risk"
            value={m.mean_risk_score * 100}
            unit="%"
            decimals={2}
            annotation={`max ${(m.max_risk_score * 100).toFixed(2)}%`}
            delay={0.18}
          />
          <Kpi
            label="Safety Index"
            value={m.safety_index}
            unit="/100"
            annotation={route.algorithm_used}
            delay={0.24}
          />
        </div>
      </div>
    </section>
  );
}
