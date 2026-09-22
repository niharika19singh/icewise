import type { ComponentType } from "react";
import { ModelIcon, EngineIcon, IcebergIcon, EyeIcon, PlayIcon, SeaIceIcon, ClockIcon } from "./icons";
import { REPLAY_DATE_LABEL, formatReplayDate } from "./replay";
import type { RouteResponse, SeaIceGeoJSON } from "./types";

// Scenario status. Every tile is either a fixed fact about this prototype
// (it replays historical 2020 data) or read from real app/API state — there
// are no "online / ready" health claims, because no health feed exists here.
// Prediction Model is the model named in the prediction dataset; the routing
// API response itself does not carry it.
type Tone = "ok" | "warn" | "idle";

function Tile({
  label,
  value,
  icon: Icon,
  tone = "ok",
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
}) {
  const dot =
    tone === "warn"
      ? "bg-vessel shadow-[0_0_8px_-1px_rgba(217,154,91,0.8)]"
      : tone === "idle"
        ? "bg-mist/50"
        : "bg-ice shadow-[0_0_8px_-1px_rgba(143,217,224,0.8)]";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase leading-tight tracking-mission text-mist">
        <Icon className="h-3.5 w-3.5 shrink-0 text-ice" />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-frost" title={value}>
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

export default function BottomBar({
  route,
  seaIce,
  seaIceError,
  routeLoading,
  routeError,
  missionDirty,
}: {
  route: RouteResponse | null;
  seaIce: SeaIceGeoJSON | null;
  seaIceError: boolean;
  routeLoading: boolean;
  routeError: boolean;
  // Planner inputs no longer match the route currently shown.
  missionDirty: boolean;
}) {
  let routeStatus: { value: string; tone: Tone };
  if (routeLoading) routeStatus = { value: "Generating…", tone: "idle" };
  else if (routeError) routeStatus = { value: "Request failed", tone: "warn" };
  else if (route && missionDirty) routeStatus = { value: "Inputs edited", tone: "warn" };
  else if (route) routeStatus = { value: `Generated · ${route.algorithm_used}`, tone: "ok" };
  else routeStatus = { value: "Not generated", tone: "idle" };

  let seaIceValue = "Loading…";
  let seaIceTone: Tone = "idle";
  if (seaIce) {
    seaIceValue = `NSIDC · ${formatReplayDate(seaIce.metadata.timestamp)}`;
    seaIceTone = "ok";
  } else if (seaIceError) {
    seaIceValue = "Unavailable";
    seaIceTone = "warn";
  }

  return (
    <div className="flex h-[140px] shrink-0 gap-4">
      <div className="shadow-panel min-w-0 flex-1 rounded-lg border border-line bg-abyss-raised/60 p-4 backdrop-blur-md">
        <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">Scenario Status</h3>
        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
          <Tile label="Data Mode" value="Historical Replay" icon={EyeIcon} />
          <Tile label="Scenario Date" value={REPLAY_DATE_LABEL} icon={PlayIcon} />
          <Tile label="Prediction Model" value="Physics + ML Hybrid" icon={ModelIcon} />
          <Tile label="Sea Ice Data" value={seaIceValue} icon={SeaIceIcon} tone={seaIceTone} />
          <Tile
            label="Corridor Icebergs"
            value={route ? String(route.icebergs.length) : "—"}
            icon={IcebergIcon}
            tone={route ? "ok" : "idle"}
          />
          <Tile
            label="Forecast Horizon"
            value={route?.forecast_horizon_hours != null ? `+${route.forecast_horizon_hours}h` : "—"}
            icon={ClockIcon}
            tone={route?.forecast_horizon_hours != null ? "ok" : "idle"}
          />
          <Tile label="Route Status" value={routeStatus.value} icon={EngineIcon} tone={routeStatus.tone} />
        </div>
      </div>
    </div>
  );
}
