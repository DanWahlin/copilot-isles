import type { WaveSampler } from '../contracts';

/**
 * Gerstner wave table: the single source for the ocean's shape (PLAN §6 Water system).
 * The GPU material builds its TSL nodes from WAVES, and the CPU samplers below read the same
 * table, so buoyancy, foam rings, splashes, and wading always match what's rendered.
 */
export interface Wave {
  /** Unit direction of travel (xz). */
  dx: number;
  dz: number;
  /** Wavenumber k = 2π/L. */
  k: number;
  /** Angular frequency from deep-water dispersion: ω = √(g k). */
  w: number;
  /** Amplitude (m). */
  a: number;
  /** Steepness Q (0-1); horizontal displacement is Q·a. */
  q: number;
  /** Phase offset (rad). */
  ph: number;
  /** Mean unresolved slope energy used by the ocean shader's specular AA. */
  slopeVariance: number;
}

const G = 9.81;

/** [dirX, dirZ, wavelength m, amplitude m, steepness, phase]. Longest first, so Low/Lite keep the first 3. */
const RAW: [number, number, number, number, number, number][] = [
  [0.92, -0.39, 42, 0.32, 0.55, 0.0],
  [0.62, -0.78, 23, 0.18, 0.5, 1.7],
  [0.99, 0.12, 13.5, 0.1, 0.45, 4.1],
  [-0.28, -0.96, 8.2, 0.055, 0.42, 2.3],
  [0.75, 0.66, 5.1, 0.03, 0.38, 5.2],
  [0.35, -0.94, 3.1, 0.016, 0.34, 0.9],
];

export const ALL_WAVES: readonly Wave[] = RAW.map(([dx, dz, L, a, q, ph]) => {
  const l = Math.hypot(dx, dz);
  const k = (2 * Math.PI) / L;
  return { dx: dx / l, dz: dz / l, k, w: Math.sqrt(G * k), a, q, ph, slopeVariance: 0.5 * (q * a) ** 2 };
});

/** Wave amplitude fades with distance from the camera (identically on the GPU) to avoid aliasing far away. */
export const FADE_DISTANCE = 240;

export function wavesForTier(count: number): readonly Wave[] {
  return ALL_WAVES.slice(0, Math.max(1, Math.min(ALL_WAVES.length, count)));
}

function fadeAt(x: number, z: number, focusX: number, focusZ: number): number {
  return Math.exp(-Math.hypot(x - focusX, z - focusZ) / FADE_DISTANCE);
}

/** Height of the surface point whose *undisplaced* position is (x0, z0). */
export function heightAtRest(waves: readonly Wave[], x0: number, z0: number, t: number, fade = 1): number {
  let y = 0;
  for (const W of waves) y += W.a * Math.sin(W.k * (W.dx * x0 + W.dz * z0) - W.w * t + W.ph);
  return y * fade;
}

/**
 * Exact surface height at a *world* point. Gerstner waves move points sideways, so we invert the
 * horizontal displacement with a short fixed-point iteration before sampling (PLAN §6).
 */
export function heightAt(waves: readonly Wave[], x: number, z: number, t: number, fade = 1): number {
  let px = x,
    pz = z;
  for (let it = 0; it < 3; it++) {
    let ox = 0,
      oz = 0;
    for (const W of waves) {
      const c = W.q * W.a * Math.cos(W.k * (W.dx * px + W.dz * pz) - W.w * t + W.ph);
      ox += c * W.dx;
      oz += c * W.dz;
    }
    px = x - ox * fade;
    pz = z - oz * fade;
  }
  return heightAtRest(waves, px, pz, t, fade);
}

/** Horizontal orbital velocity of the water surface at (x, z). */
function velocityAt(
  waves: readonly Wave[],
  x: number,
  z: number,
  t: number,
  out: Float32Array | number[],
  fade = 1,
): Float32Array | number[] {
  let vx = 0,
    vz = 0;
  for (const W of waves) {
    const s = W.q * W.a * W.w * Math.sin(W.k * (W.dx * x + W.dz * z) - W.w * t + W.ph) * fade;
    vx += s * W.dx;
    vz += s * W.dz;
  }
  out[0] = vx;
  out[1] = vz;
  return out;
}

/** A WaveSampler bound to a tier's wave set and a moving focus point (the camera). */
export class WaveField implements WaveSampler {
  focusX = 0;
  focusZ = 0;
  constructor(public waves: readonly Wave[] = ALL_WAVES) {}

  setFocus(x: number, z: number): void {
    this.focusX = x;
    this.focusZ = z;
  }

  heightAt(x: number, z: number, t: number): number {
    return heightAt(this.waves, x, z, t, fadeAt(x, z, this.focusX, this.focusZ));
  }

  velocityAt(x: number, z: number, t: number, out: Float32Array | number[]): Float32Array | number[] {
    return velocityAt(this.waves, x, z, t, out, fadeAt(x, z, this.focusX, this.focusZ));
  }
}
