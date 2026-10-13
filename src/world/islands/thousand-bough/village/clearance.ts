import { HELIX, THOUSAND_BOUGH as TB, atBearing } from '../layout';
import { fernWalkAt, thousandBoughHeight } from '../height';
import { LANDING_SWEEP, WALKS, helixWalkY } from './surfaces';

/** A sampled point of a walk surface: where someone can stand. */
export interface WalkSample {
  x: number;
  y: number;
  z: number;
  id: string;
}

const STEP = 1.5;

/**
 * Every walk surface sampled every 1.5 m (the decks, stair, bridges, landings, the Fern Walk and the
 * side paths on the ground): what the canopy, the prop roots and the props keep clear of, and what
 * the layout tests walk.
 */
export function walkSamples(): WalkSample[] {
  const out: WalkSample[] = [];
  for (const w of WALKS) {
    for (let x = w.box.minX; x <= w.box.maxX; x += STEP)
      for (let z = w.box.minZ; z <= w.box.maxZ; z += STEP) {
        const y = w.height(x, z);
        if (y !== null) out.push({ x, y, z, id: w.id });
      }
  }
  // The stair, along its walkway every ~1.5 m.
  const total = HELIX.sweep + LANDING_SWEEP;
  const dTheta = ((STEP / (2 * Math.PI * HELIX.rMid)) * 360) | 0 || 4;
  for (let t = 0; t <= total; t += Math.max(2, dTheta))
    for (const r of [HELIX.rInner + 0.4, HELIX.rMid, HELIX.rOuter - 0.4]) {
      const p = atBearing(HELIX.startBearing + t, r);
      out.push({ x: p.x, y: helixWalkY(t), z: p.z, id: 'helix' });
    }
  // The Fern Walk and the side paths (on the ground).
  const groundPaths = [TB.fernWalk.points, TB.sidePaths.mirror, TB.sidePaths.westBeach];
  for (const path of groundPaths)
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= len; s += STEP) {
        const x = a.x + ((b.x - a.x) * s) / len;
        const z = a.z + ((b.z - a.z) * s) / len;
        const walk = fernWalkAt(x, z);
        const y = walk && walk.d < 2 ? walk.y : thousandBoughHeight(x, z);
        out.push({ x, y, z, id: path === TB.fernWalk.points ? 'fernWalk' : 'path' });
      }
    }
  return out;
}

/**
 * A spatial index over the walk samples: whether a sphere comes within `beside` metres (sideways) of
 * a walk surface, between `below` under it and `above` over it (a leaf pad, a root, a prop).
 */
export class WalkClearance {
  private readonly cells = new Map<number, WalkSample[]>();
  private static readonly CELL = 6;

  constructor(readonly samples: readonly WalkSample[] = walkSamples()) {
    for (const s of samples) {
      const k = this.key(Math.floor(s.x / WalkClearance.CELL), Math.floor(s.z / WalkClearance.CELL));
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(s);
    }
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  /** The nearest sample (sideways) whose height band the sphere reaches, or null. */
  conflict(
    x: number,
    y: number,
    z: number,
    radius: number,
    o: { beside: number; above: number; below: number; ignore?: (s: WalkSample) => boolean },
  ): WalkSample | null {
    const reach = radius + o.beside;
    const C = WalkClearance.CELL;
    const x0 = Math.floor((x - reach) / C);
    const x1 = Math.floor((x + reach) / C);
    const z0 = Math.floor((z - reach) / C);
    const z1 = Math.floor((z + reach) / C);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const s of list) {
          if (Math.hypot(s.x - x, s.z - z) > reach) continue;
          if (y - radius > s.y + o.above || y + radius < s.y - o.below) continue;
          if (o.ignore?.(s)) continue;
          return s;
        }
      }
    return null;
  }
}
