import { Mesh, type BufferGeometry, type Vector3 } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CircleObstacle, Tier } from '../../contracts';
import { meshCameraBlockers, type CameraBlockerBox } from '../../terrain/camera-blockers';
import {
  PORT_Z,
  createWreckMaterial,
  wreckGeometrySteps,
  wreckObstacles,
  wreckWaterline,
  type WreckDesign,
} from '../../wreck/wreck';
import { WreckFrame, type WreckPose } from '../../wreck/frame';
import { box, cone, lanternPaint, rod, rope, type Buckets } from '../../village/pieces';
import {
  BRIGANTINE_HALF_LENGTH,
  deckHeightAt,
  halfBeamAt,
  keelHeightAt,
  sheerHeightAt,
} from '../../ship/lines';
import { keelhavenHeight } from './height';
import { FRAME, toWorld } from './layout';
import { YARD_PAINT, type ShipyardOut } from './shipyard';

/**
 * Keelhaven's wrecks (spec §3.6, §3.8, in the merged cove frame): three hulls that sailed without
 * proof, on the reef outside the North Head under the Gate Light (one on her side with her masts
 * gone, one run up bow-first onto the reef's crest with her two masts still standing, one broken in
 * two with her stern awash), and the Old Hulk, an old hull hauled out between the yard and the Keel
 * River, upright on blocks (a lodging now: her dressing is the shipyard's, `hulkDressing`). All from
 * the shared wreck builder, merged into one mesh with one look (the ship's material: no new shader).
 */

/** A heading (the ship's yaw) whose bow points along cove-frame direction (du, dv). */
function headingTo(du: number, dv: number): number {
  const dx = du * FRAME.axis.x + dv * FRAME.across.x;
  const dz = du * FRAME.axis.z + dv * FRAME.across.z;
  return Math.atan2(dx, dz);
}

/** A pose at cove-frame (u, v), bow toward (du, dv), its waterline origin at `y`. */
function pose(
  u: number,
  v: number,
  y: number,
  du: number,
  dv: number,
  pitch: number,
  heel: number,
): WreckPose {
  const p = toWorld(u, v);
  return { x: p.x, y, z: p.z, heading: headingTo(du, dv), pitch, heel };
}

const ALL_PORTS = PORT_Z.flatMap((z) => [[1, z] as const, [-1, z] as const]);

/**
 * The designs. Each one's `y` beds her keel (or her low side) about 0.4 m into the reef (the broken
 * stern deeper, awash); the Old Hulk's keeps her 0.6 m over the ground, on her blocks
 * (`wrecks.test.ts` checks them).
 */
export const KEELHAVEN_WRECKS: readonly WreckDesign[] = [
  {
    // On her side on the reef flat, masts gone, her deck to the sea.
    name: 'kh-wreck-side',
    pose: pose(-300, -188, 1.99, 0.8, -0.6, 0.05, 1.22),
    holes: [
      { side: -1, z: 1.0, y: 0.2, rz: 2.4, ry: 1.1 },
      { side: -1, z: -6.5, y: 0.8, rz: 1.2, ry: 0.6 },
      { side: 1, z: 4.5, y: 1.0, rz: 1.0, ry: 0.5 },
      { side: -1, z: 6.0, y: 1.6, rz: 1.1, ry: 0.12, slit: true },
    ],
    railKept: [{ side: -1, z0: -4, z1: 2 }],
    hatch: { z0: 2.3, z1: 4.0, x: 0.85 },
    keptLids: [[-1, 2.6]],
    lostGuns: ALL_PORTS,
    rig: { stumps: [2.2, 0.9, 0] },
  },
  {
    // Run up bow-first onto the reef's crest, heeled a little, her two masts still standing.
    name: 'kh-wreck-crest',
    pose: pose(-345, -150, 2.3, 0.3, -1, -0.2, -0.32),
    holes: [
      { side: -1, z: 3.0, y: -0.2, rz: 1.8, ry: 0.9 },
      { side: 1, z: -5.0, y: 0.6, rz: 1.1, ry: 0.6 },
      { side: 1, z: 1.2, y: 1.8, rz: 1.2, ry: 0.13, slit: true },
    ],
    railKept: [
      { side: 1, z0: -9, z1: -5 },
      { side: -1, z0: 4, z1: 8 },
    ],
    hatch: { z0: -3.2, z1: -1.6, x: 0.8 },
    keptLids: [
      [1, -3.9],
      [-1, 4.8],
    ],
    lostGuns: [
      [1, 0.4],
      [-1, -1.8],
      [-1, 2.6],
    ],
    rig: 'standing',
  },
  {
    // Broken in two: her bow half up on the reef…
    name: 'kh-wreck-broken-bow',
    pose: pose(-283, -156, 1.16, -1, -0.5, -0.12, 0.38),
    holes: [{ side: 1, z: 6.0, y: 0.6, rz: 1.3, ry: 0.7 }],
    railKept: [{ side: -1, z0: 5, z1: 9 }],
    hatch: null,
    keptLids: [],
    lostGuns: ALL_PORTS,
    rig: { stumps: [3.1, 0, 0] },
    broken: { at: -1.5, keep: 'bow' },
  },
  {
    // …and her stern half slewed round off its edge, awash.
    name: 'kh-wreck-broken-stern',
    pose: pose(-276, -166, -0.1, -0.6, -1, 0.1, -0.5),
    holes: [{ side: -1, z: -6.5, y: 0.9, rz: 1.0, ry: 0.5 }],
    railKept: [{ side: 1, z0: -11, z1: -7 }],
    hatch: null,
    keptLids: [[1, -6.0]],
    lostGuns: ALL_PORTS,
    rig: { stumps: [0, 1.6, 2.4] },
    broken: { at: -2.5, keep: 'stern' },
  },
];

/** The Old Hulk: upright on her blocks between the yard's wall and the river, bow to the sea, dismasted. */
export const OLD_HULK: WreckDesign = {
  name: 'kh-old-hulk',
  pose: pose(80, -11, 7.09, -1, 0, 0, 0.035),
  holes: [],
  // Her bulwarks whole, but for the gap where her stair comes up.
  railKept: [
    { side: 1, z0: -20, z1: 1.7 },
    { side: 1, z0: 3.3, z1: 20 },
    { side: -1, z0: -20, z1: 20 },
  ],
  hatch: null,
  keptLids: ALL_PORTS,
  lostGuns: ALL_PORTS,
  rig: { stumps: [1.4, 1.1, 0.8] },
};

/** The reef wrecks' parts by tier (they're seen from the sea and the head: a tier down from the island's). */
function reefTier(tier: Tier): Tier {
  return tier === 'ultra' || tier === 'high' ? 'medium' : tier === 'medium' ? 'low' : 'lite';
}

export interface KeelhavenWrecks {
  mesh: Mesh;
  /** The reef wrecks' circles, for the ship. */
  shipObstacles: CircleObstacle[];
  cameraBlockers: CameraBlockerBox[];
  /** Where the sea meets each reef wreck's hull (each a closed loop in plan, for the coast foam). */
  waterlines(): { x: number; z: number }[][];
  triangleCount: number;
  /** Where gulls can stand: the standing wreck's mastheads and bowsprit. */
  perches: Vector3[];
  dispose(): void;
}

/** Builds the reef wrecks and the Old Hulk into one mesh, a part at a step. */
export function* createKeelhavenWrecksSteps(tier: Tier): Generator<void, KeelhavenWrecks, void> {
  const parts: BufferGeometry[] = [];
  const cameraBlockers: CameraBlockerBox[] = [];
  const shipObstacles: CircleObstacle[] = [];
  const perches: Vector3[] = [];
  const list: [WreckDesign, Tier][] = [
    ...KEELHAVEN_WRECKS.map((d) => [d, reefTier(tier)] as [WreckDesign, Tier]),
    [OLD_HULK, tier === 'ultra' ? 'high' : tier],
  ];
  for (const [design, t] of list) {
    const w = yield* wreckGeometrySteps(t, design);
    w.geometry.applyMatrix4(w.matrix);
    parts.push(w.geometry);
    perches.push(...w.perches);
    if (design !== OLD_HULK) shipObstacles.push(...wreckObstacles(design));
    meshCameraBlockers(w.hullPositions, w.matrix, cameraBlockers, 3, -0.5);
    yield;
  }
  const geometry = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!geometry) throw new Error('keelhaven wrecks: parts did not merge');
  geometry.computeBoundingSphere();
  yield;
  const look = createWreckMaterial();
  const mesh = new Mesh(geometry, look.material);
  mesh.name = 'kh-wrecks';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  const index = geometry.getIndex();
  return {
    mesh,
    shipObstacles,
    cameraBlockers,
    waterlines: () => KEELHAVEN_WRECKS.map((d) => wreckWaterline(d.pose)),
    triangleCount: index ? index.count / 3 : 0,
    perches,
    dispose() {
      geometry.dispose();
      look.dispose();
    },
  };
}

/**
 * The Old Hulk's dressing, as a lodging (in the yard's buckets): timber blocks under her keel and
 * shores along her sides, a plank cabin with a tin roof and a stovepipe on her deck, a stair up her
 * port side to a gap in her rail, a lantern, washing strung from her mainmast's stump, and a carved
 * wooden duck on her taffrail.
 */
export function hulkDressing(b: Buckets, out: ShipyardOut, lite: boolean): void {
  const f = new WreckFrame(OLD_HULK.pose);
  const heading = OLD_HULK.pose.heading;
  const P = (x: number, y: number, z: number) => f.toWorld(x, y, z, { x: 0, y: 0, z: 0 });
  const ground = (p: { x: number; z: number }) => keelhavenHeight(p.x, p.z);
  // Keel blocks, and shores from the ground to her bilges.
  for (const z of [-10, -5, 0, 5, 10]) {
    const k = P(0, keelHeightAt(z), z);
    const g = ground(k);
    box(b, 'wood', k.x, (g - 0.2 + k.y) / 2, k.z, 1.1, k.y - g + 0.2, 0.9, heading, YARD_PAINT.tar);
    if (lite && z % 10 !== 0) continue;
    for (const side of [1, -1]) {
      const top = P(side * (halfBeamAt(z, 0.2) - 0.05), 0.2, z);
      const foot = P(side * (halfBeamAt(z, 0.2) + 2.4), -2, z);
      const gy = ground(foot);
      rod(b, 'wood', { x: foot.x, y: gy - 0.3, z: foot.z }, top, 0.1, 5, YARD_PAINT.weathered);
    }
  }
  // The cabin on her deck, aft of the mainmast's stump: plank walls, a tin roof, a stovepipe.
  const z0 = -8.5;
  const z1 = -2.5;
  const deck = deckHeightAt((z0 + z1) / 2);
  const mid = P(0, deck + 1.1, (z0 + z1) / 2);
  box(b, 'wood', mid.x, mid.y, mid.z, 3.8, 2.2, z1 - z0, heading, YARD_PAINT.silver);
  for (const side of [1, -1]) {
    const r = P(side * 1.1, deck + 2.55, (z0 + z1) / 2);
    box(
      b,
      'metal',
      r.x,
      r.y,
      r.z,
      2.5,
      0.06,
      z1 - z0 + 0.6,
      heading,
      side > 0 ? 0x8e5a3e : 0xa8503a,
      0,
      side * 0.36,
    );
  }
  const door = P(1.92, deck + 1.0, -4.2);
  box(b, 'wood', door.x, door.y, door.z, 0.06, 1.9, 0.9, heading, 0x2f7f86);
  const pipe = P(-0.9, deck + 2.6, -7.2);
  rod(b, 'metal', pipe, { x: pipe.x, y: pipe.y + 1.4, z: pipe.z }, 0.11, 6, YARD_PAINT.iron);
  cone(b, 'metal', pipe.x, pipe.y + 1.4, pipe.z, 0.22, 0.18, 6, YARD_PAINT.iron);
  const lamp = P(1.95, deck + 2.1, -3.2);
  const glow = box(b, 'glow', lamp.x, lamp.y, lamp.z, 0.2, 0.28, 0.2, heading, 0xffffff);
  lanternPaint(glow, 4.2);
  // A stair up her port side to the deck, by a gap in her rail.
  const zs = 2.5;
  const steps = lite ? 5 : 10;
  const topY = P(halfBeamAt(zs, 0) + 0.5, deckHeightAt(zs), zs).y;
  for (let k = 0; k < steps; k++) {
    const t = (k + 0.5) / steps;
    const p = P(halfBeamAt(zs, 0) + 0.6 + (1 - t) * 3.4, 0, zs);
    const g = ground(p);
    const y = g + (topY - g) * t;
    box(b, 'wood', p.x, y, p.z, 3.4 / steps + 0.05, 0.07, 1.1, heading, YARD_PAINT.silver);
  }
  const s0 = P(halfBeamAt(zs, 0) + 4, 0, zs);
  for (const dz of [-0.6, 0.6]) {
    const a0 = P(halfBeamAt(zs, 0) + 4, 0, zs + dz);
    const a1 = P(halfBeamAt(zs, 0) + 0.4, 0, zs + dz);
    rod(
      b,
      'wood',
      { x: a0.x, y: ground(s0) - 0.2, z: a0.z },
      { x: a1.x, y: topY - 0.1, z: a1.z },
      0.06,
      5,
      YARD_PAINT.weathered,
    );
  }
  // Washing from the mainmast's stump to the cabin.
  if (!lite) {
    const m = P(0, deck + 2.0, 1.0);
    const c = P(0, deck + 2.25, -2.5);
    rope(b, m, c, 0.18, 0.012, YARD_PAINT.rope, 5);
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4;
      const q = {
        x: m.x + (c.x - m.x) * t,
        y: m.y + (c.y - m.y) * t - 0.18 * 4 * t * (1 - t) - 0.3,
        z: m.z + (c.z - m.z) * t,
      };
      box(b, 'cloth', q.x, q.y, q.z, 0.02, 0.55, 0.42, heading, [0xe8dcc0, 0xa9443a, 0x46607a, 0xd9c7a0][k]!);
    }
  }
  // The carved duck on her taffrail, looking out astern: honey wood, an orange-painted bill.
  const zt = -BRIGANTINE_HALF_LENGTH + 2.2;
  const rail = sheerHeightAt(zt) + 0.35;
  const d = (x: number, y: number, z: number) => P(x, rail + y * 1.5, zt + z * 1.5);
  const body0 = d(0, 0.32, 0.35);
  const body1 = d(0, 0.3, -0.4);
  rod(b, 'wood', P(0, rail - 0.3, zt), P(0, rail, zt), 0.28, 8, YARD_PAINT.tar);
  rod(b, 'wood', body0, body1, 0.5, 8, 0xe2b57e, 0.38);
  rod(b, 'wood', d(0, 0.55, -0.32), d(0, 0.92, -0.36), 0.26, 7, 0xe2b57e, 0.3);
  rod(b, 'wood', d(0, 0.88, -0.52), d(0, 0.86, -0.82), 0.13, 6, 0xd9802e, 0.07);
  rod(b, 'wood', body0, d(0, 0.36, 0.7), 0.3, 6, 0xe2b57e, 0.06);
  // Colliders: her hull, and the stair's foot.
  const c = P(0, 0, 0);
  out.colliders.push({ x: c.x, z: c.z, hx: 4.2, hz: BRIGANTINE_HALF_LENGTH + 1, rot: heading, height: 9 });
  out.cameraBoxes.push({
    x: c.x,
    z: c.z,
    hx: 3.8,
    hz: BRIGANTINE_HALF_LENGTH,
    rot: heading,
    y0: ground(c),
    y1: c.y + 3.5,
  });
  // The camera keeps out of the stair, from its foot to the deck.
  const sm = P(halfBeamAt(zs, 0) + 0.6 + 1.7, 0, zs);
  out.cameraBoxes.push({
    x: sm.x,
    z: sm.z,
    hx: 1.9,
    hz: 0.7,
    rot: heading,
    y0: ground(sm) - 0.4,
    y1: topY + 0.15,
  });
}
