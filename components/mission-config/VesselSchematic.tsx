import { useId } from "react";
import type { VesselProfileId } from "./missionConfig";

// Side-elevation illustrations, one per vessel class. Illustrative only — no
// dimension, hull or ice-class data is implied by (or read from) them.
//   "line":  cyan wireframe (holographic)
//   "solid": white superstructure over a dark hull, lit windows, reflection

type Parts = {
  hull: string;
  superstructure: string[];
  details: string[];
  windows: [number, number][];
  portholes: number[];
  portholeY: number;
  belt?: string;
  containers?: [number, number, number, number][];
};

const VESSELS: Record<VesselProfileId, Parts> = {
  research: {
    hull: "M22 60 L298 56 L286 76 Q281 86 268 86 L42 86 Q31 86 28 78 Z",
    superstructure: [
      "M148 59 L148 44 L236 44 L248 58 Z",
      "M166 44 L166 31 L224 31 L231 44 Z",
      "M150 44 L146 29 L160 29 L162 44 Z",
    ],
    details: ["M38 59 L46 34 L60 34 L66 59", "M104 59 L104 42 L132 30", "M198 31 L198 12 M190 16 L206 16 M193 22 L203 22"],
    windows: [172, 181, 190, 199, 208, 217].map((x) => [x, 34] as [number, number]),
    portholes: [60, 80, 100, 120, 250, 262],
    portholeY: 70,
  },
  "ice-strengthened": {
    hull: "M22 58 L280 58 L304 50 L292 70 Q284 86 266 86 L42 86 Q31 86 28 78 Z",
    superstructure: [
      "M150 57 L150 40 L262 40 L274 57 Z",
      "M168 40 L168 27 L250 27 L258 40 Z",
      "M186 27 L186 18 L238 18 L243 27 Z",
      "M130 57 L128 36 L142 36 L144 57 Z",
    ],
    details: ["M24 48 L98 48 L98 57", "M214 18 L214 4 M206 8 L222 8"],
    windows: [192, 201, 210, 219, 228].map((x) => [x, 20.5] as [number, number]),
    portholes: [70, 90, 110, 200, 230, 255],
    portholeY: 68,
    belt: "M30 76 L288 76 M30 79 L286 79",
  },
  supply: {
    hull: "M22 62 L298 56 L286 76 Q281 86 268 86 L42 86 Q31 86 28 78 Z",
    superstructure: ["M204 57 L204 38 L272 38 L282 55 Z", "M216 38 L216 22 L262 22 L268 38 Z"],
    details: ["M176 58 L176 36 L144 22", "M240 22 L240 8 M232 12 L248 12"],
    windows: [222, 231, 240, 249].map((x) => [x, 26] as [number, number]),
    portholes: [214, 232, 252, 268],
    portholeY: 68,
    containers: [
      [40, 49, 22, 11],
      [66, 49, 22, 11],
      [92, 49, 22, 11],
      [118, 49, 22, 11],
      [144, 49, 22, 11],
      [53, 39, 22, 10],
      [79, 39, 22, 10],
      [105, 39, 22, 10],
    ],
  },
};

function Vessel({ parts, solid, gid }: { parts: Parts; solid: boolean; gid: string }) {
  return (
    <>
      <path d={parts.hull} fill={solid ? `url(#${gid}-hull)` : "none"} stroke={solid ? "#5fc6dc" : "currentColor"} />
      {parts.belt && <path d={parts.belt} fill="none" stroke={solid ? "#b8434a" : "currentColor"} opacity={solid ? 0.9 : 0.55} />}
      {parts.containers?.map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={solid ? ["#c05a3c", "#3d7fa6", "#d8a24a"][i % 3] : "none"}
          stroke={solid ? "#0a1419" : "currentColor"}
          strokeWidth={solid ? 0.6 : undefined}
          opacity={solid ? 0.95 : i >= 5 ? 0.7 : 1}
        />
      ))}
      {parts.superstructure.map((d) => (
        <path key={d} d={d} fill={solid ? `url(#${gid}-super)` : "none"} stroke={solid ? "#9fb8c0" : "currentColor"} strokeWidth={solid ? 0.6 : undefined} />
      ))}
      {parts.details.map((d) => (
        <path key={d} d={d} fill="none" stroke={solid ? "#dfe9ec" : "currentColor"} />
      ))}
      {parts.windows.map(([x, y]) => (
        <rect key={x} x={x} y={y} width={6} height={4} fill={solid ? "#0d2a36" : "none"} stroke={solid ? "#7fe3f5" : "currentColor"} strokeWidth={solid ? 0.5 : undefined} />
      ))}
      {parts.portholes.map((x) => (
        <circle key={x} cx={x} cy={parts.portholeY} r={1.6} fill={solid ? "#ffd48a" : "none"} stroke={solid ? "none" : "currentColor"} />
      ))}
    </>
  );
}

export default function VesselSchematic({
  profileId,
  className,
  variant = "line",
  withWater = true,
}: {
  profileId: VesselProfileId;
  className?: string;
  variant?: "line" | "solid";
  withWater?: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  const solid = variant === "solid";
  const parts = VESSELS[profileId];
  return (
    <svg
      viewBox={withWater && solid ? "0 0 320 120" : "0 0 320 100"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      {solid && (
        <defs>
          <linearGradient id={`${gid}-hull`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d3a48" />
            <stop offset="1" stopColor="#081319" />
          </linearGradient>
          <linearGradient id={`${gid}-super`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f9fa" />
            <stop offset="1" stopColor="#b9cbd1" />
          </linearGradient>
          <linearGradient id={`${gid}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`${gid}-mask`}>
            <rect x="0" y="86" width="320" height="34" fill={`url(#${gid}-fade)`} />
          </mask>
        </defs>
      )}
      <Vessel parts={parts} solid={solid} gid={gid} />
      {withWater && solid && (
        // Reflection: the same vessel mirrored about the waterline, faded out.
        <g mask={`url(#${gid}-mask)`} transform="matrix(1 0 0 -1 0 172)" opacity={0.6}>
          <Vessel parts={parts} solid gid={gid} />
        </g>
      )}
      {withWater && (
        <g opacity={solid ? 0.45 : 0.5} stroke={solid ? "#5fc6dc" : "currentColor"}>
          <path d="M4 87 Q40 84 80 87 T160 87 T240 87 T316 87" />
          {!solid && <path d="M40 94 Q80 92 120 94 T200 94 T280 94" opacity={0.5} />}
        </g>
      )}
    </svg>
  );
}
