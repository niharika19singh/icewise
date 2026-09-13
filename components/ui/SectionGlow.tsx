// A small, contained, blurred radial glow — never a full-bleed gradient wash.
// Reuses the existing light-pulse keyframe (already defined in globals.css)
// for a slow, restrained breathing effect.
export default function SectionGlow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute -z-10 animate-light-pulse rounded-full blur-3xl motion-reduce:animate-none ${className}`}
      style={{
        background: "radial-gradient(circle, rgba(143,217,224,0.16), transparent 70%)",
      }}
    />
  );
}
