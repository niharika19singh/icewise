"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Scene from "./Scene";
import GhostCursor from "./GhostCursor";
import TrajectoryOverlay from "./TrajectoryOverlay";
import VesselGlow from "./VesselGlow";
import HeroContent from "./HeroContent";
import DataPanel from "./DataPanel";
import HeroFooter from "./HeroFooter";
import { useReducedMotion } from "@/lib/useReducedMotion";

gsap.registerPlugin(ScrollTrigger);

// Locked to exactly one viewport (100svh) — no scrolling to reveal the
// ocean.
//
// The reference file is 1672x941 (aspect ~1.777) — essentially identical to
// a 16:9 viewport's aspect (1.778). Earlier composition passes assumed a
// much narrower ~1.15-aspect file (an old version of this asset) and fought
// a cropping trade-off that no longer exists: at this aspect, object-fit:
// cover needs only a fraction-of-a-percent crop to fill any standard
// widescreen viewport, so the image now displays essentially in full at its
// own natural composition — no meaningful bias needed, hence plain center
// object-position. See TrajectoryOverlay for annotation coordinates
// recalibrated against this file's actual proportions.
//
// The DOM <Image> stays as the base layer (instant paint, accessibility,
// WebGL fallback). The R3F Canvas renders the SAME photo as a texture on
// top, animated (wave distortion, shimmer, lightning, sky light movement) —
// see EnvironmentShader for how the original detail is preserved rather
// than replaced.
export default function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const exitOverlayRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  // Starts false to match the server-rendered markup exactly (touch
  // capability can't be known during SSR) and is corrected right after
  // mount — computing it eagerly via a lazy useState initializer caused a
  // real hydration mismatch (this environment's client reads touch
  // capability differently from the server's default), not just a lint
  // nitpick.
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Reading a platform API (touch capability) that's unavailable during
    // SSR and must not run during the initial client render either, or it
    // would reintroduce the hydration mismatch this effect exists to avoid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useGSAP(
    () => {
      if (reducedMotion || !sectionRef.current || !exitOverlayRef.current) return;

      // Cinematic exit: as the page scrolls past the hero, it pushes in
      // slightly and darkens under a dedicated overlay (opacity, not
      // `filter` — filter interpolation without an explicit numeric "from"
      // misbehaved and jumped straight to its end value at scroll 0) rather
      // than simply scrolling away unchanged — a transition cue for
      // whatever section follows it.
      gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=100%",
          pin: true,
          scrub: true,
        },
      })
        .fromTo(sectionRef.current, { scale: 1 }, { scale: 1.08, ease: "none" }, 0)
        .fromTo(exitOverlayRef.current, { opacity: 0 }, { opacity: 0.6, ease: "none" }, 0);
    },
    { scope: sectionRef, dependencies: [reducedMotion] },
  );

  return (
    <section
      ref={sectionRef}
      className="relative h-svh w-full overflow-hidden bg-abyss"
      style={{ position: "relative", height: "100svh", minHeight: "100svh" }}
    >
      <Image
        src="/images/hero-reference.png"
        alt="A massive Antarctic iceberg glowing with cyan light beneath a dramatic storm sky, with distant mountains and a small research vessel for scale"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      <Canvas
        style={{ position: "absolute", inset: 0 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
      >
        <Scene />
      </Canvas>

      {/*
        Cursor wake — above the environment (z-0/auto), explicitly below
        the UI/HUD layer (z-10 on TrajectoryOverlay/VesselGlow/HeroContent/
        DataPanel/HeroFooter) and the z-20 scroll-exit scrim. Previously
        this relied on GhostCursor's own default z-index (10) while the
        UI siblings had no z-index at all (auto) — an explicit z-index
        *always* wins over auto regardless of DOM order, so GhostCursor was
        actually stacking above the text/HUD, backwards from intended.
        TEMPORARY: brightness/bloomStrength/opacity are turned up to
        verify the effect actually renders at all before re-tuning it back
        down to something subtle.
      */}
      {!reducedMotion && !isTouch && (
        <GhostCursor
          color="#8FE8FF"
          brightness={1.1}
          edgeIntensity={0}
          trailLength={24}
          inertia={0.65}
          grainIntensity={0}
          bloomStrength={0.15}
          bloomRadius={1}
          bloomThreshold={0.1}
          fadeDelayMs={400}
          fadeDurationMs={700}
          zIndex={5}
          style={{ opacity: 1 }}
        />
      )}

      <TrajectoryOverlay />
      <VesselGlow />
      <HeroContent />
      <DataPanel />
      <HeroFooter />

      <div
        ref={exitOverlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 bg-abyss opacity-0"
      />
    </section>
  );
}
