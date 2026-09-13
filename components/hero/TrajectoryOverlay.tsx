"use client";

import { useReducedMotion } from "@/lib/useReducedMotion";

// Decorative technical annotations layered over the environment. Positions
// are approximate — hand-placed to match the reference's style and general
// layout (arcs framing the iceberg, marker + label pairs, an edge ruler),
// not traced from vector data.
//
// Coordinates are section-relative percentages, remeasured directly against
// hero-reference.png (1672x941) with Hero.tsx's object-cover object-center
// crop, which shows essentially the whole image at this aspect (see
// Hero.tsx) — so these are close to the image's own feature positions:
// iceberg peak ~62%/35%, mountains ~50-52% down both sides, waterline
// ~68-69% down, vessel ~80%/65%.
const ARC_1 = "M 35,48 Q 52,30 68,38";
const ARC_2 = "M 22,58 Q 50,72 82,64";

const markers = [
  { label: "Predicted Trajectory", left: "35%", top: "48%" },
  { label: "Ice Drift Vector", left: "68%", top: "38%" },
  { label: "Research Vessel", left: "80%", top: "63%" },
];

const RULER_TOP = 32;
const RULER_BOTTOM = 68;
const RULER_TICKS = 4;

export default function TrajectoryOverlay() {
  const reducedMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
      {/* 0-100 percentage space (of the section, not the image) so this
          stays aligned with the visible crop regardless of viewport size. */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <g stroke="var(--color-ice)" strokeWidth={0.15} fill="none" opacity={0.5}>
          <path d={ARC_1} strokeDasharray="0.3 1">
            {!reducedMotion && (
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-2.6"
                dur="3s"
                repeatCount="indefinite"
              />
            )}
          </path>
          <path d={ARC_2} opacity={0.55} />
        </g>

        {/* Data points traveling along the trajectory arcs. */}
        {!reducedMotion && (
          <g fill="var(--color-ice-bright)">
            <circle r="0.35">
              <animateMotion dur="5s" repeatCount="indefinite" path={ARC_1} />
            </circle>
            <circle r="0.3" opacity={0.8}>
              <animateMotion dur="7.5s" repeatCount="indefinite" path={ARC_2} />
            </circle>
          </g>
        )}

        <g fill="var(--color-ice)">
          <circle cx="35" cy="48" r="0.3" />
          <circle cx="68" cy="38" r="0.3" />
          <circle cx="80" cy="65" r="0.3" />
        </g>

        <g stroke="var(--color-ice)" strokeWidth={0.15} fill="none" opacity={0.6}>
          <ellipse cx="62" cy="60" rx="1.2" ry="1.6" />
          <ellipse cx="62" cy="60" rx="2" ry="2.7" opacity={0.4} />
        </g>
        <circle cx="62" cy="60" r="0.25" fill="var(--color-ice)" />

        <g stroke="var(--color-line)" strokeWidth={0.1}>
          <line x1="98" y1={RULER_TOP} x2="98" y2={RULER_BOTTOM} />
          {Array.from({ length: RULER_TICKS }).map((_, i) => {
            const y = RULER_TOP + (i * (RULER_BOTTOM - RULER_TOP)) / (RULER_TICKS - 1);
            return <line key={i} x1="97.4" y1={y} x2="98.6" y2={y} />;
          })}
        </g>
      </svg>

      {markers.map((marker) => (
        <span
          key={marker.label}
          className="absolute -translate-y-1/2 font-mono text-[10px] uppercase leading-tight tracking-mission text-frost/80"
          style={{ left: marker.left, top: marker.top }}
        >
          {marker.label}
        </span>
      ))}

      {Array.from({ length: RULER_TICKS }).map((_, i) => {
        const topPct = RULER_TOP + (i * (RULER_BOTTOM - RULER_TOP)) / (RULER_TICKS - 1);
        return (
          <span
            key={i}
            className="absolute right-[1.6%] -translate-y-1/2 font-mono text-[10px] text-mist"
            style={{ top: `${topPct}%` }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
        );
      })}
    </div>
  );
}
