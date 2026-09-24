"use client";

import ToggleSwitch from "./ToggleSwitch";
import { IcebergIcon, RoutesIcon, EngineIcon, SeaIceIcon } from "./icons";
import type { ComponentType } from "react";
import type { LayerId, LayerVisibility } from "./types";

type Layer = {
  id: LayerId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  // Command Center modes in which the map actually draws this layer. Omitted =
  // drawn in every mode. The toggle still works outside them; it just has no
  // visible effect until the operator switches to a matching mode.
  modes?: { ids: string[]; hint: string };
};

// Only the map's real, currently-available layers. Risk zones and
// alternative routes are deliberately absent — ICEWISE has no real data for
// them yet, and a toggle for a layer that doesn't exist would be misleading.
const layers: Layer[] = [
  { id: "icebergs", label: "Icebergs", icon: IcebergIcon, modes: { ids: ["icebergs", "routes"], hint: "Icebergs · Routes" } },
  {
    id: "trajectories",
    label: "Predicted Trajectories",
    icon: RoutesIcon,
    modes: { ids: ["icebergs", "routes"], hint: "Icebergs · Routes" },
  },
  { id: "initialRoute", label: "Original Route", icon: RoutesIcon },
  { id: "adaptiveRoute", label: "Adaptive Route", icon: EngineIcon },
  { id: "seaIce", label: "Sea Ice Concentration", icon: SeaIceIcon, modes: { ids: ["sea-ice"], hint: "Sea Ice" } },
];

export default function LayerControls({
  visibility,
  onToggle,
  activeModule,
  hasAdaptiveRoute,
  hasSeaIce,
}: {
  visibility: LayerVisibility;
  onToggle: (id: LayerId) => void;
  activeModule: string;
  hasAdaptiveRoute: boolean;
  hasSeaIce: boolean;
}) {
  return (
    <div className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-5 backdrop-blur-md">
      <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">
        Layer Controls
      </h3>
      <ul className="mt-4 flex flex-col gap-3.5">
        {layers.map(({ id, label, icon: Icon, modes }) => {
          // The adaptive route only exists once a recalculation has actually
          // returned, and the sea-ice grid only once its fetch has resolved —
          // until then those toggles are disabled rather than removed, so the
          // control communicates real system state, not fake data.
          const disabled =
            (id === "adaptiveRoute" && !hasAdaptiveRoute) || (id === "seaIce" && !hasSeaIce);
          const offView = !!modes && !modes.ids.includes(activeModule);
          return (
            <li key={id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span
                  className={`flex items-center gap-2.5 text-sm ${disabled ? "text-frost/40" : "text-frost/90"}`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${disabled ? "text-ice/40" : "text-ice"}`} />
                  {label}
                </span>
                {modes && offView && !disabled && (
                  <span className="ml-[26px] break-words font-mono text-[9px] uppercase tracking-mission text-mist/60">
                    Shown in {modes.hint}
                  </span>
                )}
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
