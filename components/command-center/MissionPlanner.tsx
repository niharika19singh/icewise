"use client";

import { useEffect, useState } from "react";
import type { OperatorError } from "./types";
import type { RouteNotices } from "./routeNotices";
import ErrorNotice from "./ErrorNotice";
import { PinIcon } from "./icons";
import { PIN_COLORS } from "./routeStyle";
import { REPLAY_DATE_LABEL, DEMO_VESSEL, type VesselRequest } from "./replay";

export type MissionFields = {
  startLat: string;
  startLon: string;
  destLat: string;
  destLon: string;
};

export type MissionPoint = { lat: number; lon: number };
export type PickTarget = "start" | "destination" | null;

export type MissionValidation = {
  start: MissionPoint | null;
  destination: MissionPoint | null;
  // Per-field message, null when that field is valid.
  errors: Record<keyof MissionFields, string | null>;
  missionError: string | null;
  valid: boolean;
};

// The routing API only accepts latitudes in this band and answers OUTSIDE_DOMAIN
// for anything else (backend/routing/main.py -> _validate_domain). Longitude is
// only bounded by the plain -180..180 check, so that is all we enforce.
export const SUPPORTED_LAT_MIN = -85;
export const SUPPORTED_LAT_MAX = -55;

// Plain decimal only: no exponent, hex, or "Infinity" (which Number() would accept).
const DECIMAL_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function parseCoord(raw: string, min: number, max: number, axis: "Lat" | "Lon", hint = "") {
  // Tolerate a typographic minus (e.g. pasted from a document) and a decimal comma.
  const text = raw
    .trim()
    .replace(/[−‒-―]/g, "-")
    .replace(",", ".");
  if (text === "") return { value: null, error: `${axis} required` };
  if (!DECIMAL_RE.test(text)) return { value: null, error: `${axis} must be a number` };
  const value = Number(text);
  if (value < min || value > max) return { value: null, error: `${axis} must be ${min} to ${max}${hint}` };
  return { value, error: null };
}

// Client-side input checks (numeric, supported latitude band, longitude range,
// start !== destination). They mirror what the API rejects up front; whether a
// point is navigable water is only known to the routing service, which reports
// it (COORDINATE_NOT_NAVIGABLE) when a route is requested.
export function validateMission(fields: MissionFields): MissionValidation {
  const latHint = " (supported Antarctic area)";
  const sLat = parseCoord(fields.startLat, SUPPORTED_LAT_MIN, SUPPORTED_LAT_MAX, "Lat", latHint);
  const sLon = parseCoord(fields.startLon, -180, 180, "Lon");
  const dLat = parseCoord(fields.destLat, SUPPORTED_LAT_MIN, SUPPORTED_LAT_MAX, "Lat", latHint);
  const dLon = parseCoord(fields.destLon, -180, 180, "Lon");

  const start = sLat.value !== null && sLon.value !== null ? { lat: sLat.value, lon: sLon.value } : null;
  const destination = dLat.value !== null && dLon.value !== null ? { lat: dLat.value, lon: dLon.value } : null;

  const missionError =
    start && destination && start.lat === destination.lat && start.lon === destination.lon
      ? "Start and destination must differ"
      : null;

  return {
    start,
    destination,
    errors: { startLat: sLat.error, startLon: sLon.error, destLat: dLat.error, destLon: dLon.error },
    missionError,
    valid: !!start && !!destination && !missionError,
  };
}

function CoordInput({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  invalid: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-mission text-mist/70">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-invalid={invalid}
        className={`w-full rounded border bg-abyss/40 px-2 py-1.5 font-mono text-xs text-frost outline-none transition-colors focus:border-ice focus:shadow-glow-ice-sm ${
          invalid ? "border-vessel/70" : "border-line/60"
        }`}
      />
    </label>
  );
}

function PointRow({
  title,
  color,
  latLabel,
  lonLabel,
  lat,
  lon,
  onLat,
  onLon,
  onFocusLat,
  onFocusLon,
  onBlurField,
  latError,
  lonError,
  picking,
  onTogglePick,
  pickDisabled,
}: {
  title: string;
  color: string;
  latLabel: string;
  lonLabel: string;
  lat: string;
  lon: string;
  onLat: (v: string) => void;
  onLon: (v: string) => void;
  onFocusLat: () => void;
  onFocusLon: () => void;
  onBlurField: () => void;
  // Already filtered to exclude the field currently being typed in.
  latError: string | null;
  lonError: string | null;
  picking: boolean;
  onTogglePick: () => void;
  pickDisabled: boolean;
}) {
  const messages = [latError, lonError].filter((m): m is string => !!m);
  return (
    <div
      className="rounded border p-2 transition-colors"
      style={picking ? { borderColor: `${color}99`, backgroundColor: `${color}14` } : { borderColor: "transparent" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center font-mono text-[10px] uppercase tracking-mission text-frost">
          <PinIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
          {title}
        </p>
        <button
          type="button"
          onClick={onTogglePick}
          disabled={pickDisabled}
          aria-pressed={picking}
          style={
            picking
              ? { borderColor: color, backgroundColor: `${color}26`, color }
              : undefined
          }
          className={`rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-mission transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            picking ? "" : "border-line/60 text-mist hover:border-ice/50 hover:text-ice"
          }`}
        >
          {picking ? "Cancel picking" : "Pick on Map"}
        </button>
      </div>
      <div className="mt-1.5 flex gap-2">
        <CoordInput label={latLabel} value={lat} onChange={onLat} onFocus={onFocusLat} onBlur={onBlurField} invalid={!!latError} />
        <CoordInput label={lonLabel} value={lon} onChange={onLon} onFocus={onFocusLon} onBlur={onBlurField} invalid={!!lonError} />
      </div>
      {messages.length > 0 && (
        <p role="alert" className="mt-1 font-body text-[11px] leading-snug text-vessel">
          {messages.join(" · ")}
        </p>
      )}
    </div>
  );
}

// Mounted only while a request is in flight, so its timer restarts each time.
function LoadingNotice({ hasRoute }: { hasRoute: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p role="status" className="mt-3 font-mono text-[10px] leading-snug tracking-mission text-ice">
      {hasRoute
        ? "Updating route — the previous route stays on the map until the new one arrives."
        : "Running the routing engine for this mission."}
      {slow && " Still waiting for the routing service…"}
    </p>
  );
}

export default function MissionPlanner({
  fields,
  onChange,
  pickTarget,
  onPickTargetChange,
  onGenerate,
  onResetDemo,
  isDemoMission,
  loading,
  error,
  hasRoute,
  dirty,
  notices,
  vessel = DEMO_VESSEL,
}: {
  fields: MissionFields;
  onChange: (fields: MissionFields) => void;
  pickTarget: PickTarget;
  onPickTargetChange: (target: PickTarget) => void;
  onGenerate: () => void;
  onResetDemo: () => void;
  isDemoMission: boolean;
  loading: boolean;
  error: OperatorError | null;
  // A route is currently drawn (from an earlier successful request).
  hasRoute: boolean;
  // Inputs no longer match the mission behind that route.
  dirty: boolean;
  // Snapped-point and warning text taken from the current route response.
  notices: RouteNotices;
  // Vessel sent with this mission's requests (demo vessel unless configured).
  vessel?: VesselRequest;
}) {
  const v = validateMission(fields);
  // A field error is hidden only while that field is being typed in, so half-typed
  // values do not flash red, but values that arrive another way (map pick,
  // reset) are validated immediately.
  const [focused, setFocused] = useState<keyof MissionFields | null>(null);
  const shown = (key: keyof MissionFields) => (focused === key ? null : v.errors[key]);
  const hasFieldError = Object.values(v.errors).some(Boolean);
  const canGenerate = v.valid && !loading;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (canGenerate) onGenerate();
      }}
      aria-busy={loading}
      className="shadow-panel rounded-lg border border-line bg-abyss-raised/60 p-5 backdrop-blur-md"
    >
      <h3 className="font-mono text-xs uppercase tracking-mission-wide text-ice">Mission Planner</h3>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-mission text-mist/60">
        Historical replay · {REPLAY_DATE_LABEL}
      </p>

      <div className="-mx-2 mt-3 flex flex-col gap-1.5">
        <PointRow
          title="Start"
          color={PIN_COLORS.start}
          latLabel="Start Lat"
          lonLabel="Start Lon"
          lat={fields.startLat}
          lon={fields.startLon}
          onLat={(startLat) => onChange({ ...fields, startLat })}
          onLon={(startLon) => onChange({ ...fields, startLon })}
          onFocusLat={() => setFocused("startLat")}
          onFocusLon={() => setFocused("startLon")}
          onBlurField={() => setFocused(null)}
          latError={shown("startLat")}
          lonError={shown("startLon")}
          picking={pickTarget === "start"}
          onTogglePick={() => onPickTargetChange(pickTarget === "start" ? null : "start")}
          pickDisabled={loading}
        />
        <PointRow
          title="Destination"
          color={PIN_COLORS.destination}
          latLabel="Dest Lat"
          lonLabel="Dest Lon"
          lat={fields.destLat}
          lon={fields.destLon}
          onLat={(destLat) => onChange({ ...fields, destLat })}
          onLon={(destLon) => onChange({ ...fields, destLon })}
          onFocusLat={() => setFocused("destLat")}
          onFocusLon={() => setFocused("destLon")}
          onBlurField={() => setFocused(null)}
          latError={shown("destLat")}
          lonError={shown("destLon")}
          picking={pickTarget === "destination"}
          onTogglePick={() => onPickTargetChange(pickTarget === "destination" ? null : "destination")}
          pickDisabled={loading}
        />
      </div>

      {pickTarget && (
        <p role="status" className="mt-2 font-mono text-[10px] leading-snug tracking-mission text-ice">
          Placing {pickTarget}: click the map to set it. Press Esc to cancel.
        </p>
      )}

      {v.missionError && (
        <p role="alert" className="mt-2 font-body text-[11px] leading-snug text-vessel">
          {v.missionError}
        </p>
      )}

      <button
        type="submit"
        disabled={!canGenerate}
        className="mt-4 w-full rounded border border-ice/40 bg-ice/5 py-2.5 font-mono text-xs uppercase tracking-mission text-ice transition-all hover:border-ice hover:bg-ice/10 hover:shadow-glow-ice-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {loading ? "Generating…" : hasRoute ? "Regenerate Route" : "Generate Route"}
      </button>

      {!loading && hasFieldError && !v.missionError && (
        <p className="mt-2 font-body text-[11px] leading-snug text-mist/80">
          Enter valid coordinates for both points to generate a route.
        </p>
      )}

      {/* One status area: in flight > failed > route state. */}
      {loading ? (
        <LoadingNotice hasRoute={hasRoute} />
      ) : error ? (
        <ErrorNotice error={error} className="mt-3">
          {hasRoute && (
            <p className="mt-1 font-body text-[11px] leading-snug text-mist/80">
              The map and panels still show the last route that was generated successfully.
            </p>
          )}
        </ErrorNotice>
      ) : hasRoute ? (
        <div className="mt-3">
          <p
            role="status"
            className={`font-mono text-[10px] leading-snug tracking-mission ${dirty ? "text-vessel" : "text-ice"}`}
          >
            {dirty
              ? "Inputs changed — the map still shows the previous route. Press Regenerate Route to update."
              : "✓ Route generated for these points."}
          </p>
          {notices.snaps.map((line) => (
            <p key={line} className="mt-1.5 font-body text-[11px] leading-snug text-mist/80">
              {line}
            </p>
          ))}
          {notices.warnings.map((line) => (
            <p key={line} className="mt-1.5 font-body text-[11px] leading-snug text-vessel/90">
              <span className="font-mono text-[9px] uppercase tracking-mission">Service notice · </span>
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {!isDemoMission && (
        <button
          type="button"
          onClick={onResetDemo}
          disabled={loading}
          className="mt-3 font-mono text-[9px] uppercase tracking-mission text-mist underline-offset-2 transition-colors hover:text-ice hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset to demo corridor
        </button>
      )}

      <p className="mt-3 font-body text-[11px] leading-relaxed text-mist/70">
        Draft points are hollow markers. Latitude must be {SUPPORTED_LAT_MIN}° to {SUPPORTED_LAT_MAX}° (the supported
        Antarctic area); the routing service checks that both points can be navigated when you generate. {vessel === DEMO_VESSEL ? "Demo vessel profile" : vessel.vessel_name ?? "Configured vessel"}:{" "}
        {vessel.cruise_speed_knots} kn, {vessel.fuel_consumption_rate_tons_per_day} t/day fuel — time and fuel figures are
        estimates for it.
      </p>
    </form>
  );
}
