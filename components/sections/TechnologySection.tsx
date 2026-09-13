import SectionGlow from "@/components/ui/SectionGlow";
import RevealOnScroll from "@/components/ui/RevealOnScroll";

const capabilities = [
  {
    index: "01",
    title: "Satellite, Oceanographic & Meteorological Data",
    body: "Satellite imagery, ocean sensor networks, and meteorological feeds covering the vessel's Antarctic operating region form the base layer every downstream prediction is built on.",
  },
  {
    index: "02",
    title: "Sea-Ice Forecasting",
    body: "Sea surface temperature, wind, currents, and ice concentration are continuously ingested to establish the conditions any drift prediction has to account for.",
  },
  {
    index: "03",
    title: "Physics-Based Iceberg Drift",
    body: "A physics-based drift model — driven by ocean currents, wind forcing, and iceberg geometry — produces a first-principles trajectory estimate.",
  },
  {
    index: "04",
    title: "ML Residual Correction",
    body: "A machine-learning layer learns from the gap between physics-predicted and observed drift, correcting for effects the physics model alone doesn't capture.",
  },
  {
    index: "05",
    title: "Uncertainty Estimation",
    body: "Every predicted position carries an explicit uncertainty estimate rather than a single confident line.",
  },
  {
    index: "06",
    title: "Probabilistic Risk",
    body: "That uncertainty is converted into a probabilistic navigation risk surface — the basis for route decisions, not an afterthought layered on top of them.",
  },
  {
    index: "07",
    title: "Graph-Based Route Optimization",
    body: "Candidate routes are modeled as a graph and optimized against the probabilistic risk surface, surfacing the trade-offs between alternatives, not just one route.",
  },
];

export default function TechnologySection() {
  return (
    <section
      id="technology"
      className="relative scroll-mt-24 overflow-hidden border-t border-ice/10 bg-abyss-raised px-6 py-28 lg:px-10"
    >
      <SectionGlow className="right-[10%] top-10 h-96 w-96" />

      <div className="mx-auto max-w-4xl">
        <RevealOnScroll>
          <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
            Technology / Methodology
          </span>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-frost sm:text-4xl lg:text-5xl">
            Prediction that{" "}
            <span className="text-ice drop-shadow-[0_0_18px_rgba(143,217,224,0.35)]">
              corrects itself
            </span>
            .
          </h2>
          <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-mist sm:text-lg">
            ICEWISE pairs physics-based drift modeling with a machine-learning correction layer,
            wraps every prediction in an honest uncertainty estimate, and optimizes routes against
            the resulting risk — not a single deterministic line.
          </p>
        </RevealOnScroll>

        <div className="mt-16 divide-y divide-ice/10">
          {capabilities.map((item, i) => (
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
