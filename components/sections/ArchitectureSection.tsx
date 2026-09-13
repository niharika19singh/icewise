import SectionGlow from "@/components/ui/SectionGlow";
import RevealOnScroll from "@/components/ui/RevealOnScroll";
import ProcessFlow from "@/components/ui/ProcessFlow";

const steps = [
  {
    step: "01",
    label: "Data Sources",
    body: "Satellite imagery, oceanographic sensors, and meteorological feeds covering the vessel's Antarctic operating region.",
  },
  {
    step: "02",
    label: "FastAPI / Processing",
    body: "Incoming data is validated, normalized, and prepared by a FastAPI-based processing layer.",
  },
  {
    step: "03",
    label: "Physics + ML",
    body: "A physics-based drift model and machine-learning residual correction layer generate iceberg trajectory predictions.",
  },
  {
    step: "04",
    label: "Risk Engine",
    body: "Prediction uncertainty is converted into a probabilistic navigation risk surface.",
  },
  {
    step: "05",
    label: "Route Optimizer",
    body: "A graph-based optimizer weighs candidate routes against that risk surface.",
  },
  {
    step: "06",
    label: "Command Center",
    body: "Vessel crews and operators view predictions, risk, and recommended routing through the Command Center interface.",
  },
];

export default function ArchitectureSection() {
  return (
    <section
      id="architecture"
      className="relative scroll-mt-24 overflow-hidden border-t border-ice/10 bg-abyss px-6 py-28 lg:px-10"
    >
      <SectionGlow className="left-1/2 top-0 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/3" />

      <div className="mx-auto max-w-6xl">
        <RevealOnScroll>
          <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
            System Architecture
          </span>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-frost sm:text-4xl lg:text-5xl">
            From raw signal to a{" "}
            <span className="text-ice drop-shadow-[0_0_18px_rgba(143,217,224,0.35)]">
              routing decision
            </span>
            .
          </h2>
          <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-mist sm:text-lg">
            Every layer exists to answer one question a little more precisely than the last:
            where is the ice going, and how sure are we?
          </p>
        </RevealOnScroll>

        <div className="mt-16">
          <ProcessFlow steps={steps} columns={3} />
        </div>
      </div>
    </section>
  );
}
