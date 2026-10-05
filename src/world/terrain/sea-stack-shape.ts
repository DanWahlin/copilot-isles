import { COVE } from '../layout';
import { clamp01, smoothstep } from '../../util/math';

/**
 * The sea stack off Anchorage Cay: a tropical limestone karst pillar (think Ko Tapu in Phang Nga Bay).
 * It's narrow at the waterline, where the waves have cut a deep notch, then it widens upward under an
 * overhanging visor, leans a little, and ends in a rounded, jungle-capped dome.
 *
 * This file is the single source of truth for its shape. The mesh (sea-stack.ts), the submerged plinth
 * in the height field (cove-height.ts), the hugging foam ribbon (coast-foam.ts), the ship's obstacle,
 * and the plants on its top and ledges all read these functions. It's plain math (no three.js), so the
 * terrain bake can use it too.
 */

const S = COVE.seaStack;
const TAU = Math.PI * 2;

/** Lowest point of the mesh (well under the water, so the waves never show its foot). */
export const SEA_STACK_BASE_Y = -9;
/** How far the rounded dome rises above the rim. */
export const SEA_STACK_CAP_RISE = 3.4;
/** Plinth height inside the waterline notch (just above the sea, so the chart still sees an islet). */
export const SEA_STACK_PLINTH_TOP = 0.8;

const LEAN_LEN = Math.hypot(-0.39, 0.92);
/** The pillar leans toward +z (south) and a little west, so the lean reads from the beach and the sea. */
const LEAN = { x: -0.39 / LEAN_LEN, z: 0.92 / LEAN_LEN, metres: 3.4 };

/** Side shoulders: buttresses that stop in a flat, planted ledge at `top`. */
export const SEA_STACK_SHOULDERS = [
  { a: 2.55, w: 0.45, top: 16.5, out: 0.42 },
  { a: -0.75, w: 0.38, top: 26.5, out: 0.36 },
  { a: 4.35, w: 0.34, top: 11.2, out: 0.3 },
  { a: 1.2, w: 0.3, top: 33.5, out: 0.22 },
] as const;

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth 3D value noise in [-1, 1]. */
function valueNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);
  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return (y0 + (y1 - y0) * fz) * 2 - 1;
}

/** Noise on the pillar's cylinder (seamless around it): angle `a`, height `y`. */
function cylinderNoise(a: number, y: number, ring: number, vertical: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise3(c * ring * f + 17.3 * o, s * ring * f - 4.1 * o, y * vertical * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Writes the pillar's axis (xz) at height `y` into `out`: it leans as it rises. */
export function seaStackCenterAt(y: number, out: { x: number; z: number }): { x: number; z: number } {
  const t = clamp01((y + 2) / (S.height + 2));
  const k = LEAN.metres * Math.pow(t, 1.6);
  out.x = S.x + LEAN.x * k;
  out.z = S.z + LEAN.z * k;
  return out;
}

/** Mean radius as a fraction of `COVE.seaStack.radius`: the notch, the visor and the body. */
export function seaStackProfile(y: number, notchTop = 2.6): number {
  const visorLip = Math.exp(-(((y - notchTop - 0.5) / 0.75) ** 2));
  return (
    0.5 +
    0.17 * smoothstep(-1.4, -7, y) +
    0.3 * smoothstep(notchTop, notchTop + 6.5, y) +
    0.13 * smoothstep(8, 20, y) +
    0.06 * smoothstep(20, 34, y) +
    0.035 * visorLip
  );
}

/** 0..1 depth of the vertical solution flutes (rillenkarst) at angle `a`, height `y`. */
export function seaStackGroove(a: number, y: number): number {
  const wobble = 0.35 * Math.sin(2 * a + y * 0.045) + 0.18 * Math.sin(5 * a - y * 0.03);
  const g1 = 1 - smoothstep(0, 0.42, Math.abs(Math.sin(6.5 * a + wobble)));
  const g2 = 1 - smoothstep(0, 0.3, Math.abs(Math.sin(10.5 * a - wobble * 1.4 + 0.8)));
  const strength = 0.6 + 0.4 * Math.sin(3 * a + 0.9);
  const zone = smoothstep(3.5, 8, y) * (1 - smoothstep(S.height - 4, S.height + 1, y));
  return clamp01((g1 * 0.75 + g2 * 0.45) * strength * zone);
}

function shoulderAt(a: number, y: number): number {
  let sum = 0;
  for (const sh of SEA_STACK_SHOULDERS) {
    const d = angleDiff(a, sh.a) / sh.w;
    sum +=
      sh.out *
      Math.exp(-d * d) *
      smoothstep(sh.top - 14, sh.top - 6, y) *
      (1 - smoothstep(sh.top - 0.6, sh.top + 0.1, y));
  }
  return sum;
}

/** Mean bedding thickness (m) and the number of vertical joints around the pillar. */
const BED_HEIGHT = 4.3;
const JOINTS = 15;

/**
 * Jointed blocks: limestone breaks along bedding planes and vertical joints, so the face is a stack of
 * blocks, each set a little in or out and tilted a little. That gives flat faces, sharp steps and lips
 * that catch the light, which is what makes it read as rock rather than a smooth casting. Returns a
 * fraction of the local radius. The joints are staggered bed to bed, like natural rock (not masonry).
 */
export function seaStackBlocks(a: number, y: number): number {
  const zone = smoothstep(3.2, 7.5, y) * (1 - smoothstep(S.height + 2, S.height + 5, y));
  if (zone <= 0) return 0;
  const bedF = (y + 0.9 * Math.sin(2 * a + 1) + 0.5 * Math.sin(5 * a + 0.3)) / BED_HEIGHT;
  const bed = Math.floor(bedF);
  const fy = bedF - bed;
  const jointF = (a / TAU) * JOINTS + hash3(bed, 3, 11) + 0.12 * Math.sin(y * 0.4 + bed);
  const joint = Math.floor(jointF);
  const fx = jointF - joint;
  const cell = ((joint % JOINTS) + JOINTS) % JOINTS;
  const inset = (hash3(bed, cell, 7) - 0.5) * 0.13;
  const tiltUp = (hash3(bed, cell, 19) - 0.5) * 0.08 * (fy - 0.5) * 2;
  const tiltSide = (hash3(bed, cell, 31) - 0.5) * 0.07 * (fx - 0.5) * 2;
  // Some blocks have fallen out, leaving a deeper recess.
  const missing = hash3(bed, cell, 43) > 0.9 ? -0.06 : 0;
  return (inset + tiltUp + tiltSide + missing) * zone;
}

/** Distance (m) from the axis to the rock surface at height `y`, angle `a`. */
export function seaStackRadius(y: number, a: number): number {
  const t = y / S.height;
  const lobes =
    1 +
    0.15 * Math.sin(2 * a + 0.6 + 0.5 * t) +
    0.08 * Math.sin(3 * a + 2.1 - 0.8 * t) +
    0.045 * Math.sin(5 * a + 0.7 + 1.6 * t);
  const broad = cylinderNoise(a, y, 1.6, 0.07, 3) * 0.12;
  const crag = cylinderNoise(a - 2.1, y, 2.9, 0.16, 2) * 0.09 * smoothstep(-2, 4, y);
  const fine = cylinderNoise(a + 1.3, y, 5.2, 0.36, 2) * 0.03;
  // Buttress ribs: a few broad vertical ribs whose strength wanders with height.
  const ribs = Math.sin(5 * a + 0.9 + cylinderNoise(a, y, 1.1, 0.05, 1) * 2.2) * 0.018;
  const blocks = seaStackBlocks(a, y);
  // Bedding: the rock steps in a little at each bed going up, a lip that varies around the pillar.
  const bedPhase = (y + 1.1 * Math.sin(2 * a + 1) + 0.6 * Math.sin(5 * a)) / 6.3;
  const lipStrength = 0.5 + 0.5 * cylinderNoise(a, y * 0.2, 1.8, 0.1, 1);
  const bed =
    smoothstep(0, 0.14, bedPhase - Math.floor(bedPhase)) * 0.055 * lipStrength * smoothstep(5, 9, y);
  const groove = seaStackGroove(a, y) * 0.055;
  // The visor over the notch rises and falls around the pillar, so the undercut isn't a neat collar.
  const notchTop = 2.6 + 1.3 * Math.sin(3 * a + 0.4) + 0.8 * Math.sin(5 * a + 2.2);
  const body = seaStackProfile(y, notchTop) * lobes + shoulderAt(a, y);
  return S.radius * body * (1 + broad + crag + fine + ribs + bed + blocks - groove);
}

/** Height of the rim (where the side turns into the dome) at angle `a`. */
export function seaStackRimHeight(a: number): number {
  return S.height + 1.6 * Math.sin(2 * a + 1.1) + 0.9 * Math.sin(3 * a - 0.4) + 0.35 * Math.sin(7 * a);
}

const centre = { x: 0, z: 0 };

/**
 * The top of the rock at world (x, z) if it's on the dome, or `null` past the rim. Plants sit on this,
 * and the mesh's dome rings use the same curve.
 */
export function seaStackDomeHeight(x: number, z: number): number | null {
  seaStackCenterAt(S.height, centre);
  const dx = x - centre.x;
  const dz = z - centre.z;
  const a = Math.atan2(dz, dx);
  const rim = seaStackRimHeight(a);
  const s = Math.hypot(dx, dz) / seaStackRadius(rim, a);
  if (s >= 1) return null;
  return rim + SEA_STACK_CAP_RISE * Math.sqrt(1 - s * s);
}

const WATERLINE_SAMPLES = 256;
let waterlineTable: Float32Array | null = null;

/** Radius of the rock at the sea surface (y = 0) by angle, from a cached table. */
export function seaStackWaterlineRadius(a: number): number {
  if (!waterlineTable) {
    waterlineTable = new Float32Array(WATERLINE_SAMPLES + 1);
    for (let i = 0; i <= WATERLINE_SAMPLES; i++) {
      waterlineTable[i] = seaStackRadius(0, (i / WATERLINE_SAMPLES) * TAU);
    }
  }
  const u = ((((a % TAU) + TAU) % TAU) / TAU) * WATERLINE_SAMPLES;
  const i = Math.floor(u);
  const f = u - i;
  return waterlineTable[i]! + (waterlineTable[i + 1]! - waterlineTable[i]!) * f;
}

/**
 * Seabed under and around the stack: a plinth hidden inside the notch (top just above the sea), then a
 * rubble talus that drops quickly to deep water, so there's no shallow turquoise disc around it.
 */
export function seaStackSeabed(x: number, z: number, current: number): number {
  const dx = x - S.x;
  const dz = z - S.z;
  const d = Math.hypot(dx, dz);
  if (d > S.radius * 1.9) return current;
  const a = Math.atan2(dz, dx);
  const wl = seaStackWaterlineRadius(a);
  const rubble = cylinderNoise(a, d * 0.4, 3.1, 0.2, 2);
  const talus =
    SEA_STACK_PLINTH_TOP -
    smoothstep(wl - 1.8, wl - 0.4, d) * (SEA_STACK_PLINTH_TOP + 4.5) -
    smoothstep(wl - 0.4, wl + 6 + rubble * 2, d) * 9 +
    rubble * 0.8 * smoothstep(wl, wl + 3, d);
  const blend = 1 - smoothstep(wl + 6, S.radius * 1.9, d);
  return Math.max(current, current + (talus - current) * blend);
}

/**
 * Ship obstacle: one circle that clears the widest rock the hull or rig can reach (the visor and the
 * body up to mast height), so the brigantine can't sail under the overhang.
 */
export function seaStackShipObstacle(): { x: number; z: number; r: number } {
  let r = 0;
  const c = { x: 0, z: 0 };
  for (let y = 0; y <= 24; y += 1.5) {
    seaStackCenterAt(y, c);
    const off = Math.hypot(c.x - S.x, c.z - S.z);
    for (let i = 0; i < 64; i++) r = Math.max(r, seaStackRadius(y, (i / 64) * TAU) + off);
  }
  return { x: S.x, z: S.z, r: r + 0.5 };
}

export type SeaStackPlantSpecies = 'palmTall' | 'palmCluster' | 'palmYoung' | 'broadleafTree' | 'fern';

export interface SeaStackPlantSpot {
  species: SeaStackPlantSpecies;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  /** Outward lean (shear), so palms and rim shrubs hang out over the edge. */
  leanX: number;
  leanZ: number;
  seed: number;
}

function rand(seed: number): number {
  const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Plants for the jungle-capped dome and the shoulder ledges (deterministic). */
export function seaStackPlantSpots(): SeaStackPlantSpot[] {
  const out: SeaStackPlantSpot[] = [];
  const top = seaStackCenterAt(S.height, { x: 0, z: 0 });
  const onDome = (
    species: SeaStackPlantSpecies,
    a: number,
    s: number,
    scale: number,
    lean: number,
    seed: number,
  ) => {
    const rim = seaStackRimHeight(a);
    const rr = seaStackRadius(rim, a) * s;
    const x = top.x + Math.cos(a) * rr;
    const z = top.z + Math.sin(a) * rr;
    const y = seaStackDomeHeight(x, z);
    if (y === null) return;
    out.push({
      species,
      x,
      y: y - 0.3,
      z,
      scale,
      rotation: rand(seed) * TAU,
      leanX: Math.cos(a) * lean,
      leanZ: Math.sin(a) * lean,
      seed: rand(seed + 7),
    });
  };

  const domeTrees: ReadonlyArray<[SeaStackPlantSpecies, number, number, number, number]> = [
    ['broadleafTree', 0.4, 0.12, 1.0, 0.03],
    ['broadleafTree', 2.2, 0.42, 0.92, 0.07],
    ['broadleafTree', 3.6, 0.38, 0.86, 0.06],
    ['broadleafTree', 5.0, 0.45, 0.94, 0.07],
    ['broadleafTree', 1.1, 0.6, 0.78, 0.1],
    ['broadleafTree', 2.9, 0.66, 0.72, 0.12],
    ['broadleafTree', 4.4, 0.7, 0.7, 0.12],
    ['broadleafTree', 5.9, 0.68, 0.74, 0.12],
    ['palmTall', 1.6, 0.74, 0.9, 0.26],
    ['palmTall', 4.0, 0.78, 0.84, 0.28],
    ['palmCluster', 5.5, 0.62, 0.74, 0.14],
    ['palmYoung', 0.6, 0.82, 0.64, 0.2],
    ['palmYoung', 3.2, 0.8, 0.6, 0.18],
  ];
  domeTrees.forEach(([species, a, s, scale, lean], i) => onDome(species, a, s, scale, lean, 11 + i * 13));

  // Bush-sized trees and ferns crowd the rim and hang over it, so the silhouette reads as jungle from every side.
  const rimPlants = 20;
  for (let i = 0; i < rimPlants; i++) {
    const seed = 400 + i * 17;
    const a = (i / rimPlants) * TAU + (rand(seed) - 0.5) * 0.3;
    const species: SeaStackPlantSpecies = i % 2 === 0 ? 'broadleafTree' : 'fern';
    const scale = species === 'broadleafTree' ? 0.4 + rand(seed + 2) * 0.18 : 1.3 + rand(seed + 2) * 0.4;
    onDome(species, a, 0.84 + rand(seed + 1) * 0.12, scale, 0.18, seed);
  }
  for (let i = 0; i < 6; i++) {
    const seed = 900 + i * 29;
    onDome('fern', rand(seed) * TAU, 0.3 + rand(seed + 1) * 0.45, 1 + rand(seed + 2) * 0.4, 0.03, seed);
  }

  // The shoulder ledges: ferns, and a young palm on the biggest one.
  SEA_STACK_SHOULDERS.forEach((sh, k) => {
    const c = seaStackCenterAt(sh.top, { x: 0, z: 0 });
    const count = k === 0 ? 7 : k === 1 ? 6 : k === 2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const seed = 1200 + k * 101 + i * 7;
      const a = sh.a + ((i + 0.5) / count - 0.5) * sh.w * 1.7 + (rand(seed + 5) - 0.5) * 0.06;
      const inner = seaStackRadius(sh.top + 0.8, a);
      const lip = seaStackRadius(sh.top - 0.6, a);
      if (lip - inner < 1.2) continue;
      const r = inner + (lip - inner) * (0.3 + rand(seed) * 0.3);
      const species: SeaStackPlantSpecies = k === 0 && i === 3 ? 'palmYoung' : 'fern';
      out.push({
        species,
        x: c.x + Math.cos(a) * r,
        y: sh.top - 0.35,
        z: c.z + Math.sin(a) * r,
        scale: species === 'palmYoung' ? 0.55 : 1.0 + rand(seed + 1) * 0.5,
        rotation: rand(seed + 2) * TAU,
        leanX: Math.cos(a) * (species === 'palmYoung' ? 0.22 : 0.1),
        leanZ: Math.sin(a) * (species === 'palmYoung' ? 0.22 : 0.1),
        seed: rand(seed + 3),
      });
    }
  });
  return out;
}
