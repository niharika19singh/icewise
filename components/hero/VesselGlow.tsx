import { palette } from "./scene/palette";

// The vessel itself is baked into the reference photo — rather than risk a
// distorted/cutout look by animating that image region directly, "alive"
// is expressed as a small bobbing, pulsing cabin light at its position
// (matches TrajectoryOverlay's "Research Vessel" marker).
export default function VesselGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-[80%] top-[63%] z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
    >
      <div
        className="h-2.5 w-2.5 animate-vessel-bob rounded-full motion-reduce:animate-none"
        style={{ background: palette.vessel, boxShadow: `0 0 10px 3px ${palette.vessel}` }}
      />
    </div>
  );
}
