import type { ReactNode } from "react";

// Reused across every analytics section: a translucent glass panel with thin
// luminous corner ticks — the same restrained HUD language as the Command
// Center, just with a bit more presence for a report-style reading page.
export default function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-lg border border-ice/15 bg-abyss-raised/50 backdrop-blur-sm ${className}`}>
      <span aria-hidden className="absolute left-0 top-0 h-3 w-3 border-l border-t border-ice/40" />
      <span aria-hidden className="absolute right-0 top-0 h-3 w-3 border-r border-t border-ice/40" />
      <span aria-hidden className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-ice/40" />
      <span aria-hidden className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-ice/40" />
      {children}
    </div>
  );
}
