"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Real dimensions of hero-reference.png.
const IMAGE_ASPECT = 1672 / 941;

// Plane UV convention here: y=0 at the bottom of the screen, y=1 at the top
// (standard PlaneGeometry UVs). The ocean/horizon sits at ~55% of the
// screen measured from the TOP, which is UV.y = 1 - 0.55 = 0.45.
const OCEAN_START = 0.45;
// Iceberg's on-screen center (measured from TrajectoryOverlay's own
// coordinates: ~62% across, ~60% down from top -> UV.y = 1 - 0.60 = 0.40).
const ICEBERG_CENTER = new THREE.Vector2(0.62, 0.4);

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uImageAspect;
  uniform float uScreenAspect;
  uniform float uTime;
  uniform float uLightningFlash;
  uniform float uOceanStart;
  uniform vec2 uIcebergCenter;
  varying vec2 vUv;

  // Reproduces CSS object-fit: cover's UV mapping so this texture aligns
  // with the DOM <Image> beneath it at any viewport aspect.
  vec2 coverUv(vec2 uv) {
    vec2 ratio = vec2(
      min(uScreenAspect / uImageAspect, 1.0),
      min(uImageAspect / uScreenAspect, 1.0)
    );
    return (uv - 0.5) * ratio + 0.5;
  }

  void main() {
    vec2 screenUv = vUv;
    // A near-hard edge at the horizon: the ocean mask reaches exactly 0 by
    // uOceanStart + 0.006, so no wave distortion can ever reach the
    // horizon/mountains/iceberg — they stay completely static.
    float oceanMask = 1.0 - smoothstep(uOceanStart - 0.004, uOceanStart + 0.006, screenUv.y);

    vec2 baseUv = coverUv(screenUv);

    // Ocean wave distortion — resamples the SAME photo at shifted
    // coordinates, so the original water detail is preserved, just
    // displaced, rather than replaced with a synthetic texture. Masked
    // strictly to the ocean band only.
    vec2 waveUv = baseUv;
    float wave = sin(baseUv.x * 40.0 + uTime * 1.5) * 0.004
               + sin(baseUv.x * 17.0 - uTime * 0.9) * 0.003;
    waveUv.y += wave * oceanMask;
    waveUv.x += cos(baseUv.y * 30.0 + uTime * 1.1) * 0.002 * oceanMask;

    vec4 color = texture2D(uTexture, waveUv);

    // Restrained, natural reflection column beneath the iceberg.
    float reflectionBand = 1.0 - smoothstep(0.0, 0.06, abs(screenUv.x - uIcebergCenter.x));
    float reflectionShimmer = reflectionBand * oceanMask * (0.5 + 0.5 * sin(baseUv.y * 50.0 - uTime * 2.5));
    color.rgb += vec3(0.4, 0.75, 0.85) * reflectionShimmer * 0.12;

    // Iceberg shimmer — lighting only, no geometric displacement, so the
    // iceberg's silhouette never shakes, wobbles or deforms.
    float icebergDist = distance(screenUv, uIcebergCenter);
    float icebergGlow = (1.0 - smoothstep(0.0, 0.22, icebergDist)) * (0.5 + 0.5 * sin(uTime * 0.6));
    color.rgb += vec3(0.55, 0.85, 0.95) * icebergGlow * 0.045;

    // Storm sky — very subtle brightness movement, never blurred.
    float skyPulse = (1.0 - oceanMask) * (0.5 + 0.5 * sin(uTime * 0.15));
    color.rgb += vec3(0.85, 0.9, 1.0) * skyPulse * 0.02;

    // Lightning — brief, dramatic, illuminates the whole frame, with an
    // extra reflected boost across the ocean surface specifically.
    color.rgb += vec3(0.8, 0.87, 1.0) * uLightningFlash;
    color.rgb += vec3(0.5, 0.75, 0.85) * uLightningFlash * oceanMask * 0.6;

    // Overall atmosphere: a multiplicative (not additive) darken + cool
    // shift toward deeper navy/black storm tones. Multiplying preserves
    // detail/contrast — an additive haze or flat overlay would wash it out.
    color.rgb *= vec3(0.87, 0.91, 1.0) * 0.9;

    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

export default function EnvironmentShader() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const texture = useTexture("/images/hero-reference.png");
  const { viewport, size } = useThree();
  const reducedMotion = useReducedMotion();
  const timeRef = useRef(0);
  // Randomized first-flash delay is set in the effect below, not here —
  // Math.random() during render is impure and can produce unstable output.
  const lightningRef = useRef({ next: 5, value: 0 });

  useEffect(() => {
    lightningRef.current.next = 5 + Math.random() * 8;
  }, []);

  useEffect(() => {
    // A THREE.Texture is a mutable graphics resource, not React state —
    // setting colorSpace after load is the standard three.js/R3F pattern.
    // eslint-disable-next-line react-hooks/immutability
    texture.colorSpace = THREE.SRGBColorSpace;
  }, [texture]);

  // uScreenAspect is intentionally read once for the initial value; it's
  // kept in sync on resize via the effect below rather than by rebuilding
  // (and resetting the animation state of) the whole uniforms object.
  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uImageAspect: { value: IMAGE_ASPECT },
      uScreenAspect: { value: size.width / size.height },
      uTime: { value: 0 },
      uLightningFlash: { value: 0 },
      uOceanStart: { value: OCEAN_START },
      uIcebergCenter: { value: ICEBERG_CENTER },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture],
  );

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uScreenAspect.value = size.width / size.height;
    }
  }, [size]);

  useFrame((_state, delta) => {
    const material = materialRef.current;
    if (!material) return;

    if (!reducedMotion) {
      timeRef.current += delta;
    }
    material.uniforms.uTime.value = timeRef.current;

    // Occasional, brief, dramatic lightning flash — the main atmospheric
    // animation, separate from the continuous ocean/iceberg motion.
    const lightning = lightningRef.current;
    if (!reducedMotion) {
      lightning.next -= delta;
      if (lightning.next <= 0 && lightning.value <= 0) {
        lightning.value = 1;
        lightning.next = 8 + Math.random() * 12;
      }
      if (lightning.value > 0) {
        lightning.value = Math.max(0, lightning.value - delta * 3.5);
      }
    }
    material.uniforms.uLightningFlash.value = lightning.value * 0.4;
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}
