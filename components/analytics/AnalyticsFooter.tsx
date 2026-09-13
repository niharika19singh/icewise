import Link from "next/link";
import ArrowIcon from "@/components/ui/ArrowIcon";

export default function AnalyticsFooter() {
  return (
    <footer className="px-6 py-14 text-center lg:px-10">
      <p className="font-mono text-[10px] uppercase tracking-mission text-mist">
        ICEWISE · Antarctic Navigation Intelligence
      </p>
      <Link
        href="/command-center"
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-ice/40 bg-ice/5 px-6 py-2.5 font-mono text-xs uppercase tracking-mission text-ice transition-colors hover:border-ice hover:bg-ice/10"
      >
        Return to Command Center
        <ArrowIcon className="h-3.5 w-3.5" />
      </Link>
    </footer>
  );
}
