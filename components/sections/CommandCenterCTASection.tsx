import Link from "next/link";
import SectionGlow from "@/components/ui/SectionGlow";
import RevealOnScroll from "@/components/ui/RevealOnScroll";
import ArrowIcon from "@/components/ui/ArrowIcon";

export default function CommandCenterCTASection() {
  return (
    <section
      id="command-center"
      className="relative scroll-mt-24 overflow-hidden border-t border-ice/10 bg-abyss px-6 py-32 lg:px-10"
    >
      <SectionGlow className="left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2" />

      <div className="relative mx-auto max-w-3xl text-center">
        <RevealOnScroll className="flex flex-col items-center">
          <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
            Enter ICEWISE
          </span>
          <h2 className="mt-4 font-display text-4xl font-medium leading-tight tracking-tight text-frost sm:text-5xl lg:text-6xl">
            Step into the{" "}
            <span className="text-ice drop-shadow-[0_0_22px_rgba(143,217,224,0.4)]">
              Command Center
            </span>
            .
          </h2>
          <p className="mt-6 max-w-xl font-body text-base leading-relaxed text-mist sm:text-lg">
            Prediction, risk, and route intelligence for Antarctic navigation — brought together
            in one operational view.
          </p>

          <Link
            href="/command-center"
            className="mt-10 inline-flex items-center gap-2 rounded-full border border-ice/40 bg-ice/5 px-7 py-3 font-body text-sm text-frost transition-colors hover:border-ice hover:bg-ice/10 hover:text-ice"
          >
            Enter Command Center
            <ArrowIcon className="h-3.5 w-3.5" />
          </Link>
        </RevealOnScroll>
      </div>
    </section>
  );
}
