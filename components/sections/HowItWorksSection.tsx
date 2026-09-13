import SectionGlow from "@/components/ui/SectionGlow";
import RevealOnScroll from "@/components/ui/RevealOnScroll";
import ProcessFlow from "@/components/ui/ProcessFlow";

const steps = [
  {
    step: "01",
    label: "Observe",
    body: "Antarctic environmental, sea-ice, and vessel telemetry data is continuously ingested from satellite, oceanographic, and meteorological sources.",
  },
  {
    step: "02",
    label: "Predict",
    body: "Physics-based drift modeling, corrected by a machine-learning residual layer, produces a trajectory estimate for tracked icebergs.",
  },
  {
    step: "03",
    label: "Assess Risk",
    body: "Prediction uncertainty is quantified and converted into a probabilistic risk surface across the vessel's operating area.",
  },
  {
    step: "04",
    label: "Optimize Route",
    body: "Candidate paths are modeled as a graph and optimized against that risk surface, weighing safety against distance and time.",
  },
  {
    step: "05",
    label: "Self-Correct / Re-route",
    body: "As new observations arrive, the model updates its correction and the route is recomputed against the revised picture.",
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 overflow-hidden border-t border-ice/10 bg-abyss px-6 py-28 lg:px-10"
    >
      <SectionGlow className="left-[10%] top-10 h-96 w-96" />

      <div className="mx-auto max-w-6xl">
        <RevealOnScroll>
          <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
            How ICEWISE Works
          </span>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-frost sm:text-4xl lg:text-5xl">
            One continuous{" "}
            <span className="text-ice drop-shadow-[0_0_18px_rgba(143,217,224,0.35)]">
              loop
            </span>
            , not a one-time forecast.
          </h2>
          <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-mist sm:text-lg">
            Every prediction is observed, questioned, and revised — the same five-step cycle
            running continuously as a vessel moves through the ice.
          </p>
        </RevealOnScroll>

        <div className="mt-16">
          <ProcessFlow steps={steps} columns={5} />
        </div>
      </div>
    </section>
  );
}
