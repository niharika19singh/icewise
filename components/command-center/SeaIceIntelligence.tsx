import type { SeaIceGeoJSON } from "./types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      <span className="min-w-0 text-right font-mono text-sm text-frost [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

function formatDate(isoTimestamp: string) {
  return isoTimestamp.slice(0, 10);
}

// Every value below is read directly from the real /api/sea-ice/geojson
// response (backend/routing/icewise/sea_ice_api.py, real NSIDC data) or
// computed directly from its features — nothing here is invented.
export default function SeaIceIntelligence({
  seaIce,
  loading,
  error,
  onRetry,
  usedInRouting,
}: {
  seaIce: SeaIceGeoJSON | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  // The routing API's own `sea_ice_integrated` flag for the current route.
  // Undefined until a route exists (or if the API does not send it).
  usedInRouting?: boolean;
}) {
  if (!seaIce) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-frost/20"
        >
          <span className="h-5 w-5 border border-frost/30" />
        </span>
        <p className="font-body text-sm text-frost/80">
          {loading ? "Fetching real NSIDC sea-ice data…" : error ? "Sea-ice data unavailable" : "No data loaded"}
        </p>
        {error && <p className="max-w-[220px] font-body text-xs leading-relaxed text-vessel">{error}</p>}
        {error && !loading && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-ice/40 bg-ice/5 px-4 py-2 font-mono text-[10px] uppercase tracking-mission text-ice transition-colors hover:border-ice hover:bg-ice/10"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const concentrations = seaIce.features.map((f) => f.properties.ice_concentration);
  const min = Math.min(...concentrations);
  const max = Math.max(...concentrations);
  const avg = concentrations.reduce((sum, c) => sum + c, 0) / concentrations.length;

  return (
    <div className="mt-4 flex flex-col">
      <Stat label="Source" value="NSIDC NOAA Sea Ice Index" />
      <Stat label="Dataset" value={seaIce.metadata.dataset_id} />
      <Stat label="Date" value={formatDate(seaIce.metadata.timestamp)} />
      <Stat label="Resolution" value={`${seaIce.metadata.grid_resolution_km} km`} />
      <Stat label="Region" value={seaIce.metadata.region} />
      <Stat label="Grid Cells" value={String(seaIce.metadata.cell_count)} />
      {usedInRouting !== undefined && (
        <Stat label="In Route Risk" value={usedInRouting ? "Yes — per routing service" : "No — per routing service"} />
      )}

      <div className="mt-4 border-t border-line/60 pt-3">
        <p className="font-mono text-[10px] uppercase tracking-mission-wide text-ice">Concentration</p>
        <div className="mt-2">
          <Stat label="Minimum" value={`${(min * 100).toFixed(1)}%`} />
          <Stat label="Maximum" value={`${(max * 100).toFixed(1)}%`} />
          <Stat label="Average" value={`${(avg * 100).toFixed(1)}%`} />
        </div>
      </div>

      <p className="mt-4 font-body text-xs leading-relaxed text-mist">
        Historical replay — a single-day NSIDC observation, not a live feed.
      </p>
    </div>
  );
}
