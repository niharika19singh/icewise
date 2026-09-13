import RevealOnScroll from "@/components/ui/RevealOnScroll";

export type ProcessStep = {
  step: string;
  label: string;
  body: string;
};

// Shared "connected steps" diagram used by both How ICEWISE Works and
// System Architecture — same visual language, different content, so the
// two read as related but distinct chapters rather than duplicated UI.
export default function ProcessFlow({
  steps,
  columns = 5,
}: {
  steps: ProcessStep[];
  columns?: 3 | 5;
}) {
  const gridCols = columns === 5 ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid gap-6 ${gridCols}`}>
      {steps.map((item, i) => (
        <RevealOnScroll key={item.step} delay={i * 0.06}>
          <div className="relative">
            <div className="group h-full rounded-lg border border-ice/15 bg-frost/[0.03] p-5 backdrop-blur-sm transition-colors hover:border-ice/40">
              <span className="font-mono text-xs text-ice">{item.step}</span>
              <h4 className="mt-2 font-display text-lg font-medium text-frost">
                {item.label}
              </h4>
              <p className="mt-2 font-body text-sm leading-relaxed text-mist">
                {item.body}
              </p>
            </div>
            {(i + 1) % columns !== 0 && i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute right-[-1.5rem] top-1/2 hidden h-px w-6 -translate-y-1/2 bg-gradient-to-r from-ice/30 to-transparent lg:block"
              />
            )}
          </div>
        </RevealOnScroll>
      ))}
    </div>
  );
}
