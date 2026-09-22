import { buildThreatTimeline, pickActiveStrategy } from "./missionAnalysis";
import type { RouteResponse } from "./types";

// Route-specific, chronological events built only from real data already on
// the API response: the active strategy's real waypoints (ETA = real
// time_offset_hours) and each corridor iceberg's closest real
// recorded/predicted position to that route (real iceberg_id, real
// coordinates, plain great-circle distance — see missionAnalysis.ts). No
// collision probability, confidence, severity or fuel-savings figure is
// shown because the prediction dataset and risk engine do not provide one.
export default function MissionThreatTimeline({
  route,
  selectedRouteOptionId,
}: {
  route: RouteResponse;
  selectedRouteOptionId: string | null;
}) {
  const active = pickActiveStrategy(route.route_options, selectedRouteOptionId);
  const waypoints = active ? active.waypoints : route.waypoints;
  if (waypoints.length === 0) return null;

  const icebergs = route.icebergs;
  const events = buildThreatTimeline(waypoints, icebergs);
  const start = waypoints[0];
  const end = waypoints[waypoints.length - 1];

  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Mission Threat Timeline</p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-mission text-mist/60">
        Closest tracked iceberg proximity to this route, by real waypoint ETA
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        <li className="flex items-center justify-between font-mono text-[10px] text-mist">
          <span className="uppercase tracking-mission text-ice/80">Depart</span>
          <span>
            +{start.time_offset_hours.toFixed(1)}h · {start.lat.toFixed(2)}°, {start.lon.toFixed(2)}°
          </span>
        </li>

        {events.map((e) => (
          <li key={e.icebergId} className="rounded border border-line/60 bg-abyss/40 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 font-mono text-xs text-frost">
              <span>Iceberg {e.icebergId}</span>
              <span className="text-mist">+{e.etaHours.toFixed(1)}h</span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] normal-case text-mist">
              Closest tracked proximity ≈ {e.distanceKm.toFixed(1)} km · waypoint {e.waypointIndex + 1}
            </div>
          </li>
        ))}

        <li className="flex items-center justify-between font-mono text-[10px] text-mist">
          <span className="uppercase tracking-mission text-ice/80">Arrive</span>
          <span>
            +{end.time_offset_hours.toFixed(1)}h · {end.lat.toFixed(2)}°, {end.lon.toFixed(2)}°
          </span>
        </li>
      </ul>

      {icebergs.length === 0 && (
        <p className="mt-2 font-body text-xs leading-relaxed text-mist">
          No icebergs were tracked within this mission&apos;s corridor.
        </p>
      )}

      {route.sea_ice_integrated !== undefined && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-mission text-mist/60">
          Sea ice in route risk: {route.sea_ice_integrated ? "Yes" : "No"} · per routing service
        </p>
      )}

      <p className="mt-3 font-body text-[11px] leading-relaxed text-mist/70">
        Distances are computed directly from the returned waypoint and iceberg coordinates — not a
        collision probability, confidence or severity estimate.
      </p>
    </div>
  );
}
