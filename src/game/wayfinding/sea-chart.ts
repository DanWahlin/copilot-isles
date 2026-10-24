/**
 * Sea lanes for the compass and the crew (shared code; each island's coast and lanes are its own
 * data, see src/world/islands/waypoints.ts). Every island gives the ship a coast: one polygon round
 * its land and shoals with some sea room, its harbour left open as a notch, and a few lane points
 * (the harbour mouth, the berth's approach). The chart's waypoints are those lane points and each
 * coast's outward corners, pushed out to sea; two waypoints are joined when the line between them
 * crosses no coast. A route joins the ship and the goal to every waypoint they can see and runs
 * Dijkstra, so the compass leads round headlands and in through the harbour mouth, not onto a beach.
 *
 * The chart's built once (a few thousand segment tests); a route allocates nothing.
 */

export interface SeaPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * An island's waters for the ship: its coasts (closed polygons, either winding: the island, and any
 * rock offshore) and its lane points.
 */
export interface SeaChartSpec {
  readonly coasts: readonly (readonly SeaPoint[])[];
  readonly lanes: readonly SeaPoint[];
}

/** Where a sea route says to steer now, and the route's length. */
export interface SeaRoute {
  x: number;
  z: number;
  length: number;
  /** Index of the waypoint aimed at (−1: the goal itself). */
  node: number;
}

/** How far (m) out to sea a coast's corner waypoint lies. */
const CORNER_OFFSET = 30;
/** A waypoint this close (m) is passed: the compass aims at the one after. */
const REACHED = 30;

export class SeaChart {
  readonly size: number;
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;
  /** Every coast's edges, flat: x0 z0 x1 z1 per edge. */
  private readonly segs: Float64Array;
  /** Each coast's first edge and edge count, for inside tests. */
  private readonly polys: { from: number; count: number }[] = [];
  /** Waypoint-to-waypoint visibility lengths (Infinity when a coast's in the way), n × n. */
  private readonly link: Float64Array;
  private readonly fromLen: Float64Array;
  private readonly toLen: Float64Array;
  private readonly dist: Float64Array;
  private readonly prev: Int32Array;
  private readonly done: Uint8Array;

  constructor(specs: readonly SeaChartSpec[]) {
    const xs: number[] = [];
    const zs: number[] = [];
    const segs: number[] = [];
    for (const s of specs)
      for (const c of s.coasts) {
        const from = segs.length / 4;
        for (let i = 0; i < c.length; i++) {
          const a = c[i]!,
            b = c[(i + 1) % c.length]!;
          segs.push(a.x, a.z, b.x, b.z);
        }
        this.polys.push({ from, count: c.length });
      }
    this.segs = Float64Array.from(segs);
    const add = (p: SeaPoint) => {
      xs.push(p.x);
      zs.push(p.z);
    };
    for (const s of specs) {
      for (const c of s.coasts) for (const p of cornerWaypoints(c)) if (!this.inside(p.x, p.z)) add(p);
      for (const p of s.lanes) add(p);
    }
    const n = xs.length;
    this.size = n;
    this.xs = Float64Array.from(xs);
    this.zs = Float64Array.from(zs);
    this.link = new Float64Array(n * n).fill(Infinity);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (this.clear(xs[i]!, zs[i]!, xs[j]!, zs[j]!)) {
          const d = Math.hypot(xs[j]! - xs[i]!, zs[j]! - zs[i]!);
          this.link[i * n + j] = d;
          this.link[j * n + i] = d;
        }
    this.fromLen = new Float64Array(n);
    this.toLen = new Float64Array(n);
    this.dist = new Float64Array(n);
    this.prev = new Int32Array(n);
    this.done = new Uint8Array(n);
  }

  /** A waypoint's position (tests, tools). */
  point(i: number): SeaPoint {
    return { x: this.xs[i]!, z: this.zs[i]! };
  }

  /** The nearest waypoint to (x, z) (all of them lie in open water); −1 for an empty chart. */
  nearest(x: number, z: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.size; i++) {
      const d = Math.hypot(this.xs[i]! - x, this.zs[i]! - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Whether (x, z) is inside any coast. */
  inside(x: number, z: number): boolean {
    for (const p of this.polys) {
      let odd = false;
      for (let k = p.from; k < p.from + p.count; k++) {
        const x0 = this.segs[k * 4]!,
          z0 = this.segs[k * 4 + 1]!,
          x1 = this.segs[k * 4 + 2]!,
          z1 = this.segs[k * 4 + 3]!;
        if (z0 > z !== z1 > z && x < x0 + ((z - z0) * (x1 - x0)) / (z1 - z0)) odd = !odd;
      }
      if (odd) return true;
    }
    return false;
  }

  /** Whether the straight line from (ax, az) to (bx, bz) crosses no coast. */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const s = this.segs;
    for (let k = 0; k < s.length; k += 4)
      if (crosses(ax, az, bx, bz, s[k]!, s[k + 1]!, s[k + 2]!, s[k + 3]!)) return false;
    return true;
  }

  /**
   * The route from the ship at (fx, fz) to a goal at (tx, tz), written to `out`. A ship that's
   * somehow inside a coast (aground on a shoal) joins at the nearest waypoint. False (and `out` aimed
   * straight at the goal) when there's no way round.
   */
  route(fx: number, fz: number, tx: number, tz: number, out: SeaRoute): boolean {
    out.x = tx;
    out.z = tz;
    out.node = -1;
    out.length = Math.hypot(tx - fx, tz - fz);
    if (this.clear(fx, fz, tx, tz)) return true;
    const n = this.size;
    if (n === 0) return false;
    const end = this.solve(fx, fz, tx, tz);
    if (end < 0) return false;
    let first = end;
    while (this.prev[first]! >= 0) first = this.prev[first]!;
    // Past the first waypoint already (within reach, and the next leg's clear from here)? Aim on.
    let next = first;
    if (Math.hypot(this.xs[first]! - fx, this.zs[first]! - fz) < REACHED && first !== end) {
      let v = end;
      while (this.prev[v] !== first) v = this.prev[v]!;
      if (this.clear(fx, fz, this.xs[v]!, this.zs[v]!)) next = v;
    }
    out.x = this.xs[next]!;
    out.z = this.zs[next]!;
    out.node = next;
    out.length = Math.hypot(out.x - fx, out.z - fz) + (this.dist[end]! - this.dist[next]!) + this.toLen[end]!;
    return true;
  }

  /**
   * Every point of the route from (fx, fz) to (tx, tz), goal last (allocates: for the crew's
   * course, not every frame). Just the goal when the way's clear or there's none round.
   */
  path(fx: number, fz: number, tx: number, tz: number): SeaPoint[] {
    if (this.clear(fx, fz, tx, tz) || this.size === 0) return [{ x: tx, z: tz }];
    const end = this.solve(fx, fz, tx, tz);
    const out: SeaPoint[] = [{ x: tx, z: tz }];
    for (let v = end; v >= 0; v = this.prev[v]!) out.push({ x: this.xs[v]!, z: this.zs[v]! });
    return out.reverse();
  }

  /** Dijkstra from the ship to the goal over the waypoints; returns the goal's waypoint (−1: none). */
  private solve(fx: number, fz: number, tx: number, tz: number): number {
    const n = this.size;
    const fromIn = this.inside(fx, fz);
    const toIn = this.inside(tx, tz);
    let nearFrom = 0,
      nearTo = 0;
    for (let i = 0; i < n; i++) {
      const df = Math.hypot(this.xs[i]! - fx, this.zs[i]! - fz);
      const dt = Math.hypot(this.xs[i]! - tx, this.zs[i]! - tz);
      this.fromLen[i] = fromIn || this.clear(fx, fz, this.xs[i]!, this.zs[i]!) ? df : Infinity;
      this.toLen[i] = toIn || this.clear(this.xs[i]!, this.zs[i]!, tx, tz) ? dt : Infinity;
      if (df < Math.hypot(this.xs[nearFrom]! - fx, this.zs[nearFrom]! - fz)) nearFrom = i;
      if (dt < Math.hypot(this.xs[nearTo]! - tx, this.zs[nearTo]! - tz)) nearTo = i;
    }
    // Nothing in sight (hemmed in by a coast's margin): join at the nearest waypoint.
    if (!this.fromLen.some(Number.isFinite))
      this.fromLen[nearFrom] = Math.hypot(this.xs[nearFrom]! - fx, this.zs[nearFrom]! - fz);
    if (!this.toLen.some(Number.isFinite))
      this.toLen[nearTo] = Math.hypot(this.xs[nearTo]! - tx, this.zs[nearTo]! - tz);
    const dist = this.dist,
      prev = this.prev,
      done = this.done;
    dist.set(this.fromLen);
    prev.fill(-1);
    done.fill(0);
    let end = -1;
    let endCost = Infinity;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++)
        if (!done[i] && dist[i]! < best) {
          best = dist[i]!;
          u = i;
        }
      if (u < 0 || best >= endCost) break;
      done[u] = 1;
      if (best + this.toLen[u]! < endCost) {
        endCost = best + this.toLen[u]!;
        end = u;
      }
      const row = u * n;
      for (let v = 0; v < n; v++) {
        const d = best + this.link[row + v]!;
        if (d < dist[v]!) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    return end;
  }
}

/** Whether segment a–b properly crosses segment c–d (touching ends don't count). */
function crosses(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** A coast's outward corners (where a shortest route can bend), each pushed `CORNER_OFFSET` out to sea. */
export function cornerWaypoints(coast: readonly SeaPoint[]): SeaPoint[] {
  const n = coast.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = coast[i]!,
      b = coast[(i + 1) % n]!;
    area += a.x * b.z - b.x * a.z;
  }
  const sign = Math.sign(area) || 1;
  const out: SeaPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = coast[(i + n - 1) % n]!,
      c = coast[i]!,
      q = coast[(i + 1) % n]!;
    const ux = c.x - p.x,
      uz = c.z - p.z,
      vx = q.x - c.x,
      vz = q.z - c.z;
    // An outward corner turns the same way the coast winds.
    if ((ux * vz - uz * vx) * sign <= 0) continue;
    const lu = Math.hypot(ux, uz) || 1,
      lv = Math.hypot(vx, vz) || 1;
    // Outward normals of the two edges (right of travel for one winding, left for the other).
    const nux = (uz / lu) * sign,
      nuz = (-ux / lu) * sign,
      nvx = (vz / lv) * sign,
      nvz = (-vx / lv) * sign;
    const bx = nux + nvx,
      bz = nuz + nvz;
    const bl = Math.hypot(bx, bz) || 1;
    out.push({ x: c.x + (bx / bl) * CORNER_OFFSET, z: c.z + (bz / bl) * CORNER_OFFSET });
  }
  return out;
}
