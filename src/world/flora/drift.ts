import { float, floor, fract, sin, smoothstep, step, vec2 } from 'three/tsl';
import { smoothstep as smooth } from '../../util/math';
import { DRIFT_HABITATS, type FloraPalette, type FloraSpecies } from './types';

// TSL's fluent typings don't cover every mixed scalar/vector graph here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * Flower drifts: the ground is cut into ~18 m cells (their edges warped, so no grid shows), and a
 * share of the cells hold a drift, densest in its middle and fading out toward the cell's edge, with
 * one species leading. The CPU scatter (`driftAt`) and the terrain's far speckle (`driftNodes`) are
 * built from these constants and the same steps, so the drifts carry on past the flowers' reach.
 */
export const DRIFT = {
  /** Cell size (m). */
  cell: 18,
  /** How far (m) the cell edges wander, and how fast (rad per m). */
  warp: 5.5,
  warpFreq: 0.047,
  /** The drift fades from full at `inner` to none at `outer` (distance from the cell's middle, 1 = mid-edge). */
  inner: 0.22,
  outer: 1.0,
} as const;

/** Our own small hash of a cell (exact enough in 32-bit floats for the GPU to agree): [0, 1). */
function cellHash(cx: number, cz: number, seed: number): number {
  const a = fract1(cx * 0.1373 + cz * 0.3191 + seed * 0.0731);
  const b = fract1(cx * 0.2617 - cz * 0.0973 + seed * 0.1913);
  return fract1((a + b + 0.1) * (a * 37.13 + b * 19.71 + 3.7));
}

function fract1(v: number): number {
  return v - Math.floor(v);
}

/** A drift at a spot: how strong (0 none … 1 its heart) and a 0-1 pick of its lead species. */
export interface DriftSample {
  strength: number;
  lead: number;
}

/** The drift at (x, z), written into `out` (no allocation). */
export function driftAt(x: number, z: number, seed: number, coverage: number, out: DriftSample): DriftSample {
  const qx = (x + DRIFT.warp * Math.sin(z * DRIFT.warpFreq + 1.3)) / DRIFT.cell;
  const qz = (z + DRIFT.warp * Math.sin(x * DRIFT.warpFreq + 4.1)) / DRIFT.cell;
  const cx = Math.floor(qx);
  const cz = Math.floor(qz);
  const d = Math.hypot(qx - cx - 0.5, qz - cz - 0.5) * 2;
  const has = cellHash(cx + 17, cz - 31, seed) < coverage ? 1 : 0;
  out.strength = has * (1 - smooth(DRIFT.inner, DRIFT.outer, d));
  out.lead = cellHash(cx, cz, seed);
  return out;
}

/**
 * The species that lead a palette's drifts (see `FloraSpecies.drifts`), in palette order: the scatter
 * picks a drift's lead from these, and the terrain's speckle colours it from the same list and pick.
 */
export function driftLeads(palette: FloraPalette): readonly FloraSpecies[] {
  return palette.species.filter(
    (s) =>
      s.drifts ??
      ((s.form === 'bloom' || s.form === 'spike') && s.habitats.some((h) => DRIFT_HABITATS.includes(h))),
  );
}

/**
 * A drift's leads are picked in this many steps of its lead hash, so the terrain can look a drift's
 * colour up in a small table (one row per step) and agree exactly with the scatter.
 */
export const DRIFT_BINS = 16;

/** The table row (0 … DRIFT_BINS − 1) of a 0-1 pick. */
export function driftBin(pick: number): number {
  return Math.min(DRIFT_BINS - 1, Math.floor(pick * DRIFT_BINS));
}

/** The lead species of a drift with lead hash `lead` (see `driftLeads`, `DRIFT_BINS`). */
export function driftLead(leads: readonly FloraSpecies[], lead: number): FloraSpecies {
  return pickSpecies(leads, (driftBin(lead) + 0.5) / DRIFT_BINS);
}

/** The species at `pick` (0-1) along `list`'s weights (the last one past the end). */
export function pickSpecies<T extends Pick<FloraSpecies, 'weight'>>(list: readonly T[], pick: number): T {
  let total = 0;
  for (const s of list) total += s.weight;
  let acc = 0;
  for (const s of list) {
    acc += s.weight / total;
    if (pick < acc) return s;
  }
  return list[list.length - 1]!;
}

/** `cellHash` as nodes. */
function cellHashNode(cx: AnyNode, cz: AnyNode, seed: AnyNode): AnyNode {
  const a = fract(cx.mul(0.1373).add(cz.mul(0.3191)).add(seed.mul(0.0731)));
  const b = fract(cx.mul(0.2617).sub(cz.mul(0.0973)).add(seed.mul(0.1913)));
  return fract(
    a
      .add(b)
      .add(0.1)
      .mul(a.mul(37.13).add(b.mul(19.71)).add(3.7)),
  );
}

/**
 * `driftAt` as TSL nodes at the world point `p` (vec2 x, z), for a per-fragment `seed` and `coverage`
 * (nodes or numbers): the drift's strength and its lead pick.
 */
export function driftNodes(
  p: AnyNode,
  seed: AnyNode,
  coverage: AnyNode,
): { strength: AnyNode; lead: AnyNode } {
  const s = float(seed);
  const q = vec2(
    p.x.add(sin(p.y.mul(DRIFT.warpFreq).add(1.3)).mul(DRIFT.warp)),
    p.y.add(sin(p.x.mul(DRIFT.warpFreq).add(4.1)).mul(DRIFT.warp)),
  ).div(DRIFT.cell) as AnyNode;
  const c = floor(q) as AnyNode;
  const d = q.sub(c).sub(0.5).length().mul(2);
  // 1 where the cell's hash is under the coverage (`step(edge, x)` is 1 for x ≥ edge).
  const has = float(1).sub(step(float(coverage), cellHashNode(c.x.add(17), c.y.sub(31), s)));
  return {
    strength: has.mul(float(1).sub(smoothstep(DRIFT.inner, DRIFT.outer, d))),
    lead: cellHashNode(c.x, c.y, s),
  };
}
