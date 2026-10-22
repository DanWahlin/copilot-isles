import { BoxGeometry, CylinderGeometry, Matrix4, TorusGeometry, type BufferGeometry } from 'three/webgpu';
import type { CircleObstacle, Tier } from '../contracts';
import type { VillageBoxCollider } from './kit';
import { paint } from './kit';
import {
  boxUv,
  CANNON,
  cannonParts,
  placeParts,
  placement,
  powderChest,
  rammer,
  shotBall,
  shotPyramid,
  type CannonDetail,
  type CannonParts,
} from './shore-cannon';

/**
 * Shore batteries (Dan: cannons at strategic spots, as in the pirate days): a few guns on timber or
 * masonry gun platforms behind a low log-rail fence, with round shot, a rammer and a powder chest.
 * The island says where (its data file); this builds the pieces into the town's kit buckets, so a
 * battery costs no new material or shader and no draw call of its own (a town material's chunks may
 * split once more), and gives the walker, the camera and the vegetation its colliders and walk
 * surfaces.
 *
 * Headings use the game's convention: a gun at `heading` points along (sin heading, cos heading).
 */
export interface BatteryGun {
  x: number;
  z: number;
  heading: number;
}

/** A level gun platform: `top` is its planks' top; local z runs along `heading`. */
export interface BatteryDeck {
  x: number;
  z: number;
  heading: number;
  /** Across (local x) and along (local z), metres. */
  width: number;
  depth: number;
  top: number;
  /**
   * 'planks': a timber platform on sleepers that reach the ground. 'stone': the planks on a
   * masonry block (a rampart's terreplein, a revetment on a slope) from `base` up.
   */
  kind: 'planks' | 'stone';
  base?: number;
  /** A raised deck against a wall: a collider along its front edge keeps the walker off the wall top. */
  parapet?: boolean;
}

/** Stone steps up to a raised deck: from the foot (x, z) climbing along `heading` over `run` metres. */
export interface BatteryStair {
  x: number;
  z: number;
  heading: number;
  width: number;
  run: number;
  bottom: number;
  top: number;
}

export interface BatteryProp {
  kind: 'shot' | 'ball' | 'rammer' | 'chest';
  x: number;
  z: number;
  heading?: number;
  /** Its standing height where the drawn ground isn't the walk height (a stone drum, raised paving). */
  y?: number;
}

export interface ShoreBattery {
  id: string;
  guns: readonly BatteryGun[];
  decks?: readonly BatteryDeck[];
  stairs?: readonly BatteryStair[];
  /** Log-rail fences, each a polyline of posts (x, z) standing on the deck or the ground. */
  fences?: readonly (readonly { x: number; z: number }[])[];
  props?: readonly BatteryProp[];
  /** An old, overgrown battery: moss on the upward faces. */
  mossy?: boolean;
}

export interface BatteryBuckets {
  metal: BufferGeometry[];
  wood: BufferGeometry[];
  stone: BufferGeometry[];
  rope: BufferGeometry[];
}

export interface BatteryOutput {
  boxes: VillageBoxCollider[];
  circles: CircleObstacle[];
  /** Camera-only blockers: the masonry under raised decks. */
  camera: VillageBoxCollider[];
}

/** The gun's level of detail on a tier (the town chunks thin it further with distance). */
export function cannonDetail(tier: Tier): CannonDetail {
  if (tier === 'lite') return 'lite';
  if (tier === 'low') return 'mid';
  return 'full';
}

/** Half-sizes of a gun's collider (carriage and barrel, cascabel to muzzle) and its centre's offset. */
export const GUN_COLLIDER = {
  hx: CANNON.halfWidth + 0.02,
  hz: (CANNON.muzzleZ - CANNON.cascabelZ) / 2 + 0.04,
  offset: (CANNON.muzzleZ + CANNON.cascabelZ) / 2,
  height: 1.15,
} as const;

const FENCE_POST_GAP = 2.2;
const STEP_RISE = 0.3;
const PLANK = 0.06;
const tmpMatrix = new Matrix4();

function deckTopAt(d: BatteryDeck, x: number, z: number): number | null {
  const s = Math.sin(d.heading);
  const c = Math.cos(d.heading);
  const dx = x - d.x;
  const dz = z - d.z;
  if (Math.abs(dx * c - dz * s) > d.width / 2 || Math.abs(dx * s + dz * c) > d.depth / 2) return null;
  return d.top;
}

function stairAt(st: BatteryStair, x: number, z: number): number | null {
  const s = Math.sin(st.heading);
  const c = Math.cos(st.heading);
  const dx = x - st.x;
  const dz = z - st.z;
  if (Math.abs(dx * c - dz * s) > st.width / 2) return null;
  const along = dx * s + dz * c;
  if (along < 0 || along > st.run) return null;
  const n = stairSteps(st);
  const i = Math.min(n - 1, Math.floor((along / st.run) * n));
  return st.bottom + ((i + 1) * (st.top - st.bottom)) / n;
}

function stairSteps(st: BatteryStair): number {
  return Math.max(1, Math.ceil((st.top - st.bottom) / STEP_RISE - 1e-6));
}

/**
 * The walk height on a battery's decks and stairs, or null off them. Allocation-free (the walker
 * and the camera call it every step).
 */
export function shoreBatteryWalkable(
  batteries: readonly ShoreBattery[],
  x: number,
  z: number,
): number | null {
  const box = batteryReach(batteries);
  if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) return null;
  let best: number | null = null;
  for (const b of batteries) {
    if (b.decks)
      for (const d of b.decks) {
        const h = deckTopAt(d, x, z);
        if (h !== null && (best === null || h > best)) best = h;
      }
    if (b.stairs)
      for (const st of b.stairs) {
        const h = stairAt(st, x, z);
        if (h !== null && (best === null || h > best)) best = h;
      }
  }
  return best;
}

const reaches = new WeakMap<
  readonly ShoreBattery[],
  { minX: number; maxX: number; minZ: number; maxZ: number }
>();

/**
 * A box round every deck and stair of `batteries` (each within its half-diagonal of its centre, a
 * stair within its half-width and run of its foot), worked out once per list: a walk query outside it
 * can skip them all.
 */
function batteryReach(batteries: readonly ShoreBattery[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let box = reaches.get(batteries);
  if (box) return box;
  box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const grow = (x: number, z: number, r: number) => {
    box!.minX = Math.min(box!.minX, x - r);
    box!.maxX = Math.max(box!.maxX, x + r);
    box!.minZ = Math.min(box!.minZ, z - r);
    box!.maxZ = Math.max(box!.maxZ, z + r);
  };
  for (const b of batteries) {
    for (const d of b.decks ?? []) grow(d.x, d.z, Math.hypot(d.width / 2, d.depth / 2) + 0.01);
    for (const st of b.stairs ?? []) grow(st.x, st.z, Math.hypot(st.width / 2, st.run) + 0.01);
  }
  reaches.set(batteries, box);
  return box;
}

/** What a gun or a prop stands on: its battery's deck there, else the given ground. */
export function batterySurface(
  battery: ShoreBattery,
  x: number,
  z: number,
  ground: (x: number, z: number) => number,
): number {
  return shoreBatteryWalkable([battery], x, z) ?? ground(x, z);
}

function boxPiece(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  heading: number,
  colour: number,
): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  g.applyMatrix4(placement(x, y, z, heading, tmpMatrix));
  paint(g, colour);
  return boxUv(g);
}

function addDeck(
  buckets: BatteryBuckets,
  out: BatteryOutput,
  d: BatteryDeck,
  ground: (x: number, z: number) => number,
  detail: CannonDetail,
): void {
  const s = Math.sin(d.heading);
  const c = Math.cos(d.heading);
  const at = (lx: number, lz: number) => ({ x: d.x + lx * c + lz * s, z: d.z - lx * s + lz * c });
  let low = Infinity;
  for (const lx of [-0.5, -0.25, 0, 0.25, 0.5])
    for (const lz of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const p = at(lx * d.width, lz * d.depth);
      low = Math.min(low, ground(p.x, p.z));
    }
  const under = d.top - PLANK;
  if (d.kind === 'stone') {
    const base = d.base ?? Math.min(low - 0.4, d.top - 1.2);
    // The masonry, with the planks overhanging its edge by 5 cm.
    buckets.stone.push(
      boxPiece(d.width - 0.1, under - base, d.depth - 0.1, d.x, base, d.z, d.heading, 0xb7a988),
    );
    out.camera.push({
      x: d.x,
      z: d.z,
      hx: d.width / 2,
      hz: d.depth / 2,
      rot: d.heading,
      y0: base,
      y1: under,
    });
  } else {
    // Sleepers along the deck, down to the lowest ground under it.
    for (const lx of [-0.42, 0, 0.42]) {
      const p = at(lx * (d.width - 0.3), 0);
      const foot = Math.min(low, under - 0.14) - 0.12;
      buckets.wood.push(boxPiece(0.15, under - foot, d.depth - 0.04, p.x, foot, p.z, d.heading, 0x4e3420));
    }
  }
  if (d.parapet) {
    const front = at(0, d.depth / 2 + 0.35);
    out.boxes.push({
      x: front.x,
      z: front.z,
      hx: d.width / 2,
      hz: 0.35,
      rot: d.heading,
      height: 1.2,
      y0: d.top - 0.5,
      y1: d.top + 1.2,
    });
  }
  // Planks across the deck, a finger's gap between them, each its own weathered tone.
  const n = Math.max(2, Math.round(d.depth / (detail === 'lite' ? 0.6 : 0.32)));
  const pitch = d.depth / n;
  for (let i = 0; i < n; i++) {
    const p = at(0, -d.depth / 2 + pitch * (i + 0.5));
    const tone = [0x7a5a3a, 0x6c4e33, 0x846443, 0x735337][(i * 7 + Math.round(d.x)) & 3]!;
    buckets.wood.push(boxPiece(d.width, PLANK, pitch - 0.012, p.x, under, p.z, d.heading, tone));
  }
}

function addStair(buckets: BatteryBuckets, out: BatteryOutput, st: BatteryStair): void {
  const n = stairSteps(st);
  const tread = st.run / n;
  const s = Math.sin(st.heading);
  const c = Math.cos(st.heading);
  for (let i = 0; i < n; i++) {
    const along = tread * (i + 0.5);
    const top = st.bottom + ((i + 1) * (st.top - st.bottom)) / n;
    const foot = st.bottom - 0.3;
    buckets.stone.push(
      boxPiece(
        st.width,
        top - foot,
        tread + 0.02,
        st.x + along * s,
        foot,
        st.z + along * c,
        st.heading,
        0xc2b48f,
      ),
    );
  }
  out.camera.push({
    x: st.x + (st.run / 2) * s,
    z: st.z + (st.run / 2) * c,
    hx: st.width / 2,
    hz: st.run / 2,
    rot: st.heading,
    y0: st.bottom - 0.3,
    y1: st.bottom + (st.top - st.bottom) * 0.5,
  });
}

/** A stable 0..1 hash per post, so fences keep their look build to build. */
function hash(x: number, z: number, salt: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function cylinderBetween(
  r: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  seg: number,
  colour: number,
): BufferGeometry {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const g = new CylinderGeometry(r, r * 1.08, len, seg, 1);
  // Lay it along +z, then turn and tilt it onto the segment.
  g.rotateX(Math.PI / 2);
  const yaw = Math.atan2(bx - ax, bz - az);
  const pitch = -Math.asin((by - ay) / len);
  g.rotateX(pitch);
  g.rotateY(yaw);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  paint(g, colour);
  return boxUv(g);
}

function addFence(
  buckets: BatteryBuckets,
  out: BatteryOutput,
  battery: ShoreBattery,
  line: readonly { x: number; z: number }[],
  ground: (x: number, z: number) => number,
  detail: CannonDetail,
): void {
  const posts: { x: number; z: number; y: number; top: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1];
    const steps = b ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / FENCE_POST_GAP)) : 1;
    for (let k = 0; k < steps; k++) {
      if (!b && k > 0) break;
      const t = b ? k / steps : 0;
      const x = b ? a.x + (b.x - a.x) * t : a.x;
      const z = b ? a.z + (b.z - a.z) * t : a.z;
      const y = batterySurface(battery, x, z, ground);
      posts.push({ x, z, y, top: y + 0.98 + hash(x, z, 1) * 0.16 });
    }
    if (b) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      out.boxes.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        hx: len / 2,
        hz: 0.14,
        rot: Math.atan2(-(b.z - a.z), b.x - a.x),
        height: 1.05,
      });
    }
  }
  const seg = detail === 'lite' ? 5 : 7;
  posts.forEach((p, i) => {
    // Split logs, a little out of true.
    const lean = (hash(p.x, p.z, 2) - 0.5) * 0.08;
    const r = 0.055 + hash(p.x, p.z, 3) * 0.018;
    buckets.wood.push(
      cylinderBetween(r, p.x, p.y - 0.3, p.z, p.x + lean, p.top, p.z - lean * 0.5, seg, 0x8a6c4c),
    );
    if (detail !== 'lite' && i % 3 === 1) {
      // A rope lashing where the rails meet the post.
      const g = new TorusGeometry(r + 0.025, 0.022, 4, 10);
      g.rotateX(Math.PI / 2);
      g.translate(p.x + lean * 0.6, p.y + 0.82, p.z - lean * 0.3);
      paint(g, 0xa0804e);
      buckets.rope.push(g);
      const g2 = g.clone();
      g2.translate(0, 0.06, 0);
      paint(g2, 0x97784a);
      buckets.rope.push(g2);
    }
    const q = posts[i + 1];
    if (!q) return;
    for (const [h, rr] of [
      [0.42, 0.036],
      [0.82, 0.042],
    ] as const) {
      const sag = (hash(p.x, q.z, h * 10) - 0.5) * 0.07;
      buckets.wood.push(cylinderBetween(rr, p.x, p.y + h + sag, p.z, q.x, q.y + h - sag, q.z, seg, 0x977552));
    }
  });
}

interface BatteryLook {
  gun: CannonParts;
  chest: CannonParts;
  rammer: CannonParts;
  pile: BufferGeometry[];
}

/**
 * Each look's pieces (per detail, plain or mossy), built on first use and kept: they're CPU-only
 * templates (never drawn; their placed copies merge into the towns), so the next island or voyage
 * places guns without rebuilding them.
 */
const LOOKS = new Map<string, BatteryLook>();

function batteryLook(detail: CannonDetail, mossy: boolean): BatteryLook {
  const key = `${detail}:${mossy}`;
  let l = LOOKS.get(key);
  if (!l) {
    l = {
      gun: cannonParts(detail, mossy),
      chest: powderChest(detail, mossy),
      rammer: rammer(0.48),
      pile: shotPyramid(detail, mossy),
    };
    LOOKS.set(key, l);
  }
  return l;
}

/**
 * Builds the batteries into the town's buckets (world space) and returns their colliders. `ground`
 * is the town's walk height off the batteries (paving, quay or terrain).
 */
export function addShoreBatteries(
  buckets: BatteryBuckets,
  batteries: readonly ShoreBattery[],
  ground: (x: number, z: number) => number,
  detail: CannonDetail,
): BatteryOutput {
  const out: BatteryOutput = { boxes: [], circles: [], camera: [] };
  for (const b of batteries) {
    for (const d of b.decks ?? []) addDeck(buckets, out, d, ground, detail);
    for (const st of b.stairs ?? []) addStair(buckets, out, st);
    for (const line of b.fences ?? []) addFence(buckets, out, b, line, ground, detail);
    const kit = batteryLook(detail, !!b.mossy);
    for (const g of b.guns) {
      const y = batterySurface(b, g.x, g.z, ground);
      placeParts(kit.gun, placement(g.x, y, g.z, g.heading, tmpMatrix), buckets);
      out.boxes.push({
        x: g.x + Math.sin(g.heading) * GUN_COLLIDER.offset,
        z: g.z + Math.cos(g.heading) * GUN_COLLIDER.offset,
        hx: GUN_COLLIDER.hx,
        hz: GUN_COLLIDER.hz,
        rot: g.heading,
        height: GUN_COLLIDER.height,
      });
    }
    for (const p of b.props ?? []) {
      const y = p.y ?? batterySurface(b, p.x, p.z, ground);
      const m = placement(p.x, y, p.z, p.heading ?? 0, tmpMatrix);
      if (p.kind === 'shot') {
        for (const g of kit.pile) buckets.metal.push(g.clone().applyMatrix4(m));
        out.circles.push({ x: p.x, z: p.z, r: CANNON.shotRadius * 3.4, height: 0.3 });
      } else if (p.kind === 'ball') {
        buckets.metal.push(shotBall(detail, 0, 0, b.mossy).applyMatrix4(m));
      } else if (p.kind === 'chest') {
        placeParts(kit.chest, m, buckets);
        out.boxes.push({ x: p.x, z: p.z, hx: 0.4, hz: 0.27, rot: p.heading ?? 0, height: 0.5 });
      } else if (p.kind === 'rammer' && detail !== 'lite') {
        placeParts(batteryLook(detail, false).rammer, m, buckets);
      }
    }
  }
  return out;
}

/** Where a gun's muzzle is (tests and audits): its tip in world x, z. */
export function muzzleAt(g: BatteryGun): { x: number; z: number } {
  return { x: g.x + Math.sin(g.heading) * CANNON.muzzleZ, z: g.z + Math.cos(g.heading) * CANNON.muzzleZ };
}

/** A gun's four truck contact points (world x, z), for grounding checks. */
export function truckContacts(g: BatteryGun): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const az of [CANNON.frontAxleZ, CANNON.rearAxleZ])
    for (const side of [-1, 1]) {
      const [lx, lz] = [side * CANNON.truckX, az];
      out.push({
        x: g.x + lx * Math.cos(g.heading) + lz * Math.sin(g.heading),
        z: g.z - lx * Math.sin(g.heading) + lz * Math.cos(g.heading),
      });
    }
  return out;
}
