"use client";

import { useEffect, useRef, useState } from "react";

// Animates from 0 to a real numeric value already returned by the backend —
// purely a presentation tween, the destination number is never invented.
export function useCountUp(target: number, active: boolean, duration = 1000) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let settled = false;
    startRef.current = null;

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        settled = true;
      }
    };
    raf = requestAnimationFrame(step);

    // Safety net independent of requestAnimationFrame: on a throttled,
    // backgrounded, or otherwise degraded tab where animation frames never
    // advance, still land on the real value rather than staying stuck at 0.
    const fallback = setTimeout(() => {
      if (!settled) setValue(target);
    }, duration + 150);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [target, active, duration]);

  return value;
}
