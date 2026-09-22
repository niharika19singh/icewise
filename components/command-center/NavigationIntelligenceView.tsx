import AntarcticMap from "./AntarcticMap";
import WhyThisRoute from "./WhyThisRoute";
import MissionThreatTimeline from "./MissionThreatTimeline";
import { StrategyDot } from "./RouteIntelligence";
import { routeStrategyColor, routeStrategyDisplayName } from "./routeStyle";
import { pickActiveStrategy } from "./missionAnalysis";
import { isRouteOption, type RouteResponse, type LayerVisibility, type SeaIceGeoJSON } from "./types";

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="shadow-panel min-w-0 rounded-lg border border-line bg-abyss-raised/60 p-5 backdrop-blur-md">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">{label}</p>
      <p className="mt-2 break-words font-display text-2xl font-medium leading-tight text-frost">{value}</p>
    </div>
  );
}

// "Why should the operator choose this route?" — an analytical decision
// screen, not a map screen. The map shrinks to a supporting reference; the
// real weight goes to the selected strategy's headline numbers, a large
// side-by-side comparison of all 3 real route_options, and the existing
// WhyThisRoute / MissionThreatTimeline components reused verbatim — placed
// at full analytical width instead of squeezed into a 340px sidebar, which
// alone reads very differently.
export default function NavigationIntelligenceView({
  route,
  recalculatedRoute,
  seaIce,
  selectedRouteOptionId,
  onSelectRouteOption,
  selectedIcebergId,
  onSelectIceberg,
}: {
  route: RouteResponse | null;
  recalculatedRoute: RouteResponse | null;
  seaIce: SeaIceGeoJSON | null;
  selectedRouteOptionId: string | null;
  onSelectRouteOption: (id: string | null) => void;
  selectedIcebergId: string | null;
  onSelectIceberg: (id: string | null) => void;
}) {
  if (!route) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="font-body text-sm text-frost/80">No mission to analyze yet</p>
        <p className="max-w-[280px] font-body text-xs leading-relaxed text-mist">
          Generate a route from Mission Overview or the Command Center first — this screen explains
          whichever route is currently on the map.
        </p>
      </div>
    );
  }

  const active = pickActiveStrategy(route.route_options, selectedRouteOptionId);
  const strategies = (route.route_options ?? []).filter(isRouteOption);
  const layerVisibility: LayerVisibility = {
    icebergs: true,
    trajectories: false,
    initialRoute: true,
    adaptiveRoute: false,
    seaIce: false,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid shrink-0 grid-cols-3 gap-4">
        <HeroStat label="Selected Strategy" value={active ? routeStrategyDisplayName(active.label) : "—"} />
        <HeroStat
          label="Distance / ETA"
          value={
            active
              ? `${active.metrics.total_distance_km.toFixed(0)} km · +${active.metrics.estimated_time_hours.toFixed(1)}h`
              : `${route.metrics.total_distance_km.toFixed(0)} km · +${route.metrics.estimated_time_hours.toFixed(1)}h`
          }
        />
        <HeroStat
          label="Mean Risk"
          value={`${((active?.metrics ?? route.metrics).mean_risk_score * 100).toFixed(2)}%`}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="flex min-h-0 w-[420px] shrink-0">
          <AntarcticMap
            route={route}
            recalculatedRoute={recalculatedRoute}
            activeModule="routes"
            selectedIcebergId={selectedIcebergId}
            onSelectIceberg={onSelectIceberg}
            layerVisibility={layerVisibility}
            seaIce={seaIce}
            selectedRouteOptionId={selectedRouteOptionId}
            pickTarget={null}
            onPickPoint={() => {}}
            draftStart={null}
            draftDestination={null}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {strategies.length > 0 && (
            <div className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-5 backdrop-blur-md">
              <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Route Comparison</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {strategies.map((opt) => {
                  const color = routeStrategyColor(opt.label);
                  const name = routeStrategyDisplayName(opt.label);
                  const isSelected = opt.route_id === selectedRouteOptionId || (!selectedRouteOptionId && opt.route_id === active?.route_id);
                  return (
                    <button
                      key={opt.route_id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onSelectRouteOption(opt.route_id === selectedRouteOptionId ? null : opt.route_id)}
                      style={{
                        borderColor: isSelected ? color : undefined,
                        boxShadow: isSelected ? `0 0 0 1px ${color}66, 0 0 20px -6px ${color}` : undefined,
                      }}
                      className={`rounded border p-3 text-left transition-colors ${
                        isSelected ? "bg-abyss/70" : "border-line/60 bg-abyss/40 hover:bg-abyss/60"
                      }`}
                    >
                      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-mission text-frost">
                        <StrategyDot color={color} />
                        {name}
                      </span>
                      <p className="mt-2 font-display text-xl font-medium text-frost">
                        {opt.metrics.total_distance_km.toFixed(0)} km
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-mist">
                        +{opt.metrics.estimated_time_hours.toFixed(1)}h · {(opt.metrics.mean_risk_score * 100).toFixed(2)}% risk
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* WhyThisRoute/MissionThreatTimeline render themselves as a
              trailing subsection (mt-5 border-t) meant to follow other
              content in the standard sidebar — stripped here since each now
              opens its own panel instead. */}
          <div className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-6 backdrop-blur-md [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0">
            <WhyThisRoute route={route} selectedRouteOptionId={selectedRouteOptionId} />
          </div>

          <div className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-6 backdrop-blur-md [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0">
            <MissionThreatTimeline route={route} selectedRouteOptionId={selectedRouteOptionId} />
          </div>
        </div>
      </div>
    </div>
  );
}
