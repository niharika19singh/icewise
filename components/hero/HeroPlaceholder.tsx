/**
 * Placeholder for the cinematic Antarctic hero (ocean, iceberg, atmosphere).
 * Establishes the visual language only — the WebGL scene replaces this section later.
 */
export default function HeroPlaceholder() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-abyss px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,_var(--color-ocean),_var(--color-abyss)_70%)]"
      />

      <div className="relative flex flex-col items-center text-center">
        <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
          Antarctic Navigation Intelligence
        </span>

        <h1 className="mt-6 font-display text-6xl font-medium tracking-tight text-frost sm:text-8xl">
          ICEWISE
        </h1>

        <p className="mt-6 max-w-md font-body text-sm leading-relaxed text-mist sm:text-base">
          Physics-based iceberg drift prediction, ML residual correction, and
          probabilistic risk — presented as a cinematic expedition experience.
        </p>
      </div>

      <div className="absolute bottom-10 flex flex-col items-center gap-3 text-mist">
        <span className="font-mono text-[10px] uppercase tracking-mission">
          Scroll
        </span>
        <span aria-hidden className="h-10 w-px bg-line" />
      </div>
    </section>
  );
}
