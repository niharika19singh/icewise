"use client";

import { useState } from "react";
import ToggleSwitch from "./ToggleSwitch";
import { SeaIceIcon, IcebergIcon, RoutesIcon, EngineIcon } from "./icons";
import type { ComponentType } from "react";

type Layer = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  defaultOn: boolean;
};

// Static layer list for shell layout — wiring to real map layers comes later.
const layers: Layer[] = [
  { id: "sea-ice", label: "Sea Ice Concentration", icon: SeaIceIcon, defaultOn: true },
  { id: "icebergs", label: "Icebergs (Detected)", icon: IcebergIcon, defaultOn: true },
  { id: "trajectories", label: "Predicted Trajectories", icon: RoutesIcon, defaultOn: false },
  { id: "risk-zones", label: "Risk Zones", icon: IcebergIcon, defaultOn: false },
  { id: "recommended-route", label: "Recommended Route", icon: RoutesIcon, defaultOn: false },
  { id: "alternative-routes", label: "Alternative Routes", icon: EngineIcon, defaultOn: false },
];

export default function LayerControls() {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(layers.map((l) => [l.id, l.defaultOn])),
  );

  return (
    <div className="rounded-lg border border-line bg-abyss-raised/60 p-5">
      <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">
        Layer Controls
      </h3>
      <ul className="mt-4 flex flex-col gap-3.5">
        {layers.map(({ id, label, icon: Icon }) => (
          <li key={id} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-sm text-frost/90">
              <Icon className="h-4 w-4 shrink-0 text-ice" />
              {label}
            </span>
            <ToggleSwitch
              checked={state[id]}
              onChange={() => setState((s) => ({ ...s, [id]: !s[id] }))}
              label={label}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
