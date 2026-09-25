import { clamp01, smoothstep } from '../../util/math';

export const BRIGANTINE_LENGTH = 24;
export const BRIGANTINE_BEAM = 6.6;
export const BRIGANTINE_DRAFT = 2.7;
const BRIGANTINE_FREEBOARD = 2.3;
export const BRIGANTINE_HALF_LENGTH = BRIGANTINE_LENGTH * 0.5;
const BRIGANTINE_HALF_BEAM = BRIGANTINE_BEAM * 0.5;

interface LocalPoint {
  /** Local +x side; at COVE.mooring this is the pier-facing/port rail. */
  x: number;
  /** Up-positive metres, sea level/waterline is 0 for the authored hull. */
  y: number;
  /** Bow-positive metres. */
  z: number;
}

export interface BuoyancyStation extends LocalPoint {
  id: number;
  naturalFrequency: number;
  dampingRatio: number;
}

export interface HullCapsule {
  z: number;
  radius: number;
}

function stationT(z: number): number {
  return clamp01((z + BRIGANTINE_HALF_LENGTH) / BRIGANTINE_LENGTH);
}

/**
 * Half-breadth curve for the brigantine's naval lines. The stern keeps a broad transom,
 * the bow pinches sharply into a raked stem, and the midship body stays full for carrying canvas.
 */
export function waterlineHalfBeamAt(z: number): number {
  const t = stationT(z);
  const sternTuck = smoothstep(0.02, 0.18, t);
  const bowTaper = 1 - smoothstep(0.82, 0.995, t);
  const fullness = Math.pow(Math.sin(Math.PI * clamp01(t * 0.92 + 0.05)), 0.42);
  const transom = 0.58 * (1 - smoothstep(0, 0.075, t));
  const run = Math.max(transom, fullness * sternTuck) * bowTaper;
  return BRIGANTINE_HALF_BEAM * Math.max(0.035, run);
}

/** Half breadth at a section height. Below the waterline it narrows to a fine keel; above it flares subtly. */
export function halfBeamAt(z: number, y: number): number {
  const wl = waterlineHalfBeamAt(z);
  if (y <= 0) {
    const t = clamp01((y + BRIGANTINE_DRAFT) / BRIGANTINE_DRAFT);
    return wl * Math.pow(Math.sin(t * Math.PI * 0.5), 0.62);
  }
  const sheer = sheerHeightAt(z);
  const t = clamp01(y / Math.max(0.001, sheer));
  const flare = 1 + 0.11 * smoothstep(0.15, 1, t);
  const tumblehome = 1 - 0.04 * smoothstep(0.72, 1, t);
  return wl * flare * tumblehome;
}

/** Deck sheer, including raised quarterdeck aft and forecastle forward. */
export function sheerHeightAt(z: number): number {
  const t = Math.abs(z) / BRIGANTINE_HALF_LENGTH;
  const endSheer = 0.42 * t * t;
  const quarterdeck = 0.92 * (1 - smoothstep(-7.0, -4.0, z));
  const forecastle = 0.55 * smoothstep(6.8, 9.8, z);
  const transomLift = 0.22 * (1 - smoothstep(-12, -10.7, z));
  return BRIGANTINE_FREEBOARD + endSheer + quarterdeck + forecastle + transomLift;
}

export function deckHeightAt(z: number): number {
  const quarterdeck = 0.78 * (1 - smoothstep(-7.3, -4.8, z));
  const forecastle = 0.38 * smoothstep(7.0, 9.8, z);
  return 1.82 + quarterdeck + forecastle + 0.16 * Math.pow(Math.abs(z) / BRIGANTINE_HALF_LENGTH, 1.6);
}

export function keelHeightAt(z: number): number {
  const t = stationT(z);
  const liftedEnds = 0.42 * (1 - Math.sin(Math.PI * t));
  const bowLift = 0.35 * smoothstep(0.83, 1, t);
  return -BRIGANTINE_DRAFT + liftedEnds + bowLift;
}

function makeHalfBeamTable(samples = 32): Float32Array {
  const n = Math.max(4, Math.floor(samples));
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = -BRIGANTINE_HALF_LENGTH + (BRIGANTINE_LENGTH * i) / (n - 1);
    data[i] = waterlineHalfBeamAt(z);
  }
  return data;
}

function station(id: number, side: -1 | 1, z: number, frequency: number, damping: number): BuoyancyStation {
  return {
    id,
    x: side * halfBeamAt(z, -0.65) * 0.62,
    y: -0.55,
    z,
    naturalFrequency: frequency,
    dampingRatio: damping,
  };
}

export const BRIGANTINE_STATIONS: readonly BuoyancyStation[] = [
  station(0, -1, -7.5, 0.58, 0.58),
  station(1, 1, -7.5, 0.62, 0.58),
  station(2, -1, -2.5, 0.68, 0.64),
  station(3, 1, -2.5, 0.7, 0.64),
  station(4, -1, 2.8, 0.76, 0.62),
  station(5, 1, 2.8, 0.72, 0.62),
  station(6, -1, 7.8, 0.82, 0.68),
  station(7, 1, 7.8, 0.78, 0.68),
];

export const BRIGANTINE_CAPSULES: readonly HullCapsule[] = Array.from({ length: 10 }, (_, i) => {
  const z = -10.8 + (21.6 * i) / 9;
  return { z, radius: waterlineHalfBeamAt(z) * 0.9 + 0.22 };
});

export const BRIGANTINE_HALF_BEAM_TABLE = makeHalfBeamTable(32);
