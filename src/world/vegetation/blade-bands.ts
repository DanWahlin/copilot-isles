import { Float32BufferAttribute, type BufferGeometry } from 'three/webgpu';
import { clamp01 } from '../../util/math';

/**
 * The grass's levels of detail (issue 257). A tussock is drawn with one of three geometries by its
 * distance: all 184 blades (two triangles each) up close, the first 72 (one triangle each) further out,
 * then the first 20. Each coarser geometry is a prefix of the denser one's layout (`bladeLayout`), and
 * the shader works the swap out continuously by distance (`bladeBandShape`) before the geometry
 * changes: the blades past the next band's count shrink away one by one, the rest widen to cover the
 * same ground, and a near blade's middle vertex slides onto its far triangle's edge. By the time the
 * field hands a tussock to the coarser geometry, the dense one already looks exactly like it, so the
 * swap changes no pixels (nothing pops in front of the captain).
 */
export const BLADE_COUNTS = [184, 72, 20] as const;
/** How much wider each band's blades are than the near ones (the same ground covered by fewer). */
export const BLADE_WIDEN = [1, 2.4, 7.5] as const;
/** Where (m, High; tiers scale it) a tussock's geometry swaps to the next band's. */
const BAND_SWAP = [9.5, 18.5] as const;
/** How long (m, High) each band's shader transition is; it ends a re-pick before the swap. */
const BAND_RAMP = [2, 5] as const;
/** Share of a band's transition each blade takes to shrink away (the rest staggers them by rank). */
const SHRINK_SPAN = 0.4;

/** A field's band distances (m, tier-scaled): transitions run a → c, geometry swaps at `swap`. */
export interface BladeBands {
  a1: number;
  c1: number;
  a2: number;
  c2: number;
  /** A tussock at least this far (horizontally) from the camera at a re-pick draws the coarser band. */
  swap1: number;
  swap2: number;
}

/**
 * The band distances for a field whose reach is `scale` × High's, re-picked every `repick` m: the
 * transitions end a re-pick short of each swap, so however far the camera moves between re-picks, a
 * tussock is never drawn coarse while it should still be changing.
 */
export function bladeBands(scale: number, repick: number): BladeBands {
  const swap1 = BAND_SWAP[0] * scale;
  const swap2 = BAND_SWAP[1] * scale;
  const c1 = swap1 - repick;
  const c2 = swap2 - repick;
  return { a1: c1 - BAND_RAMP[0] * scale, c1, a2: c2 - BAND_RAMP[1] * scale, c2, swap1, swap2 };
}

/** The few operations `bladeBandShape` needs, on numbers (CPU, tests) or TSL nodes (the shader). */
export interface BandMath<T> {
  k(value: number): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  /** 0 below `edge`, 1 from it. */
  step(edge: T, x: T): T;
  smoothstep(edge0: T, edge1: T, x: T): T;
}

/** A blade's shape at a tussock distance `d` (m, horizontal, to its centre). */
export interface BladeShape<T> {
  /** 0-1: how far a near blade's middle vertex has slid onto its far triangle's edge. */
  morph: T;
  /** How much wider than its near width the blade is drawn. */
  widen: T;
  /** 1 standing, 0 shrunk away (blades past the next band's count). */
  collapse: T;
}

/**
 * Blade `rank` (its place in `bladeLayout`) at tussock distance `d`: written once for the CPU and the
 * shader (`M` picks numbers or nodes). Every value is continuous in `d`, and at each band's end (`c1`,
 * `c2`) the dense geometry matches the next band's exactly: blades from the next band's count on are
 * gone, the near blades' middle vertices are on their far edges, and the width is the next band's.
 */
export function bladeBandShape<T>(
  M: BandMath<T>,
  d: T,
  rank: T,
  b: { a1: T; c1: T; a2: T; c2: T },
): BladeShape<T> {
  const [n1, n2, n3] = BLADE_COUNTS;
  const [, w2, w3] = BLADE_WIDEN;
  const near = M.smoothstep(b.a1, b.c1, d);
  const far = M.smoothstep(b.a2, b.c2, d);
  /** Ranks first…first+count-1 shrink away over a → c, the last rank first. */
  const shrink = (a: T, c: T, first: number, count: number): T => {
    const span = M.sub(c, a);
    const order = M.mul(M.sub(M.k(first + count - 1), rank), M.k((1 - SHRINK_SPAN) / count));
    const start = M.add(a, M.mul(span, order));
    return M.smoothstep(start, M.add(start, M.mul(span, M.k(SHRINK_SPAN))), d);
  };
  const inFirst = M.step(M.k(n2 - 0.5), rank);
  const inSecond = M.sub(M.step(M.k(n3 - 0.5), rank), inFirst);
  const one = M.k(1);
  const collapse = M.mul(
    M.sub(one, M.mul(inFirst, shrink(b.a1, b.c1, n2, n1 - n2))),
    M.sub(one, M.mul(inSecond, shrink(b.a2, b.c2, n3, n2 - n3))),
  );
  const widen = M.add(one, M.add(M.mul(M.k(w2 - 1), near), M.mul(M.k(w3 - w2), far)));
  return { morph: near, widen, collapse };
}

/** `BandMath` on plain numbers. */
export const NUMBER_MATH: BandMath<number> = {
  k: (v) => v,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  step: (edge, x) => (x < edge ? 0 : 1),
  smoothstep: (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  },
};

/** One blade of a tussock's layout, in the clump's unit space. */
export interface BladeSpot {
  x: number;
  z: number;
  /** Its spoke's direction (outward from the clump's middle). */
  cx: number;
  sz: number;
  /** 0 at the middle, 1 at the rim. */
  out: number;
}

/** The plastic number's R2 steps: any prefix of the sequence spreads evenly over the unit square. */
const R2_A = 1 / 1.324717957244746;
const R2_B = R2_A * R2_A;

/**
 * Where blade `i` of a tussock stands: an R2 low-discrepancy point mapped onto the disc, so every
 * prefix (the 72 and 20 blades of the coarser bands) fills the same disc evenly, like the whole 184.
 */
export function bladeLayout(i: number): BladeSpot {
  const u = (0.5 + i * R2_A) % 1;
  const v = (0.5 + i * R2_B) % 1;
  const out = Math.sqrt(u);
  const angle = v * Math.PI * 2;
  const cx = Math.cos(angle);
  const sz = Math.sin(angle);
  const radius = 0.46 * out * (0.9 + (i % 5) * 0.05);
  return { x: cx * radius, z: sz * radius, cx, sz, out };
}

/** Where a near blade's middle vertex sits along its far triangle's edge (base 0 … tip 1). */
export const MID_ALONG = 0.55;

/** Blade `rank` packed into its `vegPart` (1 a blade): 1 + rank / 1000, so it stays under 1.5. */
export const BLADE_RANK_STEP = 0.001;

/**
 * Sets a grass-material geometry's `bladeMorph` (per vertex: the middle vertex's move onto its far
 * edge, xyz, and the vertex's sideways offset, w), zeros for what isn't a blade (seed heads, flowers):
 * every geometry the grass material draws has the same attributes, so they share one shader.
 */
export function setBladeMorph(geometry: BufferGeometry, morph?: number[]): void {
  const count = geometry.getAttribute('position').count;
  const values = morph ? new Float32Array(morph) : new Float32Array(count * 4);
  if (values.length !== count * 4) throw new Error('grass: bladeMorph needs 4 values per vertex');
  geometry.setAttribute('bladeMorph', new Float32BufferAttribute(values, 4));
}
