import { Vector4 } from 'three/webgpu';
import { uniform } from 'three/tsl';

const TRAIL_SAMPLES = 10;
const MIN_SAMPLE_DISTANCE = 1.8;
const MAX_AGE = 18;

interface WakeSample {
  x: number;
  z: number;
  t: number;
  strength: number;
}

const samples: WakeSample[] = Array.from({ length: TRAIL_SAMPLES }, () => ({
  x: 0,
  z: 0,
  t: -999,
  strength: 0,
}));
let nextSample = 0;
let lastSampleX = Number.NaN;
let lastSampleZ = Number.NaN;

export const shipOcean = {
  /** x, z, heading, absolute forward speed. */
  pose: uniform(new Vector4(0, 0, 0, -1)),
  /** bow x, bow z, stern x, stern z. */
  bowStern: uniform(new Vector4(0, 0, 0, 0)),
  /** length, beam, draft, active flag. */
  dims: uniform(new Vector4(24, 6.6, 2.7, 0)),
  /** x, z, age seconds, strength. Newest samples are copied in ring order. */
  trail: Array.from({ length: TRAIL_SAMPLES }, () => uniform(new Vector4(0, 0, MAX_AGE + 1, 0))),
};

export function updateShipOceanInteraction(
  x: number,
  z: number,
  heading: number,
  forwardSpeed: number,
  bowX: number,
  bowZ: number,
  sternX: number,
  sternZ: number,
  t: number,
): void {
  const speed = Math.abs(forwardSpeed);
  shipOcean.pose.value.set(x, z, heading, speed);
  shipOcean.bowStern.value.set(bowX, bowZ, sternX, sternZ);
  shipOcean.dims.value.w = 1;

  const moved = Number.isFinite(lastSampleX)
    ? Math.hypot(sternX - lastSampleX, sternZ - lastSampleZ)
    : Infinity;
  if (speed > 0.35 && moved >= MIN_SAMPLE_DISTANCE) {
    samples[nextSample] = { x: sternX, z: sternZ, t, strength: Math.min(1, speed / 6.2) };
    nextSample = (nextSample + 1) % TRAIL_SAMPLES;
    lastSampleX = sternX;
    lastSampleZ = sternZ;
  }

  for (let i = 0; i < TRAIL_SAMPLES; i++) {
    const sample = samples[(nextSample - 1 - i + TRAIL_SAMPLES) % TRAIL_SAMPLES]!;
    const age = t - sample.t;
    const strength = age >= 0 && age < MAX_AGE ? sample.strength * (1 - age / MAX_AGE) : 0;
    shipOcean.trail[i]!.value.set(sample.x, sample.z, Math.max(0, age), strength);
  }
}
