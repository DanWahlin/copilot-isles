/**
 * Walking routes for the compass (shared code; each island's waypoints are its own data, see
 * src/world/islands/waypoints.ts). A small graph of waypoints joined by walkable legs: the compass
 * aims at the next waypoint on the shortest route to its target and shows the route's length, so it
 * leads along the quays, piers, streets and stairs instead of straight into the water or a wall.
 *
 * The walker and the target each join the graph at the nearest point on any leg (a height step
 * counts extra, so a walker on a stair joins the flight they're on, not the one overhead), then
 * Dijkstra runs over the waypoints. Everything's preallocated: a route allocates nothing.
 */

/** A waypoint: a spot on a walkable route, with its walk height (feet). */
export interface WayPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A leg between two waypoints, walked both ways. `ride`: a lift you take, not a walk. */
export type WayLeg = readonly [string, string] | readonly [string, string, 'ride'];

/** An island's walking routes. */
export interface WalkGraphSpec {
  readonly nodes: readonly WayPoint[];
  readonly legs: readonly WayLeg[];
}

/** Where a route says to head now: the next waypoint (or the target), and the route's length. */
export interface WalkRoute {
  x: number;
  y: number;
  z: number;
  /** Metres from the walker along the route to the target. */
  length: number;
  /** Index of the waypoint aimed at (−1: the target itself). */
  node: number;
}

/**
 * Joining the graph, a height difference past `LEVEL_SLACK` counts this many times its metres, so a
 * walker under a deck joins the ground's routes, not the deck's (a bump in the terrain doesn't count).
 */
const LEVEL_WEIGHT = 10;
const LEVEL_SLACK = 2.5;
const heightCost = (dy: number) => {
  const a = Math.abs(dy);
  return a <= LEVEL_SLACK ? a : LEVEL_SLACK + (a - LEVEL_SLACK) * LEVEL_WEIGHT;
};
/** A waypoint this close (m, level with you) is passed: the compass aims at the one after. */
const REACHED = 2.5;
/** A target this close and level with you is aimed at directly. */
const NEAR = 7;
/** Height difference (m) that counts as another level. */
export const LEVEL_STEP = 1.6;

export class WalkGraph {
  readonly size: number;
  readonly ids: readonly string[];
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly zs: Float64Array;
  private readonly ea: Int32Array;
  private readonly eb: Int32Array;
  private readonly elen: Float64Array;
  private readonly adjStart: Int32Array;
  private readonly adjNode: Int32Array;
  private readonly adjLen: Float64Array;
  private readonly dist: Float64Array;
  private readonly prev: Int32Array;
  private readonly done: Uint8Array;
  private readonly path: Int32Array;
  // The last projection (`project`): the leg, how far along it, and the point.
  private pLeg = -1;
  private pT = 0;
  private px = 0;
  private py = 0;
  private pz = 0;

  constructor(spec: WalkGraphSpec) {
    const index = new Map<string, number>();
    spec.nodes.forEach((n, i) => {
      if (index.has(n.id)) throw new Error(`waypoint ${n.id} twice`);
      index.set(n.id, i);
    });
    const n = spec.nodes.length;
    this.size = n;
    this.ids = spec.nodes.map((p) => p.id);
    this.xs = Float64Array.from(spec.nodes, (p) => p.x);
    this.ys = Float64Array.from(spec.nodes, (p) => p.y);
    this.zs = Float64Array.from(spec.nodes, (p) => p.z);
    const m = spec.legs.length;
    this.ea = new Int32Array(m);
    this.eb = new Int32Array(m);
    this.elen = new Float64Array(m);
    const degree = new Int32Array(n);
    spec.legs.forEach((leg, i) => {
      const a = index.get(leg[0]);
      const b = index.get(leg[1]);
      if (a === undefined || b === undefined) throw new Error(`leg ${leg[0]}–${leg[1]}: no such waypoint`);
      this.ea[i] = a;
      this.eb[i] = b;
      this.elen[i] = Math.hypot(
        this.xs[b]! - this.xs[a]!,
        this.ys[b]! - this.ys[a]!,
        this.zs[b]! - this.zs[a]!,
      );
      degree[a]!++;
      degree[b]!++;
    });
    this.adjStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.adjStart[i + 1] = this.adjStart[i]! + degree[i]!;
    this.adjNode = new Int32Array(2 * m);
    this.adjLen = new Float64Array(2 * m);
    const fill = this.adjStart.slice(0, n);
    for (let i = 0; i < m; i++) {
      const a = this.ea[i]!,
        b = this.eb[i]!;
      this.adjNode[fill[a]!] = b;
      this.adjLen[fill[a]!++] = this.elen[i]!;
      this.adjNode[fill[b]!] = a;
      this.adjLen[fill[b]!++] = this.elen[i]!;
    }
    this.dist = new Float64Array(n);
    this.prev = new Int32Array(n);
    this.done = new Uint8Array(n);
    this.path = new Int32Array(n);
  }

  /**
   * The nearest point on any leg to (x, y, z), heights weighted (`heightCost`): sets the projection
   * fields and returns the weighted distance (Infinity for a graph with no legs).
   */
  private project(x: number, y: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.ea.length; i++) {
      const a = this.ea[i]!,
        b = this.eb[i]!;
      const ax = this.xs[a]!,
        ay = this.ys[a]!,
        az = this.zs[a]!;
      const dx = this.xs[b]! - ax,
        dy = this.ys[b]! - ay,
        dz = this.zs[b]! - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t,
        qy = ay + dy * t,
        qz = az + dz * t;
      const h = heightCost(qy - y);
      const d = (qx - x) ** 2 + (qz - z) ** 2 + h * h;
      if (d < best) {
        best = d;
        this.pLeg = i;
        this.pT = t;
        this.px = qx;
        this.py = qy;
        this.pz = qz;
      }
    }
    return Math.sqrt(best);
  }

  /**
   * The nearest waypoint to (x, y, z), heights weighted like a join; −1 for an empty graph. For
   * putting a stuck captain back on the route.
   */
  nearest(x: number, y: number, z: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.size; i++) {
      const h = heightCost(this.ys[i]! - y);
      const d = (this.xs[i]! - x) ** 2 + (this.zs[i]! - z) ** 2 + h * h;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** A waypoint's position, written to `out`. */
  point(i: number, out: { x: number; y: number; z: number }): void {
    out.x = this.xs[i]!;
    out.y = this.ys[i]!;
    out.z = this.zs[i]!;
  }

  /**
   * The route from a walker at (fx, fy, fz) to a target at (tx, ty, tz), written to `out`: where to
   * head now and how far it is along the way. False (and `out` aimed straight at the target) when the
   * graph has no legs or the two aren't connected.
   */
  route(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, out: WalkRoute): boolean {
    const straight = Math.hypot(tx - fx, tz - fz);
    out.x = tx;
    out.y = ty;
    out.z = tz;
    out.node = -1;
    out.length = Math.hypot(straight, ty - fy);
    if (straight < NEAR && Math.abs(ty - fy) < LEVEL_STEP) return true;
    if (this.project(tx, ty, tz) === Infinity) return false;
    const goalLeg = this.pLeg,
      goalT = this.pT;
    const lastLeg = Math.hypot(tx - this.px, tz - this.pz, ty - this.py);
    this.project(fx, fy, fz);
    const startLeg = this.pLeg,
      startT = this.pT;
    // Both on one leg: the target's straight along it.
    if (startLeg === goalLeg) return true;

    const n = this.size;
    const dist = this.dist,
      prev = this.prev,
      done = this.done;
    dist.fill(Infinity);
    prev.fill(-1);
    done.fill(0);
    const sa = this.ea[startLeg]!,
      sb = this.eb[startLeg]!;
    const sl = this.elen[startLeg]!;
    dist[sa] = startT * sl;
    dist[sb] = Math.min(dist[sb]!, (1 - startT) * sl);
    const ga = this.ea[goalLeg]!,
      gb = this.eb[goalLeg]!;
    const gl = this.elen[goalLeg]!;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++)
        if (!done[i] && dist[i]! < best) {
          best = dist[i]!;
          u = i;
        }
      if (u < 0) break;
      done[u] = 1;
      if (done[ga] && done[gb]) break;
      for (let k = this.adjStart[u]!; k < this.adjStart[u + 1]!; k++) {
        const v = this.adjNode[k]!;
        const d = best + this.adjLen[k]!;
        if (d < dist[v]!) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    const viaA = dist[ga]! + goalT * gl;
    const viaB = dist[gb]! + (1 - goalT) * gl;
    const end = viaA <= viaB ? ga : gb;
    const total = Math.min(viaA, viaB);
    if (!Number.isFinite(total)) return false;
    // Back from the goal's side to the start's, then reversed: path[0] is the first waypoint ahead.
    let m = 0;
    for (let v = end; v >= 0; v = prev[v]!) this.path[m++] = v;
    for (let i = 0, j = m - 1; i < j; i++, j--) {
      const s = this.path[i]!;
      this.path[i] = this.path[j]!;
      this.path[j] = s;
    }
    let k = 0;
    while (k < m && this.passed(this.path[k]!, fx, fy, fz)) k++;
    // Every waypoint's behind you: the last stretch, straight to the target.
    if (k >= m) return true;
    const next = this.path[k]!;
    out.x = this.xs[next]!;
    out.y = this.ys[next]!;
    out.z = this.zs[next]!;
    out.node = next;
    out.length = Math.hypot(out.x - fx, out.z - fz) + (total - dist[next]!) + lastLeg;
    return true;
  }

  private passed(i: number, x: number, y: number, z: number): boolean {
    return Math.hypot(this.xs[i]! - x, this.zs[i]! - z) < REACHED && Math.abs(this.ys[i]! - y) < LEVEL_STEP;
  }
}
