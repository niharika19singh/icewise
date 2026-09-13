import SectionGlow from "@/components/ui/SectionGlow";
import RevealOnScroll from "@/components/ui/RevealOnScroll";

const pillars = [
  {
    index: "01",
    title: "Safer Research-Vessel Navigation",
    body: "By surfacing where risk is concentrated — not just where ice was last seen — ICEWISE is designed to give crews more warning and more usable time to react to a changing iceberg field.",
  },
  {
    index: "02",
    title: "Fuel-Efficient Routing",
    body: "Reactive, last-minute course corrections cost distance and fuel. A route built against a probabilistic risk surface, updated as conditions change, is designed to reduce unnecessary detours.",
  },
  {
    index: "03",
    title: "Reduced Collision & Operational Risk",
    body: "Every prediction carries an explicit uncertainty estimate instead of false precision — intended to help operators decide when to hold position, slow down, or divert around a hazard.",
  },
  {
    index: "04",
    title: "Better Decision Support for Research Missions",
    body: "The adaptive predict-observe-assess-optimize-correct loop keeps the picture a vessel is working from current, grounded in the most recently corrected model of the ice around them.",
  },
];

export default function ImpactSection() {
  return (
    <section
      id="impact"
      className="relative scroll-mt-24 overflow-hidden border-t border-ice/10 bg-abyss-raised px-6 py-28 lg:px-10"
    >
      <SectionGlow className="left-[8%] top-0 h-[26rem] w-[26rem] -translate-y-1/3" />
      <SectionGlow className="right-[8%] bottom-0 h-96 w-96 translate-y-1/3" />

      <div className="mx-auto max-w-5xl">
        <RevealOnScroll>
          <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
            The Impact
          </span>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-frost sm:text-4xl lg:text-5xl">
            What better prediction is meant to{" "}
            <span className="text-ice drop-shadow-[0_0_18px_rgba(143,217,224,0.35)]">
              change
            </span>
            .
          </h2>
          <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-mist sm:text-lg">
            ICEWISE is designed around one outcome: research vessels making informed decisions in
            Antarctic waters, backed by a continuously corrected picture of the ice.
          </p>
        </RevealOnScroll>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {pillars.map((pillar, i) => (
            <RevealOnScroll key={pillar.index} delay={i * 0.06}>
              <div className="h-full rounded-lg border border-ice/15 bg-frost/[0.03] p-6 backdrop-blur-sm transition-colors hover:border-ice/40 hover:bg-frost/[0.05]">
                <span className="font-mono text-xs uppercase tracking-mission text-ice">
                  {pillar.index}
                </span>
                <h3 className="mt-3 font-display text-xl font-medium tracking-tight text-frost sm:text-2xl">
                  {pillar.title}
                </h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-mist sm:text-base">
                  {pillar.body}
                </p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
