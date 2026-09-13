"use client";

import Panel from "./Panel";
import RevealOnMount from "./RevealOnMount";
import type { RouteResponse, C18BValidation } from "@/components/command-center/types";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</p>
      <p className="font-display text-2xl font-medium text-frost">{value}</p>
    </div>
  );
}

export default function PredictionIntelligence({
  route,
  validation,
  validationError,
}: {
  route: RouteResponse;
  validation: C18BValidation | null;
  validationError: string | null;
}) {
  const icebergs = route.icebergs;
  const horizons = icebergs.flatMap((ib) => ib.predicted_positions.map((p) => p.time_offset_hours));
  const maxHorizon = horizons.length > 0 ? Math.max(...horizons) : null;
  const meanConfidence =
    icebergs.length > 0 ? icebergs.reduce((sum, ib) => sum + ib.confidence_score, 0) / icebergs.length : null;
  const meanUncertainty =
    icebergs.length > 0
      ? icebergs.reduce((sum, ib) => sum + ib.spatial_uncertainty_km, 0) / icebergs.length
      : null;

  return (
    <section className="border-b border-line px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <RevealOnMount>
          <p className="font-mono text-xs uppercase tracking-mission-wide text-ice">Prediction Intelligence</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-frost sm:text-4xl">
            What the model actually sees.
          </h2>
        </RevealOnMount>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RevealOnMount delay={0}>
            <Panel className="h-full px-5 py-5">
              <Metric label="Icebergs Tracked" value={String(icebergs.length)} />
            </Panel>
          </RevealOnMount>
          <RevealOnMount delay={0.05}>
            <Panel className="h-full px-5 py-5">
              <Metric label="Prediction Horizon" value={maxHorizon !== null ? `+${maxHorizon}h` : "N/A"} />
            </Panel>
          </RevealOnMount>
          <RevealOnMount delay={0.1}>
            <Panel className="h-full px-5 py-5">
              <Metric
                label="Mean Confidence"
                value={meanConfidence !== null ? `${(meanConfidence * 100).toFixed(1)}%` : "N/A"}
              />
            </Panel>
          </RevealOnMount>
          <RevealOnMount delay={0.15}>
            <Panel className="h-full px-5 py-5">
              <Metric
                label="Mean Spatial Uncertainty"
                value={meanUncertainty !== null ? `${meanUncertainty.toFixed(2)} km` : "N/A"}
              />
            </Panel>
          </RevealOnMount>
        </div>

        <RevealOnMount delay={0.2}>
          <Panel className="mt-6 px-6 py-6">
            <p className="font-mono text-[11px] uppercase tracking-mission-wide text-ice">
              C18B Model Validation — 24h Prediction Accuracy
            </p>

            {validation ? (
              <>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Metric label="Physics-Only Model — Mean Error" value={`${validation.mean_physics_error_km} km`} />
                  <Metric
                    label="Physics + ML Hybrid Model — Mean Error"
                    value={`${validation.mean_hybrid_error_km} km`}
                  />
                </div>
                <p className="mt-4 font-body text-xs leading-relaxed text-mist">
                  Computed from {validation.sample_count} real day-over-day C18B observations, each validating a{" "}
                  {validation.forecast_horizon_hours}h-ahead prediction against the actual next-day recorded
                  position.{" "}
                  {!validation.other_horizons_available &&
                    "48h/72h validation is not available in this dataset — not shown rather than estimated."}
                </p>
              </>
            ) : (
              <p className="mt-4 font-body text-sm text-mist">
                {validationError ?? "Loading real C18B validation results…"}
              </p>
            )}
          </Panel>
        </RevealOnMount>
      </div>
    </section>
  );
}
