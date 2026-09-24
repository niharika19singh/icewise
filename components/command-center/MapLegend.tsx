// Compact, mode-aware map legend — mirrors the real layers actually drawn on
// the map for the current mode, so the visualization reads without needing
// the right panel.

import { PinIcon } from "./icons";
import { PIN_COLORS, strategyPalette } from "./routeStyle";
import type { SeaIceGeoJSON } from "./types";

const BOX_CLASS =
  "shadow-panel pointer-events-none absolute bottom-16 left-5 flex flex-col gap-1.5 rounded border border-line bg-abyss-raised/80 px-3 py-2.5 backdrop-blur-sm";
// Applied only below 820px viewport height (e.g. 1280×720, 1024×768).
const COMPACT_CLASS =
  "[@media(max-height:820px)]:left-3 [@media(max-height:820px)]:gap-0.5 [@media(max-height:820px)]:px-2 [@media(max-height:820px)]:py-1.5 [@media(max-height:820px)]:[&_span]:text-[8.5px] [@media(max-height:820px)]:[&_span]:tracking-[0.14em] [@media(max-height:820px)]:[&_svg]:h-3 [@media(max-height:820px)]:[&_svg]:w-3";

const rowClass = "flex items-center gap-2 font-mono text-[10px] tracking-mission text-mist";

function GlyphRow({ glyph, color, label }: { glyph: string; color: string; label: string }) {
  return (
    <span className={rowClass}>
      <span style={{ color }} className="w-3 text-center text-sm leading-none">
        {glyph}
      </span>
      {label}
    </span>
  );
}

function LineRow({ color, dashed, label }: { color: string; dashed: boolean; label: string }) {
  return (
    <span className={rowClass}>
      <span
        aria-hidden
        className="inline-block h-0 w-4 border-t-2"
        style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
      />
      {label}
    </span>
  );
}

// A real map-pin icon (icons.tsx -> PinIcon), not an emoji — matches the
// actual marker shape drawn on the map for Start/Destination.
function PinRow({ color, label, faded = false }: { color: string; label: string; faded?: boolean }) {
  return (
    <span className={rowClass} style={faded ? { opacity: 0.7 } : undefined}>
      <PinIcon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
      {label}
    </span>
  );
}

// Hollow markers for mission points that have been entered but not yet used to
// generate the route on screen.
function DraftRows({ start, destination }: { start: boolean; destination: boolean }) {
  return (
    <>
      {start && <PinRow color={PIN_COLORS.start} label="DRAFT START" faded />}
      {destination && <PinRow color={PIN_COLORS.destination} label="DRAFT DESTINATION" faded />}
    </>
  );
}

// The 3 fixed route-strategy colors (routeStyle.ts) — same mapping used on
// the map lines and the Route Comparison cards, repeated here so the legend
// alone is enough to read the map.
function RouteStrategyRows({ neon }: { neon: boolean }) {
  const colors = strategyPalette(neon);
  return (
    <>
      <LineRow color={colors.safety} dashed={false} label="SAFETY FIRST" />
      <LineRow color={colors.balanced} dashed={false} label="BALANCED" />
      <LineRow color={colors.shortest} dashed={false} label="SHORTEST" />
    </>
  );
}

export default function MapLegend({
  mode,
  hasAdaptiveRoute,
  seaIce,
  hasRoute,
  hasDraftStart,
  hasDraftDestination,
  neon = false,
  compact = false,
  reroute = false,
}: {
  mode: string;
  hasAdaptiveRoute: boolean;
  seaIce: SeaIceGeoJSON | null;
  hasSelectedRouteOption: boolean;
  hasRoute: boolean;
  hasDraftStart: boolean;
  hasDraftDestination: boolean;
  // Neon route palette, matching the Command Center hero map.
  neon?: boolean;
  // Small-map variant (Navigation Intelligence): on short viewports the same
  // rows are drawn tighter and smaller so the legend covers less of the map.
  compact?: boolean;
  // Adaptive Rerouting legend rows (adaptive route, hazard icebergs, trajectories).
  reroute?: boolean;
}) {
  const boxClass = compact ? `${BOX_CLASS} ${COMPACT_CLASS}` : BOX_CLASS;
  if (mode !== "map" && mode !== "icebergs" && mode !== "routes" && mode !== "sea-ice") return null;

  // Before any route exists there is nothing on the map to explain except the
  // operator's own draft points.
  if (mode !== "sea-ice" && !hasRoute) {
    if (!hasDraftStart && !hasDraftDestination) return null;
    return (
      <div className={boxClass}>
        <DraftRows start={hasDraftStart} destination={hasDraftDestination} />
      </div>
    );
  }

  return (
    <div className={boxClass}>
      {mode === "map" && (
        <>
          <PinRow color={PIN_COLORS.start} label="START" />
          <PinRow color={PIN_COLORS.destination} label="DESTINATION" />
          <LineRow color={neon ? "#2ee6ff" : "#8fd9e0"} dashed={false} label={reroute ? "ORIGINAL ROUTE" : "ROUTE"} />
          {reroute && (
            <>
              {hasAdaptiveRoute && <LineRow color="#39ffb0" dashed={false} label="ADAPTIVE ROUTE" />}
              <GlyphRow glyph="●" color="#ff5a36" label="ICEBERG HAZARD" />
              <LineRow color="#ff9a6b" dashed label="PREDICTED TRAJECTORY" />
            </>
          )}
          <DraftRows start={hasDraftStart} destination={hasDraftDestination} />
        </>
      )}

      {mode === "icebergs" && (
        <>
          <GlyphRow glyph="●" color="#c3f2f4" label="ICEBERG" />
          <LineRow color="#c3f2f4" dashed label="PREDICTED TRAJECTORY" />
          <GlyphRow glyph="◌" color="#c3f2f4" label="UNCERTAINTY RADIUS" />
        </>
      )}

      {mode === "routes" && (
        <>
          <LineRow color="#8fd9e0" dashed={false} label="ORIGINAL ROUTE" />
          {hasAdaptiveRoute ? (
            <LineRow color="#edf2f2" dashed label="ADAPTIVE ROUTE" />
          ) : (
            <span className="font-mono text-[10px] tracking-mission text-mist/50">
              Recalculate to compare
            </span>
          )}
          <div className="my-0.5 border-t border-line/60" />
          <RouteStrategyRows neon={neon} />
          <div className="my-0.5 border-t border-line/60" />
          <PinRow color={PIN_COLORS.start} label="START" />
          <PinRow color={PIN_COLORS.destination} label="DESTINATION" />
          <GlyphRow glyph="●" color="#c3f2f4" label="ICEBERG" />
          <DraftRows start={hasDraftStart} destination={hasDraftDestination} />
        </>
      )}

      {mode === "sea-ice" &&
        (seaIce ? (
          <>
            <span className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">
              Sea Ice Concentration
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-mist">LOW</span>
              <span
                aria-hidden
                className="h-1.5 w-16 rounded-full"
                style={{ background: "linear-gradient(to right, #0d1b22, #8fd9e0, #c3f2f4)" }}
              />
              <span className="font-mono text-[9px] text-mist">HIGH</span>
            </div>
            <span className="font-mono text-[10px] tracking-mission text-mist">0–100% concentration</span>
            <div className="mt-1 border-t border-line/60 pt-1.5">
              <span className="block font-mono text-[9px] tracking-mission text-mist/70">
                NSIDC · {seaIce.metadata.timestamp.slice(0, 10)}
              </span>
              <span className="block font-mono text-[9px] tracking-mission text-mist/70">
                {seaIce.metadata.grid_resolution_km} KM GRID
              </span>
              <span className="block font-mono text-[9px] tracking-mission text-vessel/80">
                HISTORICAL REPLAY
              </span>
            </div>
          </>
        ) : (
          <span className="font-mono text-[10px] tracking-mission text-mist/50">
            Fetching real sea-ice data…
          </span>
        ))}
    </div>
  );
}
