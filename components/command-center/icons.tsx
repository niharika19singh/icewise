// Minimal inline icon set for the Command Center shell — matches ArrowIcon's
// stroke-based style (no icon library needed for a handful of glyphs).

type IconProps = { className?: string };

export function MapIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function IcebergIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 4 15h16L14 6l-2-3Z" />
      <path d="M8 21h8l-1.5-4h-5L8 21Z" />
    </svg>
  );
}

export function SeaIceIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 8h18M3 12h18M3 16h18" />
    </svg>
  );
}

export function RoutesIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="5" cy="18" r="1.6" />
      <circle cx="19" cy="6" r="1.6" />
      <path d="M6.4 16.8 12 11l1.5 1.5c1 1 2.5 1 3.4-.2L17.6 12" />
    </svg>
  );
}

export function WeatherIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.6A4 4 0 0 0 7 17Z" />
    </svg>
  );
}

export function AnalyticsIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className={className}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className={className}>
      <path d="M3 8h10" />
    </svg>
  );
}

export function LocateIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15" />
    </svg>
  );
}

export function LayersIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m8 2 6 3.2L8 8.4 2 5.2 8 2Z" />
      <path d="m2 8.8 6 3.2 6-3.2" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M5 3.5v9l8-4.5-8-4.5Z" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 10a6 6 0 1 1 12 0c0 3.4 1 5 1.5 5.5H4.5C5 15 6 13.4 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function DishIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 15a8 8 0 0 1 8-8" />
      <path d="M12 7 20 15" />
      <circle cx="4" cy="15" r="1.6" />
      <path d="M9 15a5 5 0 0 1 5-5l-2.5 2.5L14 15H9Z" />
      <path d="M12 15v5M9 20h6" />
    </svg>
  );
}

export function ModelIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="16" r="2" />
      <path d="M7.6 7.2 10.6 14.4M16.4 7.2 13.4 14.4M8 6h8" />
    </svg>
  );
}

export function EngineIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M16 12h2.5L20 10v6l-1.5-2H16" />
      <path d="M7 9V6.5M10.5 9V6.5" />
    </svg>
  );
}

export function ThermometerIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 14.5V5a2 2 0 1 0-4 0v9.5a4 4 0 1 0 4 0Z" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function CompassIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v3M12 18v3" />
      <path d="m8.5 9.5 7 5-7-5Z" fill="currentColor" stroke="none" />
      <path d="M12 6 9.5 12 12 18l2.5-6L12 6Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
