import Link from "next/link";
import ArrowIcon from "@/components/ui/ArrowIcon";

export default function HeroContent() {
  return (
    <div className="absolute left-[4%] top-[16%] z-10 max-w-xl pr-6">
      <span className="font-mono text-xs uppercase tracking-mission-wide text-ice">
        Antarctic Navigation Intelligence
      </span>

      <h1 className="mt-3 font-display text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
        <span className="block text-frost">See</span>
        <span className="block text-frost">Tomorrow.</span>
        <span className="block text-frost/45">Sail Safer.</span>
      </h1>

      <p className="mt-6 max-w-sm font-body text-base leading-relaxed text-frost/70">
        ICEWISE uses AI and real-world data to predict moving ice, assess
        risk, and guide research vessels through Antarctica&apos;s
        unpredictable waters.
      </p>

      <Link
        href="#explore"
        className="mt-8 inline-flex items-center gap-2 rounded-full border border-frost/40 px-6 py-3 font-body text-sm text-frost transition-colors hover:border-ice hover:text-ice"
      >
        Explore the Solution
        <ArrowIcon className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
