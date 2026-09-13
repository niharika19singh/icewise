"use client";

import Panel from "./Panel";
import RevealOnMount from "./RevealOnMount";
import type { RouteResponse } from "@/components/command-center/types";

// A real segmented radial gauge — the arc fraction is the actual value/100,
// nothing decorative added beyond the gauge chrome itself.
function RadialGauge({ value, label }: { value: number; label: string }) {
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, Math.max(0, value / 100));
  const dashOffset = circumference * (1 - fraction);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(143,217,224,0.12)" strokeWidth="8" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="#8fd9e0"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ filter: "drop-shadow(0 0 6px rgba(143,217,224,0.55))" }}
        />
      </svg>
      <div className="-mt-[5.5rem] flex flex-col items-center">
        <span className="font-display text-3xl font-medium text-frost">{value.toFixed(1)}</span>
        <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      </div>
    </div>
  );
}

function RiskBar({ label, valuePct }: { label: string; valuePct: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
        <span className="font-mono text-sm text-frost">{valuePct.toFixed(2)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-frost/10">
        <div
          className="h-full rounded-full bg-ice"
          style={{ width: `${Math.min(100, valuePct)}%`, boxShadow: "0 0 8px rgba(143,217,224,0.5)" }}
        />
      </div>
    </div>
  );
}

export default function RiskIntelligence({ route }: { route: RouteResponse }) {
  const m = route.metrics;

  return (
    <section className="border-b border-line px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <RevealOnMount>
          <p className="font-mono text-xs uppercase tracking-mission-wide text-ice">Risk Intelligence</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-frost sm:text-4xl">
            Route risk, at a glance.
          </h2>
        </RevealOnMount>

        <RevealOnMount delay={0.1}>
          <Panel className="mt-8 grid grid-cols-1 gap-8 px-6 py-8 sm:grid-cols-2">
            <div className="flex items-center justify-center">
              <RadialGauge value={m.safety_index} label="Safety Index" />
            </div>
            <div className="flex flex-col justify-center gap-5">
              <RiskBar label="Mean Risk" valuePct={m.mean_risk_score * 100} />
              <RiskBar label="Max Risk" valuePct={m.max_risk_score * 100} />
              <div className="flex items-baseline justify-between border-t border-line/60 pt-3">
                <span className="font-mono text-[10px] uppercase tracking-mission text-mist">
                  Relevant Icebergs
                </span>
                <span className="font-mono text-sm text-frost">{route.icebergs.length}</span>
              </div>
            </div>
          </Panel>
        </RevealOnMount>
      </div>
    </section>
  );
}
