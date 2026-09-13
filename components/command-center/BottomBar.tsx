"use client";

import { useState } from "react";
import { DishIcon, ModelIcon, EngineIcon, BellIcon, PlayIcon } from "./icons";

// Static status/telemetry values for shell layout only — not live system data.
const statusItems = [
  { id: "feeds", label: "Data Feeds", value: "Online", icon: DishIcon },
  { id: "models", label: "Models", value: "Ready", icon: ModelIcon },
  { id: "routing", label: "Routing Engine", value: "Ready", icon: EngineIcon },
  { id: "alerts", label: "Alerts", value: "0 Active", icon: BellIcon },
];

export default function BottomBar() {
  const [scrub, setScrub] = useState(45);

  return (
    <div className="flex h-[140px] shrink-0 gap-4">
      <div className="w-[360px] shrink-0 rounded-lg border border-line bg-abyss-raised/60 p-5">
        <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">
          System Status
        </h3>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {statusItems.map(({ id, label, value, icon: Icon }) => (
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
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between rounded-lg border border-line bg-abyss-raised/60 p-5">
        <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">
          Timeline / Simulation
        </h3>
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Play simulation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ice/40 text-ice transition-colors hover:bg-ice/10"
          >
            <PlayIcon className="h-4 w-4 translate-x-0.5" />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={scrub}
            onChange={(e) => setScrub(Number(e.target.value))}
            aria-label="Simulation timeline"
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-frost/15 accent-ice"
          />
          <span className="shrink-0 font-mono text-xs text-mist">12 Jan 2026 14:30 UTC</span>
        </div>
      </div>

      <div className="flex w-[280px] shrink-0 flex-col justify-between rounded-lg border border-line bg-abyss-raised/60 p-5">
        <button
          type="button"
          disabled
          className="flex items-center justify-center gap-2 rounded-full border border-frost/15 bg-frost/5 py-3 font-body text-sm text-mist"
        >
          <EngineIcon className="h-4 w-4" />
          Generate Route
        </button>
        <p className="text-center font-body text-xs text-mist">
          Select start and destination points
        </p>
      </div>
    </div>
  );
}
