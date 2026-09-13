import SectionGlow from "@/components/ui/SectionGlow";
import RevealOnScroll from "@/components/ui/RevealOnScroll";

const sections = [
  {
    index: "01",
    title: "The Antarctic Navigation Challenge",
    body: "Antarctic waters are among the most hazardous, least-observed operating environments on Earth. Icebergs calve and drift unpredictably, sea ice conditions shift within hours, storms arrive with little warning, and visibility can collapse without notice. Research vessels routinely operate with sparse observational data and long gaps between reliable updates — forcing crews into reactive, last-minute course corrections in waters that rarely forgive them.",
  },
  {
    index: "02",
    title: "What ICEWISE Does",
    body: "ICEWISE is an AI-enabled decision-support system for research vessels navigating Antarctic waters. It combines Antarctic environmental and sea-ice data with physics-based iceberg drift prediction, corrected by a machine-learning residual layer trained against observed behavior. Every prediction carries an explicit uncertainty estimate, which feeds a probabilistic risk model and a graph-based route optimizer.",
  },
  {
    index: "03",
    title: "Adaptive by Design",
    body: "Static forecasts go stale the moment conditions change. ICEWISE is built around a continuous loop — predict, observe, compare, self-correct, re-route — so new observations are constantly folded back into the model, sharpening predictions and revising routes as the environment actually behaves.",
  },
  {
    index: "04",
    title: "Core Mission",
    body: "Antarctic research depends on vessels reaching their stations safely and on schedule. ICEWISE exists to give crews and operators a clearer, continuously updated picture of the ice around them — turning navigation into a discipline of informed decisions rather than guesswork.",
  },
];

export default function AboutSection() {
  return (
    <section
      id="about"
      className="relative scroll-mt-24 overflow-hidden border-t border-ice/10 bg-abyss-raised px-6 py-28 lg:px-10"
    >
      <SectionGlow className="left-1/2 top-0 h-80 w-80 -translate-x-1/2 -translate-y-1/2" />

      <div className="mx-auto max-w-4xl">
        <RevealOnScroll>
          <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
            The Mission
          </span>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-frost sm:text-4xl lg:text-5xl">
            Antarctic waters don&apos;t wait for{" "}
            <span className="text-ice drop-shadow-[0_0_18px_rgba(143,217,224,0.35)]">
              certainty
            </span>
            .
          </h2>
          <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-mist sm:text-lg">
            ICEWISE exists because research vessels navigating Antarctica deserve better than
            reactive guesswork — a system that predicts, questions its own predictions, and
            adapts as the ice actually moves.
          </p>
        </RevealOnScroll>

        <div className="mt-16 divide-y divide-ice/10">
          {sections.map((item, i) => (
            <RevealOnScroll key={item.index} delay={i * 0.05}>
              <div className="grid gap-4 py-10 sm:grid-cols-[80px_1fr] sm:gap-8">
                <span className="font-mono text-xs uppercase tracking-mission text-ice">
                  {item.index}
                </span>
                <div>
                  <h3 className="font-display text-xl font-medium tracking-tight text-frost sm:text-2xl">
                    {item.title}
                  </h3>
                  <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-mist sm:text-base">
                    {item.body}
                  </p>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
