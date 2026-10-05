import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { clamp01, smoothstep } from '../../util/math';
import { seaStackSeabed } from './sea-stack-shape';

const SEED = 0x51e_c0de;
const EPSILON = 1e-6;
export const TERRAIN_DEEP_DEPTH = 52;

export interface CoveMasks {
  sand: number;
  grass: number;
  rock: number;
  cliff: number;
}

export interface HeightGridData {
  heights: Float32Array;
  nx: number;
  nz: number;
  minX: number;
  minZ: number;
  cell: number;
}

export const DEFAULT_TERRAIN_BOUNDS = {
  minX: -320,
  maxX: 320,
  minZ: -260,
  maxZ: 295,
  cell: 1,
} as const;

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function gaussian(v: number, width: number): number {
  return Math.exp(-(v * v) / Math.max(EPSILON, width * width));
}

function angularGaussian(theta: number, center: number, width: number): number {
  let d = theta - center;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return gaussian(d, width);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hashInt(x: number, z: number, seed = SEED): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashSigned(x: number, z: number, seed = SEED): number {
  return hashInt(x, z, seed) / 0x7fffffff - 1;
}

function valueNoise2(x: number, z: number, seed = SEED): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = hashSigned(x0, z0, seed);
  const b = hashSigned(x0 + 1, z0, seed);
  const c = hashSigned(x0, z0 + 1, seed);
  const d = hashSigned(x0 + 1, z0 + 1, seed);
  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}

export function fbm2(x: number, z: number, octaves = 5, seed = SEED): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, z * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.03;
  }
  return sum / Math.max(EPSILON, norm);
}

export function ridged2(x: number, z: number, octaves = 4, seed = SEED + 77): number {
  let amp = 0.55;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(x * freq, z * freq, seed + i * 4099));
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / Math.max(EPSILON, norm);
}

function saw01(v: number): number {
  return v - Math.floor(v);
}

function ellipseRadius(theta: number, halfX: number, halfZ: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return 1 / Math.sqrt((c * c) / (halfX * halfX) + (s * s) / (halfZ * halfZ));
}

function coastRadiusAt(theta: number): number {
  const base = ellipseRadius(theta, COVE.island.halfX, COVE.island.halfZ);
  const southBeach = 15 * angularGaussian(theta, Math.PI / 2, 0.55);
  const eastHeadland = 56 * angularGaussian(theta, 0, 0.34);
  const northHarborBite = -16 * angularGaussian(theta, -2.35, 0.34);
  const westernCove = -9 * angularGaussian(theta, 2.7, 0.35);
  return base + southBeach + eastHeadland + northHarborBite + westernCove;
}

function noisyCoastDistance(
  x: number,
  z: number,
): { distance: number; radius: number; radial: number; theta: number } {
  const theta = Math.atan2(z, x);
  const radial = Math.hypot(x, z);
  const largeNoise = fbm2(Math.cos(theta) * 2.7 + 18.1, Math.sin(theta) * 2.7 - 4.6, 5) * 8;
  const fineNoise = fbm2(x * 0.024 - 2.5, z * 0.024 + 7.2, 4, SEED + 611) * 3;
  const radius = coastRadiusAt(theta) + largeNoise + fineNoise;
  return { distance: radius - radial, radius, radial, theta };
}

function harborBasinHeight(x: number, z: number, current: number): number {
  const d = Math.hypot(x - COVE.harbor.center.x, z - COVE.harbor.center.z);
  const basin = 1 - smoothstep(COVE.harbor.radius - 5, COVE.harbor.radius + 8, d);
  if (basin <= 0) return current;
  const dredged = -COVE.harbor.depth + fbm2(x * 0.08, z * 0.08, 3, SEED + 221) * 0.12;
  const wallSide = z < COVE.quay.z ? 1 : smoothstep(COVE.quay.z + 6, COVE.quay.z - 1, z);
  return mix(current, dredged, basin * wallSide);
}

function quayPlatformHeight(x: number, z: number, current: number): number {
  if (z < COVE.quay.z || z > -46) return current;
  const wx =
    smoothstep(COVE.quay.x0 - 5, COVE.quay.x0 + 2, x) *
    (1 - smoothstep(COVE.quay.x1 - 2, COVE.quay.x1 + 5, x));
  const wz = 1 - smoothstep(-54, -46, z);
  return mix(current, COVE.quay.height, wx * wz);
}

function discPadHeight(
  x: number,
  z: number,
  current: number,
  cx: number,
  cz: number,
  radius: number,
  target: number,
  edge = 8,
): number {
  const d = Math.hypot(x - cx, z - cz);
  const w = 1 - smoothstep(radius - edge, radius, d);
  return mix(current, target, w);
}

function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp01(((x - ax) * dx + (z - az) * dz) / Math.max(EPSILON, dx * dx + dz * dz));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function pathMask(x: number, z: number): number {
  const villageToHill = segmentDistance(x, z, COVE.village.center.x, COVE.village.center.z, -18, -10);
  const hillToBeach = segmentDistance(x, z, -18, -10, -28, 103);
  const quayToVillage = segmentDistance(x, z, -112, -64, COVE.village.center.x, COVE.village.center.z);
  return clamp01(
    1 -
      smoothstep(2.4, 7.2, villageToHill) +
      (1 - smoothstep(2.8, 8.6, hillToBeach)) +
      (1 - smoothstep(2.2, 6.5, quayToVillage)),
  );
}

function lagoonAndReefHeight(x: number, z: number, current: number): number {
  const lx = x - COVE.lagoon.center.x;
  const lz = z - COVE.lagoon.center.z;
  const d = Math.hypot(lx, lz);
  const angle = Math.atan2(lz, lx);
  const southArc = smoothstep(-0.72, -0.18, lz / Math.max(d, EPSILON));
  const landBackstop = 1 - smoothstep(64, 92, z);

  const beachAcross = 1 - smoothstep(130, 176, Math.abs(x - 6));
  const beach =
    smoothstep(COVE.beach.z0 - 10, COVE.beach.z0 + 2, z) *
    (1 - smoothstep(COVE.beach.z1 + 14, COVE.beach.z1 + 38, z)) *
    beachAcross;
  const beachT = smoothstep(COVE.beach.z0 - 4, COVE.beach.z1 + 28, z);
  const shelf = mix(2.0, -1.95, beachT) + fbm2(x * 0.07, z * 0.07, 3, SEED + 404) * 0.11;
  let h = mix(current, shelf, beach * (1 - landBackstop * 0.55));

  const lagoon =
    (1 - smoothstep(COVE.lagoon.radius - 14, COVE.lagoon.radius + 8, d)) * smoothstep(77, 104, z);
  const floor = -COVE.lagoon.depth + fbm2(x * 0.045 + 3.1, z * 0.045 - 8.3, 4, SEED + 808) * 0.16;
  h = mix(h, floor, lagoon);

  const reefRing = gaussian(d - COVE.reef.radius, COVE.reef.width * 0.95) * southArc;
  const gapA = angularGaussian(angle, 0.34, 0.07);
  const gapB = angularGaussian(angle, 2.55, 0.08);
  const channel = clamp01(gapA + gapB);
  const apronBand = smoothstep(COVE.reef.radius - 20, COVE.reef.radius + 18, d) * southArc;
  const apronT = smoothstep(COVE.reef.radius + 3, COVE.reef.radius + 20, d);
  const apronNoise = fbm2(x * 0.03 - 4.2, z * 0.03 + 3.4, 4, SEED + 910) * 0.22;
  const reefApron = mix(-3.1, -48, apronT) + apronNoise * (1 - apronT);
  h = mix(h, reefApron, apronBand * (1 - channel * 0.5));
  const crestNoise = fbm2(x * 0.055, z * 0.055, 3, SEED + 909) * 0.035;
  const crest = mix(COVE.reef.crest + crestNoise, -3.4 + crestNoise * 2, channel);
  h = mix(h, crest, reefRing * (1 - smoothstep(0.45, 0.85, channel)) + reefRing * channel * 0.9);

  return h;
}

function ravineCut(
  x: number,
  z: number,
  x0: number,
  z0: number,
  slope: number,
  width: number,
  depth: number,
): number {
  const center = z0 + (x - x0) * slope;
  const line = gaussian(z - center, width);
  return line * smoothstep(118, 178, x) * (1 - smoothstep(202, 224, x)) * depth;
}

/** Polynomial smooth minimum: rounds the corner where two cliff lines meet over about `k` metres. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Plan-view buttresses and flutes along a cliff line (metres, + = seaward), from the along-coast coordinate. */
function cliffLineRelief(along: number, across: number, seed: number): number {
  const warped = along + fbm2(across * 0.026 + 13.2, along * 0.026 - 9.1, 4, seed) * 13;
  const buttress =
    (Math.abs(saw01(warped / 28 + valueNoise2(across * 0.018, along * 0.018, seed + 1) * 0.2) - 0.5) * 2 -
      0.45) *
    8;
  const flutes = (Math.abs(saw01(warped / 9.5 + across * 0.009) - 0.5) * 2 - 0.55) * 4.5;
  return buttress + flutes;
}

/**
 * Signed distance (m, + = inland) to the headland's sea cliffs: the east face, and the north and south
 * flanks, joined round the corners. The flanks soften to slopes toward the west, where the land comes
 * down to the beach and the harbor shore.
 */
export function headlandCliffEdge(x: number, z: number): number {
  // Each line only matters within ~40 m of it; far inland of it, it can't be the nearest (skip the noise).
  const far = 1e3;
  const nearEast = x > COVE.headland.x1 - 40;
  const nearSouth = z > COVE.headland.z1 + 9 - 40;
  const nearNorth = z < COVE.headland.z0 - 9 + 40;
  if (!nearEast && !nearSouth && !nearNorth) return far;
  const noise = fbm2(x * 0.08, z * 0.08, 3, SEED + 335) * 2;
  const east = nearEast ? COVE.headland.x1 - x + cliffLineRelief(z, x, SEED + 333) + noise : far;
  const south = nearSouth
    ? (COVE.headland.z1 + 9 - z + cliffLineRelief(x, z, SEED + 343) * 0.8 + noise) *
      mix(0.14, 1, smoothstep(120, 146, x))
    : far;
  const north = nearNorth
    ? (z - (COVE.headland.z0 - 9) + cliffLineRelief(x + 57, z, SEED + 353) * 0.8 + noise) *
      mix(0.14, 1, smoothstep(114, 140, x))
    : far;
  return smin(east, smin(south, north, 8), 10);
}

function headlandHeight(x: number, z: number, current: number): number {
  if (x < COVE.headland.x0 - 24) return current;
  const cliffEdge = headlandCliffEdge(x, z);
  // West, the headland merges into the island; far offshore, the seabed is the island's own.
  const influence =
    smoothstep(COVE.headland.x0 - 24, COVE.headland.x0 + 10, x) * (1 - smoothstep(45, 75, -cliffEdge));
  if (influence <= 0) return current;
  // Sheer faces: the clifftop runs out to the edge and drops to the sea in about 4 m (the cliff mesh in
  // headland-cliff.ts covers the faces, so the height field and the rock you see agree).
  const face = smoothstep(-1.2, 2.8, cliffEdge);
  const ridge =
    8.5 * gaussian((x - 154) / 46, 1) * gaussian((z + 8) / 72, 1) +
    4.2 * ridged2(x * 0.035 + 1.7, z * 0.035 - 5.5, 3, SEED + 336);
  const ravines =
    ravineCut(x, z, 122, -47, 0.28, 7.5, 15) +
    ravineCut(x, z, 128, 2, -0.2, 6.5, 11) +
    ravineCut(x, z, 135, 36, -0.35, 7, 9);
  const strataSteps = Math.floor(Math.max(0, COVE.headland.cliffTop * face) / 3) * 0.035;
  let cliff =
    COVE.headland.cliffTop * 0.68 * face + ridge * 1.2 * smoothstep(0.22, 0.9, face) - ravines + strataSteps;
  cliff += ridged2(x * 0.18, z * 0.18, 3, SEED + 337) * 1.3 * smoothstep(0.15, 0.95, face);

  // A rock shelf at the foot, shallower than the ship's draft (so it grounds before its rigging reaches
  // the face), then
  // the seabed falls away. The sea cave is part of the cliff mesh, not the height field.
  const offshore = -2 - smoothstep(0, 45, -cliffEdge) * 22.5;
  const head = mix(offshore, cliff, face);
  return mix(current, Math.max(current, head), influence);
}

export function coveHeight(x: number, z: number): number {
  const coast = noisyCoastDistance(x, z);
  const offshoreDistance = Math.max(0, coast.radial - coast.radius);
  const seaT = smoothstep(28, 125, offshoreDistance);
  const seaNoise = fbm2(x * 0.012 + 4, z * 0.012 - 11, 4, SEED + 515) * 0.45 * (1 - seaT);
  const sea = -mix(0.35, TERRAIN_DEEP_DEPTH, seaT) + seaNoise;

  const hill =
    COVE.hill.height *
    gaussian((x - COVE.hill.center.x) / COVE.hill.radius, 1) *
    gaussian((z - COVE.hill.center.z) / (COVE.hill.radius * 0.85), 1);
  const interior = smoothstep(-2, 48, coast.distance);
  const lowLand = 1.15 + 4.5 * interior + hill * 0.82;
  const landNoise =
    fbm2(x * 0.032, z * 0.032, 5, SEED + 616) * 1.2 + ridged2(x * 0.08, z * 0.08, 3, SEED + 617) * 0.65;
  const harborBack =
    smoothstep(COVE.quay.x0 - 28, COVE.quay.x0 - 2, x) *
    (1 - smoothstep(COVE.quay.x1 + 2, COVE.quay.x1 + 34, x)) *
    smoothstep(-76, -58, z) *
    (1 - smoothstep(-38, -16, z));
  const shoreRamp = -0.2 + coast.distance * 0.055 + fbm2(x * 0.055, z * 0.055, 3, SEED + 1601) * 0.14;
  const shoreBlend = smoothstep(36, 90, coast.distance);
  let h =
    coast.distance >= 0
      ? mix(shoreRamp, lowLand + landNoise * smoothstep(4, 35, coast.distance), shoreBlend)
      : sea;
  h = mix(h, Math.max(h, 1.1 + coast.distance * 0.12), harborBack * (1 - smoothstep(4, 30, coast.distance)));
  const hillMask =
    gaussian((x - COVE.hill.center.x) / (COVE.hill.radius * 0.8), 1) *
    gaussian((z - COVE.hill.center.z) / COVE.hill.radius, 1);
  const hillRidges = ridged2(x * 0.045 - 2.1, z * 0.045 + 8.4, 4, SEED + 1201) * 2.4;
  const gullies = ridged2((x + z * 0.35) * 0.07, (z - x * 0.28) * 0.07, 3, SEED + 1202) * 1.7;
  const paths = pathMask(x, z);
  h += hillMask * (hillRidges - gullies * 0.65) * smoothstep(1, 18, h);
  h -= paths * 0.38 * smoothstep(0.5, 12, h);

  h = lagoonAndReefHeight(x, z, h);
  h = harborBasinHeight(x, z, h);
  h = discPadHeight(
    x,
    z,
    h,
    COVE.village.center.x,
    COVE.village.center.z,
    COVE.village.radius,
    COVE.village.height,
    7,
  );
  h = quayPlatformHeight(x, z, h);
  h = headlandHeight(x, z, h);
  h = seaStackSeabed(x, z, h);

  if (coast.radial >= COVE.seabedRadius) {
    h = Math.min(h, -TERRAIN_DEEP_DEPTH);
  }
  return h;
}

function normalAtAnalytic(
  x: number,
  z: number,
  out: Float32Array | number[] = [0, 0, 0],
): Float32Array | number[] {
  const e = 0.75;
  const hx0 = coveHeight(x - e, z);
  const hx1 = coveHeight(x + e, z);
  const hz0 = coveHeight(x, z - e);
  const hz1 = coveHeight(x, z + e);
  const nx = -(hx1 - hx0) / (2 * e);
  const nz = -(hz1 - hz0) / (2 * e);
  const ny = 1;
  const len = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / len;
  out[1] = ny / len;
  out[2] = nz / len;
  return out;
}

export function coveMasks(x: number, z: number): CoveMasks {
  const h = coveHeight(x, z);
  const n = normalAtAnalytic(x, z, [0, 0, 0]);
  const slope = Math.hypot(n[0], n[2]) / Math.max(0.05, n[1]);
  const coast = noisyCoastDistance(x, z);
  const lagoonD = Math.hypot(x - COVE.lagoon.center.x, z - COVE.lagoon.center.z);
  const stackD = Math.hypot(x - COVE.seaStack.x, z - COVE.seaStack.z);
  const headland =
    smoothstep(COVE.headland.x0 - 5, COVE.headland.x0 + 20, x) *
    smoothstep(COVE.headland.z0 - 18, COVE.headland.z0 + 8, z) *
    (1 - smoothstep(COVE.headland.z1 - 6, COVE.headland.z1 + 24, z));
  const shoreBand = smoothstep(-7, -1.2, h) * (1 - smoothstep(2.2, 4.2, h));
  const beachSand =
    smoothstep(COVE.beach.z0 - 18, COVE.beach.z0 + 8, z) *
    (1 - smoothstep(COVE.beach.z1 + 18, COVE.beach.z1 + 48, z)) *
    (1 - smoothstep(160, 210, Math.abs(x))) *
    (1 - smoothstep(0.45, 0.9, slope));
  const lagoonSand = smoothstep(COVE.lagoon.radius + 18, 18, lagoonD);
  const deliberateBeach = Math.max(beachSand, lagoonSand * 0.72);
  const harborBackMeadow =
    smoothstep(-86, -72, x) *
    (1 - smoothstep(-40, -30, x)) *
    smoothstep(-88, -78, z) *
    (1 - smoothstep(-45, -34, z));
  const dryHarborMeadow = harborBackMeadow * smoothstep(0.55, 1.8, h) * (1 - smoothstep(0.38, 0.76, slope));
  const shallowSand = shoreBand * (0.22 + deliberateBeach * 0.78) * (1 - headland * 0.78);
  const rockyShore =
    shoreBand *
    smoothstep(-3, 10, coast.distance) *
    (1 - smoothstep(16, 38, coast.distance)) *
    (1 - deliberateBeach * 0.9);
  const path = pathMask(x, z) * smoothstep(1.0, 6.5, h);
  const outcrop =
    smoothstep(5, 20, h) *
    smoothstep(0.28, 0.7, ridged2(x * 0.075 - 3.4, z * 0.075 + 1.8, 3, SEED + 1501)) *
    (1 - smoothstep(0.65, 1.1, slope));
  let sand = Math.max(
    shallowSand * (1 - headland * 0.7),
    beachSand,
    lagoonSand * 0.7,
    path * 0.85 * (1 - dryHarborMeadow),
  );
  let cliff = Math.max(
    smoothstep(0.52, 1.15, slope),
    // The headland's faces, not its flat top (that's grass and scrub over rock).
    headland * smoothstep(7, 26, h) * smoothstep(0.3, 0.7, slope),
    smoothstep(COVE.seaStack.radius + 8, COVE.seaStack.radius - 1, stackD),
  );
  let rock = Math.max(
    smoothstep(0.25, 0.72, slope),
    headland * 0.45,
    rockyShore * 0.72,
    smoothstep(8, 26, h) * 0.22,
    outcrop * 0.45,
  );
  let grass =
    smoothstep(1.2, 4.5, h) * (1 - smoothstep(0.22, 0.52, slope)) * (1 - headland * 0.35) * (1 - path * 0.82);
  sand *= 1 - dryHarborMeadow * 0.94;
  grass = Math.max(grass, dryHarborMeadow * 0.92);

  if (h < -9) {
    sand *= 0.3;
    rock = Math.max(rock, 0.18);
  }
  cliff = clamp01(cliff);
  rock = clamp01(rock * (1 - cliff * 0.35));
  sand = clamp01(sand * (1 - cliff * 0.75));
  grass = clamp01(grass * (1 - cliff) * (1 - sand * 0.45));

  const total = sand + grass + rock + cliff;
  if (total < 0.001) return { sand: 0.25, grass: 0, rock: 0.75, cliff: 0 };
  return { sand: sand / total, grass: grass / total, rock: rock / total, cliff: cliff / total };
}

function bilinear(grid: HeightGridData, x: number, z: number): number | null {
  const gx = (x - grid.minX) / grid.cell;
  const gz = (z - grid.minZ) / grid.cell;
  if (gx < 0 || gz < 0 || gx > grid.nx - 1 || gz > grid.nz - 1) return null;
  const ix = Math.min(grid.nx - 2, Math.max(0, Math.floor(gx)));
  const iz = Math.min(grid.nz - 2, Math.max(0, Math.floor(gz)));
  const tx = gx - ix;
  const tz = gz - iz;
  const i00 = iz * grid.nx + ix;
  const i10 = i00 + 1;
  const i01 = i00 + grid.nx;
  const i11 = i01 + 1;
  return mix(
    mix(grid.heights[i00], grid.heights[i10], tx),
    mix(grid.heights[i01], grid.heights[i11], tx),
    tz,
  );
}

export class CoveHeightField implements HeightField {
  constructor(private readonly grid?: HeightGridData) {}

  heightAt(x: number, z: number): number {
    if (this.grid) {
      const h = bilinear(this.grid, x, z);
      if (h !== null) return h;
    }
    return coveHeight(x, z);
  }

  normalAt(x: number, z: number, out: Float32Array | number[]): Float32Array | number[] {
    const e = this.grid?.cell ?? 0.75;
    const hx0 = this.heightAt(x - e, z);
    const hx1 = this.heightAt(x + e, z);
    const hz0 = this.heightAt(x, z - e);
    const hz1 = this.heightAt(x, z + e);
    const nx = -(hx1 - hx0) / (2 * e);
    const nz = -(hz1 - hz0) / (2 * e);
    const len = Math.hypot(nx, 1, nz) || 1;
    out[0] = nx / len;
    out[1] = 1 / len;
    out[2] = nz / len;
    return out;
  }

  masksAt(x: number, z: number): CoveMasks {
    return coveMasks(x, z);
  }
}
