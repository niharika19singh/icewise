import type { RouteResponse } from "./types";

export type RouteNotices = {
  // One line per requested point the backend moved to a routing grid node.
  snaps: string[];
  // Server-level warnings, verbatim from the response.
  warnings: string[];
};

type LatLon = { lat: number; lon: number };

function distanceKm(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function describeSnap(label: string, snapped: LatLon, requested: LatLon | undefined): string {
  const where = `(${snapped.lat.toFixed(4)}°, ${snapped.lon.toFixed(4)}°)`;
  const away = requested ? `, about ${distanceKm(requested, snapped).toFixed(1)} km from the point you entered` : "";
  return `${label} was moved to the nearest routing grid point ${where}${away}.`;
}

// Reads only fields the routing API actually returned: `snapped_start` /
// `snapped_destination` (sent only when a requested point was moved) and
// `warnings`. Nothing is inferred when they are absent.
export function describeRouteNotices(
  route: RouteResponse | null,
  requested: { start: LatLon; destination: LatLon } | null,
): RouteNotices {
  if (!route) return { snaps: [], warnings: [] };
  const snaps: string[] = [];
  if (route.snapped_start) snaps.push(describeSnap("Start", route.snapped_start, requested?.start));
  if (route.snapped_destination) {
    snaps.push(describeSnap("Destination", route.snapped_destination, requested?.destination));
  }
  const warnings = Array.isArray(route.warnings) ? route.warnings.filter((w) => typeof w === "string" && w) : [];
  return { snaps, warnings };
}
