import type { IslandWays } from '../../world/islands/waypoints';
import { SeaChart, type SeaRoute } from './sea-chart';
import { WalkGraph, type WalkRoute } from './walk-graph';

/** What a compass marker shows: where to aim now, how far it is along the way, and a level cue. */
export interface CompassLeg {
  x: number;
  z: number;
  length: number;
  /** The target's a level above or below you (a deck, a terrace, the lighthouse). */
  level: 'up' | 'down' | null;
}

/** Recompute a walking route after the walker has moved this far (m), a sea route after the ship has. */
const WALK_EVERY = 1.5;
const SEA_EVERY = 10;
/** The target's moved this far (an NPC walking about): recompute. */
const TARGET_MOVED = 1.5;
/** Height (m) between you and the target that gets an up or down cue. */
const LEVEL_CUE = 2.5;

/** Every island's routes: walking graphs (built the first time an island's asked for) and one sea chart. */
export class Wayfinder {
  readonly sea: SeaChart;
  private readonly walks = new Map<string, WalkGraph | null>();

  constructor(private readonly ways: Readonly<Record<string, IslandWays>>) {
    this.sea = new SeaChart(Object.values(ways).map((w) => w.sea));
  }

  walk(island: string): WalkGraph | null {
    let g = this.walks.get(island);
    if (g === undefined) {
      const w = this.ways[island];
      g = w ? new WalkGraph(w.walk) : null;
      this.walks.set(island, g);
    }
    return g;
  }
}

/**
 * One compass marker's route, recomputed only when its target changes or moves, or you've moved a
 * little way; in between, its length follows you to the waypoint it aims at. Allocates nothing.
 */
export class CompassRoute {
  private key: string | null = null;
  private fx = NaN;
  private fy = NaN;
  private fz = NaN;
  private tx = NaN;
  private tz = NaN;
  private nx = 0;
  private nz = 0;
  /** The route's length beyond the waypoint it aims at. */
  private rest = 0;
  private readonly walkOut: WalkRoute = { x: 0, y: 0, z: 0, length: 0, node: -1 };
  private readonly seaOut: SeaRoute = { x: 0, z: 0, length: 0, node: -1 };

  /** Forget the route (the next call recomputes). */
  reset(): void {
    this.key = null;
  }

  /** On foot: from (fx, fy, fz) to a target at (tx, ty, tz) on `island`, keyed by `key`. */
  ashore(
    way: Wayfinder,
    island: string,
    key: string,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    out: CompassLeg,
  ): void {
    if (this.stale(key, fx, fz, tx, tz, WALK_EVERY) || Math.abs(fy - this.fy) > 1) {
      const g = way.walk(island);
      const r = this.walkOut;
      if (!g || !g.route(fx, fy, fz, tx, ty, tz, r)) {
        r.x = tx;
        r.z = tz;
        r.length = Math.hypot(tx - fx, tz - fz);
      }
      this.keep(key, fx, fy, fz, tx, tz, r.x, r.z, r.length);
    }
    this.write(fx, fz, out);
    const dy = ty - fy;
    out.level = dy > LEVEL_CUE ? 'up' : dy < -LEVEL_CUE ? 'down' : null;
  }

  /** At sea: from the ship at (fx, fz) to a goal at (tx, tz), keyed by `key`. */
  afloat(way: Wayfinder, key: string, fx: number, fz: number, tx: number, tz: number, out: CompassLeg): void {
    if (this.stale(key, fx, fz, tx, tz, SEA_EVERY)) {
      const r = this.seaOut;
      way.sea.route(fx, fz, tx, tz, r);
      this.keep(key, fx, 0, fz, tx, tz, r.x, r.z, r.length);
    }
    this.write(fx, fz, out);
    out.level = null;
  }

  private stale(key: string, fx: number, fz: number, tx: number, tz: number, every: number): boolean {
    return (
      key !== this.key ||
      Math.hypot(fx - this.fx, fz - this.fz) > every ||
      Math.hypot(tx - this.tx, tz - this.tz) > TARGET_MOVED
    );
  }

  private keep(
    key: string,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    tz: number,
    nx: number,
    nz: number,
    length: number,
  ): void {
    this.key = key;
    this.fx = fx;
    this.fy = fy;
    this.fz = fz;
    this.tx = tx;
    this.tz = tz;
    this.nx = nx;
    this.nz = nz;
    this.rest = Math.max(0, length - Math.hypot(nx - fx, nz - fz));
  }

  private write(fx: number, fz: number, out: CompassLeg): void {
    out.x = this.nx;
    out.z = this.nz;
    out.length = Math.hypot(this.nx - fx, this.nz - fz) + this.rest;
  }
}
