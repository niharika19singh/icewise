const metrics = [
  { label: "Drift Speed", value: "3.2 cm/s" },
  { label: "Direction", value: "NE" },
  { label: "Confidence", value: "92%" },
];

export default function DataPanel() {
  return (
    <div className="absolute right-[4%] top-[16%] z-10 hidden w-72 rounded-lg border border-line bg-abyss/50 p-4 backdrop-blur-sm lg:block">
      <div className="flex items-center gap-3">
        <svg
          aria-hidden
          viewBox="0 0 32 32"
          className="h-8 w-8 shrink-0 text-ice"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path d="M16 4 27 24 5 24Z" />
          <path d="M16 4 16 24M9 14 23 18M11 24 20 10" strokeWidth={0.5} />
        </svg>
        <span className="font-mono text-xs uppercase tracking-mission text-frost">
          Iceberg #A-317
        </span>
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-center justify-between font-mono text-xs"
          >
            <span className="text-mist">{metric.label}</span>
            <span className="text-frost">{metric.value}</span>
          </div>
        ))}
      </div>

      <svg
        aria-hidden
        viewBox="0 0 260 30"
        className="mt-3 h-6 w-full text-ice/60"
      >
        <polyline
          points="0,20 20,15 40,22 60,10 80,18 100,6 120,16 140,12 160,20 180,8 200,14 220,4 240,12 260,8"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
