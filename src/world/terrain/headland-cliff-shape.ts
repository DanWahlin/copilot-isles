import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { clamp01, smoothstep } from '../../util/math';
import { extractShoreline } from './bake';
import { fbm2, headlandCliffEdge } from './cove-height';

/**
 * The east headland's sea cliff: one fluted limestone face in the same rock language as the sea stack
 * (sea-stack-shape.ts). The height field (headlandHeight in cove-height.ts) owns where the cliff is: it
 * drops from the clifftop to the sea in a few metres. This file follows that face and adds what a height
 * field can't hold: vertical flutes and jointed blocks, bedding ledges, the wave-cut notch with its visor,
 * and a buttress with the sea cave at its foot.
 *
 * It's plain math (no three.js). The cliff mesh (headland-cliff.ts), the plants on its lip and ledges,
 * and the ship's obstacle at the cave buttress all read the same frame, so they always agree.
 */

/** Bottom of the cliff mesh (under the sea, so the waves never show its foot). */
export const HEADLAND_CLIFF_BASE_Y = -6;
/** Mean gap (m) between the rock face and the height field's own steep face behind it. */
const FACE_OFFSET = 1.8;
/** Never closer than this to the height field (so its coarse faces never poke through). */
const MIN_OFFSET = 0.9;
/** How far the cave buttress stands out from the cliff line. */
export const HEADLAND_CAVE_BULGE = 5.5;
const BULGE_HALF_WIDTH = 13;
/** Mean bedding thickness (m) and the joint spacing along the face. */
const BED_HEIGHT = 5;
const JOINT_SPACING = 5.5;

/** How far past the last real cliff the rock carries on, sinking into the slope as outcrops. */
const END_RUN = 34;
/** Over this many metres inside each end, the cliff sinks back into the slope. */
const END_FADE = 6;

/** Where the cliff is traced (and where the terrain's coarse LODs recess their steep faces behind it). */
export const HEADLAND_CLIFF_AREA = { minX: 72, maxX: 240, minZ: -125, maxZ: 110 } as const;
const AREA = HEADLAND_CLIFF_AREA;
/** The cliff line is followed at this height, then smoothed. */
const CONTOUR_Y = 4;
/** Profile across the face along the station normal: from +PROFILE_OUT (sea) to -PROFILE_IN (inland). */
const PROFILE_OUT = 24;
const PROFILE_IN = 40;
const PROFILE_STEP = 0.5;
export const PROFILE_SAMPLES = Math.round((PROFILE_OUT + PROFILE_IN) / PROFILE_STEP) + 1;

export interface CliffStation {
  /** Baseline point and its outward (seaward) unit normal in the xz plane. */
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Distance along the cliff (m). */
  s: number;
  /** Clifftop edge: its height and its distance along the normal (m, + = seaward of the baseline). */
  lipY: number;
  lipD: number;
  /** 0 where there's no cliff (the mesh hides inside the slope), 1 on a full sea cliff. */
  strength: number;
}

export interface HeadlandCliffFrame {
  /** Stations every metre along the cliff, smoothed. */
  stations: CliffStation[];
  length: number;
  /** Distance along the cliff of the sea cave (the middle of its buttress), or -1 if there's none. */
  caveS: number;
  /** Where the real cliff starts and ends along the frame (past them it sinks into the slope). */
  cliffStart: number;
  cliffEnd: number;
  heightAt(x: number, z: number): number;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Heights along a station's normal, seaward first: sample `i` is at d = PROFILE_OUT - i * PROFILE_STEP. */
export function stationProfile(
  heightAt: (x: number, z: number) => number,
  st: { x: number; z: number; nx: number; nz: number },
  out: Float32Array = new Float32Array(PROFILE_SAMPLES),
): Float32Array {
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const d = PROFILE_OUT - i * PROFILE_STEP;
    out[i] = heightAt(st.x + st.nx * d, st.z + st.nz * d);
  }
  return out;
}

/** Where the face reaches height `y` (outermost crossing), as a distance along the normal. */
export function profileCrossing(profile: Float32Array, y: number): number {
  if (profile[0]! >= y) return PROFILE_OUT;
  for (let i = 1; i < PROFILE_SAMPLES; i++) {
    const h = profile[i]!;
    if (h >= y) {
      const h0 = profile[i - 1]!;
      const t = h === h0 ? 0 : (y - h0) / (h - h0);
      return PROFILE_OUT - (i - 1 + t) * PROFILE_STEP;
    }
  }
  return -PROFILE_IN;
}

/** Lip, toe and steepness of one profile. */
function readProfile(profile: Float32Array): { lipY: number; lipD: number; strength: number; slope: number } {
  let toe = PROFILE_SAMPLES - 1;
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    if (profile[i]! >= 0) {
      toe = i;
      break;
    }
  }
  const window = Math.round(16 / PROFILE_STEP);
  let maxSlope = 0;
  for (let i = toe; i < Math.min(PROFILE_SAMPLES - 2, toe + window); i++) {
    maxSlope = Math.max(maxSlope, (profile[i + 2]! - profile[i]!) / (2 * PROFILE_STEP));
  }
  const run = Math.round(2 / PROFILE_STEP);
  let lip = PROFILE_SAMPLES - 1;
  for (let i = toe + 1; i < PROFILE_SAMPLES - run; i++) {
    const slope = (profile[i + run]! - profile[i]!) / (run * PROFILE_STEP);
    if (slope < 1.4 && profile[i]! > 2) {
      lip = i;
      break;
    }
  }
  const lipY = profile[lip]!;
  const strength = smoothstep(1.0, 2.2, maxSlope) * smoothstep(3, 7, lipY);
  // A softer measure for where the cliff gives way to a steep slope (the rock carries on as outcrops).
  const slope = smoothstep(0.45, 1.3, maxSlope) * smoothstep(4, 9, lipY);
  return { lipY, lipD: PROFILE_OUT - lip * PROFILE_STEP, strength, slope };
}

function boxSmooth(values: Float64Array, radius: number, passes: number): void {
  const n = values.length;
  const tmp = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        sum += values[j]!;
        count++;
      }
      tmp[i] = sum / count;
    }
    values.set(tmp);
  }
}

/** The cliff line: the CONTOUR_Y contour round the headland, resampled every metre and smoothed. */
function cliffBaseline(
  heightAt: (x: number, z: number) => number,
): { x: Float64Array; z: Float64Array; tx: Float64Array; tz: Float64Array } | null {
  const nx = AREA.maxX - AREA.minX + 1;
  const nz = AREA.maxZ - AREA.minZ + 1;
  const grid = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) grid[iz * nx + ix] = heightAt(AREA.minX + ix, AREA.minZ + iz) - CONTOUR_Y;
  }
  let best: { x: number; z: number }[] | null = null;
  let bestScore = 0;
  for (const chain of extractShoreline(grid, nx, nz, AREA.minX, AREA.minZ, 1)) {
    const east = chain.points.filter((p) => p.x > COVE.headland.x1 - 40).length;
    if (east > bestScore) {
      bestScore = east;
      best = chain.points;
    }
  }
  if (!best || best.length < 8) return null;
  const xs: number[] = [best[0]!.x];
  const zs: number[] = [best[0]!.z];
  let carry = 0;
  for (let i = 1; i < best.length; i++) {
    const a = best[i - 1]!;
    const b = best[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let t = 1 - carry;
    while (t <= len) {
      xs.push(a.x + ((b.x - a.x) * t) / len);
      zs.push(a.z + ((b.z - a.z) * t) / len);
      t += 1;
    }
    carry = len - (t - 1);
  }
  const x = Float64Array.from(xs);
  const z = Float64Array.from(zs);
  boxSmooth(x, 5, 3);
  boxSmooth(z, 5, 3);
  // Normals come from a smoother copy, so the stations fan out evenly past the buttresses and flutes.
  const tx = Float64Array.from(x);
  const tz = Float64Array.from(z);
  boxSmooth(tx, 9, 3);
  boxSmooth(tz, 9, 3);
  return { x, z, tx, tz };
}

const frames = new WeakMap<object, HeadlandCliffFrame>();

/**
 * Builds (once per height field) the stations along the headland's sea cliff: the smoothed cliff line,
 * its outward normals, and where each profile's clifftop edge is.
 */
export function headlandCliffFrame(heightField: Pick<HeightField, 'heightAt'>): HeadlandCliffFrame {
  const cached = frames.get(heightField);
  if (cached) return cached;
  const heightAt = (x: number, z: number) => heightField.heightAt(x, z);
  const base = cliffBaseline(heightAt);
  const frame: HeadlandCliffFrame = {
    stations: [],
    length: 0,
    caveS: -1,
    cliffStart: 0,
    cliffEnd: 0,
    heightAt,
  };
  frames.set(heightField, frame);
  if (!base) return frame;
  const n = base.x.length;

  // Outward normals: pick the side of the line where the ground is lower, once for the whole line.
  const nxs = new Float64Array(n);
  const nzs = new Float64Array(n);
  let vote = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(n - 1, i + 2);
    const tx = base.tx[b]! - base.tx[a]!;
    const tz = base.tz[b]! - base.tz[a]!;
    const len = Math.hypot(tx, tz) || 1;
    nxs[i] = tz / len;
    nzs[i] = -tx / len;
    if (i % 7 === 0) {
      const sea = heightAt(base.x[i]! + nxs[i]! * 8, base.z[i]! + nzs[i]! * 8);
      const land = heightAt(base.x[i]! - nxs[i]! * 8, base.z[i]! - nzs[i]! * 8);
      vote += sea < land ? 1 : -1;
    }
  }
  const flip = vote < 0 ? -1 : 1;

  const profile = new Float32Array(PROFILE_SAMPLES);
  const raw: CliffStation[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    const st = { x: base.x[i]!, z: base.z[i]!, nx: nxs[i]! * flip, nz: nzs[i]! * flip };
    const read = readProfile(stationProfile(heightAt, st, profile));
    raw.push({ ...st, s: 0, lipY: read.lipY, lipD: read.lipD, strength: read.strength });
    slopes.push(read.slope);
  }

  // Keep everything from the first real cliff to the last (short gaps sink into the slope), with a few
  // metres either side.
  let bestStart = -1;
  let bestEnd = -1;
  for (let i = 0; i < n; i++) {
    if (raw[i]!.strength <= 0.05) continue;
    if (bestStart < 0) bestStart = i;
    bestEnd = i;
  }
  if (bestStart < 0) return frame;
  const start = Math.max(0, bestStart - END_RUN);
  const end = Math.min(n - 1, bestEnd + END_RUN);
  const count = end - start + 1;
  const lipY = new Float64Array(count);
  const lipD = new Float64Array(count);
  const strength = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const r = raw[start + i]!;
    lipY[i] = r.lipY;
    lipD[i] = r.lipD;
    // Past the last real cliff the rock sinks into the slope over END_RUN metres, so it ends as a few
    // outcrops, not a cut edge.
    const k = start + i;
    const past = k < bestStart ? bestStart - k : k > bestEnd ? k - bestEnd : 0;
    const inside = Math.min(k - bestStart, bestEnd - k);
    strength[i] =
      past > 0
        ? (1 - smoothstep(0, END_RUN - 4, past)) * 0.3 * Math.max(slopes[k]!, r.strength)
        : r.strength * (0.3 + 0.7 * smoothstep(0, END_FADE, inside));
  }
  boxSmooth(lipY, 2, 2);
  boxSmooth(lipD, 2, 2);
  boxSmooth(strength, 3, 2);
  let caveBest = Infinity;
  for (let i = 0; i < count; i++) {
    const r = raw[start + i]!;
    const station: CliffStation = {
      x: r.x,
      z: r.z,
      nx: r.nx,
      nz: r.nz,
      s: i,
      lipY: lipY[i]!,
      lipD: lipD[i]!,
      strength: smoothstep(0.02, 0.6, strength[i]!),
    };
    frame.stations.push(station);
    const dc = Math.hypot(r.x - COVE.seaCave.x, r.z - COVE.seaCave.z);
    if (dc < caveBest) {
      caveBest = dc;
      frame.caveS = i;
    }
  }
  if (caveBest > 25) frame.caveS = -1;
  frame.length = count - 1;
  frame.cliffStart = bestStart - start;
  frame.cliffEnd = bestEnd - start;
  return frame;
}

/** The frame interpolated at distance `s` along the cliff (normals renormalised). */
export function stationAt(frame: HeadlandCliffFrame, s: number, out: CliffStation): CliffStation {
  const st = frame.stations;
  const f = Math.min(Math.max(s, 0), frame.length);
  const i = Math.min(st.length - 2, Math.floor(f));
  const t = f - i;
  const a = st[i]!;
  const b = st[i + 1] ?? a;
  const nx = a.nx + (b.nx - a.nx) * t;
  const nz = a.nz + (b.nz - a.nz) * t;
  const len = Math.hypot(nx, nz) || 1;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.nx = nx / len;
  out.nz = nz / len;
  out.s = f;
  out.lipY = a.lipY + (b.lipY - a.lipY) * t;
  out.lipD = a.lipD + (b.lipD - a.lipD) * t;
  out.strength = a.strength + (b.strength - a.strength) * t;
  return out;
}

/** 0..1: how far into the cave buttress `s` is (1 at its middle). */
export function caveBulge(frame: HeadlandCliffFrame, s: number): number {
  if (frame.caveS < 0) return 0;
  return 1 - smoothstep(0.62, 1, Math.abs(s - frame.caveS) / BULGE_HALF_WIDTH);
}

/** 0..1: inside the sea cave's arch (the buttress is hollow there). */
export function caveArch(frame: HeadlandCliffFrame, s: number, y: number): number {
  if (frame.caveS < 0) return 0;
  const halfW = COVE.seaCave.width * 0.5;
  const h = COVE.seaCave.height;
  const k = y <= 0 ? 1 : Math.sqrt(Math.max(0, 1 - (y / h) ** 2));
  const w = halfW * k;
  return (
    (1 - smoothstep(w - 0.5, w + 0.35, Math.abs(s - frame.caveS))) * (1 - smoothstep(h - 0.2, h + 0.4, y))
  );
}

/** Height of the bedding plane `k` (counting up) at distance `s` along the cliff. */
export function beddingPlaneY(s: number, k: number): number {
  return k * BED_HEIGHT - 0.9 * Math.sin(s * 0.045 + 1) - 0.5 * Math.sin(s * 0.11);
}

/** Top of the wave-cut notch (where the visor starts) at distance `s`. */
export function notchTop(s: number): number {
  return 2.4 + 0.9 * Math.sin(s * 0.07 + 0.4) + 0.5 * Math.sin(s * 0.19 + 2.2);
}

/** 0..1 depth of the vertical solution flutes at (s, y). */
export function cliffGroove(s: number, y: number, lipY: number): number {
  const wobble = 0.35 * Math.sin(s * 0.06 + y * 0.045) + 0.18 * Math.sin(s * 0.17 - y * 0.03);
  const g1 = 1 - smoothstep(0, 0.42, Math.abs(Math.sin((s / 4.2) * Math.PI + wobble)));
  const g2 = 1 - smoothstep(0, 0.3, Math.abs(Math.sin((s / 2.4) * Math.PI - wobble * 1.4 + 0.8)));
  const strength = 0.6 + 0.4 * Math.sin(s * 0.21 + 0.9);
  const zone = smoothstep(3.5, 8, y) * (1 - smoothstep(lipY - 3, lipY - 0.5, y));
  return clamp01((g1 * 0.75 + g2 * 0.45) * strength * zone);
}

/**
 * Jointed blocks: the face breaks along bedding planes and vertical joints into slabs, each set a little
 * in or out and tilted, so it has flat faces and lips that catch the light (staggered bed to bed, like
 * natural rock rather than masonry). Metres, + = outward.
 */
function cliffBlocks(s: number, y: number, lipY: number): number {
  const zone = smoothstep(3, 7, y) * (1 - smoothstep(lipY - 1.2, lipY, y));
  if (zone <= 0) return 0;
  const bedF = (y + 0.9 * Math.sin(s * 0.045 + 1) + 0.5 * Math.sin(s * 0.11)) / BED_HEIGHT;
  const bed = Math.floor(bedF);
  const fy = bedF - bed;
  const jointF = s / JOINT_SPACING + hash(bed, 3, 11) * 3 + 0.12 * Math.sin(y * 0.4 + bed);
  const joint = Math.floor(jointF);
  const fx = jointF - joint;
  const inset = (hash(bed, joint, 7) - 0.5) * 1.0;
  const tiltUp = (hash(bed, joint, 19) - 0.5) * 0.45 * (fy - 0.5) * 2;
  const tiltSide = (hash(bed, joint, 31) - 0.5) * 0.4 * (fx - 0.5) * 2;
  const missing = hash(bed, joint, 43) > 0.9 ? -0.45 : 0;
  return (inset + tiltUp + tiltSide + missing) * zone;
}

/**
 * Outward offset (m) of the rock face from the height field's face at (s, y): bedding ledges, blocks,
 * flutes, the wave-cut notch and its visor, a rubble flare under the water, and the buttress round the
 * sea cave. `strength` fades it all into the slope where the cliff ends.
 */
export function cliffOffset(
  frame: HeadlandCliffFrame,
  s: number,
  y: number,
  lipY: number,
  strength: number,
): number {
  const bedF = (y + 0.9 * Math.sin(s * 0.045 + 1) + 0.5 * Math.sin(s * 0.11)) / BED_HEIGHT;
  const lipStrength = 0.5 + 0.5 * fbm2(s * 0.03 + 4.1, Math.floor(bedF) * 1.7, 2, 0x1ed6e);
  const ledge =
    smoothstep(0, 0.12, fract(bedF)) *
    0.9 *
    lipStrength *
    smoothstep(4, 8, y) *
    (1 - smoothstep(lipY - 2.5, lipY - 1, y));
  const broad = fbm2(s * 0.04 + 1.3, y * 0.05 - 2.2, 3, 0xc11ff) * 0.9;
  const crag = fbm2(s * 0.11 - 3.7, y * 0.12 + 0.6, 2, 0xc11f0) * 0.5 * smoothstep(-2, 4, y);
  const nt = notchTop(s);
  const notch = -1.25 * smoothstep(-0.9, 0.3, y) * (1 - smoothstep(nt - 0.5, nt + 0.25, y));
  const visor = 0.4 * Math.exp(-(((y - nt - 0.6) / 0.8) ** 2));
  const flare = 1.6 * smoothstep(-0.9, -5.5, y);
  const roll = -0.7 * smoothstep(lipY - 1.6, lipY, y);
  let off =
    FACE_OFFSET +
    ledge +
    broad +
    crag +
    cliffBlocks(s, y, lipY) -
    cliffGroove(s, y, lipY) * 0.55 +
    notch +
    visor +
    flare +
    roll;
  const arch = caveArch(frame, s, y);
  off += HEADLAND_CAVE_BULGE * caveBulge(frame, s) * (1 - arch);
  off = Math.max(MIN_OFFSET, off);
  // The cave's back wall: plain, close to the height field's face.
  off = off + (MIN_OFFSET - off) * arch;
  // Where the cliff gives way to a slope, the rock sinks into the ground: only its ledges and blocks
  // stand out of it, like outcrops, until it's gone.
  return strength >= 1 ? off : off - (1 - strength) * (off + 1.6);
}

/**
 * Ship obstacle: one circle round the cave buttress (it stands out past the height field's face, so the
 * height field alone wouldn't stop the hull).
 */
export function headlandCaveShipObstacle(heightField: Pick<HeightField, 'heightAt'>): {
  x: number;
  z: number;
  r: number;
} | null {
  const frame = headlandCliffFrame(heightField);
  if (frame.caveS < 0) return null;
  const st = stationAt(frame, frame.caveS, { ...frame.stations[0]! });
  const toe = profileCrossing(stationProfile(frame.heightAt, st), 0);
  const out = toe + FACE_OFFSET + HEADLAND_CAVE_BULGE * 0.5;
  return { x: st.x + st.nx * out, z: st.z + st.nz * out, r: BULGE_HALF_WIDTH * 0.75 };
}

export type HeadlandPlantSpecies = 'fern' | 'banana' | 'shrub' | 'palmYoung' | 'palmTall' | 'broadleafTree';

export interface HeadlandPlantSpot {
  species: HeadlandPlantSpecies;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  /** Outward lean (shear), so rim plants hang out over the edge. */
  leanX: number;
  leanZ: number;
  seed: number;
}

/**
 * Scrub along the clifftop edge, woods on the slopes past the cliff's ends, and a scatter of scrub, palms
 * and trees with clearings over the clifftop and its grassy shoulders. `density` thins them per tier
 * (0 = none).
 */
export function headlandCliffPlantSpots(
  heightField: Pick<HeightField, 'heightAt'>,
  density = 1,
): HeadlandPlantSpot[] {
  const out: HeadlandPlantSpot[] = [];
  if (density <= 0) return out;
  const frame = headlandCliffFrame(heightField);
  if (frame.stations.length < 2) return out;
  const st = { ...frame.stations[0]! };
  const push = (
    species: HeadlandPlantSpecies,
    d: number,
    y: number,
    scale: number,
    lean: number,
    seed: number,
  ) => {
    out.push({
      species,
      x: st.x + st.nx * d,
      y,
      z: st.z + st.nz * d,
      scale,
      rotation: hash(seed, 5, 9) * Math.PI * 2,
      leanX: st.nx * lean,
      leanZ: st.nz * lean,
      seed: hash(seed, 6, 1),
    });
  };
  const nearCave = (s: number) => frame.caveS >= 0 && Math.abs(s - frame.caveS) < BULGE_HALF_WIDTH + 2;
  for (let k = 0, s = 2; s < frame.length - 2; k++, s += 4.5 / density) {
    stationAt(frame, s + (hash(k, 1, 2) - 0.5) * 2, st);
    const past = st.s < frame.cliffStart - 2 || st.s > frame.cliffEnd + 2;
    if ((st.strength < 0.04 && !past) || st.lipY < 6) continue;
    const r = hash(k, 2, 3);
    // Scrub right on the edge, leaning out over it.
    if (r < 0.75 && !nearCave(st.s)) {
      const d = st.lipD - 0.8 - hash(k, 3, 4) * 2.2;
      const y = frame.heightAt(st.x + st.nx * d, st.z + st.nz * d);
      const rim: HeadlandPlantSpecies = hash(k, 3, 9) < 0.6 ? 'banana' : 'fern';
      push(rim, d, y - 0.12, 0.75 + hash(k, 4, 5) * 0.45, 0.1, k * 7 + 1);
    }
    // Where the cliff sinks into the slope at its ends, the slope is wooded.
    if (past) {
      const toe = profileCrossing(stationProfile(frame.heightAt, st), 2);
      for (let p = 0; p < 3; p++) {
        const t = 0.2 + hash(k, 8 + p, 3) * 0.75;
        const d = toe + (st.lipD - toe) * t - 0.6;
        const y = frame.heightAt(st.x + st.nx * d, st.z + st.nz * d);
        const pick = hash(k, 9 + p, 4);
        const species: HeadlandPlantSpecies =
          pick < 0.3 ? 'broadleafTree' : pick < 0.55 ? 'palmYoung' : pick < 0.8 ? 'banana' : 'fern';
        const scale =
          species === 'fern' || species === 'banana' ? 0.8 + pick * 0.4 : 0.6 + hash(k, 10 + p, 5) * 0.25;
        push(species, d, y - 0.2, scale, 0.04, k * 13 + p);
      }
      continue;
    }
    // Now and then a tree a little way back.
    if (k % 5 === 2) {
      const d = st.lipD - 5 - hash(k, 5, 6) * 6;
      const y = frame.heightAt(st.x + st.nx * d, st.z + st.nz * d);
      const tree: HeadlandPlantSpecies = hash(k, 6, 7) < 0.55 ? 'palmYoung' : 'broadleafTree';
      push(
        tree,
        d,
        y - 0.2,
        tree === 'palmYoung' ? 0.55 + hash(k, 7, 8) * 0.2 : 0.62 + hash(k, 7, 8) * 0.2,
        0.05,
        k * 7 + 2,
      );
    }
  }

  // The clifftop and its shoulders: a jittered grid with clearings, off the sheer cliff.
  const spacing = 7 / Math.sqrt(density);
  st.nx = 0;
  st.nz = 0;
  for (let gz = 0, z0 = COVE.headland.z0 - 25; z0 < COVE.headland.z1 + 25; gz++, z0 += spacing) {
    for (let gx = 0, x0 = COVE.headland.x0 - 4; x0 < COVE.headland.x1 + 10; gx++, x0 += spacing) {
      if (hash(gx, gz, 61) < 0.22) continue;
      const x = x0 + (hash(gx, gz, 62) - 0.5) * spacing;
      const z = z0 + (hash(gx, gz, 63) - 0.5) * spacing;
      if (headlandCliffEdge(x, z) < 6) continue;
      const y = frame.heightAt(x, z);
      if (y < 5) continue;
      const slope =
        Math.hypot(
          frame.heightAt(x + 1, z) - frame.heightAt(x - 1, z),
          frame.heightAt(x, z + 1) - frame.heightAt(x, z - 1),
        ) * 0.5;
      if (slope > 0.85) continue;
      const pick = hash(gx, gz, 64);
      const species: HeadlandPlantSpecies =
        pick < 0.32
          ? 'banana'
          : pick < 0.54
            ? 'fern'
            : pick < 0.66
              ? 'shrub'
              : pick < 0.8
                ? 'palmYoung'
                : pick < 0.9
                  ? 'broadleafTree'
                  : slope < 0.4
                    ? 'palmTall'
                    : 'palmYoung';
      const size = hash(gx, gz, 65);
      const scale =
        species === 'palmTall'
          ? 0.85 + size * 0.3
          : species === 'palmYoung'
            ? 0.5 + size * 0.25
            : species === 'broadleafTree'
              ? 0.6 + size * 0.3
              : 0.7 + size * 0.5;
      st.x = x;
      st.z = z;
      push(species, 0, y - 0.15, scale, 0, gx * 977 + gz * 31 + 7);
    }
  }
  return out;
}
