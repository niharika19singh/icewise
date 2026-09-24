import AntarcticMap from "./AntarcticMap";
import ErrorNotice from "./ErrorNotice";
import { classifyRouteStrategy } from "./routeStyle";
import { isRouteOption, type RouteResponse, type LayerVisibility, type SeaIceGeoJSON, type OperatorError } from "./types";

function BigDelta({
  label,
  before,
  after,
  unit,
  decimals,
}: {
  label: string;
  before: number;
  after: number;
  unit: string;
  decimals: number;
}) {
  const delta = after - before;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return (
    <div className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-4 backdrop-blur-md">
      <p className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-mono text-xs text-mist/70">{before.toFixed(decimals)}{unit}</span>
        <span className="font-mono text-xs text-mist/50">{"→"}</span>
        <span className="font-display text-2xl font-medium text-frost">
          {after.toFixed(decimals)}
          {unit}
        </span>
      </div>
      <p className={`mt-1 font-mono text-[11px] ${delta === 0 ? "text-mist" : "text-ice"}`}>
        {sign}
        {Math.abs(delta).toFixed(decimals)}
        {unit}
      </p>
    </div>
  );
}

// "What happens when the situation changes?" — a dedicated before/after
// screen. The trigger is stated exactly as the backend describes it
// (backend/routing/main.py -> recalculate_route: "each iceberg's latest
// real observation", not a made-up live-feed event), and every comparison
// number is the same subtraction RouteIntelligence's own comparison rows
// already do — just given a full stat-card treatment instead of a thin
// list line, so the change reads at a glance.
export default function AdaptiveReroutingView({
  route,
  recalculatedRoute,
  recalculating,
  recalculateError,
  onRecalculate,
  seaIce,
  selectedIcebergId,
  onSelectIceberg,
}: {
  route: RouteResponse | null;
  recalculatedRoute: RouteResponse | null;
  recalculating: boolean;
  recalculateError: OperatorError | null;
  onRecalculate: () => void;
  seaIce: SeaIceGeoJSON | null;
  selectedIcebergId: string | null;
  onSelectIceberg: (id: string | null) => void;
}) {
  if (!route) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="font-body text-sm text-frost/80">No mission to reroute yet</p>
        <p className="max-w-[280px] font-body text-xs leading-relaxed text-mist">
          Generate a route from Mission Overview or the Command Center first.
        </p>
      </div>
    );
  }

  const layerVisibility: LayerVisibility = {
    icebergs: true,
    trajectories: true,
    initialRoute: true,
    adaptiveRoute: true,
    seaIce: false,
  };

  if (!recalculatedRoute) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="font-body text-sm text-frost/80">No adaptive reroute yet</p>
        <p className="max-w-[320px] font-body text-xs leading-relaxed text-mist">
          This screen compares the original route against a real recalculation against each
          iceberg&apos;s latest recorded observation in the replay dataset.
        </p>
        <button
          type="button"
          onClick={onRecalculate}
          disabled={recalculating}
          className="mt-1 rounded border border-ice/40 bg-ice/5 px-5 py-2.5 font-mono text-xs uppercase tracking-mission text-ice transition-all hover:border-ice hover:bg-ice/10 hover:shadow-glow-ice-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {recalculating ? "Recalculating…" : "Recalculate Route"}
        </button>
        {recalculateError && <ErrorNotice error={recalculateError} className="mt-2 max-w-[320px]" />}
      </div>
    );
  }

  const before = route.metrics;
  const after = recalculatedRoute.metrics;
  // Real, opt-in time-aware option set (backend/routing/main.py ->
  // _build_time_aware_route_options): path search re-run with each cell's
  // risk evaluated at its estimated arrival time instead of the static
  // worst-case forecast envelope the adaptive route above uses. "Balanced"
  // is the same strategy (risk_tolerance_factor) as the primary route, so
  // it's the one directly comparable to `after` above.
  const timeAwareBalanced = (recalculatedRoute.time_aware_route_options ?? [])
    .filter(isRouteOption)
    .find((o) => classifyRouteStrategy(o.label) === "balanced");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shadow-panel max-h-[30vh] shrink-0 overflow-y-auto rounded-lg border border-vessel/40 bg-vessel/5 p-4 backdrop-blur-md">
        <p className="font-mono text-[10px] uppercase tracking-mission-wide text-vessel">Reroute Trigger</p>
        <p className="mt-1.5 font-body text-xs leading-relaxed text-frost/90">
          Recalculated against each iceberg&apos;s latest recorded observation in the replay dataset —
          not a single consistent point in time, and not a forecast for the original departure.
          Corridor icebergs: {route.icebergs.length} at original planning {"→"} {recalculatedRoute.icebergs.length}{" "}
          at recalculation.
        </p>
        {recalculatedRoute.warnings?.map((w) => (
          <p key={w} className="mt-1.5 font-body text-[11px] leading-snug text-vessel/90">
            {w}
          </p>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 min-w-0 flex-[2] flex-col gap-2">
            {/* Rerouting story, every value from the real route / recalculation responses. */}
            <ol className="shadow-panel grid shrink-0 grid-cols-4 overflow-hidden rounded-lg border border-line bg-abyss-raised/70 font-mono text-[9px] uppercase tracking-mission backdrop-blur-md">
              {[
                { k: "Hazard detected", v: `${recalculatedRoute.icebergs.length} corridor iceberg${recalculatedRoute.icebergs.length === 1 ? "" : "s"}`, c: "#ff5a36" },
                { k: "Original route", v: `${before.total_distance_km.toFixed(1)} km · ${(before.max_risk_score * 100).toFixed(1)}% max`, c: "#2ee6ff" },
                { k: "Rerouting", v: "Latest observations", c: "#ffc93c" },
                { k: "New route", v: `${after.total_distance_km.toFixed(1)} km · ${(after.max_risk_score * 100).toFixed(1)}% max`, c: "#39ffb0" },
              ].map((step, i) => (
                <li key={step.k} className="flex min-w-0 items-center gap-2 border-l border-line/40 px-3 py-2 first:border-l-0">
                  {i > 0 && <span aria-hidden className="-ml-1 text-mist/60">→</span>}
                  <span className="min-w-0 leading-tight">
                    <span className="block" style={{ color: step.c }}>{step.k}</span>
                    <span className="block truncate normal-case tracking-normal text-frost/85">{step.v}</span>
                  </span>
                </li>
              ))}
            </ol>
          <div className="flex min-h-0 flex-1">
          <AntarcticMap
            heroBasemap
            heroImage="/images/adaptive-rerouting-basemap.webp"
            rerouteFocus
            compactLegend
            route={route}
            recalculatedRoute={recalculatedRoute}
            activeModule="map"
            selectedIcebergId={selectedIcebergId}
            onSelectIceberg={onSelectIceberg}
            layerVisibility={layerVisibility}
            seaIce={seaIce}
            selectedRouteOptionId={null}
            pickTarget={null}
            onPickPoint={() => {}}
            draftStart={null}
            draftDestination={null}
          />
          </div>
        </div>

        <div className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto">
          <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">
            Original {"→"} Adaptive
          </p>
          <BigDelta label="Distance" before={before.total_distance_km} after={after.total_distance_km} unit=" km" decimals={1} />
          <BigDelta label="Transit" before={before.estimated_time_hours} after={after.estimated_time_hours} unit=" h" decimals={1} />
          <BigDelta label="Fuel" before={before.estimated_fuel_tons} after={after.estimated_fuel_tons} unit=" t" decimals={2} />
          <BigDelta
            label="Mean Risk"
            before={before.mean_risk_score * 100}
            after={after.mean_risk_score * 100}
            unit="%"
            decimals={2}
          />
          <BigDelta
            label="Max Risk"
            before={before.max_risk_score * 100}
            after={after.max_risk_score * 100}
            unit="%"
            decimals={2}
          />

          {timeAwareBalanced && (
            <>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-mission-wide text-ice">
                Time-Aware Routing (Balanced)
              </p>
              <p className="font-body text-[11px] normal-case leading-snug text-mist/70">
                Path search re-run with each cell&apos;s risk evaluated at its estimated arrival time,
                instead of the worst-case forecast envelope the adaptive route above uses.
              </p>
              <BigDelta
                label="Distance — adaptive → time-aware"
                before={after.total_distance_km}
                after={timeAwareBalanced.metrics.total_distance_km}
                unit=" km"
                decimals={1}
              />
              <BigDelta
                label="Mean Risk — adaptive → time-aware"
                before={after.mean_risk_score * 100}
                after={timeAwareBalanced.metrics.mean_risk_score * 100}
                unit="%"
                decimals={2}
              />
              <BigDelta
                label="Max Risk — adaptive → time-aware"
                before={after.max_risk_score * 100}
                after={timeAwareBalanced.metrics.max_risk_score * 100}
                unit="%"
                decimals={2}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
