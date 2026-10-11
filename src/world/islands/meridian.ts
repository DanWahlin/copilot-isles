import { sharedInstancedMesh } from '../../engine/instancing';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import type { HeightField } from '../contracts';
import { fbm2, ridged2 } from '../terrain/cove-height';
import { ROCK_ASSETS } from '../terrain/rock-assets';
import { meshCameraBlockers, type CameraBlockerBox } from '../terrain/camera-blockers';
import { createRockMaterial } from '../terrain/terrain-material';
import { clamp01, segmentDistance, smoothstep } from '../../util/math';
import { createMeridianWater, type MeridianWater } from './meridian-water';

/**
 * Port Meridian (Chapter 01), layout v2: a compact harbour town that faces south-west into the
 * evening sun. A walled basin opens south-east past the lighthouse. The quay promenade runs along its
 * north side with the plaza a step up behind it, the tavern and shipyard lie to the west, and your
 * ship berths on the east arm, bow out toward the mouth. A cliff lift climbs from the arm to the
 * citadel bluff, with the ridge rising behind. The walking loop runs berth → stair street → plaza
 * → tavern → shipyard → promenade → berth → lift, with no doubling back.
 */
export const MERIDIAN = {
  center: { x: 850, z: -850 },
  bounds: { minX: 470, maxX: 1230, minZ: -1130, maxZ: -570, cell: 2 },
  island: { halfX: 350, halfZ: 225 },
  harbor: {
    center: { x: 668, z: -692 },
    radiusX: 96,
    radiusZ: 66,
    depth: 6.5,
    /** The north quay promenade; its face (the water's edge) runs along z1. */
    quay: { x0: 586, x1: 772, z0: -772, z1: -752, height: 2.4 },
    /** The east arm; its face (the water's edge) runs along x0. */
    eastArm: { x0: 752, x1: 774, z0: -772, z1: -650, height: 2.4 },
    /** Your ship alongside the east arm: port side to the quay, bow south toward the mouth. */
    berth: { x: 747.35, z: -700, heading: 0 },
    /** Where you step ashore beside the gangway, facing up the arm toward the town. */
    landing: { x: 755.2, z: -704, heading: Math.PI },
  },
  mole: {
    start: { x: 578, z: -708 },
    end: { x: 690, z: -620 },
    width: 9,
    height: 2.5,
    lighthouse: { x: 697, z: -614, height: 5.5, radius: 10 },
  },
  pads: {
    plaza: { x: 668, z: -796, height: 7, radius: 30 },
    tavern: { x: 622, z: -796, height: 7, radius: 11 },
    shipyard: { x: 586, z: -752, height: 2.4, radius: 11 },
    citadel: { x: 816, z: -786, height: 40, radius: 30 },
  },
  ridge: { center: { x: 1090, z: -1075 }, halfX: 185, halfZ: 82, height: 148 },
  /** House rows stepping up the hill behind the plaza. */
  terraces: [
    { ax: 586, az: -840, bx: 758, bz: -840, height: 10.8, width: 8 },
    { ax: 592, az: -862, bx: 780, bz: -862, height: 14.2, width: 8 },
    { ax: 604, az: -884, bx: 792, bz: -884, height: 17.8, width: 8 },
    { ax: 620, az: -906, bx: 804, bz: -906, height: 21.4, width: 8 },
    { ax: 650, az: -928, bx: 812, bz: -928, height: 25.0, width: 8 },
    { ax: 700, az: -948, bx: 812, bz: -948, height: 28.6, width: 7 },
  ],
  seaCaves: [
    { x: 1130, z: -930, radius: 18 },
    { x: 1186, z: -1010, radius: 22 },
  ],
  seabedRadius: 1050,
  deepDepth: 58,
} as const;

const SEED = 0x1_01a_d1a;

/**
 * The quay promenade and east arm as a level stone deck (walkable right to the water's edge, where
 * the terrain's own step is hidden behind the quay wall), or null off them.
 */
export function meridianQuayHeight(x: number, z: number): number | null {
  const { quay, eastArm } = MERIDIAN.harbor;
  const on = (b: { x0: number; x1: number; z0: number; z1: number }) =>
    x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  return on(quay) || on(eastArm) ? quay.height : null;
}

function rand(seed: number): number {
  const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function ellipseDistance(
  x: number,
  z: number,
): { distance: number; radial: number; theta: number; radius: number } {
  const dx = x - MERIDIAN.center.x;
  const dz = z - MERIDIAN.center.z;
  const theta = Math.atan2(dz, dx);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const radius =
    1 /
    Math.sqrt(
      (c * c) / (MERIDIAN.island.halfX * MERIDIAN.island.halfX) +
        (s * s) / (MERIDIAN.island.halfZ * MERIDIAN.island.halfZ),
    );
  const harborBite = -72 * Math.exp(-((theta - Math.PI * 0.72) ** 2) / 0.18);
  const headland = 44 * Math.exp(-((theta + 0.65) ** 2) / 0.22);
  const noise =
    fbm2(c * 3.1 + 1.7, s * 3.1 - 5.4, 5, SEED) * 12 + fbm2(x * 0.022, z * 0.022, 3, SEED + 1) * 4;
  const r = radius + harborBite + headland + noise;
  const radial = Math.hypot(dx, dz);
  return { distance: r - radial, radial, theta, radius: r };
}

function padHeight(
  x: number,
  z: number,
  current: number,
  pad: { x: number; z: number; height: number; radius: number },
  edge = 18,
): number {
  const d = Math.hypot(x - pad.x, z - pad.z);
  return mix(current, pad.height, 1 - smoothstep(pad.radius, pad.radius + edge, d));
}

function roadMask(x: number, z: number): number {
  const { pads, harbor } = MERIDIAN;
  const armTop = { x: (harbor.eastArm.x0 + harbor.eastArm.x1) / 2, z: harbor.eastArm.z0 + 4 };
  const segments = [
    [armTop, pads.plaza],
    [pads.plaza, pads.tavern],
    [pads.tavern, pads.shipyard],
  ] as const;
  let mask = 0;
  for (const [a, b] of segments)
    mask = Math.max(mask, 1 - smoothstep(3.5, 8, segmentDistance(x, z, a.x, a.z, b.x, b.z)));
  return mask;
}

/**
 * 1 on a block's deck, falling to 0 across `edge` metres just inside its edges, so a quay face
 * drops straight into deep water (stone walls cover the step).
 */
function blockMask(
  x: number,
  z: number,
  b: { x0: number; x1: number; z0: number; z1: number },
  edge = 1.2,
): number {
  return (
    smoothstep(b.x0, b.x0 + edge, x) *
    (1 - smoothstep(b.x1 - edge, b.x1, x)) *
    smoothstep(b.z0, b.z0 + edge, z) *
    (1 - smoothstep(b.z1 - edge, b.z1, z))
  );
}

function terraceHeight(x: number, z: number, current: number): number {
  let out = current;
  for (const terrace of MERIDIAN.terraces) {
    const d = segmentDistance(x, z, terrace.ax, terrace.az, terrace.bx, terrace.bz);
    const shelf = 1 - smoothstep(terrace.width, terrace.width + 12, d);
    const shoulder = 1 - smoothstep(terrace.width + 12, terrace.width + 38, d);
    out = mix(out, terrace.height, shelf * 0.93);
    out = mix(out, Math.min(out, terrace.height + 7.5), shoulder * 0.16);
    // On the shelf itself the ground sits just under the lane's paving (none of the hill shows through).
    out = mix(
      out,
      Math.min(out, terrace.height - 0.3),
      1 - smoothstep(terrace.width, terrace.width + 2.5, d),
    );
  }
  return out;
}

function harborHeight(x: number, z: number, current: number): number {
  const h = MERIDIAN.harbor;
  const dx = (x - h.center.x) / h.radiusX;
  const dz = (z - h.center.z) / h.radiusZ;
  const basin = 1 - smoothstep(0.78, 1.08, Math.hypot(dx, dz));
  const floor = -h.depth + fbm2(x * 0.05, z * 0.05, 3, SEED + 20) * 0.12;
  let out = mix(current, floor, basin);
  // Dredged berths along both quay faces, so ships can lie alongside at any point. The feather sits
  // inside the decks (under the paving and the face walls), so the full depth reaches each face and
  // no bank of the natural shore is left standing in the inner corner.
  const q = h.quay,
    arm = h.eastArm;
  const alongQuay = blockMask(x, z, { x0: q.x0 + 6, x1: arm.x0 + 8, z0: q.z1 - 8, z1: q.z1 + 22 }, 8);
  const alongArm = blockMask(x, z, { x0: arm.x0 - 22, x1: arm.x0 + 8, z0: q.z1 - 8, z1: arm.z1 + 8 }, 8);
  out = mix(out, Math.min(out, floor), Math.max(alongQuay, alongArm));
  out = mix(out, h.quay.height, blockMask(x, z, h.quay));
  out = mix(out, h.eastArm.height, blockMask(x, z, h.eastArm));
  const mole =
    1 -
    smoothstep(
      MERIDIAN.mole.width - 1,
      MERIDIAN.mole.width + 9,
      segmentDistance(
        x,
        z,
        MERIDIAN.mole.start.x,
        MERIDIAN.mole.start.z,
        MERIDIAN.mole.end.x,
        MERIDIAN.mole.end.z,
      ),
    );
  out = mix(out, MERIDIAN.mole.height, mole);
  out = padHeight(x, z, out, { ...MERIDIAN.mole.lighthouse, height: MERIDIAN.mole.height }, 8);
  return out;
}

/**
 * The town hillside: from the back of the quay the ground climbs steadily north (about 1 in 6)
 * through the plaza and the house terraces, fading into the natural hill behind the town.
 */
function townHeight(x: number, z: number, current: number): number {
  const q = MERIDIAN.harbor.quay;
  const back = q.z0 - z;
  if (back < -1) return current;
  const ramp = q.height + Math.max(0, back) * 0.165 + fbm2(x * 0.04, z * 0.04, 3, SEED + 40) * 0.35;
  const w =
    smoothstep(q.x0 - 34, q.x0 - 6, x) *
    (1 - smoothstep(q.x1 + 12, q.x1 + 34, x)) *
    smoothstep(-1, 0.5, back) *
    (1 - smoothstep(176, 216, back));
  return mix(current, ramp, w);
}

function stairStreetTerrainHeight(x: number, z: number, current: number): number {
  const dx = Math.abs(x - MERIDIAN.pads.plaza.x);
  // Under the stair street the ramp starts at the quay's back edge, like the treads, so it stays
  // under them and the quay paving. Beside the street it keeps its start 2 m further in, so the
  // banks either side don't move.
  const z0 = MERIDIAN.harbor.quay.z0 + 2 * smoothstep(4.8, 6, dx);
  const z1 = MERIDIAN.pads.plaza.z;
  if (z > z0 || z < z1) return current;
  const t = clamp01((z0 - z) / (z0 - z1));
  const ramp = MERIDIAN.harbor.quay.height + (MERIDIAN.pads.plaza.height - MERIDIAN.harbor.quay.height) * t;
  const mask = 1 - smoothstep(5.8, 10, dx);
  return mix(current, ramp, mask);
}

/**
 * The citadel bluff: a sheer face over the east arm (where the cliff lift climbs) that runs back
 * into the hill toward the north-east instead of standing alone.
 */
function citadelHeight(x: number, z: number, current: number): number {
  const c = MERIDIAN.pads.citadel;
  const dx = x - c.x,
    dz = z - c.z;
  const d = Math.hypot(dx, dz);
  const inland = d > 0 ? (dx * 0.707 - dz * 0.707) / d : 0;
  const edge = 7 + 105 * smoothstep(0.02, 0.88, inland);
  // A craggy outline rather than a drum: the rim wanders by a few metres around the bluff.
  const a = Math.atan2(dz, dx);
  const lobes = Math.sin(a * 3.0 + 0.7) * 4.2 + Math.sin(a * 5.0 - 1.1) * 2.8;
  const buttress = Math.max(0, Math.cos(a + 0.34)) * 6.5 + Math.max(0, Math.cos(a - 2.25)) * 4.5;
  const rim =
    c.radius + lobes + buttress + fbm2(Math.cos(a) * 1.9 + 3.1, Math.sin(a) * 1.9 - 2.2, 4, SEED + 50) * 6.5;
  const top = c.height + fbm2(x * 0.05, z * 0.05, 3, SEED + 51) * 0.6;
  return mix(current, top, 1 - smoothstep(rim, rim + edge, d));
}

const LIFT_CLEARANCE = {
  bottom: { x: 770.3, y: 2.4, z: -766.8 },
  top: { x: 798.2, y: 40.35, z: -779.2 },
  core: 4.25,
  feather: 7.5,
} as const;

function liftClearanceHeight(x: number, z: number, current: number): number {
  const dx = LIFT_CLEARANCE.top.x - LIFT_CLEARANCE.bottom.x;
  const dz = LIFT_CLEARANCE.top.z - LIFT_CLEARANCE.bottom.z;
  const len2 = dx * dx + dz * dz;
  const t = clamp01(((x - LIFT_CLEARANCE.bottom.x) * dx + (z - LIFT_CLEARANCE.bottom.z) * dz) / len2);
  const px = LIFT_CLEARANCE.bottom.x + dx * t;
  const pz = LIFT_CLEARANCE.bottom.z + dz * t;
  const lateral = Math.hypot(x - px, z - pz);
  const cut = 1 - smoothstep(LIFT_CLEARANCE.core, LIFT_CLEARANCE.feather, lateral);
  if (cut <= 0) return current;
  const carY = mix(LIFT_CLEARANCE.bottom.y, LIFT_CLEARANCE.top.y, t);
  const target = carY - 0.65 - smoothstep(0.12, 0.62, t) * 0.35;
  return mix(current, Math.min(current, target), cut);
}

function ridgeHeight(x: number, z: number, current: number): number {
  const dx = (x - MERIDIAN.ridge.center.x) / MERIDIAN.ridge.halfX;
  const dz = (z - MERIDIAN.ridge.center.z) / MERIDIAN.ridge.halfZ;
  const ridge = Math.exp(-(dx * dx + dz * dz));
  const flutes = Math.abs(Math.sin((z + x * 0.35) * 0.055 + fbm2(x * 0.018, z * 0.018, 3, SEED + 30) * 2.8));
  const cliff = MERIDIAN.ridge.height * ridge + flutes * 13 * smoothstep(0.22, 0.72, ridge);
  // Only the ridge itself lifts the ground; far from it (the harbour) the sea floor stays put.
  let out = mix(current, Math.max(current, cliff), smoothstep(0.004, 0.05, ridge));
  for (const cave of MERIDIAN.seaCaves) {
    const d = Math.hypot(x - cave.x, z - cave.z);
    const mouth =
      (1 - smoothstep(cave.radius, cave.radius * 1.6, d)) *
      smoothstep(-2, 10, out) *
      (1 - smoothstep(12, 26, out));
    out = mix(out, -0.8 + Math.abs(z - cave.z) * 0.09, mouth * 0.9);
  }
  return out;
}

/** The island before its fresh water is carved in (the water's levels are taken from it). */
export function meridianHeightDry(x: number, z: number): number {
  const coast = ellipseDistance(x, z);
  const offshore = Math.max(0, -coast.distance);
  const seaT = smoothstep(20, 145, offshore);
  const sea =
    -mix(0.55, MERIDIAN.deepDepth, seaT) + fbm2(x * 0.012, z * 0.012, 4, SEED + 3) * 0.35 * (1 - seaT);
  const interior = smoothstep(-2, 92, coast.distance);
  const hillBias = smoothstep(-80, 210, x - MERIDIAN.center.x) * smoothstep(95, -190, z - MERIDIAN.center.z);
  const land =
    2.2 +
    interior * 10 +
    hillBias * 42 +
    fbm2(x * 0.026, z * 0.026, 5, SEED + 4) * 2.6 +
    ridged2(x * 0.052, z * 0.052, 4, SEED + 5) * 3.2;
  let h =
    coast.distance >= 0 ? mix(-0.25 + coast.distance * 0.07, land, smoothstep(18, 96, coast.distance)) : sea;
  h = harborHeight(x, z, h);
  h = townHeight(x, z, h);
  h = terraceHeight(x, z, h);
  for (const pad of Object.values(MERIDIAN.pads)) {
    if (pad === MERIDIAN.pads.citadel) continue;
    h = padHeight(x, z, h, pad, 8);
  }
  h = citadelHeight(x, z, h);
  h = stairStreetTerrainHeight(x, z, h);
  const basinCore = Math.hypot(
    (x - MERIDIAN.harbor.center.x) / MERIDIAN.harbor.radiusX,
    (z - MERIDIAN.harbor.center.z) / MERIDIAN.harbor.radiusZ,
  );
  const onHarborPad =
    Object.values(MERIDIAN.pads).some((pad) => Math.hypot(x - pad.x, z - pad.z) < pad.radius + 5) ||
    blockMask(x, z, MERIDIAN.harbor.quay) > 0 ||
    blockMask(x, z, MERIDIAN.harbor.eastArm) > 0;
  if (basinCore < 0.58 && !onHarborPad)
    h = Math.min(h, -MERIDIAN.harbor.depth + fbm2(x * 0.05, z * 0.05, 3, SEED + 20) * 0.12);
  const ridgeFoot = Math.exp(
    -(
      ((x - MERIDIAN.ridge.center.x) / MERIDIAN.ridge.halfX) ** 2 +
      ((z - MERIDIAN.ridge.center.z) / MERIDIAN.ridge.halfZ) ** 2
    ),
  );
  const ridgeBlend = Math.max(smoothstep(-12, 22, coast.distance), smoothstep(0.08, 0.25, ridgeFoot));
  h = mix(h, ridgeHeight(x, z, h), ridgeBlend);
  h = liftClearanceHeight(x, z, h);
  // Last, the ground under the quay and east-arm paving (edges included) stays inside the slab:
  // the plaza pad's feather, the town ramp and the hill behind would otherwise rise through it.
  if (meridianQuayHeight(x, z) !== null) h = Math.min(h, MERIDIAN.harbor.quay.height);
  if (coast.radial > MERIDIAN.seabedRadius) h = Math.min(h, -MERIDIAN.deepDepth);
  return h;
}

let water: MeridianWater | null = null;

/** The tarn, cascade, brook, lake and outflow (built on first use from the dry island). */
export function meridianWater(): MeridianWater {
  return (water ??= createMeridianWater(meridianHeightDry));
}

export function meridianHeight(x: number, z: number): number {
  return meridianWater().carve(x, z, meridianHeightDry(x, z));
}

function meridianNormalAt(
  x: number,
  z: number,
  out: Float32Array | number[] = [0, 0, 0],
): Float32Array | number[] {
  const e = 1.5;
  const nx = -(meridianHeight(x + e, z) - meridianHeight(x - e, z)) / (2 * e);
  const nz = -(meridianHeight(x, z + e) - meridianHeight(x, z - e)) / (2 * e);
  const len = Math.hypot(nx, 1, nz) || 1;
  out[0] = nx / len;
  out[1] = 1 / len;
  out[2] = nz / len;
  return out;
}

export function meridianMasks(
  x: number,
  z: number,
): { sand: number; grass: number; rock: number; cliff: number } {
  const h = meridianHeight(x, z);
  const n = meridianNormalAt(x, z, [0, 0, 0]);
  const slope = Math.hypot(n[0], n[2]) / Math.max(0.05, n[1]);
  const coast = ellipseDistance(x, z);
  const shore = smoothstep(-7, -1.2, h) * (1 - smoothstep(2.2, 5, h));
  const harbor =
    1 -
    smoothstep(
      0.8,
      1.15,
      Math.hypot(
        (x - MERIDIAN.harbor.center.x) / MERIDIAN.harbor.radiusX,
        (z - MERIDIAN.harbor.center.z) / MERIDIAN.harbor.radiusZ,
      ),
    );
  const moleDist = segmentDistance(
    x,
    z,
    MERIDIAN.mole.start.x,
    MERIDIAN.mole.start.z,
    MERIDIAN.mole.end.x,
    MERIDIAN.mole.end.z,
  );
  const moleTop = 1 - smoothstep(MERIDIAN.mole.width + 1, MERIDIAN.mole.width + 6, moleDist);
  const moleEdge = smoothstep(MERIDIAN.mole.width - 3, MERIDIAN.mole.width + 7, moleDist);
  const beach = shore * (1 - smoothstep(10, 32, coast.distance)) * (1 - smoothstep(0.38, 0.78, slope));
  let sand = Math.max(beach, harbor * shore * 0.36) * (1 - moleTop * 0.95);
  let cliff = Math.max(smoothstep(0.5, 1.1, slope), smoothstep(72, 118, h) * smoothstep(0.25, 0.56, slope));
  let rock = Math.max(
    smoothstep(0.24, 0.7, slope),
    smoothstep(35, 95, h) * 0.35,
    shore * (1 - sand) * 0.55,
    smoothstep(2, 24, h) * (1 - smoothstep(0.18, 0.45, slope)) * 0.18,
    moleTop * (0.62 + moleEdge * 0.22),
  );
  let grass = smoothstep(2, 16, h) * (1 - smoothstep(0.24, 0.55, slope)) * (1 - roadMask(x, z) * 0.6);
  const terrace = smoothstep(6, 65, h) * (1 - smoothstep(95, 130, h)) * smoothstep(-18, 115, coast.distance);
  grass = Math.max(grass, terrace * 0.48);
  const townFootprint =
    smoothstep(560, 582, x) *
    (1 - smoothstep(822, 842, x)) *
    smoothstep(-978, -964, z) *
    (1 - smoothstep(-762, -748, z)) *
    smoothstep(1.2, 4.5, h);
  const lighthousePlatform =
    (1 -
      smoothstep(
        MERIDIAN.mole.lighthouse.radius + 1,
        MERIDIAN.mole.lighthouse.radius + 7,
        Math.hypot(x - MERIDIAN.mole.lighthouse.x, z - MERIDIAN.mole.lighthouse.z),
      )) *
    smoothstep(1.5, 3.2, h);
  // Fresh water: a pebbly bed and wet stone in the channels, green banks round them.
  const shoreDist = meridianWater().shoreDistance(x, z, 12);
  if (shoreDist < 12) {
    const wet = 1 - smoothstep(0, 1.2, shoreDist);
    const bank = (1 - smoothstep(1, 9, shoreDist)) * (1 - wet) * (1 - smoothstep(0.5, 1.2, slope));
    rock = Math.max(rock, wet * 0.7);
    sand = Math.max(sand * (1 - bank), wet * 0.35);
    grass = Math.max(grass, bank * 0.9);
  }
  // The town's open ground: gardens and green verges, with trodden earth between.
  const garden = smoothstep(0.42, 0.62, fbm2(x * 0.045, z * 0.045, 3, SEED + 60) * 0.5 + 0.5);
  grass =
    Math.max(grass * (1 - townFootprint * 0.98), townFootprint * garden * 0.85) * (1 - lighthousePlatform);
  sand = Math.max(sand, townFootprint * 0.68 * (1 - garden * 0.85), lighthousePlatform * 0.38);
  rock = Math.max(rock, lighthousePlatform * 0.46);
  if (h < -8) rock = Math.max(rock, 0.16);
  cliff = clamp01(cliff);
  rock = clamp01(rock * (1 - cliff * 0.28));
  sand = clamp01(sand * (1 - cliff * 0.75));
  grass = clamp01(grass * (1 - cliff) * (1 - sand * 0.45));
  const total = sand + grass + rock + cliff;
  if (total < 0.001) return { sand: 0.2, grass: 0, rock: 0.8, cliff: 0 };
  return { sand: sand / total, grass: grass / total, rock: rock / total, cliff: cliff / total };
}

export function createMeridianSilhouette(): Group {
  const group = new Group();
  group.name = 'meridian-silhouette';
  const positions: number[] = [];
  const indices: number[] = [];
  const alongSegments = 96;
  const depthSegments = 12;
  const angle = -0.5;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);

  for (let i = 0; i <= alongSegments; i++) {
    const u = i / alongSegments;
    const along = (u - 0.5) * 500;
    const peakA = Math.exp(-((u - 0.36) ** 2) / 0.006) * 34;
    const peakB = Math.exp(-((u - 0.53) ** 2) / 0.012) * 46;
    const peakC = Math.exp(-((u - 0.69) ** 2) / 0.01) * 28;
    const ridge = 9 + peakA + peakB + peakC + Math.sin(u * Math.PI * 5.5) * 3;
    const width = 190 + Math.sin(u * Math.PI) * 64;
    for (let j = 0; j <= depthSegments; j++) {
      const v = j / depthSegments;
      const depth = (v - 0.25) * width;
      const backSlope = smoothstep(0.5, 0.94, v);
      const crown = Math.sin(Math.PI * Math.min(1, v * 0.82 + 0.18));
      const y = -5.2 + ridge * backSlope * Math.pow(Math.max(0, crown), 0.65) - (1 - backSlope) * 4.2;
      const x = MERIDIAN.center.x + ca * along - sa * depth;
      const z = MERIDIAN.center.z + sa * along + ca * depth;
      positions.push(x, y, z);
    }
  }

  const stride = depthSegments + 1;
  for (let i = 0; i < alongSegments; i++) {
    for (let j = 0; j < depthSegments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new MeshBasicNodeMaterial({
    color: 0x8ba5a4,
    depthWrite: true,
    side: DoubleSide,
  });
  material.fog = true;
  const mesh = new Mesh(geometry, material);
  mesh.name = 'meridian-silhouette-mesh';
  group.add(mesh);
  return group;
}

const rockEuler = new Euler();
const rockRotation = new Quaternion();
const rockPosition = new Vector3();
const rockScale = new Vector3();
const rockNormal = new Float32Array(3);
const ROCK_MOLE_COUNT = 14;
const ROCK_COAST_COUNT = 20;

/** Where coastal rock `i` of asset `assetIndex` sits (scaled to nothing where it would be in fresh water). */
function meridianRockMatrix(
  assetIndex: number,
  i: number,
  heightField: HeightField,
  matrix: Matrix4,
): Matrix4 {
  const moleCount = ROCK_MOLE_COUNT;
  const normal = rockNormal,
    euler = rockEuler,
    rotation = rockRotation,
    scale = rockScale,
    position = rockPosition;
  const seed = 100 + assetIndex * 97 + i * 11;
  let x: number;
  let z: number;
  let s: number;
  if (i < moleCount) {
    const t = (i + assetIndex / 3) / (moleCount - 1);
    const dx = MERIDIAN.mole.end.x - MERIDIAN.mole.start.x;
    const dz = MERIDIAN.mole.end.z - MERIDIAN.mole.start.z;
    const len = Math.hypot(dx, dz) || 1;
    const sx = dz / len;
    const sz = -dx / len;
    const offset = MERIDIAN.mole.width * 0.78 + rand(seed + 1) * 8;
    x = MERIDIAN.mole.start.x + dx * t + sx * offset + (rand(seed + 2) - 0.5) * 3.5;
    z = MERIDIAN.mole.start.z + dz * t + sz * offset + (rand(seed + 3) - 0.5) * 3.5;
    s = 2.9 + rand(seed + 4) * 4.9;
  } else {
    const j = i - moleCount;
    const a = -0.92 + rand(seed) * 1.25;
    const r = 265 + rand(seed + 1) * 80;
    x = MERIDIAN.center.x + Math.cos(a) * r;
    z = MERIDIAN.center.z + Math.sin(a) * r;
    s = 4 + rand(seed + j + 2) * 8;
  }
  heightField.normalAt(x, z, normal);
  const yaw = rand(seed + 6) * Math.PI * 2;
  euler.set((rand(seed + 7) - 0.5) * 0.2, yaw, (rand(seed + 8) - 0.5) * 0.24, 'YXZ');
  rotation.setFromEuler(euler);
  scale.set(s * (1.2 + rand(seed + 3)), s * (0.55 + rand(seed + 4) * 0.65), s * (0.9 + rand(seed + 5)));
  // None in the fresh water (the cascade's gully, the brook, the lake).
  if (meridianWater().shoreDistance(x, z, 30) < s * 1.4 + 2) scale.setScalar(0);
  position.set(
    x - normal[0] * s * 0.28,
    heightField.heightAt(x, z) - normal[1] * s * 0.28 - 1.1,
    z - normal[2] * s * 0.28,
  );
  return matrix.compose(position, rotation, scale);
}

/** Camera-only blockers for the coastal rocks (the follow camera keeps out of them; walkers don't see them). */
export function meridianRockCameraBlockers(heightField: HeightField): CameraBlockerBox[] {
  const out: CameraBlockerBox[] = [];
  const matrix = new Matrix4();
  for (let assetIndex = 0; assetIndex < 3; assetIndex++)
    for (let i = 0; i < ROCK_MOLE_COUNT + ROCK_COAST_COUNT; i++) {
      meridianRockMatrix(assetIndex, i, heightField, matrix);
      if (rockScale.x > 0) meshCameraBlockers(ROCK_ASSETS[assetIndex].positions, matrix, out);
    }
  return out;
}

export function createMeridianRocks(heightField: HeightField): Group {
  const group = new Group();
  group.name = 'meridian-coastal-rocks';
  const material = createRockMaterial();
  const matrix = new Matrix4();
  for (let assetIndex = 0; assetIndex < 3; assetIndex++) {
    const asset = ROCK_ASSETS[assetIndex];
    const instances = ROCK_MOLE_COUNT + ROCK_COAST_COUNT;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(asset.normals, 3));
    geometry.setIndex(new BufferAttribute(asset.indices, 1));
    const mesh = sharedInstancedMesh(geometry, material, instances);
    mesh.name = `meridian-rocks-${asset.key}`;
    for (let i = 0; i < instances; i++)
      mesh.setMatrixAt(i, meridianRockMatrix(assetIndex, i, heightField, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
