import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import type { HeightField } from '../contracts';
import { fbm2, ridged2 } from '../terrain/cove-height';
import { ROCK_ASSETS } from '../terrain/rock-assets';
import { createRockMaterial } from '../terrain/terrain-material';
import { clamp01, smoothstep } from '../../util/math';

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
    plaza: { x: 668, z: -796, height: 7, radius: 18 },
    tavern: { x: 622, z: -796, height: 7, radius: 11 },
    shipyard: { x: 586, z: -752, height: 2.4, radius: 11 },
    citadel: { x: 816, z: -786, height: 40, radius: 30 },
  },
  ridge: { center: { x: 1090, z: -1075 }, halfX: 185, halfZ: 82, height: 148 },
  /** House rows stepping up the hill behind the plaza. */
  terraces: [
    { ax: 596, az: -832, bx: 742, bz: -834, height: 13, width: 7 },
    { ax: 602, az: -854, bx: 752, bz: -858, height: 16.7, width: 7 },
    { ax: 612, az: -876, bx: 768, bz: -882, height: 20.4, width: 7 },
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

function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp01(((x - ax) * dx + (z - az) * dz) / Math.max(1e-6, dx * dx + dz * dz));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
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
    out = mix(out, terrace.height, shelf * 0.62);
    out = mix(out, Math.min(out, terrace.height + 8.5), shoulder * 0.1);
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
  // Dredged berths along both quay faces, so ships can lie alongside at any point.
  const q = h.quay,
    arm = h.eastArm;
  const alongQuay = blockMask(x, z, { x0: q.x0 + 6, x1: arm.x0 + 1, z0: q.z1 - 1, z1: q.z1 + 22 }, 8);
  const alongArm = blockMask(x, z, { x0: arm.x0 - 22, x1: arm.x0 + 1, z0: q.z1 - 1, z1: arm.z1 + 8 }, 8);
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
  out = padHeight(x, z, out, MERIDIAN.mole.lighthouse, 8);
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
    (1 - smoothstep(q.x1 + 4, q.x1 + 20, x)) *
    smoothstep(-1, 0.5, back) *
    (1 - smoothstep(118, 160, back));
  return mix(current, ramp, w);
}

function stairStreetTerrainHeight(x: number, z: number, current: number): number {
  const x0 = MERIDIAN.pads.plaza.x;
  const z0 = MERIDIAN.harbor.quay.z0 + 2;
  const z1 = MERIDIAN.pads.plaza.z;
  if (z > z0 || z < z1) return current;
  const t = clamp01((z0 - z) / (z0 - z1));
  const ramp = MERIDIAN.harbor.quay.height + (MERIDIAN.pads.plaza.height - MERIDIAN.harbor.quay.height) * t;
  const mask = 1 - smoothstep(5.8, 10, Math.abs(x - x0));
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
  const edge = 9 + 90 * smoothstep(0.05, 0.85, inland);
  // A craggy outline rather than a drum: the rim wanders by a few metres around the bluff.
  const a = Math.atan2(dz, dx);
  const rim = c.radius + fbm2(Math.cos(a) * 1.6 + 3.1, Math.sin(a) * 1.6 - 2.2, 4, SEED + 50) * 9;
  const top = c.height + fbm2(x * 0.05, z * 0.05, 3, SEED + 51) * 0.6;
  return mix(current, top, 1 - smoothstep(rim, rim + edge, d));
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

export function meridianHeight(x: number, z: number): number {
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
  if (coast.radial > MERIDIAN.seabedRadius) h = Math.min(h, -MERIDIAN.deepDepth);
  return h;
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

export function createMeridianRocks(heightField: HeightField): Group {
  const group = new Group();
  group.name = 'meridian-coastal-rocks';
  const material = createRockMaterial();
  const matrix = new Matrix4();
  const euler = new Euler();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const normal = new Float32Array(3);
  for (let assetIndex = 0; assetIndex < 3; assetIndex++) {
    const asset = ROCK_ASSETS[assetIndex];
    const moleCount = 14;
    const coastCount = 20;
    const instances = moleCount + coastCount;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(asset.normals, 3));
    geometry.setIndex(new BufferAttribute(asset.indices, 1));
    const mesh = new InstancedMesh(geometry, material, instances);
    mesh.name = `meridian-rocks-${asset.key}`;
    for (let i = 0; i < instances; i++) {
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
      position.set(
        x - normal[0] * s * 0.28,
        heightField.heightAt(x, z) - normal[1] * s * 0.28 - 1.1,
        z - normal[2] * s * 0.28,
      );
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
