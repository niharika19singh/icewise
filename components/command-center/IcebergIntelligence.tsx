import { REPLAY_DATE_LABEL } from "./replay";
import type { RouteResponse, IcebergPrediction } from "./types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-mission text-mist">{label}</span>
      <span className="min-w-0 text-right font-mono text-sm text-frost [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

// Every value below is read directly from the real routing API response
// (route.icebergs, itself sourced from Tanusha's prediction dataset via
// Niharika's risk/routing engine) — nothing here is fabricated.
export default function IcebergIntelligence({
  route,
  selectedIcebergId,
  onDeselect,
}: {
  route: RouteResponse;
  selectedIcebergId: string | null;
  onDeselect: () => void;
}) {
  const selected = selectedIcebergId
    ? (route.icebergs.find((ib) => ib.iceberg_id === selectedIcebergId) ?? null)
    : null;

  if (selected) {
    return <IcebergDetail iceberg={selected} onBack={onDeselect} />;
  }

  return <IcebergOverview route={route} />;
}

function IcebergOverview({ route }: { route: RouteResponse }) {
  const icebergs = route.icebergs;
  const allHorizons = icebergs.flatMap((ib) => ib.predicted_positions.map((p) => p.time_offset_hours));
  const horizon = allHorizons.length > 0 ? Math.max(...allHorizons) : null;

  return (
    <div className="mt-4 flex flex-col">
      <Stat label="Snapshot" value={`${REPLAY_DATE_LABEL} · historical`} />
      <Stat label="Icebergs In Corridor" value={String(icebergs.length)} />
      {typeof route.iceberg_prediction_count === "number" && (
        <Stat label="Evaluated By Risk Engine" value={String(route.iceberg_prediction_count)} />
      )}
      <Stat label="Prediction Horizon" value={horizon !== null ? `Up to +${horizon}h` : "N/A"} />
      <Stat
        label="Route Risk Exposure"
        value={`Mean ${(route.metrics.mean_risk_score * 100).toFixed(2)}% / Max ${(route.metrics.max_risk_score * 100).toFixed(2)}%`}
      />
      <p className="mt-4 font-body text-xs leading-relaxed text-mist">
        {icebergs.length > 0
          ? "Click an iceberg marker on the map to inspect its real prediction data."
          : "No icebergs were found within this route's corridor."}
      </p>
    </div>
  );
}

function IcebergDetail({ iceberg, onBack }: { iceberg: IcebergPrediction; onBack: () => void }) {
  return (
    <div className="mt-4 flex flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 self-start font-mono text-[10px] uppercase tracking-mission text-ice transition-colors hover:text-ice-bright"
      >
        ← Back to overview
      </button>

      <Stat label="Current Latitude" value={`${iceberg.current_position.lat.toFixed(4)}°`} />
      <Stat label="Current Longitude" value={`${iceberg.current_position.lon.toFixed(4)}°`} />
      <Stat
        label="Prediction Horizon"
        value={
          iceberg.predicted_positions.length > 0
            ? iceberg.predicted_positions.map((p) => `+${p.time_offset_hours}h`).join(", ")
            : "N/A"
        }
      />
      <Stat label="Spatial Uncertainty" value={`${iceberg.spatial_uncertainty_km.toFixed(2)} km`} />
      <Stat label="Snapshot" value={`${REPLAY_DATE_LABEL} · historical`} />

      {iceberg.predicted_positions.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-mission text-mist">Predicted Positions</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {iceberg.predicted_positions.map((p, i) => (
              <li key={i} className="flex items-center justify-between font-mono text-xs text-frost/90">
                <span className="text-mist">+{p.time_offset_hours}h</span>
                <span>
                  {p.lat.toFixed(4)}°, {p.lon.toFixed(4)}°
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 font-body text-xs leading-relaxed text-mist/70">
        Spatial uncertainty is a positional-radius heuristic (drawn on the map as a growing envelope
        along the predicted trajectory) — not a calibrated collision probability or confidence estimate.
      </p>
      <p className="mt-2 font-body text-xs leading-relaxed text-mist/70">
        Prediction confidence, drift speed/bearing and size class are not provided by the prediction
        dataset, so they are not shown.
      </p>
    </div>
  );
}
