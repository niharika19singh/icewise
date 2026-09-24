"use client";

import { useEffect, useRef } from "react";
import { PlayIcon, PauseIcon } from "./icons";
import { closestIcebergAt, interpolateVesselPosition, interpolateWaypointRisk } from "./replayEngine";
import type { RouteResponse } from "./types";

// Playback rate: 1 real second of playback = this many mission hours. Chosen
// so a typical demo-corridor transit (~13h) plays out in under a minute for
// a live jury demo — not a claim about anything real-world.
const HOURS_PER_TICK = 0.5;
const TICK_MS = 200;

// Real historical mission replay: advances a mission-time value through the
// route's own real waypoint ETAs (time_offset_hours), driving AntarcticMap's
// replayTimeHours prop (moving vessel + iceberg positions, both real
// interpolated data, see replayEngine.ts) and showing the real route risk
// and closest tracked iceberg at that moment. Nothing here is simulated
// beyond interpolating between real recorded/predicted timestamps — the same
// technique the backend's own risk engine already uses.
export default function MissionReplay({
  route,
  timeHours,
  playing,
  onTimeChange,
  onPlayingChange,
  onRouteCompleted,
}: {
  route: RouteResponse;
  timeHours: number;
  playing: boolean;
  onTimeChange: (hours: number) => void;
  onPlayingChange: (playing: boolean) => void;
  // Fired once, the moment replay reaches the route's real ETA.
  onRouteCompleted?: () => void;
}) {
  const durationHours = route.metrics.estimated_time_hours;
  // Refs so the interval below always reads the latest value without
  // needing to restart on every timeHours/onRouteCompleted change — updated
  // in their own effect (not during render) so a ref read never drives it.
  const timeHoursRef = useRef(timeHours);
  const onRouteCompletedRef = useRef(onRouteCompleted);
  useEffect(() => {
    timeHoursRef.current = timeHours;
    onRouteCompletedRef.current = onRouteCompleted;
  });

  useEffect(() => {
    if (!playing || durationHours <= 0) return;
    const interval = setInterval(() => {
      const next = timeHoursRef.current + HOURS_PER_TICK;
      if (next >= durationHours) {
        onTimeChange(durationHours);
        onPlayingChange(false);
        onRouteCompletedRef.current?.();
      } else {
        onTimeChange(next);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [playing, durationHours, onTimeChange, onPlayingChange]);

  if (durationHours <= 0) return null;

  const atEnd = timeHours >= durationHours;
  const vesselPos = interpolateVesselPosition(route.waypoints, timeHours);
  const nearest = vesselPos ? closestIcebergAt(vesselPos, route.icebergs, timeHours) : null;
  const risk = interpolateWaypointRisk(route.waypoints, route.waypoint_risks, timeHours);

  return (
    <div className="shadow-panel shrink-0 rounded-lg border border-line bg-abyss-raised/60 p-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (atEnd) onTimeChange(0);
            onPlayingChange(!playing);
          }}
          aria-label={playing ? "Pause mission replay" : "Play mission replay"}
          className="shadow-panel flex h-8 w-8 shrink-0 items-center justify-center rounded border border-ice/40 bg-ice/5 text-ice transition-all hover:border-ice hover:bg-ice/10 hover:shadow-glow-ice-sm"
        >
          {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
        </button>

        <input
          type="range"
          min={0}
          max={durationHours}
          step={0.1}
          value={timeHours}
          onChange={(e) => {
            onPlayingChange(false);
            onTimeChange(Number(e.target.value));
          }}
          className="h-1.5 flex-1 accent-ice"
          aria-label="Mission replay time"
        />

        <span className="w-28 shrink-0 text-right font-mono text-xs text-frost">
          +{timeHours.toFixed(1)}h / {durationHours.toFixed(1)}h
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-mission text-mist">
        <span>{atEnd ? "Mission Replay · Complete" : "Mission Replay · Historical playback"}</span>
        <span className="flex items-center gap-3 normal-case text-frost/90">
          {risk !== null && <span>Route risk ≈ {(risk * 100).toFixed(1)}%</span>}
          {nearest && (
            <span>
              Nearest: {nearest.icebergId} · {nearest.distanceKm.toFixed(1)} km
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
