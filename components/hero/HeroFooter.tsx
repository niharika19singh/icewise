export default function HeroFooter() {
  return (
    <div className="absolute inset-x-0 bottom-[4%] z-10 flex items-center justify-between px-[4%]">
      <div className="hidden items-center gap-4 sm:flex">
        <span className="font-mono text-[10px] uppercase leading-relaxed tracking-mission text-mist">
          Built for a
          <br />
          Safer, Smarter
          <br />
          Antarctica
        </span>
        <span aria-hidden className="hidden h-px w-16 bg-line md:block" />
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-mission text-mist">
          Scroll to Discover
        </span>
        <svg
          aria-hidden
          viewBox="0 0 16 8"
          className="h-2 w-4 text-mist"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M1 1l7 6 7-6" />
        </svg>
      </div>

      <div className="hidden items-center gap-4 sm:flex">
        <span aria-hidden className="hidden h-px w-16 bg-line md:block" />
        <span className="font-mono text-[10px] uppercase leading-relaxed tracking-mission text-mist text-right">
          Real Data
          <br />
          Real Intelligence
          <br />
          Real Impact
        </span>
      </div>
    </div>
  );
}
