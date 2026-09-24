"use client";

// Shared pieces of the ICEWISE mission workstation pages (Mission Planner,
// Route Robustness): backend loading hook, HUD primitives, polar plot and the
// left navigation.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MissionPoint } from "@/components/command-center/MissionPlanner";

export const BASE_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 90_000;

export type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

// One request to the routing service, with the same generous timeout the
// Command Center uses (an idle hosted backend can be slow to wake).
export function useBackend<T>(path: string, init: RequestInit | undefined, parse: (d: unknown) => T | null, attempt: number) {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    fetch(`${BASE_API_URL}${path}`, { ...init, signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => {
        const parsed = parse(data);
        if (!parsed) throw new Error("unexpected response");
        if (!cancelled) setState({ status: "ready", data: parsed });
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
    // init/parse are module-level constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, attempt]);
  return state;
}

// ---------------------------------------------------------------------------
// Small visual primitives
// ---------------------------------------------------------------------------

export const glass =
  "border border-[#3b8fb0]/40 bg-[linear-gradient(180deg,rgba(10,26,37,0.9),rgba(6,16,23,0.9))] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(143,217,224,0.18)] backdrop-blur-md";
export const overlay = "border border-[#3b8fb0]/45 bg-[#061019]/75 backdrop-blur-md shadow-[0_0_30px_-12px_rgba(95,211,234,0.5)]";

export function Brackets() {
  const c = "pointer-events-none absolute h-3 w-3 border-[#5fd3ea]";
  return (
    <>
      <span aria-hidden className={`${c} -left-px -top-px border-l-2 border-t-2`} />
      <span aria-hidden className={`${c} -right-px -top-px border-r-2 border-t-2`} />
      <span aria-hidden className={`${c} -bottom-px -left-px border-b-2 border-l-2`} />
      <span aria-hidden className={`${c} -bottom-px -right-px border-b-2 border-r-2`} />
    </>
  );
}

export function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
        on ? "border-[#5fd3ea] bg-[#5fd3ea]/20 text-[#bff3fb]" : "border-mist/50 text-transparent"
      }`}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3">
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    </span>
  );
}

export function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  planner: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z",
  map: "M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z M9 4v14 M15 6v14",
  intelligence: "M4 20V4 M4 20h16 M7 15l4-4 3 3 5-6",
  rerouting: "M4 7h13l-3-3 M20 17H7l3 3",
  replay: "M12 7v5l3 2 M3.5 12a8.5 8.5 0 1 0 2.5-6 M3 4v4h4",
  data: "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6 M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6",
  about: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5 M12 8h.01",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  shield: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z M9.5 12l2 2 3.5-4",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5 M12 8h.01",
  layers: "m12 3 9 5-9 5-9-5 9-5Z M3 13l9 5 9-5",
  robustness: "M4 19h16 M5 16l4-5 3 3 6-8 M16 6h3v3",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 3v3 M12 18v3 M3 12h3 M18 12h3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2",
};

// South-polar plot: real graticule, the routing engine's supported navigable
// sector and (when valid) the mission's start/destination. 0° at the top,
// west longitudes to the left, as on standard Antarctic charts.
export function PolarPlot({ start, destination, className }: { start?: MissionPoint | null; destination?: MissionPoint | null; className?: string }) {
  const R = 46;
  const xy = (lat: number, lon: number) => {
    const r = ((90 + lat) / 40) * R; // pole at centre, 50°S at the rim
    const a = (lon * Math.PI) / 180;
    // Rounded so server and client render identical SVG (no float drift).
    return [Math.round((50 + r * Math.sin(a)) * 100) / 100, Math.round((50 - r * Math.cos(a)) * 100) / 100] as const;
  };
  const sector: string[] = [];
  for (let lon = -52; lon <= -30; lon += 2) sector.push(xy(-62, lon).join(","));
  for (let lon = -30; lon >= -52; lon -= 2) sector.push(xy(-77.25, lon).join(","));
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <defs>
        <radialGradient id="polar-fill">
          <stop offset="0" stopColor="#dff4f8" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#8fd6ec" stopOpacity="0.22" />
          <stop offset="1" stopColor="#0b2530" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r={R} fill="url(#polar-fill)" />
      {[-60, -70, -80].map((lat) => (
        <circle key={lat} cx="50" cy="50" r={((90 + lat) / 40) * R} fill="none" stroke="#8fd9e0" strokeOpacity="0.3" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
      ))}
      {Array.from({ length: 12 }, (_, i) => i * 30 - 180).map((lon) => {
        const [x, y] = xy(-50, lon);
        return <line key={lon} x1="50" y1="50" x2={x} y2={y} stroke="#8fd9e0" strokeOpacity="0.2" strokeWidth="0.5" />;
      })}
      <polygon points={sector.join(" ")} fill="#5fd3ea" fillOpacity="0.35" stroke="#5fd3ea" strokeWidth="0.8" />
      {start && <circle cx={xy(start.lat, start.lon)[0]} cy={xy(start.lat, start.lon)[1]} r="1.8" fill="#2dd4bf" />}
      {destination && <circle cx={xy(destination.lat, destination.lon)[0]} cy={xy(destination.lat, destination.lon)[1]} r="1.8" fill="#f87171" />}
      <circle cx="50" cy="50" r={R} fill="none" stroke="#8fd9e0" strokeOpacity="0.45" strokeWidth="0.6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Left navigation
// ---------------------------------------------------------------------------

// Only real destinations: this page, the Command Center and its presentation
// views (opened via ?view=), the analytics page and the landing page. The
// active item is the one whose href is the current pathname.
const NAV: { label: string; href: string; icon: keyof typeof ICONS }[] = [
  { label: "Vessel & Mission Configuration", href: "/mission-configuration", icon: "planner" },
  { label: "Command Center", href: "/command-center", icon: "map" },
  { label: "Route Robustness", href: "/route-robustness", icon: "robustness" },
  { label: "Navigation Intelligence", href: "/command-center?view=intelligence", icon: "intelligence" },
  { label: "Adaptive Rerouting", href: "/command-center?view=rerouting", icon: "rerouting" },
  { label: "Mission Replay", href: "/command-center?view=overview", icon: "replay" },
  { label: "Data & Forecasts", href: "/analytics", icon: "data" },
  { label: "About", href: "/#about", icon: "about" },
];

export function LeftNav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col border-r border-[#3b8fb0]/25 bg-[linear-gradient(180deg,#07141c,#050b10)] lg:flex xl:w-[200px] 2xl:w-[236px]">
      <Link href="/" className="block px-3 pb-6 pt-6 xl:px-6" aria-label="ICEWISE home">
        <p className="font-display text-lg font-semibold tracking-[0.02em] text-frost xl:text-[30px] xl:leading-none">
          ICE<span className="text-[#5fd3ea]">WISE</span>
        </p>
        <p className="mt-2 hidden font-body text-[13px] leading-snug text-mist xl:block">
          Intelligent Navigation
          <br />
          for a Safer Tomorrow
        </p>
      </Link>
      <nav className="flex flex-col">
        {NAV.map((item) => {
          const inner = (
            <>
              <Icon d={ICONS[item.icon]} className="h-5 w-5 shrink-0" />
              <span className="hidden leading-tight xl:inline">{item.label}</span>
            </>
          );
          const base =
            "flex items-center justify-center gap-3 border-l-[3px] px-3 py-3.5 font-body text-[13px] transition-colors xl:justify-start xl:px-4 2xl:gap-3.5 2xl:px-5 2xl:text-[14px]";
          return item.href !== pathname ? (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={`${base} border-transparent text-frost/80 hover:bg-[#5fd3ea]/5 hover:text-[#bff3fb]`}
            >
              {inner}
            </Link>
          ) : (
            <span
              key={item.label}
              aria-current="page"
              title={item.label}
              className={`${base} border-[#5fd3ea] bg-[linear-gradient(90deg,rgba(95,211,234,0.22),rgba(95,211,234,0.04))] font-medium text-white`}
            >
              {inner}
            </span>
          );
        })}
      </nav>
      <div className="mt-auto hidden px-6 pb-7 xl:block [@media(max-height:800px)]:hidden">
        <PolarPlot className="mb-6 w-28 opacity-50" />
        <p className="font-body text-[15px] leading-snug text-mist">
          Protecting People.
          <br />
          Preserving Exploration.
        </p>
      </div>
    </aside>
  );
}

