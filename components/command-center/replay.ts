// The Command Center replays historical 2020 observations; it has no live feed.
// This is the single snapshot timestamp sent to the routing API with every
// mission, and the label the UI uses to say so.
export const REPLAY_TIMESTAMP = "2020-01-02T00:00:00Z";

// "2020-01-02T00:00:00Z" -> "02 JAN 2020" (UTC, no locale dependence).
export function formatReplayDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const REPLAY_DATE_LABEL = formatReplayDate(REPLAY_TIMESTAMP);

// Vessel profile sent with every mission. It is fixed by this frontend, not
// read from the backend, so the transit-time and fuel figures shown in the
// Command Center are estimates for this demo profile only.
export const DEMO_VESSEL = {
  vessel_id: "RV-POLAR-STERN-01",
  cruise_speed_knots: 12.0,
  fuel_consumption_rate_tons_per_day: 15.0,
  algorithm: "A*",
};
