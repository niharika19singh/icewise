import { DishIcon, ModelIcon, EngineIcon, IcebergIcon, EyeIcon, RoutesIcon } from "./icons";
import type { RouteResponse } from "./types";

// Real, currently-true facts about this ICEWISE prototype's setup — the same
// scenario/data-mode/model labels shown on the Analytics page. "Routing" is
// read live from the routing API response rather than hardcoded, so it can
// never drift from what the backend actually used.
const staticFacts = [
  { id: "feeds", label: "Data Feeds", value: "Online", icon: DishIcon },
  { id: "models", label: "Models", value: "Ready", icon: ModelIcon },
  { id: "routing-engine", label: "Routing Engine", value: "Ready", icon: EngineIcon },
  { id: "scenario", label: "Active Scenario", value: "C18B", icon: IcebergIcon },
  { id: "data-mode", label: "Data Mode", value: "Historical Replay", icon: EyeIcon },
  { id: "model", label: "Model", value: "Physics + ML Hybrid", icon: ModelIcon },
];

export default function BottomBar({ route }: { route: RouteResponse | null }) {
  return (
    <div className="flex h-[140px] shrink-0 gap-4">
      <div className="flex-1 rounded-lg border border-line bg-abyss-raised/60 p-5">
        <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">
          System / Scenario Status
        </h3>
        <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-3">
          {staticFacts.map(({ id, label, value, icon: Icon }) => (
            <div key={id} className="flex flex-col gap-1.5">
              <Icon className="h-4 w-4 text-ice" />
              <span className="font-mono text-[9px] uppercase leading-tight tracking-mission text-mist">
                {label}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs text-frost">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ice" />
                {value}
              </span>
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <RoutesIcon className="h-4 w-4 text-ice" />
            <span className="font-mono text-[9px] uppercase leading-tight tracking-mission text-mist">
              Routing
            </span>
            <span className="flex items-center gap-1.5 font-mono text-xs text-frost">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ice" />
              {route?.algorithm_used ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
