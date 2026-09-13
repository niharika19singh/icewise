import Logo from "@/components/ui/Logo";
import { ThermometerIcon, EyeIcon } from "./icons";

// Mock status/telemetry values for shell layout only — not live data.
const mockStatus = {
  utc: "2026-09-13 14:32:18",
  temperatureC: -18.4,
  visibilityKm: 8.2,
};

export default function TopBar() {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line bg-abyss-raised/60 px-6">
      <div className="flex items-center gap-4">
        <Logo />
        <span aria-hidden className="hidden h-8 w-px bg-line sm:block" />
        <div className="hidden leading-tight sm:block">
          <p className="font-display text-sm font-medium tracking-wide text-frost">
            Antarctic Command Center
          </p>
          <p className="font-mono text-[10px] uppercase tracking-mission text-mist">
            Intelligent navigation for a safer tomorrow
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6 font-mono text-xs text-mist">
        <span className="flex items-center gap-2 text-ice">
          <span aria-hidden className="h-2 w-2 rounded-full bg-ice shadow-[0_0_8px_rgba(143,217,224,0.8)]" />
          <span className="uppercase tracking-mission">System Online</span>
        </span>
        <span className="hidden md:inline">UTC {mockStatus.utc}</span>
        <span className="hidden items-center gap-1.5 lg:flex">
          <ThermometerIcon className="h-3.5 w-3.5 text-ice" />
          <span className="uppercase tracking-mission text-mist">Conditions</span>
          <span className="text-frost">{mockStatus.temperatureC.toFixed(1)} °C</span>
        </span>
        <span className="hidden items-center gap-1.5 lg:flex">
          <EyeIcon className="h-3.5 w-3.5 text-ice" />
          <span className="uppercase tracking-mission text-mist">Visibility</span>
          <span className="text-frost">{mockStatus.visibilityKm.toFixed(1)} km</span>
        </span>
      </div>
    </header>
  );
}
