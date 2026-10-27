import { BufferAttribute, BufferGeometry, Color, Matrix4 } from 'three/webgpu';
import { mulberry32, sinHash, smoothstep } from '../../util/math';
import {
  buildHouse,
  HOUSE_STOREY_HEIGHT,
  type HouseFootprint,
  type HouseSide,
  type HouseSpec,
} from './house-builder';
import type { MaterialKey, VillageKit } from './kit';
import type { Buckets } from './pieces';

/**
 * A Caribbean house for an island town: one or two storeys of faded pastel plaster (the kit's walls,
 * windows and doors) or painted clapboard, louvred shutters (propped out from the top, or shut),
 * white corner boards and fascias, a steep hip or gable roof of weathered corrugated tin or silver
 * shingle, and deep verandas on posts (a two-storey gallery on the big houses), on stone piers.
 *
 * Everything is in the village kit's materials (no new shader): paint is vertex colour, worked out
 * from the colour you want to see over each material's own texture (`tintFor`), so a sea-green wall
 * reads sea-green and not as the plaster's beige times green. The kit's roofs (2-4k triangles each)
 * aren't used: a tin roof is a few hundred.
 */

/** The wall's cladding: the kit's plaster walls (with its windows and door) or clapboard. */
export type VerandaWalls = 'plaster' | 'boards';

export interface VerandaHouseSpec {
  footprint: HouseFootprint;
  storeys: 1 | 2;
  /** Its floor's middle (world), on top of whatever plinth the caller builds. */
  origin: { x: number; y: number; z: number };
  /** Its turn about +y: local −z (the front) faces (−sin, −cos) of this. */
  rotY: number;
  seed: number;
  walls: VerandaWalls;
  /** The colours you see (sRGB): wall paint, trim (corner boards, fascia, posts, rails), shutters, door. */
  wall: number;
  trim: number;
  shutter: number;
  door: number;
  roof: {
    shape: 'hip' | 'gable';
    /** A gable roof's ridge across the front (eaves to the street) or along it (a gable to the street). */
    ridge?: 'across' | 'along';
    cover: 'tin' | 'shingle';
    colour: number;
    /** Pitch (radians); steep, 0.6-0.8. */
    pitch?: number;
  };
  /** Verandas on these sides, `depth` m deep; with `gallery`, a second deck on the upper storey too. */
  veranda?: { sides: readonly HouseSide[]; depth: number; gallery?: boolean };
  /** Which wall segments have windows (the kit's patterns). */
  windows?: HouseSpec['windows'];
  /** The door's segment on the front (the kit's rule when unset). */
  doorSegment?: number;
  /** How worn it is (0-1): peeling paint, salt stains at the foot, rusty and replaced roof sheets. */
  weather?: number;
  /** Fewer parts (Lite): no pickets, fewer shutters, the tin flat on plaster. */
  lite?: boolean;
  /** Ground height (world) under a point, for the verandas' piers and steps. */
  groundAt?: (x: number, z: number) => number;
}

export interface VerandaHouseInfo {
  /** The roof's ridge or apex (world y). */
  top: number;
  /** World positions of the veranda posts (for colliders). */
  posts: { x: number; z: number }[];
  /** How far each side's veranda reaches out from its wall (0 without one). */
  out: Record<HouseSide, number>;
  /**
   * Each ground-floor veranda's deck (world): its middle, the unit direction along its wall, half its
   * length along the wall and half its depth out from it, and its top (for the walker).
   */
  decks: { x: number; z: number; ax: number; az: number; half: number; width: number; y: number }[];
  /**
   * Each propped shutter's room (world): its middle, the unit direction along its wall, half its width
   * along the wall and half its depth out from it, and its foot and hinge heights (for camera blockers).
   */
  shades: {
    x: number;
    z: number;
    ax: number;
    az: number;
    half: number;
    depth: number;
    y0: number;
    y1: number;
  }[];
  /**
   * The verandas' rails between their posts, and the gallery's posts (world): each from `a` to `b`
   * (a post: the same point), from `y0` to `y1` (for camera blockers: the walker has the deck's edge
   * and the ground floor's `posts`).
   */
  rails: { a: { x: number; z: number }; b: { x: number; z: number }; y0: number; y1: number }[];
}

const H = HOUSE_STOREY_HEIGHT;
/** A veranda roof's slope (rise per metre): shallow, so it tucks under the main eave and keeps headroom. */
const LEAN = 0.14;
/** Each material's texture's mean colour (linear), so paint can aim at the colour you see. */
const TEX_MEAN: Partial<Record<MaterialKey, readonly [number, number, number]>> = {
  plaster: [0.427, 0.344, 0.212],
  metal: [0.221, 0.221, 0.275],
};
const C = new Color();

/** Vertex paint (linear) that turns `key`'s texture into sRGB colour `hex` on average. */
export function tintFor(key: MaterialKey, hex: number, k = 1): [number, number, number] {
  C.setHex(hex);
  const m = TEX_MEAN[key];
  if (!m) return [C.r * k, C.g * k, C.b * k];
  // Capped, so the texture's darkest blotches don't blow up into noise.
  return [Math.min(3.2, (C.r / m[0]) * k), Math.min(3.2, (C.g / m[1]) * k), Math.min(3.2, (C.b / m[2]) * k)];
}

/** The wood atlas's plank bands read dark and red: lift them toward honey teak (as `pieces.ts` does). */
function woodTint(hex: number, k = 1): [number, number, number] {
  C.setHex(hex);
  return [C.r * 1.22 * k, C.g * 1.34 * k, C.b * 1.24 * k];
}

type V3 = readonly [number, number, number];
type Uv8 = readonly [number, number, number, number, number, number, number, number];
/** A box's faces: the axis each faces along and its sign. */
const BOX_FACES = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [2, 1],
  [2, -1],
] as const;
/** A face's corners in its two in-plane axes, counter-clockwise seen from outside (and the other way for the far face). */
const CCW = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
const CW = [
  [-1, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
] as const;
type RGB = readonly [number, number, number];

/** Triangles for one material, built in the house's own frame. */
class Sheet {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly t: number[] = [];
  readonly c: number[] = [];
  readonly i: number[] = [];

  vert(p: V3, n: V3, u: number, v: number, c: RGB): number {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0], n[1], n[2]);
    this.t.push(u, v);
    this.c.push(c[0], c[1], c[2]);
    return this.p.length / 3 - 1;
  }

  /** A quad a-b-c-d, counter-clockwise seen from its front (its normal's side). */
  quad(a: V3, b: V3, c: V3, d: V3, uv: Uv8, ca: RGB, cb: RGB = ca, cc: RGB = cb, cd: RGB = ca): void {
    const n = normalOf(a, b, c);
    const i0 = this.vert(a, n, uv[0], uv[1], ca);
    const i1 = this.vert(b, n, uv[2], uv[3], cb);
    const i2 = this.vert(c, n, uv[4], uv[5], cc);
    const i3 = this.vert(d, n, uv[6], uv[7], cd);
    this.i.push(i0, i1, i2, i0, i2, i3);
  }

  tri(a: V3, b: V3, c: V3, uv: readonly [number, number, number, number, number, number], col: RGB): void {
    const n = normalOf(a, b, c);
    const i0 = this.vert(a, n, uv[0], uv[1], col);
    const i1 = this.vert(b, n, uv[2], uv[3], col);
    const i2 = this.vert(c, n, uv[4], uv[5], col);
    this.i.push(i0, i1, i2);
  }

  /**
   * A box from its middle and size, turned `yaw` about +y. Its UVs run in metres on each face (`k` a
   * repeat per metre) or, for wood, along its longest side through the atlas's light plank band.
   */
  box(m: V3, s: V3, col: RGB, yaw = 0, uv: 'metres' | 'wood' = 'metres', k = 0.5): void {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const h: V3 = [s[0] / 2, s[1] / 2, s[2] / 2];
    const long = s[0] >= s[1] && s[0] >= s[2] ? 0 : s[1] >= s[2] ? 1 : 2;
    // Each face: the axis it faces along, its sign, and its two in-plane axes (counter-clockwise).
    for (const [axis, sign] of BOX_FACES) {
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      const pts: V3[] = [];
      const uvs: number[] = [];
      for (const [i, j] of sign > 0 ? CCW : CW) {
        const l = [0, 0, 0];
        l[axis] = sign * h[axis]!;
        l[a] = i * h[a]!;
        l[b] = j * h[b]!;
        pts.push([m[0] + l[0]! * cy + l[2]! * sy, m[1] + l[1]!, m[2] - l[0]! * sy + l[2]! * cy]);
        if (uv === 'wood') {
          const across = long === axis ? 0 : l[3 - long - axis]!;
          const span = long === axis ? 1 : s[3 - long - axis]!;
          uvs.push(l[long]! / 1.8, 0.03 + 0.23 * (0.5 + across / Math.max(span, 1e-3)));
        } else uvs.push(l[a]! * k, l[b]! * k);
      }
      this.quad(pts[0]!, pts[1]!, pts[2]!, pts[3]!, uvs as unknown as Uv8, col);
    }
  }

  /** A square bar from a to b (`w` across, kept upright where it can be). */
  bar(a: V3, b: V3, w: number, h: number, col: RGB, uv: 'metres' | 'wood' = 'metres'): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const f: V3 = [dx / len, dy / len, dz / len];
    // A side axis level with the ground (or x for an upright bar), and up from the two.
    let sx = -f[2];
    let sz = f[0];
    let sl = Math.hypot(sx, sz);
    if (sl < 1e-3) {
      sx = 1;
      sz = 0;
      sl = 1;
    }
    const s: V3 = [sx / sl, 0, sz / sl];
    const u: V3 = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    const corner = (p: V3, i: number, j: number): V3 => [
      p[0] + (s[0] * (i * w)) / 2 + (u[0] * (j * h)) / 2,
      p[1] + (s[1] * (i * w)) / 2 + (u[1] * (j * h)) / 2,
      p[2] + (s[2] * (i * w)) / 2 + (u[2] * (j * h)) / 2,
    ];
    const ring = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const;
    const v0 = uv === 'wood' ? 0.06 : 0;
    const v1 = uv === 'wood' ? 0.22 : w;
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = ring[k]!;
      const [i1, j1] = ring[(k + 1) % 4]!;
      const l = uv === 'wood' ? len / 1.8 : len * 0.5;
      this.quad(
        corner(a, i0, j0),
        corner(a, i1, j1),
        corner(b, i1, j1),
        corner(b, i0, j0),
        [0, v0, 0, v1, l, v1, l, v0],
        col,
      );
    }
  }

  geometry(): BufferGeometry | null {
    if (this.i.length === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.t), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.c), 3));
    g.setIndex(this.i);
    return g;
  }
}

function normalOf(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** A wall's frame in the house: its middle on the footprint line, along it (seen from outside, left to right), and out. */
interface WallFrame {
  side: HouseSide;
  /** The middle of the wall's line. */
  cx: number;
  cz: number;
  /** Along the wall, and out of it (unit, level). */
  ax: number;
  az: number;
  nx: number;
  nz: number;
  /** Its length. */
  len: number;
}

function wallFrame(f: HouseFootprint, side: HouseSide): WallFrame {
  const hw = f.w / 2;
  const hd = f.d / 2;
  if (side === 'front') return { side, cx: 0, cz: -hd, ax: -1, az: 0, nx: 0, nz: -1, len: f.w };
  if (side === 'back') return { side, cx: 0, cz: hd, ax: 1, az: 0, nx: 0, nz: 1, len: f.w };
  if (side === 'right') return { side, cx: hw, cz: 0, ax: 0, az: -1, nx: 1, nz: 0, len: f.d };
  return { side, cx: -hw, cz: 0, ax: 0, az: 1, nx: -1, nz: 0, len: f.d };
}

/** A point `along` the wall, `y` up and `out` from its line. */
function onWall(w: WallFrame, along: number, y: number, out: number): V3 {
  return [w.cx + w.ax * along + w.nx * out, y, w.cz + w.az * along + w.nz * out];
}

const SIDES: readonly HouseSide[] = ['front', 'right', 'back', 'left'];

/**
 * A louvred panel on a wall: `n` slats from its top edge down, each shaded light at its foot and dark
 * under the slat above (that's what reads as louvres from the street), hinged at its top `out` m from
 * the wall and swung out by `tilt` (0: hanging flat, shut).
 */
function louvres(
  s: Sheet,
  w: WallFrame,
  a0: number,
  a1: number,
  top: number,
  height: number,
  out: number,
  tilt: number,
  col: RGB,
  lite: boolean,
): void {
  const n = lite ? 1 : Math.max(3, Math.round(height / 0.14));
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let k = 0; k < n; k++) {
    const l0 = (height * k) / n;
    const l1 = (height * (k + 1)) / n;
    const y0 = top - l0 * ct;
    const y1 = top - l1 * ct;
    const o0 = out + l0 * st;
    // Each slat's foot stands a little proud, so it catches the sky.
    const o1 = out + l1 * st + (lite ? 0 : 0.018);
    const dark = lite ? col : scale(col, 0.58);
    const light = lite ? col : scale(col, 1.06);
    s.quad(
      onWall(w, a0, y1, o1),
      onWall(w, a1, y1, o1),
      onWall(w, a1, y0, o0),
      onWall(w, a0, y0, o0),
      [a0 * 0.5, y1 * 0.5, a1 * 0.5, y1 * 0.5, a1 * 0.5, y0 * 0.5, a0 * 0.5, y0 * 0.5],
      light,
      light,
      dark,
      dark,
    );
  }
}

/** A propped shutter's room in the house's own frame (`VerandaHouseInfo.shades` before the turn). */
type Shade = VerandaHouseInfo['shades'][number];

/**
 * Shutters for one window (`along` its middle, `width` × `height` from `sill` up, its frame `out` m
 * proud). A propped one adds its room to `shades` (house-local).
 */
function shutters(
  s: Sheet,
  w: WallFrame,
  along: number,
  sill: number,
  width: number,
  height: number,
  out: number,
  col: RGB,
  style: 'propped' | 'shut',
  lite: boolean,
  rand: () => number,
  shades: Shade[],
): void {
  if (style === 'propped') {
    // Bahama shutters: one panel hinged above the window, propped out from its foot.
    const tilt = 0.5 + rand() * 0.25;
    const top = sill + height + 0.1;
    const reach = (height + 0.05) * Math.sin(tilt) + 0.02;
    const mid = onWall(w, along, 0, out + reach / 2);
    shades.push({
      x: mid[0],
      z: mid[2],
      ax: w.ax,
      az: w.az,
      half: width / 2 + 0.05,
      depth: reach / 2,
      y0: top - (height + 0.05) * Math.cos(tilt),
      y1: top,
    });
    louvres(
      s,
      w,
      along - width / 2 - 0.05,
      along + width / 2 + 0.05,
      sill + height + 0.1,
      height + 0.05,
      out,
      tilt,
      col,
      lite,
    );
    return;
  }
  // Two leaves shut over it, a hair apart.
  louvres(s, w, along - width / 2, along - 0.012, sill + height, height, out, 0, col, lite);
  louvres(s, w, along + 0.012, along + width / 2, sill + height, height, out, 0, col, lite);
}

/**
 * Corrugated tin or shingle over one roof face: its eave from `e0` along `dir` (`len` m), climbing
 * `inward` at slope `k` (rise per metre), `depth` m in plan to its ridge; with `hips`, cut back at
 * both ends along 45° hips (a hip roof's faces).
 */
function roofFace(
  sheet: Sheet,
  e0: V3,
  dir: V3,
  len: number,
  inward: V3,
  k: number,
  depth: number,
  hips: boolean,
  cover: 'tin' | 'shingle' | 'flat',
  col: RGB,
  rand: () => number,
  weather: number,
): void {
  const at = (s: number, d: number): V3 => [
    e0[0] + dir[0] * s + inward[0] * d,
    e0[1] + d * k,
    e0[2] + dir[2] * s + inward[2] * d,
  ];
  const reach = (s: number) => (hips ? Math.max(0, Math.min(s, len - s, depth)) : depth);
  const slope = Math.sqrt(1 + k * k);
  if (cover === 'shingle') {
    // Courses up the slope, each dark under the butts of the course above it.
    const course = 0.34 / slope;
    const rows = Math.max(1, Math.ceil(depth / course));
    for (let r = 0; r < rows; r++) {
      const d0 = (depth * r) / rows;
      const d1 = (depth * (r + 1)) / rows;
      const s00 = hips ? d0 : 0;
      const s01 = hips ? len - d0 : len;
      const s10 = hips ? d1 : 0;
      const s11 = hips ? len - d1 : len;
      if (s01 - s00 < 0.02) break;
      const tone = 0.86 + 0.24 * rand();
      const c = scale(col, tone * (1 - weather * 0.15 * rand()));
      const v0 = d0 * slope * 0.5;
      const v1 = d1 * slope * 0.5;
      // The eave runs clockwise seen from above, so the quad goes the other way to face up.
      sheet.quad(
        at(s01, d0),
        at(s00, d0),
        at(s10, d1),
        at(s11, d1),
        [s01 * 0.5, v0, s00 * 0.5, v0, s10 * 0.5, v1, s11 * 0.5, v1],
        c,
        c,
        scale(c, 0.62),
        scale(c, 0.62),
      );
    }
    return;
  }
  // Tin: columns down the slope (a corrugation's repeat of the metal atlas each), sheets of three
  // columns each their own shade: some newer, some rusting through. Column edges meet the hips' knees.
  const cw = 0.3;
  const stops: number[] = [];
  const knots = hips && depth < len / 2 ? [0, depth, len - depth, len] : hips ? [0, len / 2, len] : [0, len];
  for (let j = 0; j + 1 < knots.length; j++) {
    const a = knots[j]!;
    const b = knots[j + 1]!;
    const n = Math.max(1, Math.round((b - a) / cw));
    for (let q = 0; q < n; q++) stops.push(a + ((b - a) * q) / n);
  }
  stops.push(len);
  let sheetCol: RGB = col;
  for (let q = 0; q + 1 < stops.length; q++) {
    if (q % 3 === 0) {
      const h = rand();
      const rust = h < 0.1 + 0.18 * weather;
      const fresh = !rust && h > 0.93 - 0.04 * weather;
      sheetCol = rust
        ? mix(col, tintRust(cover), 0.45 + 0.3 * rand())
        : fresh
          ? mix(col, scale(col, 1.25), 0.6)
          : scale(col, 0.9 + 0.18 * rand());
    }
    const s0 = stops[q]!;
    const s1 = stops[q + 1]!;
    const d0 = reach(s0);
    const d1 = reach(s1);
    if (d0 < 1e-3 && d1 < 1e-3) continue;
    const u0 = cover === 'flat' ? s0 * 0.5 : 0.006;
    const u1 = cover === 'flat' ? s1 * 0.5 : 0.058;
    const vt0 = cover === 'flat' ? d0 * 0.5 : 0.02 + Math.min(0.96, d0 * slope * 0.17);
    const vt1 = cover === 'flat' ? d1 * 0.5 : 0.02 + Math.min(0.96, d1 * slope * 0.17);
    // A rust stain along the eave.
    const foot = scale(sheetCol, 1 - 0.18 * weather);
    sheet.quad(
      at(s1, 0),
      at(s0, 0),
      at(s0, d0),
      at(s1, d1),
      [u1, 0.02, u0, 0.02, u0, vt0, u1, vt1],
      foot,
      foot,
      sheetCol,
      sheetCol,
    );
  }
}

let rustTin: RGB = [0, 0, 0];
let rustFlat: RGB = [0, 0, 0];
function tintRust(cover: 'tin' | 'shingle' | 'flat'): RGB {
  if (rustTin[0] === 0) {
    rustTin = tintFor('metal', 0x8a4a2c);
    rustFlat = tintFor('plaster', 0x8a4a2c);
  }
  return cover === 'flat' ? rustFlat : rustTin;
}

/**
 * The house's own parts, by material, in its frame; then placed (its root turn and origin) into the
 * buckets with the kit's walls.
 */
export function addVerandaHouse(b: Buckets, kit: VillageKit, spec: VerandaHouseSpec): VerandaHouseInfo {
  const rand = mulberry32(spec.seed * 7919 + 13);
  const lite = !!spec.lite;
  const weather = spec.weather ?? 0.5;
  const { w: W, d: D } = spec.footprint;
  const top = spec.storeys * H;
  const sheets: Partial<Record<MaterialKey, Sheet>> = {};
  const sheet = (k: MaterialKey) => (sheets[k] ??= new Sheet());
  const wallCol = tintFor('plaster', spec.wall);
  const trimCol = tintFor('plaster', spec.trim);
  const shutterCol = tintFor('plaster', spec.shutter);
  const deckCol = woodTint(0xcfc4b2);
  // Shingle is painted over the plaster's texture (silver-grey reads true there, not over the wood atlas's
  // red-brown); tin over the metal's (a corrugation per column), or plain on Lite (no metal there).
  const tinKey: MaterialKey = spec.roof.cover === 'shingle' || lite ? 'plaster' : 'metal';
  const roofCover = spec.roof.cover === 'shingle' ? 'shingle' : lite ? 'flat' : 'tin';
  // Lite's plain plaster reads brighter than the tin's metal: toned down to match.
  const roofCol: RGB = tintFor(tinKey, spec.roof.colour, lite && spec.roof.cover === 'tin' ? 0.72 : 1);
  const root = new Matrix4()
    .makeTranslation(spec.origin.x, spec.origin.y, spec.origin.z)
    .multiply(new Matrix4().makeRotationY(spec.rotY));
  const cr = Math.cos(spec.rotY);
  const sr = Math.sin(spec.rotY);
  const toWorld = (x: number, z: number) => ({
    x: spec.origin.x + x * cr + z * sr,
    z: spec.origin.z - x * sr + z * cr,
  });
  const groundLocal = (x: number, z: number) => {
    if (!spec.groundAt) return -0.6;
    const p = toWorld(x, z);
    return spec.groundAt(p.x, p.z) - spec.origin.y;
  };
  const out: Record<HouseSide, number> = { front: 0, back: 0, left: 0, right: 0 };
  const posts: { x: number; z: number }[] = [];
  const decks: VerandaHouseInfo['decks'] = [];
  const shades: Shade[] = [];
  const rails: VerandaHouseInfo['rails'] = [];
  const verandaSides = new Set(spec.veranda?.sides ?? []);
  const vd = spec.veranda?.depth ?? 0;
  for (const s of verandaSides) out[s] = vd;

  // Shutter styles by window (seeded): most propped out, some shut, a few bare.
  const shutterStyle = (): 'propped' | 'shut' | null => {
    const r = rand();
    if (lite && r < 0.45) return null;
    return r < 0.58 ? 'propped' : r < 0.85 ? 'shut' : null;
  };

  // --- Walls -------------------------------------------------------------------------------------
  if (spec.walls === 'plaster') {
    const kitSpec: HouseSpec = {
      footprint: spec.footprint,
      storeys: spec.storeys,
      ground: 'plaster',
      upper: 'plaster',
      doorSide: 'front',
      doorSegment: spec.doorSegment,
      roof: 'gable',
      windows: spec.windows,
      seed: spec.seed,
      origin: spec.origin,
      rotY: spec.rotY,
    };
    for (const placement of buildHouse(kitSpec)) {
      const role = placement.role;
      if (role !== 'wall' && role !== 'window' && role !== 'door' && role !== 'doorframe') continue;
      // Square-headed windows (the kit's round ones read European).
      let piece = placement.piece;
      if (piece.includes('_Window_'))
        piece = piece.replace(/_Window_(Wide|Thin)_(Round|Flat)/, '_Window_Wide_Flat');
      if (piece.startsWith('Window_')) piece = 'Window_Wide_Flat1';
      const parts = kit.pieces.get(piece);
      if (!parts) continue;
      for (const part of parts) {
        const g = part.geometry.clone();
        g.applyMatrix4(placement.matrix);
        stripExtras(g);
        const key = part.materialKey;
        let col: RGB;
        if (key === 'plaster') col = wallCol;
        else if (key === 'glow') col = [1, 1, 1];
        else if (role === 'door') col = woodTint(spec.door);
        else col = woodTint(0xe8e2d4);
        paintWeathered(g, col, key === 'plaster' ? weather : 0, spec.origin.y, spec.seed);
        b[key].push(g);
      }
      if (role === 'window' && placement.side && placement.storey !== undefined) {
        const covered =
          verandaSides.has(placement.side) && (placement.storey === 0 || !!spec.veranda?.gallery);
        const style = covered ? (rand() < 0.5 ? 'shut' : null) : shutterStyle();
        if (style) {
          const wf = wallFrame(spec.footprint, placement.side);
          const along = (placement.local.x - wf.cx) * wf.ax + (placement.local.z - wf.cz) * wf.az;
          shutters(
            sheet('plaster'),
            wf,
            along,
            placement.storey * H + 0.95,
            1.62,
            1.58,
            style === 'shut' ? 0.43 : 0.32,
            shutterCol,
            style,
            lite,
            rand,
            shades,
          );
        }
      }
    }
  } else {
    const covered = (side: HouseSide, storey: number) =>
      verandaSides.has(side) && (storey === 0 || !!spec.veranda?.gallery);
    boardWalls(sheet, spec, wallCol, trimCol, shutterCol, weather, lite, rand, shades, (side, storey) =>
      covered(side, storey) ? (rand() < 0.5 ? 'shut' : null) : shutterStyle(),
    );
  }

  // Corner boards, white.
  for (const [x, z] of [
    [-W / 2, -D / 2],
    [W / 2, -D / 2],
    [W / 2, D / 2],
    [-W / 2, D / 2],
  ] as const)
    sheet('plaster').box([x, top / 2, z], [0.26, top, 0.26], trimCol);

  // A frieze board round the walls' top, under the eaves.
  for (const side of SIDES) {
    const wf = wallFrame(spec.footprint, side);
    sheet('plaster').bar(
      onWall(wf, -wf.len / 2 - 0.13, top + 0.04, 0.12),
      onWall(wf, wf.len / 2 + 0.13, top + 0.04, 0.12),
      0.05,
      0.3,
      trimCol,
    );
  }

  // --- Roof --------------------------------------------------------------------------------------
  const pitch = spec.roof.pitch ?? 0.68;
  const k = Math.tan(pitch);
  const o = 0.32;
  const shape = spec.roof.shape;
  // The roof frame: ridge along its x. A gable roof's ridge along the front unless it's 'along'.
  const alongX = shape === 'hip' ? W >= D : spec.roof.ridge !== 'along';
  const A = (alongX ? W : D) / 2 + o;
  const Cc = (alongX ? D : W) / 2 + o;
  // The roof's underside clears the kit walls' outer face (9 cm out) and the clapboard's.
  const eaveY = top + 0.05 - (o - 0.12) * k;
  const roofTop = eaveY + Cc * k;
  const rs = new Sheet();
  const rf = new Sheet();
  const rr = (x: number, y: number, z: number): V3 => (alongX ? [x, y, z] : [z, y, -x]);
  const face = (e0: V3, dir: V3, len: number, inward: V3, depth: number, hips: boolean) =>
    roofFace(
      rs,
      rr(e0[0], e0[1], e0[2]),
      rr(dir[0], 0, dir[2]),
      len,
      rr(inward[0], 0, inward[2]),
      k,
      depth,
      hips,
      roofCover,
      roofCol,
      rand,
      weather,
    );
  const hip = shape === 'hip';
  face([-A, eaveY, -Cc], [1, 0, 0], 2 * A, [0, 0, 1], Cc, hip);
  face([A, eaveY, Cc], [-1, 0, 0], 2 * A, [0, 0, -1], Cc, hip);
  if (hip) {
    face([A, eaveY, -Cc], [0, 0, 1], 2 * Cc, [-1, 0, 0], Cc, true);
    face([-A, eaveY, Cc], [0, 0, -1], 2 * Cc, [1, 0, 0], Cc, true);
  }
  // Ridge and hip caps, fascia boards, a gable's bargeboards and its wall.
  const capCol = scale(roofCol, 0.8);
  const ridgeHalf = hip ? A - Cc : A;
  if (ridgeHalf > 0.01)
    rs.bar(rr(-ridgeHalf, roofTop + 0.03, 0), rr(ridgeHalf, roofTop + 0.03, 0), 0.26, 0.08, capCol);
  if (hip)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        rs.bar(
          rr(sx * A, eaveY + 0.03, sz * Cc),
          rr(sx * Math.max(ridgeHalf, 0), roofTop + 0.03, 0),
          0.2,
          0.07,
          capCol,
        );
  for (const sz of [-1, 1])
    rf.bar(rr(-A, eaveY - 0.06, sz * Cc), rr(A, eaveY - 0.06, sz * Cc), 0.04, 0.2, trimCol);
  if (hip)
    for (const sx of [-1, 1])
      rf.bar(rr(sx * A, eaveY - 0.06, -Cc), rr(sx * A, eaveY - 0.06, Cc), 0.04, 0.2, trimCol);
  else {
    const half = (alongX ? W : D) / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1])
        rf.bar(
          rr(sx * (A - 0.02), eaveY - 0.04, sz * Cc),
          rr(sx * (A - 0.02), roofTop - 0.04, 0),
          0.05,
          0.22,
          trimCol,
        );
      // The gable's wall over the wall's top, up under the roof (a strip, then the triangle).
      const e = Cc - o;
      const y1 = eaveY + o * k - 0.03;
      const pts = [
        rr(sx * half, top, -e),
        rr(sx * half, top, e),
        rr(sx * half, y1, e),
        rr(sx * half, y1, -e),
      ];
      const ap = rr(sx * half, eaveY + Cc * k - 0.03, 0);
      const outward = rr(sx, 0, 0);
      const ws = sheet('plaster');
      const n = normalOf(pts[0]!, pts[1]!, pts[2]!);
      const flip = n[0] * outward[0] + n[2] * outward[2] < 0;
      const q = flip ? [pts[1]!, pts[0]!, pts[3]!, pts[2]!] : pts;
      ws.quad(q[0]!, q[1]!, q[2]!, q[3]!, [0, 0, 1, 0, 1, 0.1, 0, 0.1], wallCol);
      ws.tri(q[3]!, q[2]!, ap, [0, 0.1, 1, 0.1, 0.5, 1], wallCol);
    }
  }
  pushSheet(b, tinKey, rs, root);
  pushSheet(b, 'plaster', rf, root);

  // --- Verandas ----------------------------------------------------------------------------------
  const gallery = !!spec.veranda?.gallery && spec.storeys === 2;
  for (const side of SIDES) {
    if (!verandaSides.has(side)) continue;
    const wf = wallFrame(spec.footprint, side);
    // Front and back own the corners where a side veranda meets them.
    const ends: [number, number] = [-wf.len / 2, wf.len / 2];
    if (side === 'front' || side === 'back') {
      const leftOfViewer = side === 'front' ? 'right' : 'left';
      const rightOfViewer = side === 'front' ? 'left' : 'right';
      if (verandaSides.has(leftOfViewer)) ends[0] -= vd;
      if (verandaSides.has(rightOfViewer)) ends[1] += vd;
    }
    const levels = gallery ? [0, H] : [0];
    for (const level of levels) {
      const upper = level > 0;
      // The deck: boards along the wall, an edge beam.
      const deckTop = level + 0.04;
      const d0 = 0.1;
      const mid = (ends[0] + ends[1]) / 2;
      const span = ends[1] - ends[0];
      const deckMid = onWall(wf, mid, deckTop - 0.05, (d0 + vd) / 2);
      if (!upper) {
        const c = toWorld(deckMid[0], deckMid[2]);
        const e = toWorld(deckMid[0] + wf.ax, deckMid[2] + wf.az);
        decks.push({
          x: c.x,
          z: c.z,
          ax: e.x - c.x,
          az: e.z - c.z,
          half: span / 2,
          width: (vd - d0) / 2 + 0.05,
          y: spec.origin.y + deckTop,
        });
      }
      sheet('wood').box(
        deckMid,
        wf.ax !== 0 ? [span, 0.1, vd - d0] : [vd - d0, 0.1, span],
        deckCol,
        0,
        'wood',
      );
      sheet('wood').bar(
        onWall(wf, ends[0], deckTop - 0.16, vd - 0.05),
        onWall(wf, ends[1], deckTop - 0.16, vd - 0.05),
        0.1,
        0.22,
        woodTint(0x5e4c3e),
        'wood',
      );
      // The roof over it: a shallow lean-to from under the main eave (or the gallery's deck below it).
      const roofAtWall = upper || spec.storeys === 1 ? top - 0.42 : H + 0.62;
      const roofOut = roofAtWall - LEAN * (vd + 0.25);
      const coveredByGallery = gallery && !upper;
      const postTop = coveredByGallery ? H - 0.06 : roofOut - 0.02;
      // Posts along its outer edge, and piers to the ground under the lower deck.
      const n = Math.max(2, Math.round(span / 2.3) + 1);
      const doorAt = side === 'front' && !upper ? doorAlong(spec) : null;
      for (let q = 0; q < n; q++) {
        const along = ends[0] + 0.1 + ((span - 0.2) * q) / (n - 1);
        const p = onWall(wf, along, 0, vd - 0.12);
        sheet('plaster').box(
          [p[0], level + (postTop - level) / 2, p[2]],
          [0.15, postTop - level, 0.15],
          trimCol,
        );
        if (!upper) {
          const g = groundLocal(p[0], p[2]);
          if (g < -0.05)
            sheet('stone' as MaterialKey).box(
              [p[0], (g - 0.3 + deckTop - 0.1) / 2, p[2]],
              [0.34, deckTop - 0.1 - g + 0.3, 0.34],
              tintFor('stone', 0xd8ccb0),
              0,
              'metres',
              0.6,
            );
          const wp = toWorld(p[0], p[2]);
          posts.push(wp);
        } else {
          const wp = toWorld(p[0], p[2]);
          rails.push({ a: wp, b: wp, y0: spec.origin.y + level, y1: spec.origin.y + postTop });
        }
        // Rails between this post and the next (a gap where the steps come up to the door).
        if (q + 1 < n) {
          const next = ends[0] + 0.1 + ((span - 0.2) * (q + 1)) / (n - 1);
          if (doorAt !== null && doorAt > along && doorAt < next) continue;
          const ra = onWall(wf, along + 0.08, 0, vd - 0.12);
          const rb = onWall(wf, next - 0.08, 0, vd - 0.12);
          rails.push({
            a: toWorld(ra[0], ra[2]),
            b: toWorld(rb[0], rb[2]),
            y0: spec.origin.y + level + 0.1,
            y1: spec.origin.y + level + 1.0,
          });
          for (const y of [level + 0.95, level + 0.16])
            sheet('plaster').bar([ra[0], y, ra[2]], [rb[0], y, rb[2]], 0.07, 0.07, trimCol);
          if (!lite) {
            const pickets = Math.max(1, Math.round((next - along) / 0.16));
            for (let j = 1; j < pickets; j++) {
              const pa = onWall(wf, along + ((next - along) * j) / pickets, 0, vd - 0.12);
              sheet('plaster').box([pa[0], level + 0.555, pa[2]], [0.04, 0.72, 0.04], trimCol);
            }
          }
        }
      }
      if (!coveredByGallery) {
        const ls = new Sheet();
        roofFace(
          ls,
          onWall(wf, ends[1] + 0.15, roofOut, vd + 0.25),
          [-wf.ax, 0, -wf.az],
          span + 0.3,
          [-wf.nx, 0, -wf.nz],
          LEAN,
          vd + 0.25,
          false,
          roofCover,
          scale(roofCol, 0.95),
          rand,
          weather,
        );
        ls.bar(
          onWall(wf, ends[0] - 0.15, roofOut - 0.06, vd + 0.25),
          onWall(wf, ends[1] + 0.15, roofOut - 0.06, vd + 0.25),
          0.04,
          0.18,
          trimCol,
        );
        pushSheet(b, tinKey, ls, root);
      }
      // Steps down from the deck to the door's path.
      if (doorAt !== null) {
        const g = groundLocal(...xzOf(onWall(wf, doorAt, 0, vd + 0.6)));
        const rise = deckTop - g;
        const steps = Math.min(6, Math.max(0, Math.round(rise / 0.2)));
        for (let q = 0; q < steps; q++) {
          const y = deckTop - ((q + 1) * rise) / (steps + 1);
          const p = onWall(wf, doorAt, y - 0.05, vd + 0.16 + q * 0.28);
          sheet('wood').box(p, wf.ax !== 0 ? [1.4, 0.08, 0.3] : [0.3, 0.08, 1.4], deckCol, 0, 'wood');
        }
      }
    }
  }

  for (const key of Object.keys(sheets) as MaterialKey[]) pushSheet(b, key, sheets[key]!, root);
  // The shutters' rooms, turned into the world.
  for (const h of shades) {
    const p = toWorld(h.x, h.z);
    const ax = h.ax * cr + h.az * sr;
    h.az = -h.ax * sr + h.az * cr;
    h.ax = ax;
    h.x = p.x;
    h.z = p.z;
    h.y0 += spec.origin.y;
    h.y1 += spec.origin.y;
  }
  return { top: spec.origin.y + roofTop, posts, out, decks, shades, rails };
}

function xzOf(p: V3): [number, number] {
  return [p[0], p[2]];
}

/** Where along the front wall (its frame) the door is: the kit's door segment. */
function doorAlong(spec: VerandaHouseSpec): number {
  const n = spec.footprint.w / 2;
  const seg = Math.max(0, Math.min(n - 1, spec.doorSegment ?? Math.floor((n - 1) / 2)));
  // The front's frame runs along −x; segment 0 is at local x = −w/2 + 1.
  const x = -spec.footprint.w / 2 + 1 + seg * 2;
  return -x;
}

/** Placed in the house's root, into its material's bucket. */
function pushSheet(b: Buckets, key: MaterialKey, s: Sheet, root: Matrix4): void {
  const g = s.geometry();
  if (!g) return;
  g.applyMatrix4(root);
  b[key].push(g);
}

/** What `paint` drops so kit pieces merge with built ones. */
function stripExtras(g: BufferGeometry): void {
  for (const name of ['tangent', 'uv1', 'uv2'] as const) if (g.hasAttribute(name)) g.deleteAttribute(name);
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = g.getAttribute(name) as BufferAttribute | undefined;
    if (attr && !(attr.array instanceof Float32Array)) {
      const data = new Float32Array(attr.count * attr.itemSize);
      for (let i = 0; i < attr.count; i++)
        for (let c = 0; c < attr.itemSize; c++) data[i * attr.itemSize + c] = attr.getComponent(i, c);
      g.setAttribute(name, new BufferAttribute(data, attr.itemSize));
    }
  }
}

/**
 * Vertex paint `col` over a kit piece, worn by `weather`: salt-grey and damp toward the wall's foot,
 * paint peeled to bare plaster in patches (whiter, greyer), faint streaks under the eaves.
 */
function paintWeathered(g: BufferGeometry, col: RGB, weather: number, base: number, seed: number): void {
  const p = g.getAttribute('position');
  const colours = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const c = weathered(col, x + z, p.getY(i) - base, weather, seed, x * 3.1 + z * 2.3);
    colours[i * 3] = c[0];
    colours[i * 3 + 1] = c[1];
    colours[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new BufferAttribute(colours, 3));
}

let wear: { faded: RGB; salt: RGB; bare: RGB; dirt: RGB } | null = null;
/** Weathering's colours as paint over the plaster (made once). */
function wearColours(): { faded: RGB; salt: RGB; bare: RGB; dirt: RGB } {
  return (wear ??= {
    faded: tintFor('plaster', 0xcfc9bb),
    salt: tintFor('plaster', 0xeceae2),
    bare: tintFor('plaster', 0xb9b1a2),
    dirt: tintFor('plaster', 0x6f5d48),
  });
}

/**
 * Painted wall worn by salt and sun (`weather` 0-1), at a point `along` the wall and `up` from its
 * foot: the paint faded toward chalky grey, peeled to bare plaster or grey timber in patches, salt
 * crusting white in blotches and in tide-like bands low down, and splashed dirt and damp at the foot.
 */
function weathered(col: RGB, along: number, up: number, weather: number, seed: number, wobble: number): RGB {
  if (weather <= 0) return col;
  const { faded, salt, bare, dirt } = wearColours();
  let c = mix(col, faded, 0.38 * weather);
  const cell = sinHash(Math.floor(along / 0.9), Math.floor(up / 0.7), seed);
  if (cell > 1 - 0.24 * weather) c = mix(c, bare, 0.6);
  const blotch = sinHash(Math.floor(along / 1.3) + 17, Math.floor(up / 1.1), seed + 5);
  if (blotch > 1 - 0.3 * weather) c = mix(c, salt, 0.5);
  // Salt in a ragged band a little over the foot (the spray's reach), dirt and damp under it.
  const band = smoothstep(0.5, 0.8, up) * (1 - smoothstep(1.0, 1.6, up)) * (0.6 + 0.4 * Math.sin(wobble));
  c = mix(c, salt, 0.35 * band * weather);
  const foot = 1 - smoothstep(0, 0.9, up);
  c = mix(c, dirt, 0.6 * foot * weather);
  // Streaks down from the eaves.
  return scale(c, 1 - 0.07 * weather * (0.5 + 0.5 * Math.sin(along * 4.7 + seed)));
}

/**
 * Clapboard walls: lapped boards (each one's foot proud of the one below's top, so it reads in the
 * sun), a little different paint from board to board and bare grey where it's peeled; windows with
 * white frames and shutters, and a panelled door, laid over them.
 */
function boardWalls(
  sheet: (k: MaterialKey) => Sheet,
  spec: VerandaHouseSpec,
  wallCol: RGB,
  trimCol: RGB,
  shutterCol: RGB,
  weather: number,
  lite: boolean,
  rand: () => number,
  shades: Shade[],
  shutterStyle: (side: HouseSide, storey: number) => 'propped' | 'shut' | null,
): void {
  const top = spec.storeys * H;
  const boardH = lite ? 0.52 : 0.26;
  // Boards in lengths along the wall (each its own wear); one length on Lite.
  const pieceLen = lite ? 99 : 1.5;
  const s = sheet('plaster');
  const door = doorAlong(spec);
  for (const side of SIDES) {
    const wf = wallFrame(spec.footprint, side);
    const n = Math.round(top / boardH);
    for (let r = 0; r < n; r++) {
      const y0 = (top * r) / n;
      const y1 = (top * (r + 1)) / n;
      const board = scale(wallCol, 0.9 + 0.16 * rand());
      const span = wf.len + 0.04;
      const pieces = Math.max(1, Math.round(span / pieceLen));
      for (let q = 0; q < pieces; q++) {
        const a = -span / 2 + (span * q) / pieces;
        const e = -span / 2 + (span * (q + 1)) / pieces;
        // A board or two replaced with bare, unpainted grey timber.
        let c = rand() < 0.06 * weather ? mix(board, wearColours().bare, 0.7) : board;
        const wa = weathered(c, a + wf.cx + wf.cz, y0, weather, spec.seed, a * 3.1 + side.length);
        const we = weathered(c, e + wf.cx + wf.cz, y0, weather, spec.seed, e * 3.1 + side.length);
        c = wa;
        s.quad(
          onWall(wf, a, y0, 0.03),
          onWall(wf, e, y0, 0.03),
          onWall(wf, e, y1, 0),
          onWall(wf, a, y1, 0),
          [a * 0.5, y0 * 0.5, e * 0.5, y0 * 0.5, e * 0.5, y1 * 0.5, a * 0.5, y1 * 0.5],
          wa,
          we,
          scale(we, lite ? 1 : 0.72),
          scale(c, lite ? 1 : 0.72),
        );
      }
    }
    // Windows (and the door) by 2 m segment.
    const segs = wf.len / 2;
    for (let st = 0; st < spec.storeys; st++)
      for (let q = 0; q < segs; q++) {
        const along = -wf.len / 2 + 1 + q * 2;
        const isDoor = st === 0 && side === 'front' && Math.abs(along - door) < 0.01;
        if (isDoor) {
          const y = 0;
          sheet('wood').box(
            onWall(wf, along, y + 1.08, 0.05),
            wf.ax !== 0 ? [1.0, 2.16, 0.05] : [0.05, 2.16, 1.0],
            woodTint(spec.door),
            0,
            'wood',
          );
          for (const da of [-0.56, 0.56])
            s.box(
              onWall(wf, along + da, y + 1.14, 0.07),
              wf.ax !== 0 ? [0.12, 2.28, 0.06] : [0.06, 2.28, 0.12],
              trimCol,
            );
          s.box(
            onWall(wf, along, y + 2.32, 0.07),
            wf.ax !== 0 ? [1.26, 0.14, 0.06] : [0.06, 0.14, 1.26],
            trimCol,
          );
          continue;
        }
        const want =
          side === 'front' || side === 'back' ? rand() < 0.8 : segs > 2 ? q % 2 === 1 : rand() < 0.5;
        if (!want) continue;
        const sill = st * H + 0.95;
        const wW = 1.0;
        const wH = 1.36;
        sheet('glow').box(
          onWall(wf, along, sill + wH / 2, 0.035),
          wf.ax !== 0 ? [wW, wH, 0.03] : [0.03, wH, wW],
          [1, 1, 1],
        );
        for (const da of [-wW / 2 - 0.05, wW / 2 + 0.05])
          s.box(
            onWall(wf, along + da, sill + wH / 2, 0.06),
            wf.ax !== 0 ? [0.1, wH + 0.2, 0.05] : [0.05, wH + 0.2, 0.1],
            trimCol,
          );
        for (const dy of [-0.05, wH + 0.05])
          s.box(
            onWall(wf, along, sill + dy, 0.07),
            wf.ax !== 0 ? [wW + 0.3, 0.1, 0.08] : [0.08, 0.1, wW + 0.3],
            trimCol,
          );
        const style = shutterStyle(side, st);
        if (style) shutters(s, wf, along, sill, wW + 0.08, wH, 0.1, shutterCol, style, lite, rand, shades);
      }
  }
}
