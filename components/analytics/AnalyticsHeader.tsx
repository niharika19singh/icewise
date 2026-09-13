import Link from "next/link";
import ArrowIcon from "@/components/ui/ArrowIcon";
import SectionGlow from "@/components/ui/SectionGlow";
import RevealOnMount from "./RevealOnMount";

const STATUS_ITEMS = (algorithmUsed: string | null) => [
  { label: "Scenario", value: "C18B" },
  { label: "Data Mode", value: "Historical Replay" },
  { label: "Model", value: "Physics + ML Hybrid" },
  { label: "Routing", value: algorithmUsed ?? "—" },
];

export default function AnalyticsHeader({ algorithmUsed }: { algorithmUsed: string | null }) {
  return (
    <header className="relative overflow-hidden border-b border-line">
      <nav className="relative z-10 flex items-center justify-between border-b border-line px-6 py-4 lg:px-10">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-sm font-medium tracking-wide text-frost">ICEWISE</span>
          <span aria-hidden className="h-3 w-px bg-line" />
          <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">Mission Analytics</span>
        </div>
        <Link
          href="/command-center"
          className="inline-flex items-center gap-2 rounded-full border border-frost/30 px-4 py-1.5 font-mono text-xs uppercase tracking-mission text-frost transition-colors hover:border-ice hover:text-ice"
        >
          <ArrowIcon className="h-3 w-3 rotate-180" />
          Command Center
        </Link>
      </nav>

      <SectionGlow className="left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/3" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-20">
        <RevealOnMount>
          <p className="font-mono text-xs uppercase tracking-mission-wide text-ice">
            Navigation Intelligence · Historical Scenario Analysis
          </p>
          <h1 className="mt-4 font-display text-5xl font-medium leading-[0.95] tracking-tight text-frost sm:text-6xl lg:text-7xl">
            Mission
            <br />
            <span className="text-ice drop-shadow-[0_0_24px_rgba(143,217,224,0.35)]">Analytics</span>
          </h1>
          <p className="mt-6 max-w-xl font-body text-base leading-relaxed text-mist sm:text-lg">
            An evaluation of route efficiency, safety exposure, prediction performance, and adaptive
            re-routing for the current ICEWISE navigation scenario.
          </p>
        </RevealOnMount>

        <RevealOnMount delay={0.15}>
          <div className="mt-10 grid grid-cols-2 gap-4 border-t border-line pt-6 sm:grid-cols-4">
            {STATUS_ITEMS(algorithmUsed).map((item) => (
              <div key={item.label}>
                <p className="font-mono text-[10px] uppercase tracking-mission text-mist">{item.label}</p>
                <p className="mt-1 font-mono text-sm text-frost">{item.value}</p>
              </div>
            ))}
          </div>
        </RevealOnMount>
      </div>
    </header>
  );
}
