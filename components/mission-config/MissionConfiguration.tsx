"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { validateMission, type MissionFields, type MissionPoint } from "@/components/command-center/MissionPlanner";
import { REPLAY_TIMESTAMP, REPLAY_DATE_LABEL, DEMO_MISSION } from "@/components/command-center/replay";
import { ROUTE_STRATEGY_COLORS } from "@/components/command-center/routeStyle";
import { haversineKm } from "@/components/command-center/missionAnalysis";
import type { SeaIceGeoJSON } from "@/components/command-center/types";
import MissionRoutePreview, { type PreviewLayers } from "./MissionRoutePreview";
import VesselSchematic from "./VesselSchematic";
import {
  ICE_BANDS,
  ENVIRONMENT_REGION,
  NAVIGABLE_REGION_LABEL,
  CORRIDOR_KM,
  iceBand,
  parseIcebergForecast,
  directLineExposure,
  type IcebergForecast,
} from "./environment";
import {
  VESSEL_PROFILES,
  OBJECTIVES,
  SPEED_RANGE,
  FUEL_RANGE,
  DEFAULT_MISSION_CONFIG,
  getVesselProfile,
  getObjective,
  loadMissionConfig,
  saveMissionConfig,
  type MissionConfig,
  type OperationalObjective,
  type VesselProfileId,
} from "./missionConfig";
import { useBackend, glass, overlay, Brackets, Check, Icon, ICONS, PolarPlot, LeftNav, type Load } from "./workstation";


// Horizons present in backend/prediction/iceberg_prediction_dataset.csv. The
// routing API always uses every horizon in the snapshot; a request cannot pick one.
const DATASET_FORECAST_HOURS = [24, 48, 72];
const MAX_HORIZON = DATASET_FORECAST_HOURS[DATASET_FORECAST_HOURS.length - 1];
const REPLAY_TIME_LABEL = `${REPLAY_TIMESTAMP.slice(0, 10)} ${REPLAY_TIMESTAMP.slice(11, 16)}`;


const parseSeaIce = (d: unknown): SeaIceGeoJSON | null => {
  const g = d as Partial<SeaIceGeoJSON> | null;
  return g && Array.isArray(g.features) && g.metadata ? (g as SeaIceGeoJSON) : null;
};
const parseHealth = (d: unknown) => (d ? true : null);
const PREDICTION_INIT: RequestInit = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ region: ENVIRONMENT_REGION, start_time: REPLAY_TIMESTAMP, horizon_hours: DATASET_FORECAST_HOURS }),
};

// ---------------------------------------------------------------------------
// Hero: tilted environment map with overlays
// ---------------------------------------------------------------------------

// 180° arc gauge for the highest sea-ice concentration observed near the line.
function Gauge({ value }: { value: number | null }) {
  const r = 38;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    return `M ${50 + r * Math.cos(a0)} ${50 - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${50 + r * Math.cos(a1)} ${50 - r * Math.sin(a1)}`;
  };
  const band = value === null ? null : iceBand(value);
  const ascending = [...ICE_BANDS].reverse();
  return (
    <div className="relative mx-auto h-[56px] w-[112px]">
      <svg viewBox="0 0 100 54" className="h-full w-full" aria-hidden>
        <path d={arc(0, 1)} fill="none" stroke="#1d3a48" strokeWidth="7" strokeLinecap="round" />
        {ascending.map((b, i) => (
          <path key={b.id} d={arc(b.min, i < ascending.length - 1 ? ascending[i + 1].min : 1)} fill="none" stroke={b.color} strokeOpacity="0.4" strokeWidth="2.5" />
        ))}
        {value !== null && value > 0 && (
          <path d={arc(0, Math.min(1, value))} fill="none" stroke="#5fd3ea" strokeWidth="7" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px #5fd3ea)" }} />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-tight">
        <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-frost">{band ? band.label : "No obs"}</p>
        <p className="font-body text-[10px] text-mist">{value === null ? `within ${CORRIDOR_KM} km` : `max ${(value * 100).toFixed(0)}% ice`}</p>
      </div>
    </div>
  );
}

function HeroMap({
  start,
  destination,
  seaIce,
  forecast,
  health,
  onRetry,
}: {
  start: MissionPoint | null;
  destination: MissionPoint | null;
  seaIce: Load<SeaIceGeoJSON>;
  forecast: Load<IcebergForecast>;
  health: Load<boolean>;
  onRetry: () => void;
}) {
  const [layers, setLayers] = useState<PreviewLayers>({ seaIce: true, icebergs: true, forecast: true, directLine: true });
  const seaIceData = seaIce.status === "ready" ? seaIce.data : null;
  const forecastData = forecast.status === "ready" ? forecast.data : null;

  const bandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of seaIceData?.features ?? []) {
      const id = iceBand(f.properties.ice_concentration).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [seaIceData]);

  const exposure = useMemo(
    () => (start && destination && (seaIceData || forecastData) ? directLineExposure(start, destination, seaIceData, forecastData) : null),
    [start, destination, seaIceData, forecastData],
  );

  const bergCount = forecastData?.icebergs.length ?? 0;
  const layerRows: { key: keyof PreviewLayers; label: string; note: string; available: boolean }[] = [
    {
      key: "seaIce",
      label: "Ice Concentration",
      note: seaIce.status === "ready" ? `NSIDC · ${seaIce.data.metadata.cell_count} cells` : seaIce.status === "loading" ? "Loading…" : "Unavailable",
      available: seaIce.status === "ready",
    },
    {
      key: "icebergs",
      label: "Iceberg Positions",
      note: forecast.status === "ready" ? `${bergCount} tracked · ${REPLAY_DATE_LABEL}` : forecast.status === "loading" ? "Loading…" : "Unavailable",
      available: forecast.status === "ready",
    },
    {
      key: "forecast",
      label: "Drift Forecast + Uncertainty",
      note: forecastData?.horizons.length ? `${forecastData.horizons.join(" / ")} h` : forecast.status === "loading" ? "Loading…" : "Unavailable",
      available: forecast.status === "ready",
    },
    { key: "directLine", label: "Direct Line", note: "Start → destination", available: true },
  ];
  const anyFailed = seaIce.status === "error" || forecast.status === "error";

  const forecastPanel = (
    <>
          <p className="flex items-center gap-2 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5fd3ea]">
            <Icon d={ICONS.layers} className="h-4 w-4" /> Forecast ({MAX_HORIZON}H)
          </p>
          <p className="mt-0.5 font-body text-[10px] text-mist">
            {forecastData?.model === "physics_ml_hybrid" ? "Physics + ML hybrid drift model" : "Iceberg drift model"}
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {layerRows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={layers[row.key] && row.available}
                  disabled={!row.available}
                  onClick={() => setLayers((l) => ({ ...l, [row.key]: !l[row.key] }))}
                  className="flex w-full items-start gap-2.5 rounded-sm px-1 py-1 text-left transition-colors hover:bg-[#5fd3ea]/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check on={layers[row.key] && row.available} />
                  <span className="leading-tight">
                    <span className="block font-body text-[12px] text-frost">{row.label}</span>
                    <span className="hidden font-body text-[10px] text-mist 2xl:block">{row.note}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {anyFailed && (
            <button type="button" onClick={onRetry} className="mt-1.5 font-body text-[11px] text-[#5fd3ea] underline-offset-2 hover:underline">
              Retry loading environment data
            </button>
          )}
    </>
  );

  return (
    <section className="relative isolate min-h-[480px] flex-1 overflow-hidden 2xl:min-h-[400px] rounded-md border border-[#3b8fb0]/35 bg-[#040a0e]">
      <MissionRoutePreview
        start={start}
        destination={destination}
        seaIce={seaIceData}
        icebergs={forecastData?.icebergs ?? null}
        layers={layers}
        insets={{ top: 0.36, bottom: 0.12, left: 0.24, right: 0.44 }}
      />

      {/* Cinematic grade: sky haze at the horizon, darkened frame, faint scanlines. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#0a3a5c]/45 mix-blend-color" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#1b4c6e]/55 mix-blend-multiply" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[42%] bg-[linear-gradient(180deg,rgba(4,10,14,0.92),rgba(4,10,14,0.35)_55%,rgba(4,10,14,0))]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_80%_at_45%_60%,rgba(4,10,14,0)_50%,rgba(4,10,14,0.85)_100%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(0deg,rgba(4,10,14,0.9),rgba(4,10,14,0))]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:repeating-linear-gradient(0deg,#8fd9e0_0px,#8fd9e0_1px,transparent_1px,transparent_3px)]" />

      {/* Title block */}
      <div className="absolute left-5 top-5 xl:left-6 xl:top-6">
        <div className={`relative px-5 py-4 ${overlay} bg-[#061019]/55`}>
          <Brackets />
          <h1 className="font-display text-[28px] font-semibold uppercase leading-none tracking-[0.03em] text-white xl:text-[34px]">
            Mission Planner
          </h1>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 font-body text-[12px] uppercase tracking-[0.08em] text-frost/80">
            {["Plan", "Analyze", "Navigate", "Safer Tomorrows"].map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <span className="text-[#5fd3ea]">›</span>}
                {s}
              </span>
            ))}
          </p>
        </div>
      </div>

      <p className="pointer-events-none absolute left-[430px] top-[30px] hidden max-w-[220px] font-body text-[14px] italic leading-snug text-frost/80 2xl:block">
        “Smarter routes.
        <br />
        Safer missions.
        <br />A more resilient Antarctica.”
      </p>

      {/* Status + replay */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className={`flex items-stretch ${overlay}`}>
          <div className="px-4 py-2.5">
            <p className="flex items-center gap-2 font-body text-[13px] text-frost">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${
                  health.status === "ready"
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                    : health.status === "loading"
                      ? "bg-mist"
                      : "bg-vessel shadow-[0_0_8px_rgba(217,154,91,0.9)]"
                }`}
              />
              Antarctica Research Support
            </p>
            <p className="pl-[18px] font-body text-[12px] text-mist">
              {health.status === "ready" ? "Routing service online" : health.status === "loading" ? "Checking routing service…" : "Routing service unreachable"}
            </p>
          </div>
          <div className="hidden border-l border-[#3b8fb0]/35 px-4 py-2.5 xl:block">
            <p className="font-body text-[13px] font-medium text-frost">ICEWISE</p>
            <p className="font-body text-[12px] text-mist">Grand Finale Edition</p>
          </div>
        </div>
        <div className={`px-4 py-2 ${overlay}`}>
          <p className="font-display text-[16px] font-medium tracking-wide text-white">
            {REPLAY_DATE_LABEL} <span className="ml-3">{REPLAY_TIMESTAMP.slice(11, 16)} UTC</span>
          </p>
          <p className="mt-0.5 font-body text-[11px] uppercase tracking-[0.12em] text-[#5fd3ea]">— Historical Replay Mode</p>
        </div>
      </div>

      {/* Left column: ice conditions legend (+ real cell counts per band), and
          below 2xl the forecast layer toggles stacked under it. */}
      <div className="absolute left-5 top-[128px] flex w-[212px] flex-col gap-2 xl:left-6 xl:top-[136px]">
        <div className={`px-3.5 py-3 ${overlay}`}>
          <p className="font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5fd3ea]">Ice Conditions</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {ICE_BANDS.map((b) => (
              <li key={b.id} className="flex items-center gap-2.5 font-body text-[12px] text-frost/90">
                <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-[2px] border border-white/20" style={{ background: b.color }} />
                <span className="flex-1">
                  {b.label} <span className="text-mist">({b.range})</span>
                </span>
                {seaIceData && <span className="font-mono text-[10px] text-mist">{bandCounts.get(b.id) ?? 0}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 hidden font-body text-[10px] leading-snug text-mist 2xl:block">
            NSIDC Sea Ice Index · {seaIceData ? seaIceData.metadata.timestamp.slice(0, 10) : "—"}
          </p>
        </div>
        <div className={`hidden px-3.5 py-2.5 xl:block 2xl:hidden ${overlay}`}>{forecastPanel}</div>
      </div>

      {/* Forecast layer toggles at full width — every row is real data on the map */}
      <div className={`absolute right-[244px] top-[130px] hidden w-[200px] px-3.5 py-3 2xl:block ${overlay}`}>{forecastPanel}</div>

      {/* Right column: region + direct-line environment */}
      <div className="absolute bottom-4 right-4 top-[130px] hidden w-[216px] flex-col gap-2.5 xl:flex">
        <div className={`flex shrink-0 items-center gap-3 px-3 py-2 [@media(max-height:960px)]:hidden ${overlay}`}>
          <PolarPlot start={start} destination={destination} className="h-[58px] w-[58px] shrink-0" />
          <div className="leading-tight">
            <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-frost">Weddell Sea</p>
            <p className="font-body text-[11px] text-mist">Antarctica</p>
            <p className="mt-1.5 font-body text-[10.5px] text-frost/80">Navigable region</p>
            <p className="font-body text-[10.5px] text-mist">{NAVIGABLE_REGION_LABEL}</p>
          </div>
        </div>
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-3.5 py-3 ${overlay}`}>
          <p className="font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5fd3ea]" title={`Observed within ${CORRIDOR_KM} km of the direct line`}>
            Direct-Line Environment
          </p>
          <div className="mt-1.5">
            <Gauge value={exposure?.maxConcentration ?? null} />
          </div>
          <dl className="mt-2 flex flex-col gap-1 font-body text-[12px]">
            {[
              ["Sea-ice cells", exposure ? String(exposure.seaIceCells) : "—"],
              ["Mean concentration", exposure?.meanConcentration != null ? `${(exposure.meanConcentration * 100).toFixed(0)}%` : "—"],
              ["Icebergs near line", exposure && forecastData ? String(exposure.icebergsNear) : "—"],
              ["Nearest iceberg", exposure?.nearest ? `${exposure.nearest.id} · ${exposure.nearest.km.toFixed(0)} km` : "—"],
              ["Max 72 h uncertainty", exposure?.maxUncertaintyKm != null ? `${exposure.maxUncertaintyKm.toFixed(1)} km` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <dt className="text-frost/80">{k}</dt>
                <dd className="text-right font-medium text-frost">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Below xl the overlays above are hidden; keep the essentials. */}
      <div className={`absolute bottom-4 left-5 px-3 py-2 xl:hidden ${overlay}`}>
        <p className="font-body text-[11px] text-frost">
          {bergCount > 0 ? `${bergCount} icebergs tracked · ` : ""}
          {exposure?.nearest ? `nearest ${exposure.nearest.id} ${exposure.nearest.km.toFixed(0)} km from line` : "Weddell Sea"}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Numbered panels
// ---------------------------------------------------------------------------

function Panel({
  n,
  title,
  subtitle,
  className = "",
  titleExtra,
  children,
}: {
  n: number;
  title: string;
  subtitle: string;
  className?: string;
  titleExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`relative flex flex-col rounded-md px-5 pb-3 pt-3 ${glass} ${className}`}>
      <header className="mb-2.5 flex items-center gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#5fd3ea] font-display text-[17px] font-semibold text-[#bff3fb] shadow-[0_0_14px_-2px_rgba(95,211,234,0.7)]">
          {n}
        </span>
        <div className="min-w-0 leading-tight">
          <h2 className="flex flex-wrap items-center gap-x-2 font-display text-[18px] font-semibold uppercase tracking-[0.02em] text-white">
            {title}
            {titleExtra}
          </h2>
          <p className="mt-0.5 font-body text-[12.5px] text-[#8fd6ec]">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

const inputBase =
  "w-full rounded-[4px] border bg-[#061119] px-3 py-[7px] font-body text-[14px] text-frost outline-none transition-colors focus:border-[#5fd3ea] focus:shadow-[0_0_0_1px_rgba(95,211,234,0.5),0_0_14px_-4px_rgba(95,211,234,0.8)]";

// Numeric vessel parameter: keeps its own text while typing and only commits
// values inside the accepted range.
function NumberField({
  value,
  unit,
  range,
  label,
  onChange,
}: {
  value: number;
  unit: string;
  range: { min: number; max: number; step: number };
  label: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(value);
  const parsed = Number(shown.replace(",", "."));
  const invalid = text !== null && !(shown.trim() !== "" && Number.isFinite(parsed) && parsed >= range.min && parsed <= range.max);
  return (
    <div className="flex flex-col">
      <div
        className={`flex overflow-hidden rounded-[4px] border bg-[#061119] focus-within:border-[#5fd3ea] ${
          invalid ? "border-vessel/80" : "border-[#2a5a6c]"
        }`}
      >
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid}
          value={shown}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value.replace(",", "."));
            if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= range.min && v <= range.max) onChange(v);
          }}
          onBlur={() => setText(null)}
          className="w-full min-w-0 bg-transparent px-3 py-[7px] font-body text-[14px] text-frost outline-none"
        />
        <span className="flex shrink-0 items-center border-l border-[#2a5a6c] px-3 font-body text-[13px] text-frost/80">{unit}</span>
      </div>
      {invalid && (
        <span role="alert" className="mt-0.5 font-body text-[10.5px] text-vessel">
          {range.min}–{range.max} {unit}
        </span>
      )}
    </div>
  );
}

function VesselPanel({
  config,
  onSelectProfile,
  onChange,
}: {
  config: MissionConfig;
  onSelectProfile: (id: VesselProfileId) => void;
  onChange: (patch: Partial<MissionConfig>) => void;
}) {
  const profile = getVesselProfile(config.profileId);
  const adjusted =
    config.cruiseSpeedKnots !== profile.cruiseSpeedKnots || config.fuelRateTonsPerDay !== profile.fuelRateTonsPerDay;
  return (
    <Panel
      n={1}
      title="Vessel Profile"
      subtitle="Select a vessel or customize parameters"
      titleExtra={
        <span title="Planning presets sent to the routing engine — not certified vessel specifications." className="text-[#8fd6ec]">
          <Icon d={ICONS.info} className="h-4 w-4" />
        </span>
      }
    >
      <div role="radiogroup" aria-label="Vessel class" className="grid grid-cols-3 gap-2.5">
        {VESSEL_PROFILES.map((p) => {
          const active = p.id === config.profileId;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={p.name}
              onClick={() => onSelectProfile(p.id)}
              className={`group relative flex flex-col overflow-hidden rounded-[5px] border px-2.5 pb-2 pt-2 text-left transition-all ${
                active
                  ? "border-[#5fd3ea] bg-[linear-gradient(180deg,rgba(95,211,234,0.16),rgba(95,211,234,0.03))] shadow-[0_0_0_1px_rgba(95,211,234,0.5),0_0_22px_-6px_rgba(95,211,234,0.9)]"
                  : "border-[#2a5a6c]/70 bg-[#071520]/80 hover:border-[#5fd3ea]/60"
              }`}
            >
              <span className="font-display text-[12.5px] font-semibold leading-tight text-white">{p.name}</span>
              <span className="relative -mx-1 my-0.5 block h-[40px] bg-[radial-gradient(ellipse_70%_55%_at_50%_75%,rgba(95,211,234,0.28),rgba(0,0,0,0)_70%)]">
                <VesselSchematic profileId={p.id} variant="solid" className="h-full w-full" />
              </span>
              <span className="font-body text-[11px] leading-snug text-mist">{p.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <p className="font-body text-[13px] font-medium text-frost">Vessel Parameters</p>
        {adjusted && (
          <button type="button" onClick={() => onSelectProfile(profile.id)} className="font-body text-[11px] text-[#5fd3ea] hover:underline">
            Reset to preset
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-x-4 gap-y-2 2xl:grid-cols-[minmax(0,7.5rem)_minmax(0,9rem)_1fr]">
        <span className="font-body text-[13px] text-frost">Cruising Speed</span>
        <NumberField label="Cruising speed" value={config.cruiseSpeedKnots} unit="knots" range={SPEED_RANGE} onChange={(cruiseSpeedKnots) => onChange({ cruiseSpeedKnots })} />
        <span className="hidden font-body text-[11.5px] leading-snug text-mist 2xl:block">Sets routed ETA</span>

        <span className="font-body text-[13px] text-frost">Fuel Consumption</span>
        <NumberField label="Fuel consumption" value={config.fuelRateTonsPerDay} unit="t/day" range={FUEL_RANGE} onChange={(fuelRateTonsPerDay) => onChange({ fuelRateTonsPerDay })} />
        <span className="hidden font-body text-[11.5px] leading-snug text-mist 2xl:block">Sets routed fuel</span>

        <span className="font-body text-[13px] text-frost">Operational Profile</span>
        <div className="relative">
          <select
            aria-label="Operational profile"
            value={config.objective}
            onChange={(e) => onChange({ objective: e.target.value as OperationalObjective })}
            className={`${inputBase} cursor-pointer appearance-none border-[#2a5a6c] pr-8`}
          >
            {OBJECTIVES.map((o) => (
              <option key={o.id} value={o.id} className="bg-[#061119]">
                {o.label}
              </option>
            ))}
          </select>
          <Icon d="m6 9 6 6 6-6" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-frost/80" />
        </div>
        <span className="hidden font-body text-[11.5px] leading-snug text-mist 2xl:block">{getObjective(config.objective).caption}</span>
      </div>
    </Panel>
  );
}

function CoordField({
  label,
  value,
  error,
  onChange,
  onFocus,
  onBlur,
}: {
  label: string;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="font-body text-[13px] text-frost">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-invalid={!!error}
        className={`${inputBase} ${error ? "border-vessel/80" : "border-[#2a5a6c]"}`}
      />
      {error && (
        <span role="alert" className="-mt-0.5 font-body text-[10.5px] leading-tight text-vessel">
          {error}
        </span>
      )}
    </label>
  );
}

function LockedField({ label, value, icon, title }: { label: string; value: string; icon: keyof typeof ICONS; title: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1" title={title}>
      <span className="font-body text-[13px] text-frost">{label}</span>
      <div className={`${inputBase} flex items-center justify-between gap-2 border-[#2a5a6c]/70 bg-[#061119]/70 text-frost/90`}>
        <span className="truncate">{value}</span>
        <Icon d={ICONS[icon]} className="h-4 w-4 shrink-0 text-frost/70" />
      </div>
    </div>
  );
}

function MissionPanel({
  fields,
  errors,
  missionError,
  objective,
  onFieldsChange,
  onFocusField,
  onObjective,
  isDemo,
  onResetDemo,
}: {
  fields: MissionFields;
  errors: Record<keyof MissionFields, string | null>;
  missionError: string | null;
  objective: OperationalObjective;
  onFieldsChange: (f: MissionFields) => void;
  onFocusField: (k: keyof MissionFields | null) => void;
  onObjective: (o: OperationalObjective) => void;
  isDemo: boolean;
  onResetDemo: () => void;
}) {
  const field = (key: keyof MissionFields, label: string) => (
    <CoordField
      label={label}
      value={fields[key]}
      error={errors[key]}
      onChange={(v) => onFieldsChange({ ...fields, [key]: v })}
      onFocus={() => onFocusField(key)}
      onBlur={() => onFocusField(null)}
    />
  );
  const activeIndex = OBJECTIVES.findIndex((o) => o.id === objective);
  return (
    <Panel
      n={2}
      title="Mission Parameters"
      subtitle="Define your mission area and timing"
      titleExtra={
        !isDemo && (
          <button type="button" onClick={onResetDemo} className="font-body text-[11px] font-normal normal-case tracking-normal text-[#5fd3ea] hover:underline">
            Reset to demo corridor
          </button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        {field("startLat", "Start Latitude")}
        {field("startLon", "Start Longitude")}
        {field("destLat", "Destination Latitude")}
        {field("destLon", "Destination Longitude")}
        <LockedField
          label="Departure / Replay Time"
          value={REPLAY_TIME_LABEL}
          icon="calendar"
          title="Fixed historical snapshot (UTC): the only date with the full iceberg set and the NSIDC sea-ice grid."
        />
        <LockedField
          label="Forecast Horizon"
          value={`${MAX_HORIZON} hours`}
          icon="lock"
          title={`Set by the prediction dataset: every mission uses its ${DATASET_FORECAST_HOURS.join(" / ")} h forecasts.`}
        />
      </div>
      {missionError && (
        <p role="alert" className="mt-1.5 font-body text-[11px] text-vessel">
          {missionError}
        </p>
      )}

      <div className="mt-3 border-t border-[#3b8fb0]/25 pt-2.5">
        <div className="flex items-center gap-3">
          <Icon d={ICONS.shield} className="h-7 w-7 shrink-0 text-[#5fd3ea]" />
          <div className="leading-tight">
            <p className="font-display text-[15px] font-medium text-white">Operational Objective</p>
            <p className="font-body text-[12px] text-mist">Set your mission priority</p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Operational objective" className="relative mt-2.5 grid grid-cols-3">
          <span aria-hidden className="absolute left-[16.66%] right-[16.66%] top-[9px] h-[2px] bg-[#2a5a6c]" />
          <span
            aria-hidden
            className="absolute left-[16.66%] top-[9px] h-[2px] bg-[#5fd3ea] shadow-[0_0_8px_#5fd3ea] transition-all duration-500"
            style={{ width: `${(activeIndex / 2) * 66.67}%` }}
          />
          {OBJECTIVES.map((o) => {
            const on = o.id === objective;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onObjective(o.id)}
                className="group relative flex flex-col items-center px-1 text-center"
              >
                <span className="flex h-5 items-center">
                  <span
                    aria-hidden
                    className={`relative z-10 flex items-center justify-center rounded-full transition-all ${
                      on
                        ? "h-[28px] w-[28px] border-2 border-[#5fd3ea] bg-[#061119] shadow-[0_0_16px_rgba(95,211,234,0.9)]"
                        : "h-[18px] w-[18px] border border-[#2a5a6c] bg-[#061119] group-hover:border-[#5fd3ea]"
                    }`}
                  >
                    <span className={`rounded-full ${on ? "h-3 w-3 bg-[#5fd3ea]" : "h-1.5 w-1.5 bg-[#5fd3ea]/60"}`} />
                  </span>
                </span>
                <span className={`mt-2 font-display text-[13px] font-semibold ${on ? "text-white" : "text-frost/80 group-hover:text-white"}`}>
                  {o.label}
                </span>
                <span className="font-body text-[11px] leading-snug text-mist">{o.caption}</span>
                <span className="font-body text-[10px] text-mist/60">α {o.riskWeight.toFixed(1)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function SummaryRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="grid grid-cols-[6.6rem_1fr] gap-2 py-[2px] font-body text-[12px] 2xl:grid-cols-[7.8rem_1fr] 2xl:text-[12.5px]">
      <dt className="text-frost/75">{k}</dt>
      <dd className="font-medium text-white" style={color ? { color } : undefined}>
        {v}
      </dd>
    </div>
  );
}

function SummaryPanel({
  config,
  start,
  destination,
  className,
}: {
  config: MissionConfig;
  start: MissionPoint | null;
  destination: MissionPoint | null;
  className?: string;
}) {
  const profile = getVesselProfile(config.profileId);
  const objective = getObjective(config.objective);
  const fmt = (p: MissionPoint | null) => (p ? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` : "—");
  // Direct-line lower bound with the routing engine's own formulas
  // (metrics.py: hours = nm / speed, fuel = hours / 24 * rate).
  const direct = useMemo(() => {
    if (!start || !destination) return null;
    const km = haversineKm(start, destination);
    const hours = km / 1.852 / config.cruiseSpeedKnots;
    return { km, hours, fuel: (hours / 24) * config.fuelRateTonsPerDay };
  }, [start, destination, config.cruiseSpeedKnots, config.fuelRateTonsPerDay]);

  return (
    <Panel n={3} title="Mission Summary" subtitle="Review before initializing" className={className}>
      <div className="rounded-[5px] border border-[#2a5a6c]/70 bg-[#061119]/60 px-4 py-2.5">
        <dl>
          <SummaryRow k="Vessel" v={profile.name} />
          <SummaryRow k="Speed" v={`${config.cruiseSpeedKnots} knots`} />
          <SummaryRow k="Fuel Consumption" v={`${config.fuelRateTonsPerDay} tons/day`} />
          <SummaryRow k="Operational Profile" v={objective.label} color={ROUTE_STRATEGY_COLORS[objective.strategy]} />
        </dl>
        <div className="my-2 h-px bg-[#3b8fb0]/25" />
        <dl>
          <SummaryRow k="Start" v={fmt(start)} />
          <SummaryRow k="Destination" v={fmt(destination)} />
          <SummaryRow k="Departure Time" v={`${REPLAY_TIME_LABEL} UTC`} />
          <SummaryRow k="Forecast Horizon" v={`${MAX_HORIZON} hours`} />
          <SummaryRow
            k="Direct-line minimum"
            v={direct ? `${direct.km.toFixed(0)} km · ${direct.hours.toFixed(1)} h · ${direct.fuel.toFixed(1)} t` : "—"}
          />
        </dl>
      </div>
      <div className="mt-2.5 flex gap-3 rounded-[5px] border border-[#3b8fb0]/35 bg-[#5fd3ea]/[0.05] px-3.5 py-2.5">
        <Icon d={ICONS.info} className="mt-0.5 h-5 w-5 shrink-0 text-[#5fd3ea]" />
        <p className="font-body text-[11.5px] leading-snug text-frost/80">
          Vessel values are representative planning presets. Routed distance, ETA and fuel are computed by the ICEWISE
          routing engine when the mission is initialized.
        </p>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MissionConfiguration() {
  const router = useRouter();
  const [config, setConfig] = useState<MissionConfig>(DEFAULT_MISSION_CONFIG);
  const [focused, setFocused] = useState<keyof MissionFields | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Restore this tab's previous configuration. Client-only (sessionStorage
  // does not exist during SSR), so it cannot be a state initializer without a
  // hydration mismatch.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const stored = loadMissionConfig();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored) setConfig(stored);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Keep the saved configuration current as it is edited (without asking the
  // Command Center to generate), so pages such as Route Robustness see it.
  useEffect(() => {
    if (restored) saveMissionConfig(config, false);
  }, [config, restored]);

  const health = useBackend("/health", undefined, parseHealth, attempt);
  const seaIce = useBackend("/api/sea-ice/geojson", undefined, parseSeaIce, attempt);
  const forecast = useBackend("/api/prediction/mission", PREDICTION_INIT, parseIcebergForecast, attempt);

  const validation = validateMission(config.fields);
  const errors = Object.fromEntries(
    (Object.keys(validation.errors) as (keyof MissionFields)[]).map((k) => [
      k,
      focused === k && !showAllErrors ? null : validation.errors[k],
    ]),
  ) as Record<keyof MissionFields, string | null>;
  const isDemo = (Object.keys(DEMO_MISSION) as (keyof MissionFields)[]).every(
    (k) => Number(config.fields[k]) === Number(DEMO_MISSION[k]),
  );

  const update = (patch: Partial<MissionConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const selectProfile = (id: VesselProfileId) => {
    const p = getVesselProfile(id);
    update({ profileId: id, cruiseSpeedKnots: p.cruiseSpeedKnots, fuelRateTonsPerDay: p.fuelRateTonsPerDay });
  };

  const handleInitialize = () => {
    if (launching) return;
    if (!validation.valid) {
      setShowAllErrors(true);
      return;
    }
    setLaunching(true);
    saveMissionConfig(config, true);
    router.push("/command-center");
  };

  return (
    <div className="flex min-h-screen bg-[#03080c] text-frost">
      <LeftNav active="planner" />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <HeroMap
          start={validation.start}
          destination={validation.destination}
          seaIce={seaIce}
          forecast={forecast}
          health={health}
          onRetry={() => setAttempt((n) => n + 1)}
        />

        <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.12fr_1.12fr_0.92fr]">
          <VesselPanel config={config} onSelectProfile={selectProfile} onChange={update} />
          <MissionPanel
            fields={config.fields}
            errors={errors}
            missionError={validation.missionError}
            objective={config.objective}
            onFieldsChange={(fields) => update({ fields })}
            onFocusField={setFocused}
            onObjective={(objective) => update({ objective })}
            isDemo={isDemo}
            onResetDemo={() => update({ fields: DEMO_MISSION })}
          />
          <SummaryPanel
            config={config}
            start={validation.start}
            destination={validation.destination}
            className="md:col-span-2 xl:col-span-1"
          />
        </div>

        <button
          type="button"
          onClick={handleInitialize}
          disabled={launching}
          aria-describedby="initialize-status"
          className={`group relative flex h-[60px] shrink-0 items-center justify-center overflow-hidden rounded-md font-display text-[19px] font-semibold uppercase tracking-[0.12em] transition-all ${
            validation.valid
              ? "bg-[linear-gradient(90deg,#3fb9e2,#7fdcf2_45%,#a8ecf8_60%,#56c7ea)] text-[#04202c] shadow-[0_0_0_1px_rgba(191,243,251,0.7),0_0_44px_-8px_rgba(95,211,234,0.95)] hover:shadow-[0_0_0_1px_rgba(191,243,251,1),0_0_60px_-6px_rgba(95,211,234,1)]"
              : "cursor-not-allowed border border-[#2a5a6c] bg-[#071520] text-mist"
          }`}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/4 skew-x-[-20deg] bg-white/40 opacity-0 transition-all duration-700 group-hover:left-[110%] group-hover:opacity-100"
          />
          <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="mr-4 h-5 w-5">
            <path d="M7 4.5v15l12-7.5-12-7.5Z" />
          </svg>
          {launching ? "Opening Command Center…" : "Initialize Mission"}
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute right-6 h-6 w-6 transition-transform group-hover:translate-x-1">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </button>
        <p id="initialize-status" className={`-mt-1.5 text-center font-body text-[11.5px] ${validation.valid ? "text-mist" : "text-vessel"}`}>
          {validation.valid
            ? "Saves this configuration, runs the routing engine and opens the mission in the Command Center."
            : showAllErrors
              ? "Resolve the highlighted mission parameters to initialize."
              : "Enter valid start and destination coordinates to initialize."}
        </p>
      </div>
    </div>
  );
}
