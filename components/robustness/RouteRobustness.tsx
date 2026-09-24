"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { validateMission } from "@/components/command-center/MissionPlanner";
import { REPLAY_TIMESTAMP, REPLAY_DATE_LABEL } from "@/components/command-center/replay";
import { classifyRouteStrategy } from "@/components/command-center/routeStyle";
import { isRouteOption, type RouteOption, type RouteResponse, type SeaIceGeoJSON } from "@/components/command-center/types";
import VesselSchematic from "@/components/mission-config/VesselSchematic";
import {
  DEFAULT_MISSION_CONFIG,
  getObjective,
  getVesselProfile,
  loadMissionConfig,
  saveMissionConfig,
  toVesselRequest,
  type MissionConfig,
  type OperationalObjective,
} from "@/components/mission-config/missionConfig";
import { BASE_API_URL, useBackend, glass, overlay, Icon, ICONS, LeftNav, type Load } from "@/components/mission-config/workstation";
import heroImage from "@/public/images/route-robustness-hero.webp";
import {
  UNCERTAINTY_LEVELS,
  analyseStrategy,
  makeSeaIceLookup,
  outsideCorridorBound,
  type OutsideBerg,
  type StrategyAnalysis,
} from "./robustness";

const REQUEST_TIMEOUT_MS = 90_000;

// Display identity for the three existing strategies on this page. Colors
// match the trajectories drawn in the hero visual (cyan / yellow / red).
const STRATEGIES: { objective: OperationalObjective; kind: "shortest" | "balanced" | "safety"; name: string; color: string }[] = [
  { objective: "efficiency", kind: "shortest", name: "Shortest Route", color: "#3fd8f0" },
  { objective: "balanced", kind: "balanced", name: "Balanced Route", color: "#f7c948" },
  { objective: "safety", kind: "safety", name: "Safety First Route", color: "#ff5a4e" },
];

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const parseSeaIce = (d: unknown): SeaIceGeoJSON | null => {
  const g = d as Partial<SeaIceGeoJSON> | null;
  return g && Array.isArray(g.features) && g.metadata ? (g as SeaIceGeoJSON) : null;
};
const parseHealth = (d: unknown) => (d ? true : null);

function isRouteResponse(d: unknown): d is RouteResponse {
  const r = d as Partial<RouteResponse> | null;
  return !!r && Array.isArray(r.waypoints) && Array.isArray(r.icebergs) && !!r.metrics && Array.isArray(r.route_options);
}

// POST /api/route for the configured mission and vessel — the same request
// the Command Center sends, so these are the same three strategies it shows.
function useRoute(config: MissionConfig | null, attempt: number): Load<RouteResponse> {
  const [state, setState] = useState<Load<RouteResponse>>({ status: "loading" });
  const body = useMemo(() => {
    if (!config) return null;
    const v = validateMission(config.fields);
    if (!v.valid || !v.start || !v.destination) return null;
    return JSON.stringify({
      ...toVesselRequest(config),
      start_point: v.start,
      destination: v.destination,
      target_timestamp: REPLAY_TIMESTAMP,
    });
  }, [config]);

  useEffect(() => {
    if (!body) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    fetch(`${BASE_API_URL}/api/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => {
        if (!isRouteResponse(data)) throw new Error("unexpected response");
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [body, attempt]);
  return state;
}

// Every iceberg forecast around the mission (POST /api/prediction/mission),
// used only to bound bergs the route response leaves out of its corridor.
function useOutsideBergs(fields: MissionConfig["fields"] | null, corridorIds: string[] | null, attempt: number): OutsideBerg[] | null {
  const [bergs, setBergs] = useState<OutsideBerg[] | null>(null);
  const key = corridorIds?.join(",");
  const fieldsKey = fields ? JSON.stringify(fields) : null;
  useEffect(() => {
    if (!fields || !corridorIds) return;
    const v = validateMission(fields);
    if (!v.start || !v.destination) return;
    // Mission box ±3° lat / ±8° lon, within the API's 15° × 30° prototype limit.
    const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
    const region = {
      min_lat: clamp(Math.min(v.start.lat, v.destination.lat) - 3, -90, 90),
      max_lat: clamp(Math.max(v.start.lat, v.destination.lat) + 3, -90, 90),
      min_lon: clamp(Math.min(v.start.lon, v.destination.lon) - 8, -180, 180),
      max_lon: clamp(Math.max(v.start.lon, v.destination.lon) + 8, -180, 180),
    };
    let cancelled = false;
    fetch(`${BASE_API_URL}/api/prediction/mission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, start_time: REPLAY_TIMESTAMP, horizon_hours: [24, 48, 72] }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { status?: string; icebergs?: unknown[] }) => {
        const inCorridor = new Set(corridorIds);
        const list: OutsideBerg[] = [];
        for (const raw of data.icebergs ?? []) {
          const b = raw as { iceberg_id?: string; current_state?: { latitude: number; longitude: number }; predictions?: { latitude: number; longitude: number; uncertainty_km: number }[] };
          if (!b.iceberg_id || !b.current_state || inCorridor.has(b.iceberg_id)) continue;
          const preds = b.predictions ?? [];
          const u0 = preds.length ? Math.min(...preds.map((p) => p.uncertainty_km)) : 0;
          list.push({
            id: b.iceberg_id,
            positions: [
              { lat: b.current_state.latitude, lon: b.current_state.longitude, uncertaintyKm: u0 },
              ...preds.map((p) => ({ lat: p.latitude, lon: p.longitude, uncertaintyKm: p.uncertainty_km })),
            ],
          });
        }
        if (!cancelled) setBergs(list);
      })
      .catch(() => {
        if (!cancelled) setBergs(null);
      });
    return () => {
      cancelled = true;
    };
    // fields/corridorIds are keyed by their serialized values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, key, attempt]);
  return bergs;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Card({ title, info, aside, className = "", children }: { title: string; info?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`relative flex min-w-0 flex-col rounded-md px-4 py-2.5 ${glass} ${className}`}>
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[13.5px] font-semibold uppercase tracking-[0.05em] text-[#5fd3ea]">
          {title}
          {info && (
            <span title={info} className="text-[#8fd6ec]">
              <Icon d={ICONS.info} className="h-4 w-4" />
            </span>
          )}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function RouteThumb({ options, highlight, color }: { options: RouteOption[]; highlight: string; color: string }) {
  // Real route geometry, equirectangular with longitude scaled by cos(lat).
  const all = options.flatMap((o) => o.waypoints);
  if (!all.length) return null;
  const midLat = (Math.min(...all.map((p) => p.lat)) + Math.max(...all.map((p) => p.lat))) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = all.map((p) => p.lon * kx);
  const ys = all.map((p) => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const W = 96;
  const H = 64;
  const s = (Math.min(W, H) - 12) / span;
  const px = (p: { lat: number; lon: number }) =>
    `${(W / 2 + (p.lon * kx - (x0 + x1) / 2) * s).toFixed(1)},${(H / 2 - (p.lat - (y0 + y1) / 2) * s).toFixed(1)}`;
  const target = options.find((o) => o.route_id === highlight);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="h-[64px] w-[96px] shrink-0 rounded-[4px] border border-[#2a5a6c]/70 bg-[#050d13]">
      {options
        .filter((o) => o.route_id !== highlight)
        .map((o) => (
          <polyline key={o.route_id} points={o.waypoints.map(px).join(" ")} fill="none" stroke="#8fd9e0" strokeOpacity="0.2" strokeWidth="1" />
        ))}
      {target && (
        <>
          <polyline points={target.waypoints.map(px).join(" ")} fill="none" stroke={color} strokeWidth="1.8" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
          <circle cx={px(target.waypoints[0]).split(",")[0]} cy={px(target.waypoints[0]).split(",")[1]} r="2.2" fill="#2dd4bf" />
          <circle cx={px(target.waypoints[target.waypoints.length - 1]).split(",")[0]} cy={px(target.waypoints[target.waypoints.length - 1]).split(",")[1]} r="2.2" fill="#f87171" />
        </>
      )}
    </svg>
  );
}

function HazardChart({ rows }: { rows: { name: string; color: string; values: number[] }[] }) {
  const W = 360;
  const H = 170;
  const pad = { l: 34, r: 14, t: 10, b: 34 };
  const maxV = Math.max(0.1, ...rows.flatMap((r) => r.values));
  const top = Math.ceil((maxV * 100) / 10) * 10;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (UNCERTAINTY_LEVELS.length - 1);
  const y = (v: number) => pad.t + (1 - (v * 100) / top) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: 5 }, (_, i) => (top * i) / 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Maximum hazard exposure by uncertainty level">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t / 100)} y2={y(t / 100)} stroke="#8fd9e0" strokeOpacity="0.12" />
          <text x={pad.l - 6} y={y(t / 100) + 3} textAnchor="end" className="fill-[#7c8b90] font-body text-[9px]">
            {t.toFixed(0)}
          </text>
        </g>
      ))}
      <text x={10} y={(H - pad.b + pad.t) / 2} transform={`rotate(-90 10 ${(H - pad.b + pad.t) / 2})`} textAnchor="middle" className="fill-[#7c8b90] font-body text-[9px]">
        Max hazard (%)
      </text>
      {UNCERTAINTY_LEVELS.map((l, i) => (
        <g key={l.k}>
          <line x1={x(i)} x2={x(i)} y1={pad.t} y2={H - pad.b} stroke="#8fd9e0" strokeOpacity="0.08" />
          <text x={x(i)} y={H - pad.b + 13} textAnchor="middle" className="fill-[#edf2f2] font-body text-[10px]">
            {l.k.toFixed(1)}×
          </text>
          <text x={x(i)} y={H - pad.b + 24} textAnchor="middle" className="fill-[#7c8b90] font-body text-[9px]">
            {l.label}
          </text>
        </g>
      ))}
      {rows.map((r) => (
        <g key={r.name}>
          <polyline
            points={r.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={r.color}
            strokeWidth="2"
            style={{ filter: `drop-shadow(0 0 3px ${r.color})` }}
          />
          {r.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={r.color} stroke="#05080a" strokeWidth="1" />
          ))}
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RouteRobustness() {
  const router = useRouter();
  const [config, setConfig] = useState<MissionConfig | null>(null);
  const [configured, setConfigured] = useState(false);
  const [levelIndex, setLevelIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [launching, setLaunching] = useState(false);

  // Vessel + mission come from the Vessel & Mission Configuration page
  // (sessionStorage); the demo configuration is used when none was saved.
  useEffect(() => {
    const stored = loadMissionConfig();
    /* eslint-disable react-hooks/set-state-in-effect */
    setConfig(stored ?? DEFAULT_MISSION_CONFIG);
    setConfigured(!!stored);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const health = useBackend("/health", undefined, parseHealth, attempt);
  const seaIce = useBackend("/api/sea-ice/geojson", undefined, parseSeaIce, attempt);
  const route = useRoute(config, attempt);
  const routeData = route.status === "ready" ? route.data : null;
  const corridorIds = useMemo(() => (routeData ? routeData.icebergs.map((b) => b.iceberg_id) : null), [routeData]);
  const outside = useOutsideBergs(config?.fields ?? null, corridorIds, attempt);

  const validation = config ? validateMission(config.fields) : null;
  const profile = config ? getVesselProfile(config.profileId) : null;
  const level = UNCERTAINTY_LEVELS[levelIndex];

  // The analysis waits for the real sea-ice grid so the 1.0× case can match the engine.
  const analyses = useMemo(() => {
    if (!routeData || seaIce.status !== "ready") return null;
    const seaIceAt = makeSeaIceLookup(seaIce.data);
    const options = (routeData.route_options ?? []).filter(isRouteOption);
    return STRATEGIES.map((s) => {
      const option = options.find((o) => classifyRouteStrategy(o.label) === s.kind);
      if (!option) return { ...s, analysis: null as StrategyAnalysis | null, failed: true };
      return { ...s, analysis: analyseStrategy(option, routeData.icebergs, seaIceAt), failed: false };
    });
  }, [routeData, seaIce]);

  const realOptions = useMemo(() => (routeData?.route_options ?? []).filter(isRouteOption), [routeData]);
  const solved = analyses?.filter((a) => a.analysis) ?? [];
  const maxDeviation = solved.length ? Math.max(...solved.map((a) => a.analysis!.engineDeviation ?? 0)) : null;
  const mostRobust = solved.length ? solved.reduce((b, a) => (a.analysis!.sensitivity < b.analysis!.sensitivity ? a : b)) : null;
  const outsideBound =
    outside && solved.length
      ? Math.max(...solved.map((a) => outsideCorridorBound(a.analysis!.option.waypoints, outside, UNCERTAINTY_LEVELS[UNCERTAINTY_LEVELS.length - 1].k)))
      : null;

  const selected = config?.objective ?? "balanced";
  const selectedStrategy = STRATEGIES.find((s) => s.objective === selected)!;

  const handleConfirm = () => {
    if (!config || launching) return;
    setLaunching(true);
    saveMissionConfig(config, true);
    router.push("/command-center");
  };

  const shortest = solved.find((a) => a.kind === "shortest")?.analysis ?? null;

  return (
    <div className="flex min-h-screen bg-[#03080c] text-frost">
      <LeftNav />

      <main className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-md xl:flex-nowrap border border-[#3b8fb0]/30 bg-[linear-gradient(90deg,rgba(10,26,37,0.95),rgba(6,16,23,0.7))] px-4 py-2">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#5fd3ea]/60 text-[#5fd3ea] shadow-[0_0_16px_-4px_rgba(95,211,234,0.8)]">
              <Icon d={ICONS.target} className="h-6 w-6" />
            </span>
            <div className="leading-tight">
              <h1 className="font-display text-[20px] font-semibold uppercase tracking-[0.03em] text-white 2xl:text-[23px]">
                Route Robustness &amp; Uncertainty Analysis
              </h1>
              <p className="font-body text-[13.5px] text-frost/75">Evaluate route resilience under forecast uncertainty</p>
            </div>
          </div>
          <div className="flex shrink-0 items-stretch gap-2">
            <div className={`flex items-stretch ${overlay}`}>
              <div className="px-4 py-2">
                <p className="flex items-center gap-2 font-body text-[13px] text-frost">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${
                      health.status === "ready" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : health.status === "loading" ? "bg-mist" : "bg-vessel"
                    }`}
                  />
                  Antarctica Research Support
                </p>
                <p className="pl-[18px] font-body text-[12px] text-mist">
                  {health.status === "ready" ? "Routing service online" : health.status === "loading" ? "Checking routing service…" : "Routing service unreachable"}
                </p>
              </div>
              <div className="hidden border-l border-[#3b8fb0]/35 px-4 py-2 min-[1700px]:block">
                <p className="font-body text-[13px] font-medium text-frost">ICEWISE</p>
                <p className="font-body text-[12px] text-mist">Grand Finale Edition</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 px-4 py-2 ${overlay}`}>
              <Icon d={ICONS.clock} className="h-5 w-5 text-[#5fd3ea]" />
              <div className="leading-tight">
                <p className="font-display text-[15px] font-medium text-white">
                  {REPLAY_DATE_LABEL} <span className="ml-2">{REPLAY_TIMESTAMP.slice(11, 16)} UTC</span>
                </p>
                <p className="font-body text-[11px] uppercase tracking-[0.1em] text-[#5fd3ea]">Historical replay</p>
              </div>
            </div>
          </div>
        </header>

        {/* Mission strip */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 2xl:grid-cols-[1.1fr_1.1fr_1fr_1.25fr]">
          <Card title="Selected Vessel" aside={!configured && config ? <span className="font-body text-[10.5px] text-vessel">Demo — not configured</span> : undefined}>
            {config && profile && (
              <div className="flex items-center gap-3">
                <div className="flex h-[62px] w-[100px] shrink-0 items-center rounded-[4px] border border-[#2a5a6c]/70 bg-[radial-gradient(ellipse_70%_60%_at_50%_70%,rgba(95,211,234,0.25),rgba(5,13,19,1)_75%)] px-1">
                  <VesselSchematic profileId={profile.id} variant="solid" className="w-full" />
                </div>
                <dl className="min-w-0 flex-1 font-body text-[12px]">
                  <p className="mb-1 truncate font-display text-[13.5px] font-medium leading-tight text-white" title={profile.name}>{profile.name}</p>
                  {[
                    ["Speed", `${config.cruiseSpeedKnots} knots`],
                    ["Fuel", `${config.fuelRateTonsPerDay} tons/day`],
                    ["Profile", getObjective(config.objective).label],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-mist">{k}</dt>
                      <dd className="text-[#8fd6ec]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Card>

          <Card title="Mission Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-body text-[12.5px]">
              {[
                ["Start", validation?.start ? `${validation.start.lat.toFixed(3)}, ${validation.start.lon.toFixed(3)}` : "—"],
                ["Destination", validation?.destination ? `${validation.destination.lat.toFixed(3)}, ${validation.destination.lon.toFixed(3)}` : "—"],
                ["Departure", `${REPLAY_DATE_LABEL} ${REPLAY_TIMESTAMP.slice(11, 16)} UTC`],
                ["Forecast Horizon", routeData?.forecast_horizon_hours != null ? `${routeData.forecast_horizon_hours} hours` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-mist">{k}</dt>
                  <dd className="text-frost">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Uncertainty Level" info="Multiplies every iceberg's forecast position uncertainty σ(t) in the routing engine's risk model.">
            <div role="radiogroup" aria-label="Uncertainty level" className="relative mt-1 grid grid-cols-3">
              <span aria-hidden className="absolute left-[16.66%] right-[16.66%] top-[9px] h-[2px] bg-[#2a5a6c]" />
              <span
                aria-hidden
                className="absolute left-[16.66%] top-[9px] h-[2px] bg-[#5fd3ea] shadow-[0_0_8px_#5fd3ea] transition-all duration-500"
                style={{ width: `${(levelIndex / 2) * 66.67}%` }}
              />
              {UNCERTAINTY_LEVELS.map((l, i) => {
                const on = i === levelIndex;
                return (
                  <button key={l.k} type="button" role="radio" aria-checked={on} onClick={() => setLevelIndex(i)} className="group relative flex flex-col items-center">
                    <span className="flex h-5 items-center">
                      <span
                        aria-hidden
                        className={`relative z-10 flex items-center justify-center rounded-full transition-all ${
                          on ? "h-[26px] w-[26px] border-2 border-[#5fd3ea] bg-[#061119] shadow-[0_0_16px_rgba(95,211,234,0.9)]" : "h-[16px] w-[16px] border border-[#2a5a6c] bg-[#061119] group-hover:border-[#5fd3ea]"
                        }`}
                      >
                        <span className={`rounded-full ${on ? "h-2.5 w-2.5 bg-[#5fd3ea]" : "h-1.5 w-1.5 bg-[#5fd3ea]/60"}`} />
                      </span>
                    </span>
                    <span className={`mt-2 font-display text-[15px] font-semibold ${on ? "text-[#bff3fb]" : "text-frost/80"}`}>{l.k.toFixed(1)}×</span>
                    <span className="font-body text-[11px] text-mist">{l.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Analysis Basis" info="What the calculation uses. Every value comes from the routing API or the prediction API.">
            <ul className="flex flex-col gap-0.5 font-body text-[12px] text-frost/85">
              <li className="flex justify-between gap-2">
                <span className="text-mist">Corridor icebergs</span>
                <span>{routeData ? `${routeData.icebergs.length} of ${routeData.iceberg_prediction_count ?? "—"} evaluated` : "—"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-mist">Uncertainty model</span>
                <span>σ = k·(σ₀ + 0.05·t) km</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-mist">Sea ice</span>
                <span>{seaIce.status === "ready" ? `NSIDC ${seaIce.data.metadata.timestamp.slice(0, 10)}` : "—"}</span>
              </li>
              <li className="flex justify-between gap-2" title="Largest difference between this page's 1.0× waypoint risk and the routing engine's own waypoint_risks.">
                <span className="text-mist">Engine match at 1.0×</span>
                <span className={maxDeviation !== null && maxDeviation < 0.001 ? "text-emerald-300" : "text-frost"}>
                  {maxDeviation !== null ? `Δ ≤ ${maxDeviation.toFixed(4)}` : "—"}
                </span>
              </li>
            </ul>
          </Card>
        </div>

        {/* Hero + comparison */}
        <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_470px]">
          <figure className="relative self-start overflow-hidden rounded-md border border-[#3b8fb0]/40 shadow-[0_0_40px_-18px_rgba(95,211,234,0.7)]">
            <Image
              src={heroImage}
              alt="Illustrative Antarctic scene: three route trajectories between a start and destination, with iceberg hazard regions and uncertainty envelopes."
              priority
              // Served as the original file: no re-encoding or downscaling of the hero artwork.
              unoptimized
              className="block h-auto w-full"
            />
            {/* Labels pinned to the start/destination markers in the artwork, with the real mission coordinates. */}
            {validation?.start && (
              <div className="pointer-events-none absolute font-display leading-tight [text-shadow:0_0_6px_#05080a,0_1px_3px_#05080a]" style={{ left: "13.5%", top: "70%" }}>
                <p className="text-[14px] font-semibold tracking-wide text-white">START</p>
                <p className="text-[13px] text-frost">
                  {validation.start.lat.toFixed(3)}, {validation.start.lon.toFixed(3)}
                </p>
              </div>
            )}
            {validation?.destination && (
              <div className="pointer-events-none absolute text-right font-display leading-tight [text-shadow:0_0_6px_#05080a,0_1px_3px_#05080a]" style={{ right: "3%", top: "5%" }}>
                <p className="text-[14px] font-semibold tracking-wide text-white">DESTINATION</p>
                <p className="text-[13px] text-frost">
                  {validation.destination.lat.toFixed(3)}, {validation.destination.lon.toFixed(3)}
                </p>
              </div>
            )}
            <figcaption className={`absolute left-3 top-3 max-w-[300px] px-3 py-2 ${overlay}`}>
              <p className="font-display text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5fd3ea]">Mission scene</p>
              <p className="font-body text-[11px] leading-snug text-frost/80">
                Illustrative visualization, not to scale. All figures on this page are computed from the routing engine&apos;s real route output.
              </p>
            </figcaption>
            <div className={`absolute bottom-3 right-3 px-3.5 py-2.5 ${overlay}`}>
              <p className="font-display text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5fd3ea]">Route Options</p>
              <ul className="mt-1.5 flex flex-col gap-1 font-body text-[12px] text-frost">
                {STRATEGIES.map((s) => (
                  <li key={s.kind} className="flex items-center gap-2.5">
                    <span aria-hidden className="w-6 border-t-2 border-dashed" style={{ borderColor: s.color }} />
                    {s.name}
                  </li>
                ))}
                <li className="mt-0.5 flex items-center gap-2.5 text-frost/80">
                  <span aria-hidden className="h-3 w-6 rounded-full border border-[#c084fc]/70 bg-[#ef4444]/40" />
                  Iceberg hazard + uncertainty envelope
                </li>
              </ul>
            </div>
          </figure>

          <Card title="Route Comparison" aside={<span className="font-body text-[11px] text-mist">at {level.k.toFixed(1)}× uncertainty</span>}>
            {route.status === "loading" || (route.status === "ready" && !analyses) ? (
              <p role="status" className="py-6 text-center font-body text-[12.5px] text-mist">
                Running the routing engine for this mission…
              </p>
            ) : route.status === "error" ? (
              <div className="py-6 text-center">
                <p className="font-body text-[12.5px] text-vessel">The routing service could not be reached or rejected this mission.</p>
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 font-body text-[12px] text-[#5fd3ea] hover:underline">
                  Retry
                </button>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Route to confirm" className="flex flex-1 flex-col gap-2">
                {analyses!.map((a) => {
                  const on = a.objective === selected;
                  const ev = a.analysis?.levels[levelIndex];
                  return (
                    <button
                      key={a.kind}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={a.failed}
                      onClick={() => config && setConfig({ ...config, objective: a.objective })}
                      className={`flex flex-1 flex-col rounded-[5px] border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                        on ? "bg-[#5fd3ea]/[0.07] shadow-[0_0_22px_-8px_rgba(95,211,234,0.9)]" : "border-[#2a5a6c]/60 bg-[#061119]/60 hover:border-[#5fd3ea]/50"
                      }`}
                      style={on ? { borderColor: a.color } : undefined}
                    >
                      <p className="flex items-center justify-between font-display text-[15px] font-semibold" style={{ color: a.color }}>
                        {a.name}
                        {on && <span className="font-body text-[10.5px] font-normal uppercase tracking-[0.1em] text-frost/80">Selected</span>}
                      </p>
                      {a.analysis && ev ? (
                        <div className="mt-1 flex items-center gap-3">
                          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 font-body text-[12px]">
                            {[
                              ["Distance", `${a.analysis.option.metrics.total_distance_nm.toFixed(1)} nm`],
                              ["ETA", `${a.analysis.option.metrics.estimated_time_hours.toFixed(1)} hours`],
                              ["Max Hazard", pct(ev.maxHazard)],
                              ["Mean Hazard", pct(ev.meanHazard)],
                            ].map(([k, v]) => (
                              <div key={k} className="contents">
                                <dt className="text-mist">{k}</dt>
                                <dd className="text-frost">{v}</dd>
                              </div>
                            ))}
                          </dl>
                          <RouteThumb options={realOptions} highlight={a.analysis.option.route_id} color={a.color} />
                        </div>
                      ) : (
                        <p className="mt-1 font-body text-[12px] text-mist">No route found for this strategy under the current risk threshold.</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Chart · table · insights */}
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 xl:grid-cols-[1fr_1.15fr_0.95fr]">
          <Card title="Hazard Exposure Under Uncertainty" info="Highest per-waypoint risk along each route (the routing engine's max_risk_score definition), re-evaluated at each uncertainty level.">
            <p className="-mt-1 font-body text-[12px] text-mist">Route exposure as forecast uncertainty increases</p>
            <div className="mt-1 flex min-h-[128px] flex-1 items-center gap-2">
              <div className="min-w-0 flex-1">
                {solved.length ? (
                  <HazardChart rows={solved.map((a) => ({ name: a.name, color: a.color, values: a.analysis!.levels.map((l) => l.maxHazard) }))} />
                ) : (
                  <p className="text-center font-body text-[12px] text-mist">{route.status === "error" ? "No data" : "Calculating…"}</p>
                )}
              </div>
              <ul className="flex shrink-0 flex-col gap-1.5 font-body text-[12px] text-frost">
                {STRATEGIES.map((s) => (
                  <li key={s.kind} className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card title="Route Robustness Metrics" info="Distance, ETA and fuel are the routing engine's own per-strategy metrics for the configured vessel. Hazard rows re-evaluate the engine's risk model with scaled uncertainty.">
            <p className="-mt-1 mb-1 font-body text-[12px] text-mist">Comparative analysis across uncertainty levels</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-body text-[11.5px]">
                <thead>
                  <tr className="border-b border-[#3b8fb0]/30 text-left">
                    <th className="py-1 pr-2 font-medium text-frost">Metric</th>
                    {STRATEGIES.map((s) => (
                      <th key={s.kind} className="py-1 text-right font-medium" style={{ color: s.color }}>
                        {s.name.replace(" Route", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-frost/90">
                  {(() => {
                    const cell = (kind: string, f: (a: StrategyAnalysis) => string) => {
                      const a = analyses?.find((x) => x.kind === kind)?.analysis;
                      return a ? f(a) : "—";
                    };
                    const rows: { label: ReactNode; f: (a: StrategyAnalysis) => string; hl?: boolean; sub?: boolean }[] = [
                      { label: "Distance (nm)", f: (a) => a.option.metrics.total_distance_nm.toFixed(1) },
                      { label: "ETA (hours)", f: (a) => a.option.metrics.estimated_time_hours.toFixed(1) },
                      { label: "Fuel (t)", f: (a) => a.option.metrics.estimated_fuel_tons.toFixed(1) },
                      { label: "Closest iceberg (km)", f: (a) => (a.clearanceKm !== null ? a.clearanceKm.toFixed(1) : "—") },
                      ...UNCERTAINTY_LEVELS.map((l, i) => ({
                        label: <>Max hazard · {l.k.toFixed(1)}×</>,
                        f: (a: StrategyAnalysis) => pct(a.levels[i].maxHazard),
                        hl: i === levelIndex,
                        sub: true,
                      })),
                      {
                        label: <>Hours inside 1σ envelope · {level.k.toFixed(1)}×</>,
                        f: (a: StrategyAnalysis) => a.levels[levelIndex].envelopeHours.toFixed(2),
                      },
                    ];
                    return rows.map((r, i) => (
                      <tr key={i} className={`border-b border-[#3b8fb0]/10 ${r.hl ? "bg-[#5fd3ea]/[0.07]" : ""}`}>
                        <td className={`py-[2px] pr-2 ${r.sub ? "text-frost/80" : "text-mist"}`}>{r.label}</td>
                        {STRATEGIES.map((s) => (
                          <td key={s.kind} className="py-[2px] text-right tabular-nums">
                            {cell(s.kind, r.f)}
                          </td>
                        ))}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Insights" info="Generated from the numbers on this page; no other inputs." className="lg:col-span-2 xl:col-span-1">
            <ul className="flex flex-col gap-1">
              {solved.map((a) => {
                const an = a.analysis!;
                const [lo, hi] = [an.levels[0].maxHazard, an.levels[an.levels.length - 1].maxHazard];
                const extraNm = shortest ? an.option.metrics.total_distance_nm - shortest.option.metrics.total_distance_nm : null;
                const extraH = shortest ? an.option.metrics.estimated_time_hours - shortest.option.metrics.estimated_time_hours : null;
                return (
                  <li key={a.kind} className="rounded-[5px] border border-[#2a5a6c]/60 bg-[#061119]/60 px-3 py-1">
                    <p className="flex items-center justify-between font-display text-[13.5px] font-semibold" style={{ color: a.color }}>
                      {a.name}
                      {mostRobust?.kind === a.kind && (
                        <span className="rounded-sm border border-emerald-400/50 px-1.5 font-body text-[10px] font-normal uppercase tracking-[0.08em] text-emerald-300">
                          Most robust
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 font-body text-[11px] leading-snug text-frost/80">
                      Max hazard {pct(lo)} → {pct(hi)} (+{((hi - lo) * 100).toFixed(1)} pts) at 2.0×
                      {extraNm !== null && extraH !== null && a.kind !== "shortest" && ` for +${extraNm.toFixed(1)} nm / +${extraH.toFixed(1)} h vs shortest`}.
                    </p>
                  </li>
                );
              })}
              {analyses?.filter((a) => a.failed).map((a) => (
                <li key={a.kind} className="font-body text-[11.5px] text-mist">
                  {a.name}: no route found for this mission.
                </li>
              ))}
              {outsideBound !== null && (
                <li className="font-body text-[10.5px] leading-snug text-mist" title="Icebergs outside the routing corridor are not in the route response; this bounds what any of them could add.">
                  Icebergs outside the routing corridor could add at most {pct(outsideBound, 2)} risk at 2.0×.
                </li>
              )}
              {!solved.length && <li className="font-body text-[12px] text-mist">{route.status === "error" ? "No analysis available." : "Calculating…"}</li>}
            </ul>
          </Card>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!config || launching}
          className="group relative flex h-[56px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[linear-gradient(90deg,#3fb9e2,#7fdcf2_45%,#a8ecf8_60%,#56c7ea)] font-display text-[17px] font-semibold uppercase tracking-[0.1em] text-[#04202c] shadow-[0_0_0_1px_rgba(191,243,251,0.7),0_0_44px_-8px_rgba(95,211,234,0.95)] transition-all hover:shadow-[0_0_0_1px_rgba(191,243,251,1),0_0_60px_-6px_rgba(95,211,234,1)] disabled:opacity-60"
        >
          <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/4 skew-x-[-20deg] bg-white/40 opacity-0 transition-all duration-700 group-hover:left-[110%] group-hover:opacity-100" />
          <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="mr-4 h-5 w-5">
            <path d="M7 4.5v15l12-7.5-12-7.5Z" />
          </svg>
          {launching ? "Opening Command Center…" : `Confirm ${selectedStrategy.name} & Proceed to Command Center`}
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute right-6 h-6 w-6 transition-transform group-hover:translate-x-1">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </button>
      </main>
    </div>
  );
}
