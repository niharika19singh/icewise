// Fixed color identity for the map/UI — the ONLY hardcoded visual mapping in
// this module. Route geometry, distances, times and risk values are never
// touched here; this file only decides which color a given real label draws in.

export type RouteStrategyKind = "safety" | "balanced" | "shortest" | "unknown";

export const ROUTE_STRATEGY_COLORS: Record<RouteStrategyKind, string> = {
  safety: "#34d399", // green
  balanced: "#fbbf24", // amber / yellow
  shortest: "#f87171", // red
  unknown: "#8fd9e0", // falls back to the existing ICEWISE ice cyan
};

// Distinct from the route colors above (deeper/more saturated so "green" and
// "red" both still read correctly, but a pin is never mistaken for a line —
// pins are also a completely different shape/elevation on the map).
export const PIN_COLORS = {
  start: "#2dd4bf",
  destination: "#dc2626",
};

// Classifies one of the backend's real route_options labels (see
// backend/routing/main.py -> ROUTE_OPTION_PROFILES: "Safety Priority",
// "Balanced", "Baseline / Shortest") into a fixed display identity. Matches
// by keyword rather than exact string, so a future backend wording tweak
// degrades to "unknown" (still shown, ice-colored) instead of miscoloring.
export function classifyRouteStrategy(label: string): RouteStrategyKind {
  const l = label.toLowerCase();
  if (l.includes("safety")) return "safety";
  if (l.includes("balanced")) return "balanced";
  if (l.includes("shortest") || l.includes("baseline")) return "shortest";
  return "unknown";
}

export function routeStrategyColor(label: string): string {
  return ROUTE_STRATEGY_COLORS[classifyRouteStrategy(label)];
}

// Fixed, intuitive display name for each strategy — cosmetic only. The
// backend's own `label` (used for matching above, and shown verbatim in the
// "Service details" expander for a failed strategy) is never altered.
export function routeStrategyDisplayName(label: string): string {
  switch (classifyRouteStrategy(label)) {
    case "safety":
      return "Safety First";
    case "balanced":
      return "Balanced";
    case "shortest":
      return "Shortest";
    default:
      return label;
  }
}

// Neon palette for the cinematic Command Center / Mission Overview maps (the
// hero-artwork basemap). Same per-strategy mapping as the Route Robustness
// page: Shortest = electric cyan, Balanced = gold, Safety First = red. Only
// used where a caller opts in; every other view keeps ROUTE_STRATEGY_COLORS.
export const NEON_ROUTE_COLORS: Record<RouteStrategyKind, string> = {
  shortest: "#2ee6ff",
  balanced: "#ffc93c",
  safety: "#ff4d5e",
  unknown: "#8fd9e0",
};

// Lighter tint of each neon color for the bright inner core of a glowing line.
export const NEON_ROUTE_CORES: Record<RouteStrategyKind, string> = {
  shortest: "#d6fbff",
  balanced: "#fff1c4",
  safety: "#ffd0d5",
  unknown: "#e6f7f8",
};

export function strategyPalette(neon: boolean): Record<RouteStrategyKind, string> {
  return neon ? NEON_ROUTE_COLORS : ROUTE_STRATEGY_COLORS;
}

export function routeStrategyColorFor(label: string, neon: boolean): string {
  return strategyPalette(neon)[classifyRouteStrategy(label)];
}
