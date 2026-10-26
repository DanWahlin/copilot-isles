import { keelhavenHeight } from './height';
import { toWorld } from './layout';
import { GATE_PATH, GATE_PATH_HALF } from './works';

/** One tread of the Gate Light's stair, in the cove frame: its middle, height, run and drop side. */
export interface GateTread {
  readonly u: number;
  readonly v: number;
  y: number;
  /** Along the path. */
  readonly tu: number;
  readonly tv: number;
  /** Across, toward the drop. */
  readonly nu: number;
  readonly nv: number;
  /** Distance along the path to the tread's start (m). */
  readonly s: number;
}

/** A tread's length along the path (m), the same on every tier: the treads are the walk surface. */
export const GATE_TREAD = 1.4;
/** The most a tread stands over the one before it (m), under the walker's step. */
export const GATE_STAIR_RISE = 0.4;

const ground = (u: number, v: number) => {
  const p = toWorld(u, v);
  return keelhavenHeight(p.x, p.z);
};

let treads: GateTread[] | null = null;

/**
 * The stair up the North Head (works.ts `GATE_PATH`), tread by tread: each on the slope's high edge and
 * over the ground on its line. The treads only climb: over a gully they bridge on taller posts (a dip
 * read as a sag in the stair), and where the high side jumps, the treads before it rise to meet it, so
 * no step is higher than `GATE_STAIR_RISE`. At the top it steps down onto the light's bench. The town's builder and the compass's waypoints read it.
 */
export function gateStairTreads(): readonly GateTread[] {
  if (treads) return treads;
  const out: GateTread[] = [];
  const half = GATE_PATH_HALF * 0.5;
  let run = 0;
  let next = 0;
  let climb = -Infinity;
  const need: number[] = [];
  for (let i = 0; i + 1 < GATE_PATH.length; i++) {
    const a = GATE_PATH[i]!;
    const e = GATE_PATH[i + 1]!;
    const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
    const tu = (e[0] - a[0]) / len;
    const tv = (e[1] - a[1]) / len;
    const mu = (a[0] + e[0]) / 2;
    const mv = (a[1] + e[1]) / 2;
    const side = ground(mu - tv * 5, mv + tu * 5) < ground(mu + tv * 5, mv - tu * 5) ? 1 : -1;
    const nu = -tv * side;
    const nv = tu * side;
    for (let t = next - run; t < len; t += GATE_TREAD) {
      const u = a[0] + tu * (t + GATE_TREAD / 2);
      const v = a[1] + tv * (t + GATE_TREAD / 2);
      const high = ground(u - nu * half, v - nv * half);
      const along = (t + GATE_TREAD / 2) / len;
      const profile = a[2] + (e[2] - a[2]) * Math.min(1, along);
      need.push(Math.max(high, ground(u, v), profile) + 0.14);
      climb = Math.max(climb, need[need.length - 1]!);
      out.push({ u, v, y: climb, tu, tv, nu, nv, s: run + t });
      next = run + t + GATE_TREAD;
    }
    run += len;
  }
  for (let k = out.length - 2; k >= 0; k--) out[k]!.y = Math.max(out[k]!.y, out[k + 1]!.y - GATE_STAIR_RISE);
  // At the top the stair steps down onto the light's bench, tread by tread, as far as it stands over it.
  const last = out.length - 1;
  out[last]!.y = need[last]!;
  for (let k = last - 1; k >= 0; k--) {
    const y = Math.max(need[k]!, Math.min(out[k]!.y, out[k + 1]!.y + GATE_STAIR_RISE));
    if (y === out[k]!.y) break;
    out[k]!.y = y;
  }
  treads = out;
  return out;
}

/** The stair's walk height nearest cove frame (u, v). */
export function gateStairY(u: number, v: number): number {
  let best = Infinity;
  let y = 0;
  for (const t of gateStairTreads()) {
    const d = (t.u - u) ** 2 + (t.v - v) ** 2;
    if (d < best) {
      best = d;
      y = t.y;
    }
  }
  return y;
}
