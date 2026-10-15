import { BufferAttribute, BufferGeometry, Vector3 } from 'three/webgpu';
import { mulberry32 } from '../../../../util/math';
import { THOUSAND_BOUGH as TB, TREE, bearingOf } from '../layout';
import { COLUMN_TOP } from '../village/surfaces';
import {
  BRANCHES,
  ROOT_GATE,
  TRUNK_BASE,
  carryingSprays,
  coreSurface,
  type Branch,
  type Cluster,
  type GroundRoot,
  type PropRoot,
  type Vine,
} from './shape';

/**
 * The great banyan's meshes, in the shared vegetation material's procedural form (bark and leaves
 * told apart by `vegPart`, shaded by `shade`, coloured by vertex colour): no new shader. Positions are
 * relative to `TREE_ORIGIN`, sunk far below their real height: the material sways geometry by its
 * own height above its origin, and the tree mustn't sway against the decks bolted to it (its leaves
 * still flutter).
 */
export const TREE_ORIGIN = { x: TREE.x, y: 140, z: TREE.z } as const;

/** The palette (spec §2.3), as linear-ish 0–1 vertex colours the material grades from. */
// Warmed toward the spec's silver #8C8573 (undertone #6B5A45) from the stone part's cool grey.
const BARK = [1.0, 0.86, 0.6] as const;
const BARK_DARK = [0.32, 0.22, 0.1] as const;
const MOSS = [0.2, 0.95, 0.12] as const;
/**
 * The bark draws as the material's stone part: a grey, ringless finish (a banyan's smooth bark),
 * warmed and mossed by the vertex colours. The same shader as every other plant.
 */
const BARK_PART = 4;
const LEAF_DEEP = [0.22, 0.46, 0.3] as const;
const LEAF_MID = [0.4, 0.7, 0.36] as const;
const LEAF_RIM = [0.7, 0.92, 0.42] as const;

/** Accumulates one mesh's vertices in the vegetation layout (position, normal, uv, colour, part, shade). */
export class VegGeometry {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly part: number[] = [];
  readonly shade: number[] = [];
  readonly idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
    c: readonly number[],
    part: number,
    shade: number,
  ): number {
    this.pos.push(x - TREE_ORIGIN.x, y - TREE_ORIGIN.y, z - TREE_ORIGIN.z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c[0]!, c[1]!, c[2]!);
    this.part.push(part);
    this.shade.push(shade);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** A BufferGeometry with the vegetation's per-vertex attributes (fade and tint go per instance). */
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('vegPart', new BufferAttribute(new Float32Array(this.part), 1));
    g.setAttribute('shade', new BufferAttribute(new Float32Array(this.shade), 1));
    const n = this.count;
    g.setIndex(
      n > 65535
        ? new BufferAttribute(new Uint32Array(this.idx), 1)
        : new BufferAttribute(new Uint16Array(this.idx), 1),
    );
    g.computeBoundingSphere();
    return g;
  }
}

const tmpC = [0, 0, 0];

function mixC(a: readonly number[], b: readonly number[], t: number): number[] {
  tmpC[0] = a[0]! + (b[0]! - a[0]!) * t;
  tmpC[1] = a[1]! + (b[1]! - a[1]!) * t;
  tmpC[2] = a[2]! + (b[2]! - a[2]!) * t;
  return tmpC;
}

/** Bark colour for a vertex: silver, darker in the folds and underneath, mossy on its upper faces. */
function barkColour(ny: number, fold: number, seed: number): number[] {
  const c = mixC(BARK_DARK, BARK, 0.55 + fold * 0.45);
  const moss = Math.max(0, ny - 0.35) * 1.4 * (0.6 + seed * 0.4);
  return mixC(c, MOSS, Math.min(0.75, moss));
}

/** Catmull-Rom resample of a branch, every `step` metres (radius interpolated too). */
function resample(b: Branch, step: number): (Vector3 & { r: number })[] {
  const p = b.points;
  const out: (Vector3 & { r: number })[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[Math.min(p.length - 1, i + 2)]!;
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, bb: number, c: number, d: number) =>
        0.5 * (2 * bb + (-a + c) * t + (2 * a - 5 * bb + 4 * c - d) * t2 + (-a + 3 * bb - 3 * c + d) * t3);
      const v = new Vector3(
        f(p0.x, p1.x, p2.x, p3.x),
        f(p0.y, p1.y, p2.y, p3.y),
        f(p0.z, p1.z, p2.z, p3.z),
      ) as Vector3 & {
        r: number;
      };
      v.r = p1.r + (p2.r - p1.r) * t;
      out.push(v);
    }
  }
  const last = p[p.length - 1]!;
  const v = new Vector3(last.x, last.y, last.z) as Vector3 & { r: number };
  v.r = last.r;
  out.push(v);
  return out;
}

const T = new Vector3();
const N = new Vector3();
const B = new Vector3();
const UP = new Vector3(0, 1, 0);

/** A tube along a resampled branch, `seg` sides, its far end capped with a rounded tip. */
export function tube(
  g: VegGeometry,
  pts: readonly (Vector3 & { r: number })[],
  seg: number,
  seed: number,
  capEnd = true,
): void {
  const rand = mulberry32(seed);
  const base = g.count;
  let along = 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += pts[i]!.distanceTo(pts[i - 1]!);
  // Knots (two swellings at random points along it) and flutes (deeper on the thick ones).
  const knots = [0.25 + rand() * 0.25, 0.55 + rand() * 0.3];
  const flutePhase = rand() * Math.PI * 2;
  // A start frame, then parallel transport along the line.
  T.subVectors(pts[1]!, pts[0]!).normalize();
  N.copy(Math.abs(T.y) > 0.9 ? new Vector3(1, 0, 0) : UP)
    .cross(T)
    .normalize();
  B.crossVectors(T, N);
  const bumps = Array.from({ length: seg }, () => 0.9 + rand() * 0.2);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i > 0) along += p.distanceTo(pts[i - 1]!);
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const prev = pts[Math.max(0, i - 1)]!;
    const t = new Vector3().subVectors(next, prev).normalize();
    // Transport the frame: rotate N by the turn from T to t.
    const axis = new Vector3().crossVectors(T, t);
    const s = axis.length();
    if (s > 1e-6) N.applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, s)));
    T.copy(t);
    B.crossVectors(T, N).normalize();
    N.crossVectors(B, T).normalize();
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const u = total > 0 ? along / total : 0;
      let knot = 1;
      for (const kp of knots) knot += 0.16 * Math.exp(-(((u - kp) / 0.035) ** 2));
      const flute = 1 + Math.min(0.13, p.r * 0.05) * Math.cos(a * 5 + flutePhase + along * 0.04);
      const bump = bumps[k % seg]! * (1 + 0.05 * Math.sin(along * 0.9 + k)) * knot * flute;
      const nx = N.x * ca + B.x * sa;
      const ny = N.y * ca + B.y * sa;
      const nz = N.z * ca + B.z * sa;
      const r = p.r * bump;
      const fold = 0.5 + 0.5 * Math.cos(a * 5 + flutePhase + along * 0.04);
      g.vertex(
        p.x + nx * r,
        p.y + ny * r,
        p.z + nz * r,
        nx,
        ny,
        nz,
        k / seg,
        along / 4,
        barkColour(ny, fold, rand()),
        BARK_PART,
        0.2 + ny * 0.35 + fold * 0.3,
      );
    }
  }
  const ring = seg + 1;
  for (let i = 0; i < pts.length - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a = base + i * ring + k;
      const b = a + ring;
      g.tri(a, b, a + 1);
      g.tri(a + 1, b, b + 1);
    }
  if (capEnd) {
    const end = pts[pts.length - 1]!;
    const tip = g.vertex(
      end.x + T.x * end.r * 0.7,
      end.y + T.y * end.r * 0.7,
      end.z + T.z * end.r * 0.7,
      T.x,
      T.y,
      T.z,
      0.5,
      along / 4 + 0.2,
      BARK,
      BARK_PART,
      0.5,
    );
    const last = base + (pts.length - 1) * ring;
    for (let k = 0; k < seg; k++) g.tri(last + k, tip, last + k + 1);
  }
}

/** The fluted core from under the Root Hall to the column's top (the beacon's footing). */
function core(g: VegGeometry, seg: number, step: number): void {
  const base = g.count;
  const rings: number[] = [];
  for (let y = TRUNK_BASE; y < COLUMN_TOP; y += step) rings.push(y);
  rings.push(COLUMN_TOP);
  for (const y of rings) {
    for (let k = 0; k <= seg; k++) {
      const b = (k / seg) * 360;
      const a = (b * Math.PI) / 180;
      const flare = 1 + 0.22 * Math.max(0, (19.5 - y) / 2.7) ** 2;
      const r = coreSurface(b, y) * flare;
      // Normal: outward, tilted by the flutes' slope and the taper.
      const dr = (coreSurface(b + 1, y) - coreSurface(b - 1, y)) / ((2 * Math.PI) / 180) / Math.max(1, r);
      const sx = Math.sin(a);
      const sz = -Math.cos(a);
      let nx = sx - dr * Math.cos(a);
      let nz = sz - dr * Math.sin(a);
      const len = Math.hypot(nx, 0.12, nz);
      nx /= len;
      nz /= len;
      const fold = 0.5 + 0.5 * Math.cos(7 * a + y * 0.05);
      g.vertex(
        TREE.x + sx * r,
        y,
        TREE.z + sz * r,
        nx,
        0.12 / len,
        nz,
        k / seg,
        y / 4,
        barkColour(0.12, fold, 0.5),
        BARK_PART,
        0.15 + fold * 0.6,
      );
    }
  }
  const ring = seg + 1;
  for (let i = 0; i < rings.length - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a = base + i * ring + k;
      const b = a + ring;
      g.tri(a, a + 1, b);
      g.tri(a + 1, b + 1, b);
    }
  // The column's top: rounded over into a mossy crown (the leaders grow out of it; the Beacon stands
  // on it), not a sawn-off disc.
  const caps = [
    [0.86, 0.9],
    [0.62, 1.5],
    [0.36, 1.85],
  ] as const;
  let prev = base + (rings.length - 1) * ring;
  for (const [k, dy] of caps) {
    const cb = g.count;
    for (let j = 0; j <= seg; j++) {
      const b = (j / seg) * 360;
      const a = (b * Math.PI) / 180;
      const r = coreSurface(b, COLUMN_TOP) * k;
      const sx = Math.sin(a);
      const sz = -Math.cos(a);
      const ny = 0.35 + (1 - k) * 0.8;
      const l = Math.hypot(sx, ny, sz);
      g.vertex(
        TREE.x + sx * r,
        COLUMN_TOP + dy,
        TREE.z + sz * r,
        sx / l,
        ny / l,
        sz / l,
        j / seg,
        0,
        mixC(BARK, MOSS, 0.55 + (1 - k) * 0.4),
        BARK_PART,
        0.7,
      );
    }
    for (let j = 0; j < seg; j++) {
      g.tri(prev + j, prev + j + 1, cb + j);
      g.tri(prev + j + 1, cb + j + 1, cb + j);
    }
    prev = cb;
  }
  const top = g.vertex(TREE.x, COLUMN_TOP + 2, TREE.z, 0, 1, 0, 0.5, 0, MOSS, BARK_PART, 0.8);
  for (let k = 0; k < seg; k++) g.tri(prev + k, prev + k + 1, top);
}

/**
 * A prop root: down from its limb, bowed and wavering, thicker below than above, flaring and sinking
 * into the ground at its foot; about half have two thinner strands twisting round them.
 */
function propRoot(g: VegGeometry, root: PropRoot, seg: number, seed: number): void {
  const rand = mulberry32(seed);
  const drop = root.top.y - root.foot.y;
  const n = Math.max(6, Math.ceil(drop / 1.6));
  const bowA = rand() * Math.PI * 2;
  const bow = 0.35 + rand() * 0.7;
  const wave = 0.15 + rand() * 0.2;
  const phase = rand() * 10;
  const at = (t: number, out: Vector3) =>
    out.set(
      root.top.x +
        (root.foot.x - root.top.x) * t +
        Math.cos(bowA) * bow * Math.sin(Math.PI * t) +
        Math.sin(t * 9 + phase) * wave * (1 - t),
      root.top.y + (root.foot.y - 0.9 - root.top.y) * t,
      root.top.z +
        (root.foot.z - root.top.z) * t +
        Math.sin(bowA) * bow * Math.sin(Math.PI * t) +
        Math.cos(t * 7 + phase) * wave * (1 - t),
    );
  const pts: (Vector3 & { r: number })[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = at(t, new Vector3()) as Vector3 & { r: number };
    v.r = root.r * (0.55 + 0.45 * t + Math.pow(t, 7) * 1.5);
    pts.push(v);
  }
  tube(g, pts, seg, seed, false);
  // The braided strands only on the near tree's finer levels (they're lost on the coarse ones).
  if (rand() < 0.5 || seg < 6) return;
  for (let s = 0; s < 2; s++) {
    const strand: (Vector3 & { r: number })[] = [];
    const ph = rand() * Math.PI * 2;
    const turns = 1 + rand() * 1.5;
    const sr = 0.1 + rand() * 0.08;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const c = at(t, new Vector3());
      const off = root.r * (0.55 + 0.45 * t) + sr * 0.6;
      const a = ph + t * turns * Math.PI * 2;
      const v = c.add(new Vector3(Math.cos(a) * off, 0, Math.sin(a) * off)) as Vector3 & { r: number };
      v.r = sr * (0.7 + 0.6 * t + Math.pow(t, 7) * 1.2);
      strand.push(v);
    }
    tube(g, strand, Math.max(4, seg - 2), seed + 31 * (s + 1), true);
  }
}

/** A surface root, half sunk into the ground, tapering out from under the Root Hall's rim. */
function groundRoot(g: VegGeometry, root: GroundRoot, seg: number, seed: number): void {
  const pts = root.points.map((p) => Object.assign(new Vector3(p.x, p.y, p.z), { r: p.r }));
  tube(g, pts, seg, seed, true);
}

/** A hanging vine (green, it sways with the leaves) or a young air root (bark), from a limb. */
function vine(g: VegGeometry, v: Vine): void {
  const rand = mulberry32(Math.floor(v.seed * 1e6) + 3);
  const leafy = v.seed < 0.6;
  const n = 5;
  const base = g.count;
  const sides = 3;
  const lean = (rand() - 0.5) * 0.6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = v.top.x + lean * t * t;
    const y = v.top.y - v.length * t;
    const z = v.top.z + Math.sin(t * 3 + v.seed * 9) * 0.25 * t;
    const r = (leafy ? 0.09 : 0.12) * (1 - t * 0.6);
    const c = leafy ? mixC(LEAF_DEEP, LEAF_MID, 0.3 + rand() * 0.5) : barkColour(0, 0.4, 0.5);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      g.vertex(
        x + nx * r,
        y,
        z + nz * r,
        nx,
        0,
        nz,
        k / sides,
        t,
        c,
        leafy ? leafPart(false, t) : BARK_PART,
        leafy ? 0.35 : 0.3,
      );
    }
  }
  const ring = sides + 1;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < sides; k++) {
      const a = base + i * ring + k;
      const b = a + ring;
      g.tri(a, b, a + 1);
      g.tri(a + 1, b, b + 1);
    }
}

/** An irregular leaf clump: two jittered icosahedra with soft round normals. */
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x!, y!, z!);
    return [x! / l, y! / l, z! / l];
  });
  const f = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  return { v, f };
})();

/** The icosahedron split once (80 faces): the main lobe of a near clump, for a rounder, leafier edge. */
const ICO2 = (() => {
  const v = ICO.v.map((p) => [...p]);
  const mid = new Map<string, number>();
  const at = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let i = mid.get(key);
    if (i === undefined) {
      const p = v[a]!;
      const q = v[b]!;
      const m = [p[0]! + q[0]!, p[1]! + q[1]!, p[2]! + q[2]!];
      const l = Math.hypot(m[0]!, m[1]!, m[2]!);
      i = v.push([m[0]! / l, m[1]! / l, m[2]! / l]) - 1;
      mid.set(key, i);
    }
    return i;
  };
  const f: number[][] = [];
  for (const [a, b, c] of ICO.f) {
    const ab = at(a!, b!);
    const bc = at(b!, c!);
    const ca = at(c!, a!);
    f.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
  }
  return { v, f };
})();

/** The leaves' sway weight in `vegPart`'s fraction: 0 where a clump hangs from its twig, 1 at its far side. */
function leafPart(card: boolean, weight: number): number {
  return (card ? 5 : 1) + 0.4 * Math.min(1, Math.max(0, weight));
}

/**
 * How far a leaf's normal leans to the canopy's (`most` facing out of it, none facing into it, or a
 * `floor` of it everywhere).
 */
function layerLean(x: number, y: number, z: number, c: Cluster, most: number, floor: number): number {
  const d = (x * c.nx + y * c.ny + z * c.nz) / (Math.hypot(x, y, z) || 1);
  return Math.max(floor, most * Math.min(1, Math.max(0, (d + 0.2) / 0.7)));
}

/**
 * A clump of leaves on the end of its twig: an irregular, flattened lobe or two (soft normals leaning
 * to the canopy's own, so the clumps read as one leafy mass), a leaf pattern over them, and leaf cards
 * (sprays of leaves cut out of the shared material's card part) over its underside and round its rim,
 * so its outline and the canopy's underside read as leaves. Every vertex carries how far it is from
 * where the twig enters: the material sways the leaves about that point, never the whole clump.
 */
function clump(g: VegGeometry, c: Cluster, d: BanyanDetail): void {
  const rand = mulberry32(Math.floor(c.seed * 1e6) + 7);
  // One clump in four a fresher, yellower green (the canopy's three greens, not one).
  const fresh = rand() < 0.25 ? 0.22 : 0;
  // Where the twig comes in (its sway's pivot).
  const t0 = c.twig[0] ?? { x: c.x, y: c.y - c.r, z: c.z };
  const tl = Math.hypot(t0.x - c.x, t0.y - c.y, t0.z - c.z) || 1;
  const px = c.x + ((t0.x - c.x) / tl) * c.r * 0.7;
  const py = c.y + ((t0.y - c.y) / tl) * c.r * 0.5;
  const pz = c.z + ((t0.z - c.z) / tl) * c.r * 0.7;
  const weight = (x: number, y: number, z: number) => Math.hypot(x - px, y - py, z - pz) / (1.8 * c.r);
  // The leaf pattern's offset (each clump its own leaves).
  const uo = Math.floor(rand() * 40);
  const vo = Math.floor(rand() * 40);
  // The coarse levels' clumps shade as the canopy's one soft volume (their few big faces read as
  // facets otherwise), and the underside of the canopy stays in its own shade.
  const leanMost = d.lean ?? 0.55;
  const leanFloor = d.lean ? d.lean * 0.6 : 0;
  const under = d.lean ? (1 - c.up) * 0.45 : 0;
  // A core under a full fringe of cards is the clump's shaded inside: smaller and darker than its leaves.
  const coreK = d.core ?? 0.78;
  const coreDim = d.core ? 0.6 : 1;
  const cardOut = 0.9 * Math.min(1, (coreK + 0.15) / 0.78);
  const tone = (h: number) =>
    Math.max(0, Math.min(1, (h * 0.95 + c.up * 0.35 + fresh - 0.12) * (1 - under) + under * h * 0.3));
  for (let l = 0; l < d.lobes; l++) {
    const shape = l === 0 && (d.lobes >= 3 || d.fine) ? ICO2 : ICO;
    const lr = c.r * (l === 0 ? (d.cards ? coreK : 0.95) + rand() * 0.3 : 0.4 + rand() * 0.35);
    const ox = l === 0 ? 0 : (rand() - 0.5) * c.r * 1.5;
    const oy = l === 0 ? 0 : (rand() - 0.25) * c.r * 0.5;
    const oz = l === 0 ? 0 : (rand() - 0.5) * c.r * 1.5;
    const base = g.count;
    let vi = 0;
    for (const [vx, vy, vz] of shape.v) {
      // A leafy, ragged outline: on the split shape the corners stand out and the edge points dip
      // in and out (sprays of leaves, not a smooth ball).
      const j =
        shape === ICO2
          ? vi < 12 || !d.fine
            ? 1.04 + rand() * 0.2
            : 0.7 + rand() * 0.42
          : d.fine || d.ragged
            ? 0.72 + rand() * 0.55
            : 0.9 + rand() * 0.2;
      vi++;
      const x = c.x + ox + vx! * lr * j;
      const y = c.y + oy + vy! * lr * j * (d.squash ?? 0.62);
      const z = c.z + oz + vz! * lr * j;
      // Deep in the shade underneath, bright where the sun catches the top.
      const t = tone((vy! + 1) / 2) * coreDim;
      const colour = t < 0.5 ? mixC(LEAF_DEEP, LEAF_MID, t * 2) : mixC(LEAF_MID, LEAF_RIM, (t - 0.5) * 2);
      // Normals lean to the canopy's own on the side that faces out of it (one soft, leafy mass); the
      // side turned into the canopy keeps its own, so an upper clump's underside stays in shade.
      const lean = layerLean(vx!, vy!, vz!, c, leanMost, leanFloor);
      const nx = vx! * (1 - lean) + c.nx * lean;
      const ny = vy! * (1 - lean) + c.ny * lean;
      const nz = vz! * (1 - lean) + c.nz * lean;
      const nl = Math.hypot(nx, ny, nz) || 1;
      g.vertex(
        x,
        y,
        z,
        nx / nl,
        ny / nl,
        nz / nl,
        uo + (x - c.x + (z - c.z) * 0.35) * 0.45,
        vo + (y - c.y + (z - c.z) * 0.6) * 0.45,
        colour,
        leafPart(false, weight(x, y, z)),
        0.04 + t * 0.96,
      );
    }
    for (const [a, b, e] of shape.f) g.tri(base + a!, base + b!, base + e!);
  }
  // Leaf cards round the core, half out past it, so the clump's outline is leaves: spread over the
  // underside and rim of the canopy's lower clumps (seen from the decks and the ground), over the rim
  // and top of its upper ones (seen from the sea and the Crown).
  const [elLo, elHi] = c.up < 0.4 ? [-0.95, 0.3] : c.up > 0.6 ? [-0.3, 0.95] : [-0.85, 0.85];
  const rh = c.r * 1.05;
  const rv = c.r * 0.62;
  const spin = rand() * Math.PI * 2;
  for (let k = 0; k < d.cards; k++) {
    // An even spread (golden angle), jittered.
    const el = elLo + ((k + 0.5) / d.cards) * (elHi - elLo) + (rand() - 0.5) * 0.15;
    const az = spin + k * 2.39996 + (rand() - 0.5) * 0.5;
    const ce = Math.sqrt(Math.max(0, 1 - el * el));
    const dx = Math.cos(az) * ce;
    const dz = Math.sin(az) * ce;
    const s = c.r * (1.0 + rand() * 0.35);
    // Its middle just inside the core: the leaves grow out of the mass, never float off it.
    const cx = c.x + dx * rh * cardOut;
    const cy = c.y + el * rv * 0.78;
    const cz = c.z + dz * rh * cardOut;
    // Square to the core's surface there, tipped a little.
    let nx = dx * rv + (rand() - 0.5) * 0.5;
    let ny = el * rh * 1.2 + (rand() - 0.5) * 0.4;
    let nz = dz * rv + (rand() - 0.5) * 0.5;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // Two axes across the card, turned by a random angle about its normal.
    let ax = Math.abs(ny) < 0.9 ? -nz : 0;
    let ay = Math.abs(ny) < 0.9 ? 0 : nz;
    let azz = Math.abs(ny) < 0.9 ? nx : -ny;
    const al = Math.hypot(ax, ay, azz) || 1;
    ax /= al;
    ay /= al;
    azz /= al;
    const bx = ny * azz - nz * ay;
    const by = nz * ax - nx * azz;
    const bz = nx * ay - ny * ax;
    const rot = rand() * Math.PI * 2;
    const cr = Math.cos(rot) * s * 0.5;
    const sr = Math.sin(rot) * s * 0.5;
    const ux = ax * cr + bx * sr;
    const uy = ay * cr + by * sr;
    const uz = azz * cr + bz * sr;
    const vx = bx * cr - ax * sr;
    const vy = by * cr - ay * sr;
    const vz = bz * cr - azz * sr;
    const t = tone((el + 1) / 2);
    const colour = t < 0.5 ? mixC(LEAF_DEEP, LEAF_MID, t * 2) : mixC(LEAF_MID, LEAF_RIM, (t - 0.5) * 2);
    const cl = layerLean(nx, ny, nz, c, leanMost, leanFloor);
    const vnx = nx * (1 - cl) + c.nx * cl;
    const vny = ny * (1 - cl) + c.ny * cl;
    const vnz = nz * (1 - cl) + c.nz * cl;
    const vl = Math.hypot(vnx, vny, vnz) || 1;
    const cu = Math.floor(rand() * 40);
    const cv = Math.floor(rand() * 40);
    // A big card holds a few sprays (the material cuts one per unit of uv), so its leaves stay leaf-sized.
    const span = d.cardSpan ? Math.max(1, Math.round(s / d.cardSpan)) : 1;
    const base = g.count;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const x = cx + ux * su + vx * sv;
      const y = cy + uy * su + vy * sv;
      const z = cz + uz * su + vz * sv;
      g.vertex(
        x,
        y,
        z,
        vnx / vl,
        vny / vl,
        vnz / vl,
        cu + ((su + 1) / 2) * span,
        cv + ((sv + 1) / 2) * span,
        colour,
        leafPart(true, weight(x, y, z)),
        0.04 + t * 0.96,
      );
    }
    g.tri(base, base + 1, base + 2);
    g.tri(base + 1, base + 3, base + 2);
  }
}

/** How much of the tree a level of detail draws. */
export interface BanyanDetail {
  /** Sides round the core, the limbs and the roots. */
  coreSeg: number;
  limbSeg: number;
  rootSeg: number;
  /** Ring spacing (m) along the core and the limbs. */
  step: number;
  /** Lobes per leaf clump. */
  lobes: number;
  /** Leaf cards per clump. */
  cards: number;
  /** Each clump's own twig (lost from far away). */
  twigs: boolean;
  /** Every lobe on the split, ragged shape (the near tree on the finer tiers). */
  fine?: boolean;
  /** How far the leaves' normals lean to the canopy's (default 0.55, facing out of it only). */
  lean?: number;
  /** A leaf card's size (m) per spray of leaves: bigger cards hold more sprays (default one each). */
  cardSpan?: number;
  /** The core's radius (of the clump's) under its cards; a set one is darker too (default 0.78). */
  core?: number;
  /** A lobe's height (of its width): flatter clumps lie in layers (default 0.62). */
  squash?: number;
  /** Lobes on the plain shape get the ragged outline the finer levels have (spray tips in and out). */
  ragged?: boolean;
}

export const BANYAN_DETAIL: Record<'near' | 'far' | 'lite', BanyanDetail> = {
  near: { coreSeg: 64, limbSeg: 12, rootSeg: 7, step: 1.6, lobes: 2, cards: 8, twigs: true, fine: true },
  // Fewer, bigger clumps than the finer tiers: a small core under a fringe of leaf cards (so the outline
  // is leaves, not its facets), shaded as one soft canopy.
  lite: {
    coreSeg: 28,
    limbSeg: 7,
    rootSeg: 5,
    step: 2.8,
    lobes: 1,
    cards: 12,
    twigs: true,
    lean: 0.85,
    cardSpan: 3,
    core: 0.6,
  },
  // From the sea (past 120 m): one flat, ragged lobe a clump under a few big leaf cards round its rim,
  // its normals leaning to the canopy's, so the crown reads as broad layers of leaves (darker under
  // each tier), not a heap of round puffs.
  far: {
    coreSeg: 28,
    limbSeg: 6,
    rootSeg: 4,
    step: 4,
    lobes: 1,
    cards: 4,
    twigs: false,
    lean: 0.9,
    cardSpan: 4,
    core: 0.72,
    squash: 0.46,
    ragged: true,
  },
};

/**
 * The great banyan (core, pillars, limbs, sprays, leaders, prop roots and leaf clumps on their twigs) as
 * one mesh, a part at a time (a sliced build breathes at each yield).
 */
export function* buildBanyan(
  d: BanyanDetail,
  clusters: readonly Cluster[],
  roots: readonly PropRoot[],
  extras: { vines?: readonly Vine[]; ground?: readonly GroundRoot[]; gate?: boolean } = {},
): Generator<void, BufferGeometry, void> {
  const g = new VegGeometry();
  core(g, d.coreSeg, d.step);
  yield;
  const carrying = carryingSprays(clusters);
  BRANCHES.forEach((b, i) => {
    const pillar = b.id.startsWith('pillar');
    const spray = b.id.includes('spray');
    if (spray && !carrying.has(b.id)) return;
    const fine = d.limbSeg >= 10;
    const seg = pillar ? Math.max(8, d.limbSeg + 2) : spray ? (fine ? 6 : 3) : d.limbSeg;
    // The coarser levels draw a spray through every other point of its arch.
    const line =
      spray && !fine
        ? { ...b, points: b.points.filter((_, k) => k % 2 === 0 || k === b.points.length - 1) }
        : b;
    tube(
      g,
      resample(line, pillar ? d.step * 1.2 : spray ? d.step * (fine ? 1.5 : 3) : d.step),
      seg,
      101 + i,
      !pillar,
    );
  });
  yield;
  roots.forEach((r, i) => propRoot(g, r, d.rootSeg, 501 + i));
  (extras.ground ?? []).forEach((r, i) => groundRoot(g, r, Math.max(5, d.rootSeg), 801 + i));
  if (extras.gate)
    ROOT_GATE.forEach((pts, i) =>
      tube(
        g,
        pts.map((p) => Object.assign(new Vector3(p.x, p.y, p.z), { r: p.r })),
        Math.max(6, d.rootSeg + 1),
        901 + i,
        false,
      ),
    );
  for (const v of extras.vines ?? []) vine(g, v);
  yield;
  // The twigs end inside their clumps (no caps): a few rings each, straight on the coarser levels.
  if (d.twigs)
    clusters.forEach((c, i) => {
      const fine = d.limbSeg >= 10;
      const points = (fine ? c.twig : [c.twig[0]!, c.twig[c.twig.length - 1]!]) as Branch['points'];
      tube(
        g,
        resample({ id: 'twig', canopy: false, points }, Math.max(2.4, d.step * 1.8)),
        fine ? 4 : 3,
        3001 + i,
        false,
      );
    });
  for (let i = 0; i < clusters.length; i++) {
    if (i % 8 === 0) yield;
    clump(g, clusters[i]!, d);
  }
  yield;
  return g.build();
}

/** Bearing (degrees) of a world point from the tree, for the trunk's details (the Great Hall's arch). */
export function treeBearing(x: number, z: number): number {
  return bearingOf(x, z);
}

/** The banyan's real size, for culling and the layout tests. */
export const BANYAN_BOUNDS = {
  x: TREE.x,
  z: TREE.z,
  y: (TRUNK_BASE + TB.tree.crownTop) / 2,
  radius: 78,
} as const;
