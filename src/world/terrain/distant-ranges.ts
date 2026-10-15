import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, color, float, mix } from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import { clamp01, smoothstep } from '../../util/math';
import { fbm2, ridged2 } from './cove-height';
import { world } from '../uniforms';

type QualityTier = TierSettings['tier'];

interface IslandSpec {
  name: string;
  centerX: number;
  centerZ: number;
  angle: number;
  radiusX: number;
  radiusZ: number;
  height: number;
  seed: number;
  haze: number;
  peakX: number;
  peakZ: number;
  peakScaleX: number;
  peakScaleZ: number;
  peakSharpness: number;
  ridgeAngle: number;
  ridgeWidth: number;
  ridgeHeight: number;
  rockHeight: number;
  foliage: number;
}

interface GeometryMeta {
  spec: number[];
  radial: number[];
  height01: number[];
  canopy: number[];
  valley: number[];
  peak: number[];
  shore: number[];
  wet: number[];
  lagoon: number[];
}

interface IslandBuffers extends GeometryMeta {
  positions: number[];
  indices: number[];
}

interface IslandQuality {
  segments: number;
  landRings: number;
}

type Rgb = readonly [number, number, number];

interface IslandField {
  side: number;
  heights: Float32Array;
  flow: Float32Array;
  peak: Float32Array;
  canopy: Float32Array;
}

interface IslandSample {
  y: number;
  height01: number;
  canopy: number;
  valley: number;
  peak: number;
  shore: number;
  wet: number;
  lagoon: number;
}

const TAU = Math.PI * 2;

const ISLANDS: readonly IslandSpec[] = [
  {
    name: 'title-volcano',
    centerX: -2550,
    centerZ: -3150,
    angle: 0.1,
    radiusX: 1280,
    radiusZ: 330,
    height: 225,
    seed: 0x1a11,
    haze: 0.2,
    peakX: -0.08,
    peakZ: -0.05,
    peakScaleX: 0.26,
    peakScaleZ: 0.34,
    peakSharpness: 1.65,
    ridgeAngle: -0.28,
    ridgeWidth: 0.1,
    ridgeHeight: 0.76,
    rockHeight: 0.42,
    foliage: 1,
  },
  {
    name: 'north-ridge',
    centerX: 2550,
    centerZ: -3650,
    angle: -0.48,
    radiusX: 1180,
    radiusZ: 280,
    height: 275,
    seed: 0x2b22,
    haze: 0.24,
    peakX: 0.16,
    peakZ: 0,
    peakScaleX: 0.42,
    peakScaleZ: 0.5,
    peakSharpness: 2.0,
    ridgeAngle: 0.02,
    ridgeWidth: 0.11,
    ridgeHeight: 0.72,
    rockHeight: 0.62,
    foliage: 0.94,
  },
  {
    name: 'west-islet',
    centerX: -4300,
    centerZ: -2550,
    angle: 0.5,
    radiusX: 410,
    radiusZ: 210,
    height: 130,
    seed: 0x3c33,
    haze: 0.32,
    peakX: 0.12,
    peakZ: 0.06,
    peakScaleX: 0.52,
    peakScaleZ: 0.48,
    peakSharpness: 2.15,
    ridgeAngle: 0.65,
    ridgeWidth: 0.18,
    ridgeHeight: 0.34,
    rockHeight: 0.7,
    foliage: 0.98,
  },
  {
    name: 'west-sea-stack',
    centerX: -3820,
    centerZ: -2260,
    angle: 0.1,
    radiusX: 95,
    radiusZ: 64,
    height: 145,
    seed: 0x4d44,
    haze: 0.31,
    peakX: 0,
    peakZ: 0,
    peakScaleX: 0.58,
    peakScaleZ: 0.58,
    peakSharpness: 1.25,
    ridgeAngle: 0.8,
    ridgeWidth: 0.2,
    ridgeHeight: 0.18,
    rockHeight: 0.26,
    foliage: 0.08,
  },
  {
    name: 'southwest-green',
    centerX: -4200,
    centerZ: 3650,
    angle: -0.3,
    radiusX: 980,
    radiusZ: 300,
    height: 220,
    seed: 0x5e55,
    haze: 0.38,
    peakX: -0.24,
    peakZ: 0.02,
    peakScaleX: 0.46,
    peakScaleZ: 0.48,
    peakSharpness: 1.95,
    ridgeAngle: -0.18,
    ridgeWidth: 0.13,
    ridgeHeight: 0.62,
    rockHeight: 0.65,
    foliage: 1,
  },
  {
    name: 'east-headland',
    centerX: 5200,
    centerZ: 700,
    angle: -1.2,
    radiusX: 680,
    radiusZ: 210,
    height: 170,
    seed: 0x6f66,
    haze: 0.42,
    peakX: 0.05,
    peakZ: -0.02,
    peakScaleX: 0.48,
    peakScaleZ: 0.5,
    peakSharpness: 2.0,
    ridgeAngle: -0.05,
    ridgeWidth: 0.13,
    ridgeHeight: 0.48,
    rockHeight: 0.66,
    foliage: 0.86,
  },
  {
    name: 'far-south',
    centerX: 650,
    centerZ: 6100,
    angle: 0.2,
    radiusX: 1050,
    radiusZ: 260,
    height: 185,
    seed: 0x7077,
    haze: 0.5,
    peakX: -0.18,
    peakZ: 0.05,
    peakScaleX: 0.5,
    peakScaleZ: 0.5,
    peakSharpness: 2.2,
    ridgeAngle: 0.16,
    ridgeWidth: 0.14,
    ridgeHeight: 0.56,
    rockHeight: 0.68,
    foliage: 0.9,
  },
];

const VALLEY_GREEN: Rgb = [0.035, 0.15, 0.065];
const DEEP_GREEN: Rgb = [0.055, 0.26, 0.095];
const MID_GREEN: Rgb = [0.13, 0.43, 0.15];
const SUN_GREEN: Rgb = [0.46, 0.58, 0.2];
const OCHRE_ROCK: Rgb = [0.53, 0.39, 0.23];
const GREY_ROCK: Rgb = [0.42, 0.41, 0.36];
const PALE_PEAK: Rgb = [0.62, 0.56, 0.46];
const SAND: Rgb = [0.82, 0.68, 0.43];
const WET_SAND: Rgb = [0.46, 0.35, 0.22];
const SURF: Rgb = [0.9, 0.97, 0.92];
const LAGOON: Rgb = [0.2, 0.62, 0.58];

// TSL's fluent typings do not cover mixed attribute/vector graphs consistently.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

function createIslandMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
  });
  material.name = 'distant-island-lush-standard';
  material.fog = false;
  const base = attribute('color', 'vec3') as AnyNode;
  const haze = attribute('islandHaze', 'float') as AnyNode;
  const wet = attribute('islandWet', 'float') as AnyNode;
  const softened = mix(base, color(0x9fbcb0), haze.mul(0.24)) as AnyNode;
  material.colorNode = softened;
  // Light scattered by the haze in front of far land: daylight only, so islands go dark at night.
  material.emissiveNode = mix(base, color(0xaec6b8), haze.mul(0.46))
    .mul(0.16)
    .mul(float(1).sub(world.night.mul(0.9))) as AnyNode;
  material.roughnessNode = mix(float(0.96), float(0.66), wet) as AnyNode;
  return material;
}

function qualityForTier(tier: QualityTier = 'high'): IslandQuality {
  if (tier === 'lite') return { segments: 36, landRings: 11 };
  if (tier === 'low') return { segments: 56, landRings: 16 };
  if (tier === 'medium') return { segments: 76, landRings: 21 };
  return { segments: 96, landRings: 26 };
}

function qualityForIsland(spec: IslandSpec, tier: QualityTier = 'high'): IslandQuality {
  if (tier !== 'high' && tier !== 'ultra') return qualityForTier(tier);
  switch (spec.name) {
    case 'title-volcano':
      return { segments: 160, landRings: 36 };
    case 'north-ridge':
      return { segments: 112, landRings: 28 };
    case 'southwest-green':
      return { segments: 88, landRings: 24 };
    case 'far-south':
      return { segments: 80, landRings: 22 };
    case 'west-sea-stack':
      return { segments: 40, landRings: 14 };
    default:
      return { segments: 72, landRings: 22 };
  }
}

function mixNumber(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function mixRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  const k = clamp01(t);
  return [mixNumber(a[0], b[0], k), mixNumber(a[1], b[1], k), mixNumber(a[2], b[2], k)];
}

function pushRgb(out: number[], rgb: Rgb): void {
  out.push(clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2]));
}

function ringRadii(landRings: number): number[] {
  const radii: number[] = [];
  for (let i = 0; i < landRings; i++) {
    radii.push(Math.pow(i / Math.max(1, landRings - 1), 0.82) * 0.968);
  }
  radii.push(0.992, 1.01, 1.045, 1.085);
  return radii;
}

function coastScale(spec: IslandSpec, theta: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const broad = fbm2(c * 2.7 + spec.seed * 0.002, s * 2.7 - spec.seed * 0.001, 4, spec.seed + 17);
  const headlandA = Math.exp(-((theta + 2.32) ** 2) / 0.08) * 0.13;
  const headlandB = Math.exp(-((theta - 0.45) ** 2) / 0.1) * 0.1;
  const coveA = -Math.exp(-((theta + 0.85) ** 2) / 0.07) * 0.11;
  const coves = Math.sin(theta * 3.0 + spec.seed * 0.013) * 0.045 + Math.sin(theta * 5.0 - 1.1) * 0.025;
  return 1 + broad * 0.095 + coves + headlandA + headlandB + coveA;
}

function radialAt(spec: IslandSpec, x: number, z: number): number {
  const theta = Math.atan2(z, x);
  return Math.hypot(x, z) / Math.max(0.35, coastScale(spec, theta));
}

function fieldSideForQuality(quality: IslandQuality): number {
  return quality.segments >= 140 ? 177 : 129;
}

function mass(
  x: number,
  z: number,
  cx: number,
  cz: number,
  sx: number,
  sz: number,
  amp: number,
  round = 1,
): number {
  const dx = (x - cx) / sx;
  const dz = (z - cz) / sz;
  const d = Math.hypot(dx, dz);
  const shoulder = Math.pow(clamp01(1 - smoothstep(0.18, 1.1, d)), round);
  const plateau = 1 - smoothstep(0.0, 0.28, d);
  return amp * mixNumber(shoulder, 1, plateau * 0.55);
}

function baseIslandHeight(spec: IslandSpec, x: number, z: number): { height: number; peak: number } {
  const wrpX = fbm2(x * 2.0 + spec.seed, z * 2.0 - spec.seed, 3, spec.seed + 201) * 0.16;
  const wrpZ = fbm2(x * 1.9 - spec.seed, z * 1.9 + spec.seed, 3, spec.seed + 211) * 0.16;
  const wx = x + wrpX;
  const wz = z + wrpZ;
  const r = radialAt(spec, wx, wz);
  if (r > 1.08) return { height: 0, peak: 0 };

  let h: number;
  let peak: number;
  if (spec.name === 'title-volcano') {
    const crown = mass(wx, wz, -0.34, -0.05, 0.2, 0.32, 0.7, 0.48);
    const crownBlock =
      1 - smoothstep(0.56, 1.02, Math.max(Math.abs((wx + 0.36) / 0.2), Math.abs((wz + 0.04) / 0.27)));
    const basaltCap = crownBlock * 0.82;
    const shoulder = mass(wx, wz, 0.1, 0.03, 0.72, 0.38, 0.34, 0.86);
    const eastShoulder = mass(wx, wz, 0.46, 0.0, 0.5, 0.3, 0.22, 0.95);
    const westPiton = mass(wx, wz, -0.72, -0.02, 0.16, 0.24, 0.24, 0.85);
    const lowRidge = mass(wx, wz, 0.74, 0.01, 0.36, 0.21, 0.15, 1.0);
    const cliffFace = smoothstep(-0.58, -0.18, wx) * Math.max(crown, basaltCap) * 0.11;
    h =
      Math.max(crown, basaltCap) +
      shoulder +
      eastShoulder +
      westPiton +
      lowRidge +
      smoothstep(-0.7, -0.28, wx) * crown * 0.1;
    peak = clamp01(Math.max(crown, basaltCap) * 1.2 + westPiton * 0.4);
    h -= smoothstep(0.22, 0.72, wz) * smoothstep(0.18, 0.72, h) * 0.1;
    h -= Math.exp(-((wx + 0.03) ** 2) / 0.012) * smoothstep(0.2, 0.7, h) * 0.18;
    h -= Math.exp(-((wx - 0.33) ** 2) / 0.01) * smoothstep(0.16, 0.62, h) * 0.11;
    h += cliffFace;
  } else if (spec.name === 'north-ridge') {
    h =
      mass(wx, wz, -0.34, -0.01, 0.46, 0.35, 0.5, 0.8) +
      mass(wx, wz, 0.18, 0.02, 0.58, 0.3, 0.43, 0.75) +
      mass(wx, wz, 0.56, -0.02, 0.44, 0.24, 0.25, 0.9);
    peak = clamp01(h);
  } else {
    h =
      mass(wx, wz, spec.peakX, spec.peakZ, spec.peakScaleX, spec.peakScaleZ, 0.62, 0.72) +
      mass(wx, wz, spec.peakX + 0.36, spec.peakZ + 0.03, 0.46, 0.3, 0.24, 0.85) +
      mass(wx, wz, spec.peakX - 0.34, spec.peakZ - 0.02, 0.35, 0.26, 0.2, 0.9);
    peak = clamp01(h * 1.1);
  }

  const theta = Math.atan2(wz, wx);
  const ridgeDirection = spec.ridgeAngle;
  const ridgeAcross = -wx * Math.sin(ridgeDirection) + wz * Math.cos(ridgeDirection);
  const ridgeAlong = wx * Math.cos(ridgeDirection) + wz * Math.sin(ridgeDirection);
  const ridge = Math.exp(-(ridgeAcross * ridgeAcross) / Math.max(0.006, spec.ridgeWidth * spec.ridgeWidth));
  const spurRidges =
    spec.name === 'title-volcano'
      ? Math.max(0, Math.sin((wx + 0.82) * 20 + fbm2(wx * 2.7, wz * 2.7, 2, spec.seed + 55) * 2.3)) *
        smoothstep(-0.78, 0.58, wx) *
        (1 - smoothstep(0.25, 0.92, Math.abs(wz)))
      : 0;
  h +=
    ridge * (1 - smoothstep(0.55, 1.03, Math.abs(ridgeAlong))) * spec.ridgeHeight * 0.16 + spurRidges * 0.045;

  const gullies =
    Math.pow(
      clamp01(1 - Math.abs(Math.sin(theta * 4.5 + fbm2(wx * 2.2, wz * 2.2, 2, spec.seed + 29) * 1.2))),
      3.4,
    ) *
    smoothstep(0.18, 0.92, r) *
    (1 - smoothstep(0.94, 1.06, r));
  const crags = ridged2(wx * 5.0 + wrpX * 2, wz * 5.0 + wrpZ * 2, 5, spec.seed + 43);
  const canopyLumps =
    fbm2(wx * 7.5 + spec.seed, wz * 7.5 - spec.seed, 4, spec.seed + 303) *
    (spec.name === 'title-volcano' ? 0.06 : 0.045);
  const shoreFeather = 1 - smoothstep(0.7, 1.02, r);
  h =
    h +
    crags * (spec.name === 'title-volcano' ? 0.13 : 0.1) +
    canopyLumps -
    gullies * (spec.name === 'title-volcano' ? 0.34 : 0.16);
  h *= shoreFeather;
  h = Math.max(0, h);

  const capStart = spec.name === 'title-volcano' ? 0.5 : 0.68;
  const cap = smoothstep(capStart, 0.92, h);
  h = mixNumber(h, capStart + (h - capStart) * (spec.name === 'title-volcano' ? 0.22 : 0.42), cap);
  return { height: h, peak };
}

function erodeField(heights: Float32Array, flow: Float32Array, side: number, iterations: number): void {
  const delta = new Float32Array(heights.length);
  for (let iter = 0; iter < iterations; iter++) {
    delta.fill(0);
    for (let z = 1; z < side - 1; z++) {
      for (let x = 1; x < side - 1; x++) {
        const i = z * side + x;
        const h = heights[i]!;
        if (h <= 0.01) continue;
        let low = i;
        let lowH = h;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const n = i + dz * side + dx;
            const nh = heights[n]!;
            if (nh < lowH) {
              low = n;
              lowH = nh;
            }
          }
        }
        const diff = h - lowH;
        if (diff <= 0.026) continue;
        const moved = (diff - 0.026) * 0.18;
        delta[i] -= moved;
        delta[low] += moved * 0.86;
      }
    }
    for (let i = 0; i < heights.length; i++) heights[i] = Math.max(0, heights[i]! + delta[i]!);
  }

  const order = Array.from({ length: heights.length }, (_, i) => i).sort((a, b) => heights[b]! - heights[a]!);
  flow.fill(0);
  for (let i = 0; i < heights.length; i++) flow[i] = heights[i]! > 0.012 ? 1 : 0;
  for (const i of order) {
    const h = heights[i]!;
    if (h <= 0.012) continue;
    const x = i % side;
    const z = Math.floor(i / side);
    if (x <= 0 || z <= 0 || x >= side - 1 || z >= side - 1) continue;
    let low = i;
    let lowH = h;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = i + dz * side + dx;
        const nh = heights[n]!;
        if (nh < lowH) {
          low = n;
          lowH = nh;
        }
      }
    }
    if (low !== i) flow[low] += flow[i]! * 0.72;
  }
  for (let i = 0; i < heights.length; i++) {
    const channel = smoothstep(3.0, 24.0, flow[i]!);
    const h = heights[i]!;
    heights[i] = Math.max(
      0,
      h - channel * smoothstep(0.06, 0.58, h) * (1 - smoothstep(0.78, 0.94, h)) * 0.07,
    );
  }
}

/**
 * Island fields depend only on the spec and quality, so they're kept: the title's horizon builds
 * them, and the world's horizon (after New Voyage) reuses them instead of eroding them again.
 */
const islandFields = new Map<string, IslandField>();

function createIslandField(spec: IslandSpec, quality: IslandQuality): IslandField {
  const key = `${spec.name}:${fieldSideForQuality(quality)}:${quality.segments}`;
  let field = islandFields.get(key);
  if (!field) {
    field = buildIslandField(spec, quality);
    islandFields.set(key, field);
  }
  return field;
}

function buildIslandField(spec: IslandSpec, quality: IslandQuality): IslandField {
  const side = fieldSideForQuality(quality);
  const heights = new Float32Array(side * side);
  const peak = new Float32Array(side * side);
  const flow = new Float32Array(side * side);
  const canopy = new Float32Array(side * side);
  for (let z = 0; z < side; z++) {
    const nz = (z / (side - 1)) * 2.24 - 1.12;
    for (let x = 0; x < side; x++) {
      const nx = (x / (side - 1)) * 2.24 - 1.12;
      const i = z * side + x;
      const base = baseIslandHeight(spec, nx, nz);
      heights[i] = base.height;
      peak[i] = base.peak;
      const blobs = fbm2(nx * 5.6 + spec.seed * 0.01, nz * 5.6 - spec.seed * 0.01, 4, spec.seed + 801);
      const crowns = ridged2(nx * 11.0 - spec.seed * 0.02, nz * 11.0 + spec.seed * 0.02, 3, spec.seed + 811);
      canopy[i] = clamp01(0.5 + blobs * 0.62 + crowns * 0.28);
    }
  }
  erodeField(heights, flow, side, quality.segments >= 100 ? 38 : 26);
  return { side, heights, flow, peak, canopy };
}

function bilinear(field: Float32Array, side: number, x: number, z: number): number {
  const fx = clamp01((x + 1.12) / 2.24) * (side - 1);
  const fz = clamp01((z + 1.12) / 2.24) * (side - 1);
  const x0 = Math.min(side - 2, Math.floor(fx));
  const z0 = Math.min(side - 2, Math.floor(fz));
  const tx = fx - x0;
  const tz = fz - z0;
  const i = z0 * side + x0;
  const a = field[i]!;
  const b = field[i + 1]!;
  const c = field[i + side]!;
  const d = field[i + side + 1]!;
  return mixNumber(mixNumber(a, b, tx), mixNumber(c, d, tx), tz);
}

function sampleIsland(spec: IslandSpec, field: IslandField, localX: number, localZ: number): IslandSample {
  const radial = radialAt(spec, localX, localZ);
  const shore = 1 - smoothstep(0.004, 0.07, Math.abs(radial - 1.006));
  if (radial > 1) {
    const skirt = smoothstep(1, 1.095, radial);
    const lagoon = (1 - smoothstep(1.03, 1.11, radial)) * (1 - shore * 0.7);
    return {
      y: mixNumber(1.15, -4.8, skirt),
      height01: 0,
      canopy: 0,
      valley: 0,
      peak: 0,
      shore,
      wet: 1 - skirt * 0.55,
      lagoon,
    };
  }

  let h = bilinear(field.heights, field.side, localX, localZ);
  const flow = bilinear(field.flow, field.side, localX, localZ);
  const beach = smoothstep(0.86, 1.0, radial);
  const beachLift = mixNumber(3.5, 1.05, beach);
  let canopy = bilinear(field.canopy, field.side, localX, localZ);
  let titleValley = 0;
  if (spec.name === 'title-volcano') {
    const ridgeNoise = ridged2(localX * 10.5 + spec.seed, localZ * 7.0 - spec.seed, 4, spec.seed + 123);
    const spurPhase = Math.sin(
      (localX + 0.95) * 18 + fbm2(localX * 4.0, localZ * 4.0, 2, spec.seed + 131) * 2.2,
    );
    const spurs =
      Math.max(0, spurPhase) * smoothstep(0.12, 0.82, radial) * (1 - smoothstep(0.94, 1.04, radial));
    const ravineA = Math.exp(-((localX + 0.05) ** 2) / 0.006) * smoothstep(-0.38, 0.22, localZ);
    const ravineB = Math.exp(-((localX - 0.35) ** 2) / 0.009) * smoothstep(-0.28, 0.3, localZ);
    titleValley = clamp01((ravineA + ravineB) * smoothstep(0.18, 0.78, radial));
    h = Math.max(0, h + ridgeNoise * 0.055 + spurs * 0.045 - titleValley * 0.16);
    canopy = clamp01(
      canopy + fbm2(localX * 14.0 + spec.seed, localZ * 14.0 - spec.seed, 3, spec.seed + 151) * 0.28,
    );
  }
  const y = Math.max(0.22, beachLift + h * spec.height);
  const valley = clamp01(smoothstep(2.8, 26, flow) + (1 - canopy) * 0.18 + titleValley * 0.55);
  const peak = bilinear(field.peak, field.side, localX, localZ);
  return {
    y,
    height01: clamp01(y / spec.height),
    canopy,
    valley,
    peak,
    shore,
    wet: smoothstep(0.91, 1.01, radial),
    lagoon: 0,
  };
}

function appendIsland(
  spec: IslandSpec,
  specIndex: number,
  quality: IslandQuality,
  buffers: IslandBuffers,
): void {
  const field = createIslandField(spec, quality);
  const radii = ringRadii(quality.landRings);
  const ca = Math.cos(spec.angle);
  const sa = Math.sin(spec.angle);
  const stride = quality.segments + 1;
  const vertexOffset = buffers.positions.length / 3;

  for (let ri = 0; ri < radii.length; ri++) {
    const radial = radii[ri]!;
    for (let si = 0; si <= quality.segments; si++) {
      const theta = (si / quality.segments) * TAU;
      const coast = coastScale(spec, theta);
      const localX = Math.cos(theta) * radial * coast;
      const localZ = Math.sin(theta) * radial * coast;
      const lx = localX * spec.radiusX;
      const lz = localZ * spec.radiusZ;
      const x = spec.centerX + ca * lx - sa * lz;
      const z = spec.centerZ + sa * lx + ca * lz;
      const sample = sampleIsland(spec, field, localX, localZ);
      buffers.positions.push(x, sample.y, z);
      buffers.spec.push(specIndex);
      buffers.radial.push(radial);
      buffers.height01.push(sample.height01);
      buffers.canopy.push(sample.canopy);
      buffers.valley.push(sample.valley);
      buffers.peak.push(sample.peak);
      buffers.shore.push(sample.shore);
      buffers.wet.push(sample.wet);
      buffers.lagoon.push(sample.lagoon);
    }
  }

  for (let ri = 0; ri < radii.length - 1; ri++) {
    for (let si = 0; si < quality.segments; si++) {
      const a = vertexOffset + ri * stride + si;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      buffers.indices.push(a, b, c, c, b, d);
    }
  }
}

function colorForVertex(spec: IslandSpec, meta: GeometryMeta, index: number, normalY: number): Rgb {
  const radial = meta.radial[index]!;
  const height01 = meta.height01[index]!;
  const canopy = meta.canopy[index]!;
  const valley = meta.valley[index]!;
  const peak = meta.peak[index]!;
  const shore = meta.shore[index]!;
  const wet = meta.wet[index]!;
  const lagoon = meta.lagoon[index]!;
  const slope = clamp01(1 - normalY);
  const beach = smoothstep(0.83, 1.015, radial);
  const steepRock = smoothstep(0.48, 0.9, slope) * smoothstep(0.28, 0.78, height01);
  const summitStart = spec.name === 'title-volcano' ? 0.5 : spec.rockHeight;
  const highRock = smoothstep(summitStart, 0.94, height01);
  const rock = clamp01(Math.max(steepRock * 0.78, highRock + peak * 0.2) * (1 - beach * 0.9));
  const jungleLight = canopy * 0.62 + height01 * 0.22 + peak * 0.16;
  let green = mixRgb(DEEP_GREEN, MID_GREEN, jungleLight);
  green = mixRgb(green, SUN_GREEN, smoothstep(0.46, 0.92, height01) * (1 - valley) * 0.62);
  green = mixRgb(green, VALLEY_GREEN, clamp01(valley * 0.92 + (1 - canopy) * 0.3));
  const rockBase = mixRgb(OCHRE_ROCK, GREY_ROCK, clamp01(slope * 0.5 + canopy * 0.26));
  const rockColor = mixRgb(rockBase, PALE_PEAK, smoothstep(0.72, 1, height01) * 0.55);
  const summitRock = highRock * (0.58 + peak * 0.42);
  let out = mixRgb(green, rockColor, Math.max(rock * mixNumber(1, 0.62, spec.foliage), summitRock * 0.95));
  const titleBasalt =
    spec.name === 'title-volcano' ? smoothstep(0.42, 0.62, height01) * smoothstep(0.18, 0.52, peak) : 0;
  out = mixRgb(out, mixRgb(OCHRE_ROCK, PALE_PEAK, 0.46), titleBasalt * (1 - beach));
  out = mixRgb(out, rockColor, rock * (1 - spec.foliage));
  out = mixRgb(out, mixRgb(SAND, WET_SAND, wet * 0.7), beach * (1 - shore * 0.82));
  out = mixRgb(out, LAGOON, lagoon * 0.38);
  out = mixRgb(out, SURF, shore);
  return out;
}

function applyColorAttributes(geometry: BufferGeometry, buffers: IslandBuffers): void {
  const normals = geometry.getAttribute('normal').array;
  const colors: number[] = [];
  const haze: number[] = [];
  const wet: number[] = [];
  for (let i = 0; i < buffers.radial.length; i++) {
    const spec = ISLANDS[buffers.spec[i]!]!;
    pushRgb(colors, colorForVertex(spec, buffers, i, normals[i * 3 + 1] ?? 1));
    haze.push(spec.haze + smoothstep(0.78, 1.08, buffers.radial[i]!) * 0.08);
    wet.push(Math.max(buffers.wet[i]!, buffers.shore[i]!));
  }
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('islandHaze', new BufferAttribute(new Float32Array(haze), 1));
  geometry.setAttribute('islandWet', new BufferAttribute(new Float32Array(wet), 1));
}

export function createDistantRanges(tier?: Pick<TierSettings, 'tier'>): Group {
  const steps = buildDistantRanges(tier);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same horizon, an island at a time: `breathe` runs between islands. */
export async function createDistantRangesAsync(
  tier: Pick<TierSettings, 'tier'> | undefined,
  breathe: () => Promise<void>,
): Promise<Group> {
  const steps = buildDistantRanges(tier);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await breathe();
  }
}

function* buildDistantRanges(tier?: Pick<TierSettings, 'tier'>): Generator<void, Group, void> {
  const start = performance.now();
  const buffers: IslandBuffers = {
    positions: [],
    indices: [],
    spec: [],
    radial: [],
    height01: [],
    canopy: [],
    valley: [],
    peak: [],
    shore: [],
    wet: [],
    lagoon: [],
  };
  const group = new Group();
  group.name = 'distant-islands';
  for (let index = 0; index < ISLANDS.length; index++) {
    const island = ISLANDS[index]!;
    appendIsland(island, index, qualityForIsland(island, tier?.tier), buffers);
    yield;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  yield;
  applyColorAttributes(geometry, buffers);
  geometry.computeBoundingSphere();

  const mesh = new Mesh(geometry, createIslandMaterial());
  mesh.name = 'distant-islands-merged';
  mesh.frustumCulled = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.generationMs = performance.now() - start;
  group.userData.triangles = buffers.indices.length / 3;
  group.userData.vertices = buffers.positions.length / 3;
  return group;
}
