// Compact, mode-aware map legend — mirrors the real layers actually drawn on
// the map for the current mode, so the visualization reads without needing
// the right panel.

import type { SeaIceGeoJSON } from "./types";

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

export default function MapLegend({
  mode,
  hasAdaptiveRoute,
  seaIce,
  hasSelectedRouteOption,
}: {
  mode: string;
  hasAdaptiveRoute: boolean;
  seaIce: SeaIceGeoJSON | null;
  hasSelectedRouteOption: boolean;
}) {
  if (mode !== "map" && mode !== "icebergs" && mode !== "routes" && mode !== "sea-ice") return null;

  return (
    <div className="pointer-events-none absolute bottom-16 left-5 flex flex-col gap-1.5 rounded border border-line bg-abyss-raised/80 px-3 py-2.5">
      {mode === "map" && (
        <>
          <GlyphRow glyph="◆" color="#d99a5b" label="VESSEL / START" />
          <GlyphRow glyph="◎" color="#edf2f2" label="DESTINATION" />
          <LineRow color="#8fd9e0" dashed={false} label="ROUTE" />
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
          <LineRow color="#8fd9e0" dashed={false} label="INITIAL PLAN" />
          {hasAdaptiveRoute ? (
            <LineRow color="#edf2f2" dashed label="ADAPTIVE RE-ROUTE" />
          ) : (
            <span className="font-mono text-[10px] tracking-mission text-mist/50">
              Recalculate to compare
            </span>
          )}
          <GlyphRow glyph="◆" color="#d99a5b" label="VESSEL" />
          <GlyphRow glyph="◎" color="#edf2f2" label="DESTINATION" />
          <GlyphRow glyph="🧊" color="#c3f2f4" label="ICEBERG / RISK OBJECT" />
          {hasSelectedRouteOption && (
            <LineRow color="#d99a5b" dashed={false} label="SELECTED ROUTE OPTION" />
          )}
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
