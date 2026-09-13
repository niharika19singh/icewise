"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/ui/Logo";

// Genuine client-side UTC clock — no fabricated environmental data. There is
// no real Antarctic weather/conditions feed in this prototype, so nothing
// claiming to be live temperature/visibility belongs here.
function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export default function TopBar() {
  const [utc, setUtc] = useState<string | null>(null);

  useEffect(() => {
    // Deliberately client-only (not a render-time initializer): rendering
    // `new Date()` during SSR would bake a build-time timestamp into the
    // static HTML and mismatch on hydration. One-time init, not a
    // cascading-render risk.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUtc(formatUtc(new Date()));
    const interval = setInterval(() => setUtc(formatUtc(new Date())), 1000);
    return () => clearInterval(interval);
  }, []);

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
        {utc && <span className="hidden md:inline">UTC {utc}</span>}
      </div>
    </header>
  );
}
