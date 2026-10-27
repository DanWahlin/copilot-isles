import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  Sphere,
  Vector3,
  type InstancedMesh,
  type Material,
} from 'three/webgpu';
import { markInstancesChanged, sharedInstancedMesh } from '../../../engine/instancing';
import type { VillageKit } from '../../village/kit';
import { mergeWithRigidParts, type RigidParts } from '../../sites/rigid-parts';
import type { SignSet } from '../../sites/sign';
import { ROCK_ASSETS } from '../../terrain/rock-assets';
import { mulberry32, smoothstep } from '../../../util/math';
import { CREW_LOOK } from '../../../game/puzzles/channel-routing/boards';
import type { ChannelRoutingState, Crew, Flow, FlumeTerraceView } from './contract';
import type { FlumeStones } from './rocks';
import type { CameraBlockerBox } from '../../terrain/camera-blockers';
import { THOUSAND_BOUGH as TB } from './layout';
import { thousandBoughHeight } from './height';
import {
  PAINT,
  beam,
  box,
  cone,
  gridIndex,
  gridSurface,
  lanternPaint,
  makeBuckets,
  rod,
  type Buckets,
} from './village/pieces';
import type { BoxCollider } from '../../../game/collision';

/**
 * The Flume Terrace (spec §5.2): the 5 × 4 board of wooden flume tiles stepping down the shelf, the
 * header box with the three crews' gates and banners, the chutes from the outlets to the wheel-lifts,
 * and the Great Hall's sluice that catches whatever spills. It's the Channel Routing puzzle's view:
 * tiles turn, dyed water runs cell by cell, mud swirls where crews mix, wheels turn, and the crews'
 * houses light in their colours. Every moving part is a rigid part of a few merged meshes (one draw
 * each, the kit's materials, no new shader); the frame loop doesn't allocate.
 */

const F = TB.flume;
const TILE = F.tile;
const ROWS = 4;
const COLS = 5;
/** Tile-local heights: the floor's top, the water's surface, the walls' top. */
const FLOOR = 0.2;
const WATER = 0.4;
const WALL = 0.78;
const CHANNEL = 0.62;
/** Water runs along the tiles at 4 m/s (spec §5.4): this long per cell. */
const CELL_TIME = TILE / 4;

const CREWS: readonly Crew[] = ['blue', 'green', 'teal'];
const DYE: Record<Crew | 'mixed', number> = {
  blue: PAINT.blue,
  green: PAINT.green,
  teal: PAINT.teal,
  mixed: 0x7a5a32,
};
const DYES = ['blue', 'green', 'teal', 'mixed'] as const;
type Dye = (typeof DYES)[number];

export function tileCentre(row: number, col: number, out: Vector3): Vector3 {
  return out.set(F.cols[col]!, F.rowY[row]!, F.rows[row]!);
}

/** The board's tile kinds and rotations as numbers: where water enters and leaves (N E S W). */
const N = 0;
const E = 1;
const S = 2;
const W = 3;

/** The tile pieces, in tile-local space (rot 0: straight N–S, elbow N–E). */
function straightPiece(b: Buckets): void {
  box(b, 'wood', 0, FLOOR / 2, 0, TILE - 0.08, FLOOR, TILE - 0.08, 0, PAINT.teak);
  for (const s of [-1, 1])
    box(
      b,
      'wood',
      s * (CHANNEL + 0.06),
      (FLOOR + WALL) / 2,
      0,
      0.12,
      WALL - FLOOR,
      TILE - 0.1,
      0,
      PAINT.plank,
    );
}

function elbowPiece(b: Buckets): void {
  box(b, 'wood', 0, FLOOR / 2, 0, TILE - 0.08, FLOOR, TILE - 0.08, 0, PAINT.teak);
  // Walls round a quarter circle about the tile's north-east corner.
  const cx = TILE / 2;
  const cz = -TILE / 2;
  for (const r of [TILE / 2 - CHANNEL - 0.06, TILE / 2 + CHANNEL + 0.06]) {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI / 2 + (k / n) * (Math.PI / 2);
      const a1 = Math.PI / 2 + ((k + 1) / n) * (Math.PI / 2);
      const p0 = { x: cx + Math.cos(a0) * r, y: (FLOOR + WALL) / 2, z: cz + Math.sin(a0) * r };
      const p1 = { x: cx + Math.cos(a1) * r, y: (FLOOR + WALL) / 2, z: cz + Math.sin(a1) * r };
      // Clip the outer wall to the tile.
      if (Math.abs(p0.x) > TILE / 2 + 0.01 || Math.abs(p1.z) > TILE / 2 + 0.01) continue;
      beam(b, 'wood', p0, p1, 0.12, WALL - FLOOR, PAINT.plank);
    }
  }
}

/** A rock's bed: the tile's floor, with no walls (the rock sits in it). */
function bedPiece(b: Buckets): void {
  box(b, 'wood', 0, FLOOR / 2, 0, TILE - 0.08, FLOOR, TILE - 0.08, 0, PAINT.teak);
}

/** The water in a channel, as a dyed slab (rot 0 shapes). */
function straightWater(b: Buckets, dye: number): void {
  const g = box(b, 'glow', 0, WATER, 0, CHANNEL * 2 - 0.04, 0.05, TILE - 0.06, 0, 0xffffff);
  lanternPaint(g, 1);
  tintGlow(g, dye);
}

function elbowWater(b: Buckets, dye: number): void {
  const cx = TILE / 2;
  const cz = -TILE / 2;
  const pts: { x: number; y: number; z: number }[] = [];
  const n = 6;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI / 2 + (k / n) * (Math.PI / 2);
    for (const r of [TILE / 2 - CHANNEL + 0.02, TILE / 2 + CHANNEL - 0.02])
      pts.push({ x: cx + Math.cos(a) * r, y: WATER, z: cz + Math.sin(a) * r });
  }
  const g = gridSurface(b, 'glow', pts, n + 1, 2, 0xffffff);
  tintGlow(g, dye);
}

/** The kit's glow material shows its paint × 0.18 by day: dye the water bright enough to read. */
function tintGlow(g: BufferGeometry, dye: number, strength = 4.6): void {
  const c = g.getAttribute('color');
  const r = ((dye >> 16) & 255) / 255;
  const gg = ((dye >> 8) & 255) / 255;
  const bb = (dye & 255) / 255;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, r * strength, gg * strength, bb * strength);
  c.needsUpdate = true;
}

/**
 * Fen's shared trough (the demo, the old way): one wide, plank-floored channel laid over the whole
 * board (its tiles put away under it), falling with the rows, with posts and a rail down its sides
 * on stone piers and a low lip at its foot. Nothing divides it: the three gates pour into the same
 * water. Built level about its centre; it's pitched down the slope where it's placed.
 */
const TROUGH_W = COLS * TILE + 0.4;
const TROUGH_L = ROWS * TILE + 0.4;
/** Its fall: the rows step down 0.5 m every tile. */
const TROUGH_PITCH = Math.atan2(0.5, TILE);
/** Its floor's underside at the board's centre: just over each row's tiles' floor (they're put away under it). */
const TROUGH_Y = F.rowY[0]! - FLOOR + 0.02 - Math.tan(TROUGH_PITCH) * TILE;
/** Trough-local heights (its floor's top is at 0.12): the water's surface, the lip's top. */
const TROUGH_WATER = 0.32;
const TROUGH_LIP = 0.27;
/** The water's run, from just under the gates to the lip (its distance down the trough). */
const WATER_FROM = 0.1;
const WATER_RUN = TROUGH_L - 0.2;
const WATER_HALF = TROUGH_W / 2 - 0.08;
/** Each crew's gate across the trough. */
const GATE_X = CREWS.map((c) => F.cols[F.gates[c]]! - F.center.x);

function troughWood(b: Buckets): void {
  // Boards across the trough: no seam runs down it, so nothing reads as lanes.
  const paints = [PAINT.teak, PAINT.weathered, PAINT.plank];
  const n = Math.round(TROUGH_L / 0.55);
  const d = TROUGH_L / n;
  for (let i = 0; i < n; i++)
    box(
      b,
      'wood',
      0,
      0.06,
      -TROUGH_L / 2 + (i + 0.5) * d,
      TROUGH_W - 0.02,
      0.12,
      d - 0.03,
      0,
      paints[i % 3]!,
    );
  for (let k = 0; k <= ROWS; k++) {
    const z = -TROUGH_L / 2 + 0.2 + k * TILE;
    // A sleeper under the floor at each pier, a post each side.
    box(b, 'wood', 0, -0.05, z, TROUGH_W + 0.5, 0.1, 0.24, 0, PAINT.teakDark);
    for (const s of [-1, 1])
      box(b, 'wood', s * (TROUGH_W / 2 + 0.24), 0.59, z, 0.22, 1.22, 0.22, 0, PAINT.weathered);
  }
  for (const s of [-1, 1]) {
    box(b, 'wood', s * (TROUGH_W / 2 + 0.1), 0.39, 0, 0.18, 0.82, TROUGH_L, 0, PAINT.teakDark);
    box(b, 'wood', s * (TROUGH_W / 2 + 0.2), 1.05, 0, 0.14, 0.12, TROUGH_L + 0.3, 0, PAINT.weathered);
  }
  // The low lip at its foot: the water runs over it into the Great Hall's sluice.
  box(b, 'wood', 0, TROUGH_LIP / 2, TROUGH_L / 2 + 0.06, TROUGH_W + 0.4, TROUGH_LIP, 0.14, 0, PAINT.teakDark);
}

/** The trough's stone piers: on the terrace's side walls, one a row each side (level, not pitched). */
function troughPiers(b: Buckets): void {
  const tan = Math.tan(TROUGH_PITCH);
  for (let r = 0; r < ROWS; r++) {
    const z = F.rows[r]! - F.center.z;
    const top = TROUGH_Y - z * tan;
    const bottom = F.rowY[r]! - FLOOR - 0.06;
    for (const s of [-1, 1])
      box(
        b,
        'stone',
        s * (TROUGH_W / 2 + 0.24),
        (top + bottom) / 2,
        z,
        0.62,
        top - bottom,
        0.62,
        0.15,
        PAINT.stone,
      );
  }
}

/** Where each crew's water runs down the trough (its middle across it), `d` metres down. */
function plumeCentre(c: number, d: number): number {
  const u = d / WATER_RUN;
  // They drift together and meander as they go.
  return (
    GATE_X[c]! * (1 - 0.6 * smoothstep(0.1, 0.9, u)) +
    Math.sin(d * 0.9 + c * 2.2) * 0.8 * smoothstep(0.05, 0.5, u)
  );
}

/** How wide a crew's water has spread `d` metres down. */
const plumeWidth = (d: number) => 0.7 + d * 0.45;

const MUD = 0x64492a;
const RGB = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const CREW_RGB = CREWS.map((c) => RGB(DYE[c]));
const MUD_RGB = RGB(MUD);

/**
 * The shared water at (x, d): each gate's dye in its own tongue at the top, spreading as it runs;
 * where two meet they turn brown, and by the foot it's all mud. Writes its colour (glow paint) and
 * returns how wet it is (under 0.5 the surface dips under the floor: dry boards show).
 */
function troughField(x: number, d: number, rgb: number[]): number {
  const u = d / WATER_RUN;
  let k1 = 0;
  let k2 = 0;
  let sum = 0;
  rgb[0] = rgb[1] = rgb[2] = 0;
  for (let c = 0; c < 3; c++) {
    const t = (x - plumeCentre(c, d)) / plumeWidth(d);
    const k = Math.exp(-t * t);
    if (k > k1) {
      k2 = k1;
      k1 = k;
    } else if (k > k2) k2 = k;
    const w = k * k;
    sum += w;
    for (let i = 0; i < 3; i++) rgb[i]! += CREW_RGB[c]![i]! * w;
  }
  const wet = k1 + k2 * 0.5 + smoothstep(0.55, 0.85, u);
  const mixT = smoothstep(0.22, 0.8, u);
  // A brown seam where two dyes meet, long before the foot.
  const seam = smoothstep(0.3, 0.85, k2 / Math.max(k1, 1e-3)) * smoothstep(0.02, 0.14, u) * 0.85;
  const m = Math.min(1, Math.max(mixT, seam));
  // Swirls in the mud (it's moving water, not paint).
  const marble = 0.84 + 0.16 * Math.sin(x * 1.7 + Math.sin(d * 0.8) * 2.4 + d * 0.6);
  for (let i = 0; i < 3; i++) {
    const crew = sum > 1e-6 ? rgb[i]! / sum : MUD_RGB[i]!;
    const v = crew + (MUD_RGB[i]! - crew) * m;
    rgb[i] = v * (1 + (marble - 1) * m) * (2.6 - 0.4 * m);
  }
  return wet;
}

/** The shared water, a reach at a time (it's revealed as it runs, and drains the same way). */
const WATER_REACHES = 12;
const REACH = WATER_RUN / WATER_REACHES;

function troughWaterReach(reach: number): BufferGeometry {
  const rows = 3;
  const cols = 30;
  const n = rows * cols;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const rgb = [0, 0, 0];
  for (let r = 0; r < rows; r++) {
    const dz = (r / (rows - 1)) * REACH;
    const d = reach * REACH + dz;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = -WATER_HALF + (c / (cols - 1)) * WATER_HALF * 2;
      const wet = troughField(x, d, rgb);
      pos[i * 3] = x;
      pos[i * 3 + 1] = TROUGH_WATER - Math.max(0, 0.5 - wet) * 1.3;
      pos[i * 3 + 2] = dz;
      col.set(rgb, i * 3);
      nrm[i * 3 + 1] = 1;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(gridIndex(rows, cols));
  return g;
}

/** A flat glowing shape facing up (x, z in metres), as a fan round its first point. */
function flatShape(
  points: readonly (readonly [number, number])[],
  dye: number,
  strength: number,
): BufferGeometry {
  const tris = points.length - 2;
  const pos = new Float32Array(tris * 9);
  for (let t = 0; t < tris; t++) {
    const p0 = points[0]!;
    let p1 = points[t + 1]!;
    let p2 = points[t + 2]!;
    // Face up (+y): the cross product's y is az·bx − ax·bz.
    if ((p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]) < 0) [p1, p2] = [p2, p1];
    for (const [k, p] of [p0, p1, p2].entries()) {
      pos[t * 9 + k * 3] = p[0];
      pos[t * 9 + k * 3 + 2] = p[1];
    }
  }
  const n = tris * 3;
  const nrm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) nrm[i * 3 + 1] = 1;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3));
  tintGlow(g, dye, strength);
  return g;
}

/** What each crew's water carries (spec §5.2): blue blossoms, leaves, paper boats. */
function floatShape(crew: Crew): BufferGeometry {
  if (crew === 'blue') {
    const pts: [number, number][] = [[0, 0]];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const r = k % 2 ? 0.13 : 0.3;
      pts.push([Math.sin(a) * r, Math.cos(a) * r]);
    }
    return flatShape(pts, 0xa8ccff, 3.4);
  }
  if (crew === 'green')
    return flatShape(
      [
        [0, -0.3],
        [0.13, -0.08],
        [0.1, 0.12],
        [0, 0.3],
        [-0.1, 0.12],
        [-0.13, -0.08],
      ],
      0xa6e486,
      3.2,
    );
  return flatShape(
    [
      [0, -0.3],
      [0.17, -0.12],
      [0.17, 0.2],
      [0, 0.3],
      [-0.17, 0.2],
      [-0.17, -0.12],
    ],
    0xfff4dc,
    3.4,
  );
}

/** A glowing ribbon of water from its origin along +z (`len` long), revealed by scaling along it. */
function ribbon(len: number, width: number, dye: number, strength: number): BufferGeometry {
  const b = makeBuckets();
  const g = box(b, 'glow', 0, 0, len / 2, width, 0.04, len, 0, 0xffffff);
  tintGlow(g, dye, strength);
  return g;
}

/**
 * A stand-in for one of the island's rocks (unit size, base at 0, as tall as the rock asset) when
 * there are no rock batches to borrow: two basalt blocks with a mossy top, a few triangles.
 */
function standInRock(asset: number): BufferGeometry {
  const h = rockHeight(asset);
  const b = makeBuckets();
  box(b, 'stone', 0, h * 0.4, 0, 0.95, h * 0.8, 0.9, 0.4, PAINT.basalt);
  box(b, 'stone', 0.06, h * 0.86, -0.04, 0.62, h * 0.28, 0.58, 1.1, PAINT.moss);
  return mergeParts(b.stone);
}

/** The dismantled trough's boards, stacked on the ground down each side of the terrace (built in place). */
function troughStacks(b: Buckets): void {
  const x0 = F.cols[0]! - TILE / 2;
  const x1 = F.cols[COLS - 1]! + TILE / 2;
  const len = TROUGH_W / 2 - 0.02;
  for (const [x, s] of [
    [x0 - 1.8, -1],
    [x1 + 1.8, 1],
  ] as const) {
    const z = F.center.z + 1.2;
    const gN = thousandBoughHeight(x, z - len / 2);
    const gS = thousandBoughHeight(x, z + len / 2);
    const pitch = Math.atan2(gN - gS, len);
    const y = (gN + gS) / 2;
    // Sleepers on the ground, two courses of boards, the posts across the top.
    for (const k of [-1, 0, 1])
      box(b, 'wood', x, y + 0.04 - k * Math.sin(pitch) * 3.2, z + k * 3.2, 1.5, 0.12, 0.2, 0, PAINT.teakDark);
    for (let layer = 0; layer < 3; layer++)
      for (let k = 0; k < 2; k++)
        box(
          b,
          'wood',
          x + (k - 0.5) * 0.56 + s * layer * 0.04,
          y + 0.16 + layer * 0.13,
          z,
          0.52,
          0.12,
          len - layer * 0.3,
          0.01 * s * layer,
          (layer + k) % 2 ? PAINT.weathered : PAINT.teak,
          pitch,
        );
    for (const k of [-1, 1])
      box(
        b,
        'wood',
        x,
        y + 0.6 - k * Math.sin(pitch) * 2.2,
        z + k * 2.2,
        1.3,
        0.2,
        0.2,
        0.06 * k,
        PAINT.weathered,
      );
  }
}

const TMP = new Matrix4();
const TMP2 = new Matrix4();
const Q = new Quaternion();
const Q2 = new Quaternion();
const V = new Vector3();
const V2 = new Vector3();
const ONE = new Vector3(1, 1, 1);
const ZERO = new Matrix4().makeScale(0, 0, 0);
const IDENT = new Matrix4();
const UPV = new Vector3(0, 1, 0);
const XV = new Vector3(1, 0, 0);
const ZV = new Vector3(0, 0, 1);
/** The shared trough where it stands, pitched down the slope; its piers stand level. */
const TROUGH_M = new Matrix4().compose(
  new Vector3(F.center.x, TROUGH_Y, F.center.z),
  new Quaternion().setFromAxisAngle(XV, TROUGH_PITCH),
  ONE,
);
const PIERS_M = new Matrix4().makeTranslation(F.center.x, 0, F.center.z);
/** A borrowed rock slot waits hidden on the terrace (scale 0, so it doesn't stretch its batch's bounds). */
const STONE_HIDDEN = new Matrix4().makeScale(0, 0, 0).setPosition(F.center.x, F.rowY[1]!, F.center.z);
/** Board A's rock tiles (row 2, columns 2 and 4). */
const TILE_ROCKS = 2;

function tileMatrix(row: number, col: number, rot: number, out: Matrix4, lift = 0): Matrix4 {
  Q.setFromAxisAngle(UPV, -rot * (Math.PI / 2));
  return out.compose(V.set(F.cols[col]!, F.rowY[row]! - FLOOR + lift, F.rows[row]!), Q, ONE);
}

// Fen's demo, in seconds from the gates opening.
/** The water leaves the gates, and runs down the trough at this speed (m/s). */
const FLOW_START = 0.35;
const FLOW_SPEED = 3.6;
/** When the front reaches the lip. */
const AT_LIP = FLOW_START + WATER_RUN / FLOW_SPEED;
/** The mud runs along the sluice and down the chutes at this speed (m/s). */
const CHUTE_SPEED = 9;
/** Once the gates shut, the water's tail runs down and out at this speed (m/s). */
const DRAIN_SPEED = 8;
/** Floats on each crew's water, and how far one runs before it comes round again (over the lip). */
const FLOATS = 4;
const FLOAT_LOOP = WATER_RUN + 1.2;

function rockHeight(asset: number): number {
  const p = ROCK_ASSETS[asset]!.positions;
  let top = 0;
  for (let i = 1; i < p.length; i += 3) top = Math.max(top, p[i]!);
  return top;
}
/** The board's rock tiles: one of the island's mossy basalt rocks in each. */
const TILE_ROCK_ASSET = 0;
const TILE_ROCK_SCALE = new Vector3(2.2, 1.65 / rockHeight(TILE_ROCK_ASSET), 2.05);

interface Run {
  flows: readonly Flow[];
  t: number;
  done: () => void;
  /** Seconds each flow takes (its cells, then its end). */
  length: number;
}

export interface FlumeTerrace extends FlumeTerraceView {
  group: Group;
  /** Static structure for the village's merged meshes was added to its buckets. */
  colliders: BoxCollider[];
  /** For the camera: the side walls past the walker's box (issue 312). */
  cameraBoxes: CameraBlockerBox[];
  /** Adds separate flume meshes that share the island rock geometry and material. */
  useStones(stones: FlumeStones): void;
  update(dt: number): void;
  dispose(): void;
}

/**
 * Builds the terrace. Static pieces (header, chutes, trestles, sluice, gate posts) go into `statics`
 * (the village's buckets) and the crews' gate boards into `signs`; the moving parts are its own meshes.
 */
export function createFlumeTerrace(
  kit: VillageKit,
  statics: Buckets,
  wheelAxles: readonly { x: number; y: number; z: number; yaw: number; crew: string }[],
  signs?: SignSet,
): FlumeTerrace {
  const group = new Group();
  group.name = 'thousand-bough-flume';
  const colliders: BoxCollider[] = [];
  const cameraBoxes: CameraBlockerBox[] = [];
  buildStatics(statics, colliders, signs, cameraBoxes);

  // Rigid parts: wood (straight, elbow and a rock's bed per cell, the gates, the wheels, the demo
  // trough and its stacked boards), stone (the trough's piers; painted rocks if there are no rock
  // batches to borrow), glow (water per cell, kind and dye; the cursor and pulse frames; the demo's
  // water, floats, spill and chutes).
  const wood: BufferGeometry[] = [];
  const stone: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  const take = (fn: (b: Buckets) => void, key: 'wood' | 'stone' | 'glow', into: BufferGeometry[]) => {
    const b = makeBuckets();
    fn(b);
    into.push(mergeParts(b[key]));
    return into.length - 1;
  };
  const woodIndex = {
    straight: [] as number[],
    elbow: [] as number[],
    bed: [] as number[],
    gates: [] as number[],
    trough: -1,
    stacks: -1,
  };
  for (let i = 0; i < ROWS * COLS; i++) {
    woodIndex.straight.push(take(straightPiece, 'wood', wood));
    woodIndex.elbow.push(take(elbowPiece, 'wood', wood));
    woodIndex.bed.push(take(bedPiece, 'wood', wood));
  }
  for (let g = 0; g < 3; g++)
    woodIndex.gates.push(
      take((b) => box(b, 'wood', 0, 0.45, 0, CHANNEL * 2 + 0.3, 0.9, 0.1, 0, PAINT.teakDark), 'wood', wood),
    );
  // The three wheels, as wood parts too (they turn by rewriting their own vertices).
  const wheelPart: number[] = [];
  for (let k = 0; k < wheelAxles.length; k++) {
    wheelPart.push(wood.length);
    wood.push(wheelGeometry());
  }
  woodIndex.trough = take(troughWood, 'wood', wood);
  woodIndex.stacks = take(troughStacks, 'wood', wood);
  const stoneIndex = { piers: take(troughPiers, 'stone', stone), rocks: [] as number[] };
  // Stand-ins for the borrowed rocks: the island's rock shapes, painted.
  for (let k = 0; k < TILE_ROCKS; k++) {
    stoneIndex.rocks.push(stone.length);
    stone.push(standInRock(TILE_ROCK_ASSET));
  }
  const glowIndex: Record<Dye, { straight: number[]; elbow: number[] }> = {
    blue: { straight: [], elbow: [] },
    green: { straight: [], elbow: [] },
    teal: { straight: [], elbow: [] },
    mixed: { straight: [], elbow: [] },
  };
  for (const dye of DYES)
    for (let i = 0; i < ROWS * COLS; i++) {
      glowIndex[dye].straight.push(take((b) => straightWater(b, DYE[dye]), 'glow', glow));
      glowIndex[dye].elbow.push(take((b) => elbowWater(b, DYE[dye]), 'glow', glow));
    }
  const frame = (colour: number) => (b: Buckets) => {
    for (const [x, z, w, d] of [
      [0, -TILE / 2, TILE, 0.12],
      [0, TILE / 2, TILE, 0.12],
      [-TILE / 2, 0, 0.12, TILE],
      [TILE / 2, 0, 0.12, TILE],
    ] as const) {
      const g = box(b, 'glow', x, WALL + 0.05, z, w, 0.08, d, 0, 0xffffff);
      tintGlow(g, colour);
    }
  };
  const cursorPart = take(frame(0xffe08a), 'glow', glow);
  const pulsePart = take(frame(0xff5a3a), 'glow', glow);

  // The demo's shared water, a reach at a time; the crews' floats on it.
  const reachPart: number[] = [];
  for (let r = 0; r < WATER_REACHES; r++) {
    reachPart.push(glow.length);
    glow.push(troughWaterReach(r));
  }
  const rand = mulberry32(0xf10a7);
  const floats: { part: number; crew: number; phase: number; side: number; spin: number }[] = [];
  for (let c = 0; c < 3; c++)
    for (let k = 0; k < FLOATS; k++) {
      floats.push({
        part: glow.length,
        crew: c,
        phase: (k + rand() * 0.6) / FLOATS,
        side: rand() * 2 - 1,
        spin: rand() * 6.3,
      });
      glow.push(floatShape(CREWS[c]!));
    }
  // Over the lip into the sluice, along the sluice both ways, and down every crew's chute: the same mud.
  const ribbons: {
    part: number;
    base: Matrix4;
    len: number;
    delay: number;
    speed: number;
    wheel: Crew | null;
  }[] = [];
  const addRibbon = (
    from: Vector3,
    to: Vector3,
    width: number,
    delay: number,
    speed: number,
    wheel: Crew | null,
  ) => {
    const len = from.distanceTo(to);
    const base = new Matrix4().compose(
      from,
      new Quaternion().setFromUnitVectors(ZV, to.clone().sub(from).normalize()),
      ONE,
    );
    ribbons.push({ part: glow.length, base, len, delay, speed, wheel });
    glow.push(ribbon(len, width, MUD, 2.3));
  };
  const x0 = F.cols[0]! - TILE / 2;
  const x1 = F.cols[COLS - 1]! + TILE / 2;
  const zS = F.rows[ROWS - 1]! + TILE / 2;
  const sluiceMud = SLUICE_Y + 0.42;
  addRibbon(
    new Vector3(0, TROUGH_WATER - 0.02, TROUGH_L / 2 + 0.1).applyMatrix4(TROUGH_M),
    new Vector3(F.center.x, sluiceMud + 0.02, zS + 0.75),
    TROUGH_W - 0.4,
    0,
    3,
    null,
  );
  for (const x of [x0 - 0.5, x1 + 0.5])
    addRibbon(
      new Vector3(F.center.x, sluiceMud, zS + 0.9),
      new Vector3(x, sluiceMud, zS + 0.9),
      1.4,
      0.12,
      CHUTE_SPEED,
      null,
    );
  for (const w of TB.water.wheels) {
    const { start, end } = chuteEnds(w);
    const along = Math.abs(start.x - F.center.x) / CHUTE_SPEED;
    addRibbon(
      new Vector3(start.x, start.y + 0.11, start.z - 0.3),
      new Vector3(end.x, end.y + 0.11, end.z),
      1.0,
      0.25 + along,
      CHUTE_SPEED,
      w.crew as Crew,
    );
  }
  const woodParts = mergeWithRigidParts([], wood);
  const stoneParts = mergeWithRigidParts([], stone);
  const glowParts = mergeWithRigidParts([], glow);
  // The parts are built at the origin and placed on the terrace: a fixed bound round the terrace,
  // its chutes and the stacks beside it lets the renderer cull them.
  for (const p of [woodParts, stoneParts, glowParts])
    p.geometry.boundingSphere = new Sphere(new Vector3(F.center.x + 2, F.rowY[1]! - 2, F.center.z + 14), 40);
  const mesh = (p: RigidParts, key: 'wood' | 'stone' | 'glow') => {
    const m = new Mesh(p.geometry, kit.materials[key] as Material);
    m.name = `thousand-bough-flume-${key}`;
    m.castShadow = key !== 'glow';
    m.receiveShadow = key !== 'glow';
    group.add(m);
    return m;
  };
  mesh(woodParts, 'wood');
  mesh(stoneParts, 'stone');
  mesh(glowParts, 'glow');

  const wheels = wheelAxles.map((a, k) => ({
    part: wheelPart[k]!,
    axle: a,
    crew: a.crew as Crew,
    spin: 0,
    speed: 0,
    target: 0,
  }));
  const placeWheel = (w: (typeof wheels)[number]) => {
    Q.setFromAxisAngle(UPV, w.axle.yaw);
    Q2.setFromAxisAngle(XV, -w.spin);
    Q.multiply(Q2);
    woodParts.set(w.part, TMP.compose(V.set(w.axle.x, w.axle.y, w.axle.z), Q, ONE));
  };

  // State.
  const board: { kind: 'straight' | 'elbow' | 'rock'; rot: number; shown: number; from: number }[] = [];
  for (let i = 0; i < ROWS * COLS; i++) board.push({ kind: 'straight', rot: 0, shown: 0, from: 0 });
  let cursor: readonly [number, number] | null = null;
  let run: Run | null = null;
  let pulse: readonly [number, number] | null = null;
  let pulseT = 0;
  /** The shared trough stands over the board (until it's cleared and stacked beside it). */
  let trough = false;
  /** Seconds since the demo's gates opened, and since they shut (−1: not yet). */
  let pour = -1;
  let drain = -1;
  let poured: (() => void) | null = null;
  let drained: (() => void) | null = null;
  /** What water each cell shows: its dye index (−1 none) and since when. */
  const water = new Int8Array(ROWS * COLS).fill(-1);

  // The flume's separate rock mesh (the board's rock tiles) and the last matrix written to each
  // slot, so only moves upload.
  let stones: FlumeStones | null = null;
  let stoneMesh: InstancedMesh | null = null;
  let stoneLast: Float32Array | null = null;
  /** Which slots show a stone: the mesh draws only up to its last one in use. */
  let stoneOn: Uint8Array | null = null;
  let stoneDirty = false;
  const putStone = (slot: number, m: Matrix4) => {
    if (!stones) {
      // The painted stand-ins.
      const part = stoneIndex.rocks[slot];
      if (part !== undefined) stoneParts.set(part, m === STONE_HIDDEN ? ZERO : m);
      return;
    }
    const on = m === STONE_HIDDEN ? 0 : 1;
    if (stoneOn![slot] !== on) {
      stoneOn![slot] = on;
      stoneDirty = true;
    }
    const last = stoneLast!;
    const o = slot * 16;
    const e = m.elements;
    let moved = false;
    for (let k = 0; k < 16; k++) {
      const v = Math.fround(e[k]!);
      if (last[o + k] !== v) {
        last[o + k] = v;
        moved = true;
      }
    }
    if (!moved) return;
    stoneMesh!.setMatrixAt(slot, m);
    stoneDirty = true;
  };

  const placeRocks = () => {
    const covered = trough;
    let slot = 0;
    for (let i = 0; i < ROWS * COLS; i++) {
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      if (board[i]!.kind !== 'rock' || covered || slot >= TILE_ROCKS) continue;
      Q.setFromAxisAngle(UPV, 0.9 + i * 2.39);
      TMP.compose(V.set(F.cols[c]!, F.rowY[r]! - 0.08, F.rows[r]!), Q, TILE_ROCK_SCALE);
      putStone(slot++, TMP);
    }
    for (; slot < TILE_ROCKS; slot++) putStone(slot, STONE_HIDDEN);
  };

  const placeTiles = () => {
    // The tiles are put away under the shared trough while it stands.
    const covered = trough;
    for (let i = 0; i < ROWS * COLS; i++) {
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const t = board[i]!;
      const rot = t.from + (t.rot - t.from) * Math.min(1, t.shown);
      woodParts.set(
        woodIndex.straight[i]!,
        t.kind === 'straight' && !covered ? tileMatrix(r, c, rot, TMP) : ZERO,
      );
      woodParts.set(woodIndex.elbow[i]!, t.kind === 'elbow' && !covered ? tileMatrix(r, c, rot, TMP) : ZERO);
      woodParts.set(woodIndex.bed[i]!, t.kind === 'rock' && !covered ? tileMatrix(r, c, 0, TMP) : ZERO);
      for (const dye of DYES) {
        const d = DYES.indexOf(dye);
        const on = water[i] === d && !covered;
        glowParts.set(
          glowIndex[dye].straight[i]!,
          on && t.kind === 'straight' ? tileMatrix(r, c, t.rot, TMP) : ZERO,
        );
        glowParts.set(
          glowIndex[dye].elbow[i]!,
          on && t.kind === 'elbow' ? tileMatrix(r, c, t.rot, TMP) : ZERO,
        );
      }
    }
    glowParts.set(cursorPart, cursor && !covered ? tileMatrix(cursor[0], cursor[1], 0, TMP) : ZERO);
    const blink = pulse && Math.sin(pulseT * 9) > -0.2;
    glowParts.set(
      pulsePart,
      pulse && blink && !covered ? tileMatrix(pulse[0], pulse[1], 0, TMP, 0.03) : ZERO,
    );
    placeRocks();
  };

  const placeGates = () => {
    const demoOpen = pour < 0 ? 0 : drain >= 0 ? Math.max(0, 1 - drain * 2.5) : Math.min(1, pour * 2);
    for (let g = 0; g < 3; g++) {
      const crew = CREWS[g]!;
      const col = F.gates[crew];
      const open = run && run.flows.some((f) => f.crew === crew) ? Math.min(1, run.t * 2) : demoOpen;
      Q.identity();
      TMP.compose(V.set(F.cols[col]!, F.rowY[0]! + 0.55 + open * 0.75, F.rows[0]! - TILE / 2 - 0.25), Q, ONE);
      woodParts.set(woodIndex.gates[g]!, TMP);
    }
  };

  const placeDemo = () => {
    woodParts.set(woodIndex.trough, trough ? TROUGH_M : ZERO);
    stoneParts.set(stoneIndex.piers, trough ? PIERS_M : ZERO);
    woodParts.set(woodIndex.stacks, trough ? ZERO : IDENT);
    const wet = trough && pour >= 0;
    const front = wet ? Math.min(WATER_RUN, Math.max(0, (pour - FLOW_START) * FLOW_SPEED)) : 0;
    const tail = wet && drain >= 0 ? Math.max(0, (drain - 0.15) * DRAIN_SPEED) : 0;
    // The water runs down the trough a reach at a time (and drains the same way).
    for (let r = 0; r < WATER_REACHES; r++) {
      const s0 = r * REACH;
      const a = Math.min(REACH, Math.max(0, tail - s0));
      const b = Math.min(REACH, Math.max(0, front - s0));
      if (b - a < 0.01) {
        glowParts.set(reachPart[r]!, ZERO);
        continue;
      }
      TMP2.makeScale(1, 1, (b - a) / REACH).setPosition(0, 0, -TROUGH_L / 2 + WATER_FROM + s0 + a);
      glowParts.set(reachPart[r]!, TMP.multiplyMatrices(TROUGH_M, TMP2));
    }
    // The crews' floats ride the water from their gates, drift into each other and go over the lip.
    for (const f of floats) {
      const launch = FLOW_START + (f.phase * FLOAT_LOOP) / FLOW_SPEED;
      const d = wet && pour >= launch ? ((pour - launch) * FLOW_SPEED) % FLOAT_LOOP : -1;
      let s = d < 0 ? 0 : smoothstep(0, 0.5, d) * (1 - smoothstep(WATER_RUN - 0.7, WATER_RUN - 0.1, d));
      if (d >= 0 && d > front) s = 0;
      if (s > 0 && drain >= 0) s *= smoothstep(tail, tail + 0.5, d);
      if (s <= 0.001) {
        glowParts.set(f.part, ZERO);
        continue;
      }
      const u = d / WATER_RUN;
      let x =
        plumeCentre(f.crew, d) + f.side * plumeWidth(d) * 0.4 + Math.sin(d * 1.3 + f.phase * 6.28) * 0.5 * u;
      x = Math.max(-WATER_HALF + 0.4, Math.min(WATER_HALF - 0.4, x));
      const yaw =
        f.crew === 0
          ? pour * 1.3 * (f.side > 0 ? 1 : -1) + f.spin
          : Math.sin(pour * 1.7 + f.spin) * 0.7 + f.spin * 0.2;
      Q.setFromAxisAngle(UPV, yaw);
      TMP2.compose(V.set(x, TROUGH_WATER + 0.03, -TROUGH_L / 2 + WATER_FROM + d), Q, V2.set(s, s, s));
      glowParts.set(f.part, TMP.multiplyMatrices(TROUGH_M, TMP2));
    }
    // Over the lip, along the sluice and down all three chutes: everyone gets the same mud.
    const atLip = wet ? pour - AT_LIP : -1;
    for (const rb of ribbons) {
      const reach = atLip > rb.delay ? Math.min(1, ((atLip - rb.delay) * rb.speed) / rb.len) : 0;
      if (reach <= 0.001) {
        glowParts.set(rb.part, ZERO);
        continue;
      }
      TMP2.makeScale(1, 1, reach);
      glowParts.set(rb.part, TMP.multiplyMatrices(rb.base, TMP2));
      if (rb.wheel && reach >= 1)
        for (const w of wheels) if (w.crew === rb.wheel && drain < 0) w.target = 0.3;
    }
    if (poured && atLip >= 0.9) {
      const done = poured;
      poured = null;
      done();
    }
    if (drained && drain >= 1.3) {
      const done = drained;
      drained = null;
      done();
    }
  };

  /** The trough's put away for good (its boards stacked beside the terrace); any demo stops. */
  const clearTrough = () => {
    trough = false;
    pour = -1;
    drain = -1;
    for (const w of wheels) w.target = 0;
    poured?.();
    poured = null;
    drained?.();
    drained = null;
  };

  const dyeOf = (f: Flow, cellIndex: number): number => {
    if (
      f.end === 'mixed' &&
      f.at &&
      f.cells[cellIndex]?.[0] === f.at[0] &&
      f.cells[cellIndex]?.[1] === f.at[1]
    )
      return 3;
    return CREWS.indexOf(f.crew);
  };

  const placeAll = () => {
    placeTiles();
    placeGates();
    placeDemo();
  };

  const view: FlumeTerrace = {
    group,
    colliders,
    cameraBoxes,
    useStones(s) {
      // Hide the painted stand-ins; this mesh shares the island's real rock asset.
      for (const p of stoneIndex.rocks) stoneParts.set(p, ZERO);
      stones = s;
      const mesh = sharedInstancedMesh(s.geometries[TILE_ROCK_ASSET]!, s.material, TILE_ROCKS, { count: 0 });
      mesh.name = `thousand-bough-flume-rocks-${ROCK_ASSETS[TILE_ROCK_ASSET]!.key}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.computeBoundingSphere();
      markInstancesChanged(mesh);
      group.add(mesh);
      stoneMesh = mesh;
      stoneLast = new Float32Array(TILE_ROCKS * 16).fill(Number.NaN);
      stoneOn = new Uint8Array(TILE_ROCKS);
      placeRocks();
    },
    async setRound() {
      // Every round plays on the same board; the trough's long gone by round 1.
      if (trough) clearTrough();
      placeAll();
    },
    setBoard(b: ChannelRoutingState['board'], animate) {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const tile = b[r]?.[c];
          if (!tile) continue;
          const t = board[r * COLS + c]!;
          const turned = t.kind === tile.kind && t.rot !== tile.rot;
          // Turn the short way round (clockwise is +1).
          let from = t.from + (t.rot - t.from) * Math.min(1, t.shown);
          if (turned && animate) {
            let d = tile.rot - from;
            while (d > 2) d -= 4;
            while (d < -2) d += 4;
            from = tile.rot - d;
          }
          t.kind = tile.kind;
          t.rot = tile.rot;
          t.from = animate && turned ? from : tile.rot;
          t.shown = animate && turned ? 0 : 1;
        }
      placeTiles();
    },
    setCursor(cell) {
      cursor = cell;
      placeTiles();
    },
    tileCenter: (row, col, out) => tileCentre(row, col, out),
    showSharedTrough(on) {
      if (on === trough) return;
      if (on) trough = true;
      else clearTrough();
      placeAll();
    },
    demoSharedTrough() {
      trough = true;
      pour = 0;
      drain = -1;
      for (const w of wheels) w.target = 0;
      placeAll();
      return new Promise<void>((done) => {
        poured?.();
        poured = done;
      });
    },
    drainSharedTrough() {
      if (!trough || pour < 0) return Promise.resolve();
      if (drain < 0) drain = 0;
      for (const w of wheels) w.target = 0;
      return new Promise<void>((done) => {
        drained?.();
        drained = done;
      });
    },
    clearSharedTrough() {
      clearTrough();
      placeAll();
    },
    runFlows(flows) {
      water.fill(-1);
      pulse = null;
      let longest = 0;
      for (const f of flows) longest = Math.max(longest, f.cells.length * CELL_TIME + 1.4);
      return new Promise<void>((done) => {
        run = { flows, t: 0, done, length: longest };
      });
    },
    resetWater() {
      water.fill(-1);
      pulse = null;
      run?.done();
      run = null;
      for (const w of wheels) w.target = 0;
      placeTiles();
      placeGates();
    },
    update(dt) {
      let moved = false;
      for (const t of board)
        if (t.shown < 1) {
          t.shown = Math.min(1, t.shown + dt / 0.28);
          moved = true;
        }
      if (run) {
        run.t += dt;
        // Each flow fills its cells in order from its gate; a problem pulses where it happened.
        for (const f of run.flows) {
          const n = Math.min(f.cells.length, Math.floor(run.t / CELL_TIME));
          for (let i = 0; i < n; i++) {
            const [r, c] = f.cells[i]!;
            const idx = r * COLS + c;
            const d = dyeOf(f, i);
            // Two crews in one tile: mud.
            water[idx] = water[idx] !== -1 && water[idx] !== d ? 3 : d;
          }
          if (n >= f.cells.length && f.end !== 'wheel' && f.at) pulse = f.at;
          for (const w of wheels)
            if (f.wheel === w.crew && n >= f.cells.length) w.target = f.end === 'wheel' ? 1 : 0.25;
        }
        moved = true;
        if (run.t >= run.length) {
          const r = run;
          run = null;
          r.done();
        }
      }
      if (pulse) {
        pulseT += dt;
        moved = true;
      }
      if (pour >= 0) {
        pour += dt;
        if (drain >= 0) drain += dt;
        // Drained dry: the trough stands empty again.
        if (drain >= 0 && (drain - 0.15) * DRAIN_SPEED > WATER_RUN + 2) {
          pour = -1;
          drain = -1;
        }
        moved = true;
      }
      if (moved) placeAll();
      for (const w of wheels) {
        w.speed += (w.target - w.speed) * Math.min(1, dt * 1.5);
        if (w.speed > 0.001) {
          w.spin += w.speed * dt * 1.6;
          placeWheel(w);
        }
      }
      woodParts.commit();
      stoneParts.commit();
      glowParts.commit();
      if (stones && stoneMesh && stoneDirty) {
        stoneDirty = false;
        let used = 0;
        for (let k = 0; k < TILE_ROCKS; k++) if (stoneOn![k]) used = k + 1;
        stoneMesh.count = used;
        stoneMesh.visible = used > 0;
        stoneMesh.castShadow = used > 0 && stones.shadows;
        if (used > 0) {
          markInstancesChanged(stoneMesh);
          stoneMesh.computeBoundingSphere();
        }
      }
    },
    dispose() {
      if (stoneMesh) {
        group.remove(stoneMesh);
        stoneMesh.dispose();
      }
      stoneMesh = null;
      stones = null;
      woodParts.geometry.dispose();
      stoneParts.geometry.dispose();
      glowParts.geometry.dispose();
    },
  };
  placeAll();
  for (const w of wheels) placeWheel(w);
  woodParts.commit();
  stoneParts.commit();
  glowParts.commit();
  return view;
}

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  if (flat.length === 1) return flat[0]!;
  const b = makeBuckets();
  void b;
  let count = 0;
  for (const g of flat) count += g.getAttribute('position').count;
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color'] as const) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of flat) {
      const a = g.getAttribute(name);
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(
      name,
      new (flat[0]!.getAttribute(name).constructor as typeof import('three/webgpu').BufferAttribute)(
        arr,
        size,
      ),
    );
  }
  return out;
}

/** A water wheel: two rims, spokes and paddles, round its axle (local x is the axle). */
function wheelGeometry(): BufferGeometry {
  const b = makeBuckets();
  const R = 2.2;
  for (const s of [-0.45, 0.45]) {
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2;
      const a1 = ((k + 1) / 16) * Math.PI * 2;
      beam(
        b,
        'wood',
        { x: s, y: Math.cos(a0) * R, z: Math.sin(a0) * R },
        { x: s, y: Math.cos(a1) * R, z: Math.sin(a1) * R },
        0.12,
        0.18,
        PAINT.teakDark,
      );
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      beam(
        b,
        'wood',
        { x: s, y: 0, z: 0 },
        { x: s, y: Math.cos(a) * R, z: Math.sin(a) * R },
        0.08,
        0.1,
        PAINT.teakDark,
      );
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    box(b, 'wood', 0, Math.cos(a) * (R - 0.15), Math.sin(a) * (R - 0.15), 1.0, 0.45, 0.06, 0, PAINT.plank, a);
  }
  rod(b, 'wood', { x: -0.8, y: 0, z: 0 }, { x: 0.8, y: 0, z: 0 }, 0.12, 8, PAINT.weathered);
  return mergeParts(b.wood);
}

/** The terrace's walker fences (for tests and audits), without building it. */
export function flumeColliders(): BoxCollider[] {
  const out: BoxCollider[] = [];
  const b = makeBuckets();
  buildStatics(b, out, undefined, []);
  for (const list of Object.values(b)) for (const g of list) g.dispose();
  return out;
}

/** The catch sluice's floor (its middle) under the south edge. */
const SLUICE_Y = F.rowY[ROWS - 1]! - FLOOR - 0.35;

/** A wheel's chute: from its outlet under the south edge down to just short of its wheel. */
function chuteEnds(w: (typeof TB.water.wheels)[number]): {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
} {
  const zS = F.rows[ROWS - 1]! + TILE / 2;
  const col = F.outlets[w.crew as Crew];
  const a = (w.bearing * Math.PI) / 180;
  const wx = TB.tree.x + Math.sin(a) * w.r;
  const wz = TB.tree.z - Math.cos(a) * w.r;
  const ground = thousandBoughHeight(wx, wz);
  const startY = F.rowY[ROWS - 1]! - FLOOR - 0.05;
  const start = { x: F.cols[col]!, y: startY, z: zS + 1.9 };
  const dl = Math.hypot(wx - start.x, wz - start.z);
  const end = { x: wx - ((wx - start.x) / dl) * 2.3, y: ground + 2.9, z: wz - ((wz - start.z) / dl) * 2.3 };
  return { start, end };
}

/**
 * The header box over the north edge, the chutes to the wheels, the trestles, the catch sluice, and
 * the crews' gates with their painted boards (name and icon, like the Gate Board's) in `signs`.
 */
function buildStatics(
  b: Buckets,
  colliders: BoxCollider[],
  signs: SignSet | undefined,
  cameraBoxes: CameraBlockerBox[],
): void {
  const x0 = F.cols[0]! - TILE / 2;
  const x1 = F.cols[COLS - 1]! + TILE / 2;
  const zN = F.rows[0]! - TILE / 2;
  const zS = F.rows[ROWS - 1]! + TILE / 2;
  // Trestles under every tile's corners.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS; c++) {
      const x = x0 + c * TILE;
      const z = F.rows[r]!;
      const ground = thousandBoughHeight(x, z);
      const top = F.rowY[r]! - FLOOR - 0.02;
      if (top - ground > 0.15)
        rod(b, 'wood', { x, y: ground - 0.3, z }, { x, y: top, z }, 0.14, 6, PAINT.weathered);
    }
  // The header box: a long trough over the gates, fed by the Header Race from the Upper Pool.
  const hy = F.rowY[0]! + 0.2;
  const hz = zN - 1.3;
  box(b, 'wood', (x0 + x1) / 2, hy, hz, x1 - x0 + 1, 0.2, 1.8, 0, PAINT.teak);
  for (const s of [-1, 1])
    box(b, 'wood', (x0 + x1) / 2, hy + 0.5, hz + s * 0.85, x1 - x0 + 1, 0.9, 0.12, 0, PAINT.plank);
  for (const s of [-1, 1])
    box(b, 'wood', s < 0 ? x0 - 0.45 : x1 + 0.45, hy + 0.5, hz, 0.12, 0.9, 1.8, 0, PAINT.plank);
  const race = TB.water.headerRace;
  const raceTop = TB.pools.upper.level + 0.1;
  beam(
    b,
    'wood',
    { x: race.from.x, y: raceTop, z: race.from.z },
    { x: race.to.x, y: hy + 0.15, z: hz - 0.9 },
    race.width,
    0.2,
    PAINT.teak,
  );
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const x = race.from.x + (race.to.x - race.from.x) * t;
    const z = race.from.z + (race.to.z - race.from.z) * t;
    const y = raceTop + (hy + 0.15 - raceTop) * t;
    const ground = thousandBoughHeight(x, z);
    if (y - ground > 0.3)
      rod(b, 'wood', { x, y: ground - 0.3, z }, { x, y: y - 0.1, z }, 0.12, 5, PAINT.weathered);
  }
  // The crews' gate posts, painted boards and dye buckets.
  const postX = TILE / 2 - 0.18;
  const top = hy + 3.4;
  for (const crew of CREWS) {
    const col = F.gates[crew];
    const x = F.cols[col]!;
    for (const s of [-1, 1])
      rod(
        b,
        'wood',
        { x: x + s * postX, y: hy - 0.1, z: zN - 0.25 },
        { x: x + s * postX, y: top, z: zN - 0.25 },
        0.09,
        6,
        PAINT.teakDark,
      );
    beam(
      b,
      'wood',
      { x: x - postX - 0.12, y: top, z: zN - 0.25 },
      { x: x + postX + 0.12, y: top, z: zN - 0.25 },
      0.12,
      0.14,
      PAINT.teakDark,
    );
    // Hung from the beam on two ropes, in front of the posts (the gate lifts behind it).
    const look = CREW_LOOK[crew];
    for (const s of [-1, 1])
      rod(
        b,
        'rope',
        { x: x + s * 1.0, y: top - 0.05, z: zN - 0.14 },
        { x: x + s * 1.0, y: hy + 3.22, z: zN - 0.14 },
        0.025,
        4,
        PAINT.rope,
      );
    // The crew's name as big as the board allows (it reads at Lite's render scale too).
    const board = signs?.add([look.icon, look.name], 2.7, 1.45, {
      fill: look.colour,
      size: 0.42,
      scales: [0.9, 1.7],
      colors: [undefined, '#fff6e2'],
      twoSided: true,
    });
    board?.object.position.set(x, hy + 2.5, zN - 0.13);
    // The dye bucket beside the gate.
    rod(
      b,
      'wood',
      { x: x + CHANNEL + 0.9, y: hy - 0.1, z: zN - 0.9 },
      { x: x + CHANNEL + 0.9, y: hy + 0.55, z: zN - 0.9 },
      0.32,
      10,
      PAINT.weathered,
      0.36,
    );
    const dye = box(b, 'glow', x + CHANNEL + 0.9, hy + 0.5, zN - 0.9, 0.5, 0.04, 0.5, 0, 0xffffff);
    tintGlow(dye, DYE[crew]);
  }
  // The catch sluice under the south edge (the Great Hall's "main" spillway) and its side gutters.
  const sy = SLUICE_Y;
  box(b, 'stone', (x0 + x1) / 2, sy, zS + 0.9, x1 - x0 + 1.4, 0.3, 1.8, 0, PAINT.stone);
  for (const s of [-1, 1])
    box(b, 'stone', (x0 + x1) / 2, sy + 0.4, zS + 0.9 + s * 0.85, x1 - x0 + 1.4, 0.6, 0.18, 0, PAINT.stone);
  for (const s of [-1, 1]) {
    const x = s < 0 ? x0 - 0.7 : x1 + 0.7;
    box(
      b,
      'stone',
      x,
      (F.rowY[0]! + F.rowY[ROWS - 1]!) / 2 - FLOOR - 0.4,
      F.center.z,
      1.0,
      0.3,
      ROWS * TILE + 1,
      0,
      PAINT.stone,
    );
  }
  // Chutes from the wheel outlets (c0, c2, c4) down to the wheels at the trunk's foot.
  for (const w of TB.water.wheels) {
    const { start, end } = chuteEnds(w);
    beam(b, 'wood', start, end, 1.3, 0.14, PAINT.teak);
    for (const s of [-1, 1]) {
      const off = 0.62 * s;
      beam(
        b,
        'wood',
        { ...start, x: start.x + off, y: start.y + 0.3 },
        { ...end, x: end.x + off, y: end.y + 0.3 },
        0.1,
        0.5,
        PAINT.plank,
      );
    }
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    for (let s = 4; s < len - 1; s += 5) {
      const t = s / len;
      const x = start.x + (end.x - start.x) * t;
      const z = start.z + (end.z - start.z) * t;
      const y = start.y + (end.y - start.y) * t;
      const g = thousandBoughHeight(x, z);
      if (y - g > 0.4) rod(b, 'wood', { x, y: g - 0.3, z }, { x, y: y - 0.08, z }, 0.12, 5, PAINT.weathered);
    }
  }
  // Dry-stone retaining walls down both sides, stepping with the rows, mossy along their tops: the
  // terrace is built into the shelf, not standing on stilts in the dirt.
  for (const [wx, sgn] of [
    [x0 - 0.3, -1],
    [x1 + 0.3, 1],
  ] as const)
    for (let r = 0; r < ROWS; r++) {
      const top = F.rowY[r]! - FLOOR - 0.04;
      const z = F.rows[r]!;
      const ground = Math.min(thousandBoughHeight(wx, z - TILE / 2), thousandBoughHeight(wx, z + TILE / 2));
      if (top - ground < 0.15) continue;
      const h = top - ground + 0.5;
      box(b, 'stone', wx, top - h / 2, z, 0.55, h, TILE + 0.02, 0, r % 2 ? PAINT.stone : PAINT.basalt);
      box(b, 'stone', wx + sgn * 0.04, top + 0.03, z, 0.6, 0.08, TILE, 0, PAINT.moss);
      // The camera keeps out of the wall and its footing, which stand past the walker's box.
      cameraBoxes.push({
        x: wx + sgn * 0.3,
        z,
        hx: 0.6,
        hz: TILE / 2 + 0.01,
        rot: 0,
        y0: ground - 0.6,
        y1: top + 0.11,
      });
    }
  // The front wall under the last row, above the sluice.
  {
    const top = F.rowY[ROWS - 1]! - FLOOR - 0.04;
    const ground = thousandBoughHeight(F.center.x, zS);
    if (top - ground > 0.15) {
      const h = top - ground + 0.5;
      box(b, 'stone', (x0 + x1) / 2, top - h / 2, zS + 0.05, x1 - x0 + 1.1, h, 0.5, 0, PAINT.basalt);
    }
  }
  // Flowers along the header's top at both ends (planters on the trough's rim).
  for (const ex of [x0 - 0.1, x1 + 0.1])
    for (let k = 0; k < 3; k++)
      cone(
        b,
        'cloth',
        ex + (ex < F.center.x ? 0.35 : -0.35) * k,
        hy + 0.98,
        hz + (k - 1) * 0.5,
        0.16,
        0.28,
        5,
        k === 1 ? PAINT.orchid : PAINT.heliconia,
      );
  // Nobody walks on the board: a low fence of its trestles' rails.
  colliders.push({
    x: F.center.x,
    z: F.center.z,
    hx: (x1 - x0) / 2 + 0.5,
    hz: (zS - zN) / 2 + 1.6,
    rot: 0,
    y0: 18,
    y1: 25,
    height: 3,
  });
}

export { N, E, S, W };
