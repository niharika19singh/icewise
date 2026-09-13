import type { FeatureCollection, LineString } from "geojson";

const MERIDIAN_STEP_DEG = 30;
const PARALLELS = [-60, -70, -80];
const POLE_LAT = -89.5;
const OUTER_LAT = -50;

// Real lat/lon graticule (meridians + parallels) for the map's cyan grid overlay —
// generated client-side, not a fake decorative shape.
export function buildGraticule(): FeatureCollection<LineString> {
  const features: FeatureCollection<LineString>["features"] = [];

  for (let lon = -180; lon < 180; lon += MERIDIAN_STEP_DEG) {
    const coords: [number, number][] = [];
    for (let lat = OUTER_LAT; lat >= POLE_LAT; lat -= 1) {
      coords.push([lon, lat]);
    }
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  for (const lat of PARALLELS) {
    const coords: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      coords.push([lon, lat]);
    }
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  return { type: "FeatureCollection", features };
}
