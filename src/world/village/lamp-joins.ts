import { BufferAttribute, BufferGeometry, Vector3 } from 'three/webgpu';

/**
 * Test support for the lamp joins test (never shipped): splits built geometry into its parts and
 * measures how two parts meet, from the vertices and the faces, not by eye.
 */

/** One convex part: its points and its faces' planes (unit normal, offset). */
export interface Part {
  readonly points: Float32Array;
  /** Its triangles' edges, as pairs of point indices. */
  readonly edges: Uint32Array;
  readonly planes: Float32Array;
  readonly min: Vector3;
  readonly max: Vector3;
}

/**
 * Splits geometries into their parts: vertices joined by a triangle or sharing a position (a box's
 * faces have their own vertices) are one part. A merged geometry splits back into what made it.
 */
export function partsOf(geometries: readonly BufferGeometry[]): Part[] {
  const out: Part[] = [];
  for (const g of geometries) {
    const pos = g.getAttribute('position') as BufferAttribute;
    const n = pos.count;
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
      return i;
    };
    const join = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    const seen = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      const j = seen.get(key);
      if (j === undefined) seen.set(key, i);
      else join(i, j);
    }
    const index = g.index;
    const tri = (k: number) => (index ? index.getX(k) : k);
    const count = index ? index.count : n;
    for (let k = 0; k < count; k += 3) {
      join(tri(k), tri(k + 1));
      join(tri(k), tri(k + 2));
    }
    const verts = new Map<number, number[]>();
    const faces = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let list = verts.get(r);
      if (!list) verts.set(r, (list = []));
      list.push(i);
    }
    for (let k = 0; k < count; k += 3) {
      const r = find(tri(k));
      let list = faces.get(r);
      if (!list) faces.set(r, (list = []));
      list.push(tri(k), tri(k + 1), tri(k + 2));
    }
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (const [r, list] of verts) {
      const points = new Float32Array(list.length * 3);
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      list.forEach((i, k) => {
        a.fromBufferAttribute(pos, i);
        a.toArray(points, k * 3);
        min.min(a);
        max.max(a);
      });
      const planes: number[] = [];
      const f = faces.get(r) ?? [];
      const local = new Map(list.map((i, k) => [i, k]));
      const edges: number[] = [];
      for (let k = 0; k < f.length; k += 3)
        for (const [i, j] of [
          [f[k]!, f[k + 1]!],
          [f[k + 1]!, f[k + 2]!],
          [f[k + 2]!, f[k]!],
        ] as const)
          edges.push(local.get(i)!, local.get(j)!);
      // Faces wound either way: each plane faces away from the part's middle.
      const mid = min.clone().add(max).multiplyScalar(0.5);
      for (let k = 0; k < f.length; k += 3) {
        a.fromBufferAttribute(pos, f[k]!);
        b.fromBufferAttribute(pos, f[k + 1]!);
        c.fromBufferAttribute(pos, f[k + 2]!);
        const nrm = b.sub(a).cross(c.sub(a));
        if (nrm.lengthSq() < 1e-14) continue;
        nrm.normalize();
        let off = nrm.dot(a);
        if (nrm.dot(mid) > off) {
          nrm.negate();
          off = -off;
        }
        planes.push(nrm.x, nrm.y, nrm.z, off);
      }
      out.push({ points, edges: new Uint32Array(edges), planes: new Float32Array(planes), min, max });
    }
  }
  return out;
}

/**
 * Signed distance from p to a part taken as convex (the largest of its faces' plane distances): under
 * 0 inside, by how deep. An open part (a cone without a base) reads as its hull.
 */
function sdf(part: Part, x: number, y: number, z: number): number {
  const pl = part.planes;
  // The part's box bounds it too: an open cone's side planes alone run on past its rim.
  let d = Math.max(
    part.min.x - x,
    x - part.max.x,
    part.min.y - y,
    y - part.max.y,
    part.min.z - z,
    z - part.max.z,
  );
  for (let k = 0; k < pl.length; k += 4)
    d = Math.max(d, pl[k]! * x + pl[k + 1]! * y + pl[k + 2]! * z - pl[k + 3]!);
  return d;
}

/** Whether an edge of `a` passes through `b` grown by `grow` (m): a rod through a plate, side by side. */
function crosses(a: Part, b: Part, grow: number): boolean {
  const p = a.points;
  const pl = b.planes;
  for (let e = 0; e < a.edges.length; e += 2) {
    const i = a.edges[e]! * 3;
    const j = a.edges[e + 1]! * 3;
    let t0 = 0;
    let t1 = 1;
    const box = [
      [1, 0, 0, b.max.x],
      [-1, 0, 0, -b.min.x],
      [0, 1, 0, b.max.y],
      [0, -1, 0, -b.min.y],
      [0, 0, 1, b.max.z],
      [0, 0, -1, -b.min.z],
    ];
    const clip = (nx: number, ny: number, nz: number, d: number) => {
      const s0 = nx * p[i]! + ny * p[i + 1]! + nz * p[i + 2]! - d - grow;
      const s1 = nx * p[j]! + ny * p[j + 1]! + nz * p[j + 2]! - d - grow;
      if (s0 > 0 && s1 > 0) return false;
      if (s0 > 0) t0 = Math.max(t0, s0 / (s0 - s1));
      else if (s1 > 0) t1 = Math.min(t1, s0 / (s0 - s1));
      return t0 <= t1;
    };
    let hit = true;
    for (const [nx, ny, nz, d] of box) if (!(hit = clip(nx!, ny!, nz!, d!))) break;
    for (let k = 0; hit && k < pl.length; k += 4) hit = clip(pl[k]!, pl[k + 1]!, pl[k + 2]!, pl[k + 3]!);
    if (hit) return true;
  }
  return false;
}

/**
 * How two parts meet: under 0, how deep the deepest vertex of either goes into the other; 0 if an
 * edge passes through the other; else the gap between them (m, to a millimetre or so).
 */
export function meet(a: Part, b: Part): number {
  // Boxes apart by more than 5 cm don't meet (and spare the vertex loop).
  const sep = Math.max(
    a.min.x - b.max.x,
    b.min.x - a.max.x,
    a.min.y - b.max.y,
    b.min.y - a.max.y,
    a.min.z - b.max.z,
    b.min.z - a.max.z,
  );
  if (sep > 0.05) return sep;
  let d = Infinity;
  for (const [p, q] of [
    [a, b],
    [b, a],
  ] as const)
    for (let i = 0; i < p.points.length; i += 3)
      d = Math.min(d, sdf(q, p.points[i]!, p.points[i + 1]!, p.points[i + 2]!));
  if (d <= 0) return d;
  const hit = (g: number) => crosses(a, b, g) || crosses(b, a, g);
  if (hit(0)) return 0;
  if (!hit(d)) return d;
  // The least growth that makes them meet, by halves.
  let lo = 0;
  let hi = d;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (hit(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The parts within `r` of a point (box distance): one lamp out of a bigger build. */
export function near(parts: readonly Part[], p: { x: number; y: number; z: number }, r: number): Part[] {
  return parts.filter((q) => {
    const dx = Math.max(q.min.x - p.x, 0, p.x - q.max.x);
    const dy = Math.max(q.min.y - p.y, 0, p.y - q.max.y);
    const dz = Math.max(q.min.z - p.z, 0, p.z - q.max.z);
    return Math.hypot(dx, dy, dz) <= r;
  });
}

/**
 * The faults in a lamp: parts that touch no other (gap over `gap`), the lamp in more than one piece,
 * and parts that touch with a vertex deeper than `overlap` in another.
 */
export function lampFaults(parts: readonly Part[], { gap = 0.01, overlap = 0.03 } = {}): string[] {
  const faults: string[] = [];
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const name = (p: Part) =>
    `part at (${((p.min.x + p.max.x) / 2).toFixed(2)}, ${((p.min.y + p.max.y) / 2).toFixed(2)}, ${((p.min.z + p.max.z) / 2).toFixed(2)})`;
  for (let i = 0; i < parts.length; i++) {
    let best = Infinity;
    for (let j = 0; j < parts.length; j++) {
      if (i === j) continue;
      const m = meet(parts[i]!, parts[j]!);
      best = Math.min(best, m);
      if (m <= gap) {
        parent[find(i)] = find(j);
        if (j > i && -m > overlap)
          faults.push(`${name(parts[i]!)} and ${name(parts[j]!)} overlap ${(-m * 100).toFixed(1)} cm`);
      }
    }
    if (best > gap)
      faults.push(`${name(parts[i]!)} floats ${(best * 100).toFixed(1)} cm from the nearest part`);
  }
  const roots = new Set(parts.map((_, i) => find(i)));
  if (roots.size > 1) faults.push(`the lamp is in ${roots.size} pieces`);
  return faults;
}
