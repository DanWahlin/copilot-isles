import { Vector4 } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { seaState } from './sea-state';

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
let lastPitch = Number.NaN;
let lastSprayT = Number.NaN;
let slam = 0;

export const shipOcean = {
  /** x, z, heading, absolute forward speed. */
  pose: uniform(new Vector4(0, 0, 0, -1)),
  /** bow x, bow z, stern x, stern z. */
  bowStern: uniform(new Vector4(0, 0, 0, 0)),
  /** length, beam, draft, active flag. */
  dims: uniform(new Vector4(24, 6.6, 2.7, 0)),
  /** Bow spray, 0-1: her bow slamming into a sea × the sea state's spray (0 in a Breeze). */
  spray: uniform(0),
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
  pitch = 0,
): void {
  const speed = Math.abs(forwardSpeed);
  // A slam: the bow dropping into a sea (pitch rising, bow down) with way on. It flares, then fades.
  const dt = Number.isFinite(lastSprayT) ? t - lastSprayT : 0;
  if (dt > 0 && dt < 0.25) {
    const drop = (pitch - lastPitch) / dt;
    const hit = Math.min(1, Math.max(0, (drop - 0.03) * 9)) * Math.min(1, speed / 4.5);
    slam = Math.max(hit, slam * Math.exp(-2.4 * dt));
  } else if (dt !== 0) slam = 0;
  lastPitch = pitch;
  lastSprayT = t;
  shipOcean.spray.value = slam * seaState.live.spray;
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
