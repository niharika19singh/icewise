"use client";

import Panel from "./Panel";
import RevealOnMount from "./RevealOnMount";
import type { RouteResponse } from "@/components/command-center/types";

// Composes a plain-language summary purely from the two real metric objects —
// every clause is a direct read of an actual delta, never a hardcoded claim.
function buildOutcomeStatement(initial: RouteResponse, adaptive: RouteResponse): string {
  const dDist = adaptive.metrics.total_distance_km - initial.metrics.total_distance_km;
  const dMaxRisk = (adaptive.metrics.max_risk_score - initial.metrics.max_risk_score) * 100;

  const distancePhrase =
    dDist > 0.05
      ? `increased route distance by ${dDist.toFixed(1)} km`
      : dDist < -0.05
        ? `reduced route distance by ${Math.abs(dDist).toFixed(1)} km`
        : "kept route distance effectively unchanged";

  const riskPhrase =
    dMaxRisk < -0.005
      ? `lowering maximum risk exposure by ${Math.abs(dMaxRisk).toFixed(2)} percentage points`
      : dMaxRisk > 0.005
        ? `while maximum risk exposure increased by ${dMaxRisk.toFixed(2)} percentage points`
        : "with maximum risk exposure effectively unchanged";

  return `Adaptive routing ${distancePhrase} while ${riskPhrase}, based on each iceberg's latest recorded observation. Safety index moved from ${initial.metrics.safety_index.toFixed(1)} to ${adaptive.metrics.safety_index.toFixed(1)}.`;
}

export default function MissionOutcome({
  route,
  recalculatedRoute,
}: {
  route: RouteResponse;
  recalculatedRoute: RouteResponse | null;
}) {
  return (
    <section className="border-b border-line px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <RevealOnMount>
          <p className="font-mono text-xs uppercase tracking-mission-wide text-ice">Engineering Insight</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-frost sm:text-4xl">
            Mission Outcome
          </h2>
        </RevealOnMount>

        <RevealOnMount delay={0.1}>
          <Panel className="mt-6 px-6 py-6">
            {recalculatedRoute ? (
              <p className="font-body text-base leading-relaxed text-frost/90">
                {buildOutcomeStatement(route, recalculatedRoute)}
              </p>
            ) : (
              <p className="font-body text-sm text-mist">
                Awaiting the real adaptive re-route result before a mission outcome can be reported.
              </p>
            )}
          </Panel>
        </RevealOnMount>
      </div>
    </section>
  );
}
