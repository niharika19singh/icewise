export type PresentationView = "standard" | "overview" | "intelligence" | "rerouting";

const views: { id: PresentationView; label: string }[] = [
  { id: "standard", label: "Command Center" },
  { id: "overview", label: "Mission Overview" },
  { id: "intelligence", label: "Navigation Intelligence" },
  { id: "rerouting", label: "Adaptive Rerouting" },
];

// Switches the ENTIRE main-content composition, not just the right panel —
// each non-"standard" view is its own layout (see MissionOverviewView /
// NavigationIntelligenceView / AdaptiveReroutingView), all reading the same
// live route/mission state this shell already holds.
export default function ViewSwitcher({
  active,
  onSelect,
}: {
  active: PresentationView;
  onSelect: (view: PresentationView) => void;
}) {
  return (
    <nav className="shadow-panel flex shrink-0 items-center gap-1 self-start rounded-lg border border-line bg-abyss-raised/60 p-1 backdrop-blur-md">
      {views.map((v) => {
        const isActive = active === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            aria-current={isActive}
            className={`rounded px-3.5 py-2 font-mono text-[10px] uppercase tracking-mission transition-all ${
              isActive ? "shadow-glow-ice-sm bg-ice/10 text-ice-bright" : "text-mist hover:text-ice"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </nav>
  );
}
