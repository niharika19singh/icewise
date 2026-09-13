"use client";

import ToggleSwitch from "./ToggleSwitch";
import { IcebergIcon, RoutesIcon, EngineIcon, SeaIceIcon } from "./icons";
import type { ComponentType } from "react";
import type { LayerId, LayerVisibility } from "./types";

type Layer = {
  id: LayerId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

// Only the map's real, currently-available layers. Risk zones and
// alternative routes are deliberately absent — ICEWISE has no real data for
// them yet, and a toggle for a layer that doesn't exist would be misleading.
const layers: Layer[] = [
  { id: "icebergs", label: "Icebergs (Detected)", icon: IcebergIcon },
  { id: "trajectories", label: "Predicted Trajectories", icon: RoutesIcon },
  { id: "initialRoute", label: "Initial Route", icon: RoutesIcon },
  { id: "adaptiveRoute", label: "Adaptive Re-Route", icon: EngineIcon },
  { id: "seaIce", label: "Sea Ice Concentration", icon: SeaIceIcon },
];

export default function LayerControls({
  visibility,
  onToggle,
  hasAdaptiveRoute,
  hasSeaIce,
}: {
  visibility: LayerVisibility;
  onToggle: (id: LayerId) => void;
  hasAdaptiveRoute: boolean;
  hasSeaIce: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-abyss-raised/60 p-5">
      <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">
        Layer Controls
      </h3>
      <ul className="mt-4 flex flex-col gap-3.5">
        {layers.map(({ id, label, icon: Icon }) => {
          // The adaptive route only exists once a recalculation has actually
          // returned, and the sea-ice grid only once its fetch has resolved —
          // until then those toggles are disabled rather than removed, so the
          // control communicates real system state, not fake data.
          const disabled =
            (id === "adaptiveRoute" && !hasAdaptiveRoute) || (id === "seaIce" && !hasSeaIce);
          return (
            <li key={id} className="flex items-center justify-between gap-3">
              <span
                className={`flex items-center gap-2.5 text-sm ${disabled ? "text-frost/40" : "text-frost/90"}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${disabled ? "text-ice/40" : "text-ice"}`} />
                {label}
              </span>
              <ToggleSwitch
                checked={!disabled && visibility[id]}
                onChange={() => onToggle(id)}
                label={label}
                disabled={disabled}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
