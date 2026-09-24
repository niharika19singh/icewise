"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SettingsIcon,
  LayersIcon,
  MapIcon,
  IcebergIcon,
  SeaIceIcon,
  RoutesIcon,
  AnalyticsIcon,
} from "./icons";

// Weather is out of scope for this prototype — no real weather data/feed
// exists yet, so it's deliberately not a navigable mode here.
const navItems = [
  { id: "map", label: "Map", icon: MapIcon },
  { id: "icebergs", label: "Icebergs", icon: IcebergIcon },
  { id: "sea-ice", label: "Sea Ice", icon: SeaIceIcon },
  { id: "routes", label: "Routes", icon: RoutesIcon },
];

const navButtonClass =
  "flex w-20 flex-col items-center gap-1.5 border-l-2 px-2 py-3 font-mono text-[9px] uppercase tracking-mission transition-colors";

// Dedicated pages outside the Command Center shell — these navigate away.
// Same button style, with slightly smaller type/spacing so the long labels
// ("CONFIGURATION") fit the 80px rail.
const pageLinkClass = navButtonClass
  .replace("px-2", "px-1")
  .replace("text-[9px]", "text-[8px]")
  .replace("tracking-mission", "tracking-[0.04em]");

const pageLinks = [
  { href: "/mission-configuration", label: "Mission Configuration", icon: SettingsIcon },
  { href: "/route-robustness", label: "Route Robustness", icon: LayersIcon },
];

export default function Sidebar({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="shadow-panel flex w-20 shrink-0 flex-col items-center justify-between rounded-lg border border-line bg-abyss-raised/60 py-4 backdrop-blur-md">
      <ul className="flex flex-col items-stretch gap-1">
        {pageLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`${pageLinkClass} text-center leading-tight ${
                  isActive
                    ? "shadow-glow-ice-sm border-ice bg-ice/10 text-ice-bright"
                    : "border-transparent text-mist hover:text-ice"
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
                {label}
              </Link>
            </li>
          );
        })}
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={isActive}
                className={`${navButtonClass} ${
                  isActive
                    ? "shadow-glow-ice-sm border-ice bg-ice/10 text-ice-bright"
                    : "border-transparent text-mist hover:text-ice"
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
                {label}
              </button>
            </li>
          );
        })}
        <li>
          {/* Analytics is a dedicated page, not an in-shell mode — navigates away. */}
          <Link href="/analytics" className={`${navButtonClass} border-transparent text-mist hover:text-ice`}>
            <AnalyticsIcon className="h-4.5 w-4.5" />
            Analytics
          </Link>
        </li>
      </ul>
    </nav>
  );
}
