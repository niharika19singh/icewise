export type MissionEventKind = "info" | "warn";

export type MissionEvent = {
  id: string;
  atIso: string;
  label: string;
  detail?: string;
  kind: MissionEventKind;
};

// Compact operator-facing log of real system transitions this session has
// actually gone through (see CommandCenter.tsx's pushMissionEvent call
// sites) — a mission generated, forecast/risk state updated, a strategy
// hitting the real hazard risk threshold, a reroute triggered/completed, a
// replay reaching route completion. Nothing here is invented for visual
// effect: every entry corresponds to a real state transition that already
// happened, using only values the API actually returned.
export default function MissionEventLog({ events }: { events: MissionEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="mt-3 font-body text-xs leading-relaxed text-mist">
        No mission events yet — generate a route to begin.
      </p>
    );
  }

  return (
    <ul className="mt-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
      {events.map((event) => (
        <li
          key={event.id}
          className={`rounded border px-2.5 py-1.5 ${
            event.kind === "warn" ? "border-vessel/40 bg-vessel/5" : "border-line/60 bg-abyss/40"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`font-mono text-[10px] uppercase tracking-mission ${
                event.kind === "warn" ? "text-vessel" : "text-ice"
              }`}
            >
              {event.label}
            </span>
            <span className="shrink-0 font-mono text-[9px] text-mist/70">
              {event.atIso.slice(11, 19)}
            </span>
          </div>
          {event.detail && (
            <p className="mt-0.5 font-body text-[11px] leading-snug text-mist">{event.detail}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
