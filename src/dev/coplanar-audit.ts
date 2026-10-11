import {
  BackSide,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  SkinnedMesh,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three/webgpu';

/** A pair of objects (or one object with itself) holding opaque faces in the same plane that overlap. */
export interface CoplanarHit {
  a: string;
  b: string;
  /** Overlapping triangle pairs. */
  pairs: number;
  /** Upper bound of the overlapping area (m²): the sum of the smaller triangle of each pair. */
  area: number;
  /** World position of the first overlap, and the shared plane's normal there. */
  at: [number, number, number];
  normal: [number, number, number];
  /** The biggest overlap spots (2 m cells): centre and area, largest first, at most 5. */
  spots: { at: [number, number, number]; area: number }[];
}

export interface CoplanarAuditOptions {
  /** Faces count as coplanar within this distance (m). Default 0.002. */
  distance?: number;
  /** Faces must overlap by more than this (m, inside both triangles) to count. Default 0.002. */
  margin?: number;
  /** Meshes with more triangles (all instances) are skipped, like terrain. Default 250 000. */
  maxTriangles?: number;
  /** Extra filter: return true to leave an object out. */
  skip?: (object: Object3D) => boolean;
}

export interface CoplanarAudit {
  hits: CoplanarHit[];
  meshes: number;
  triangles: number;
  /** Meshes left out, with the reason (GPU-displaced, too big, skinned). */
  skipped: { name: string; reason: string }[];
}

interface Tri {
  owner: number;
  /** Oriented unit normal and plane offset (n·p). */
  nx: number;
  ny: number;
  nz: number;
  d: number;
  p: Float64Array; // 9 world coordinates
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const NORMAL_CELL = 0.05;

/** Readable path of an object: its name (or type) and up to three named ancestors. */
function objectPath(o: Object3D): string {
  const parts: string[] = [];
  for (let p: Object3D | null = o; p && parts.length < 4; p = p.parent) {
    if (p.name || p === o) parts.push(p.name || p.type);
  }
  return parts.join(' < ');
}

function displaced(m: Material): boolean {
  return !!(m as Material & { positionNode?: unknown }).positionNode;
}

/** Whether a material's faces write depth and stay opaque (the ones that can z-fight). */
function depthOpaque(m: Material): boolean {
  return m.visible && m.depthTest && m.depthWrite && !m.transparent && !m.polygonOffset;
}

/**
 * Static z-fighting audit: walks the visible scene for opaque, depth-writing faces that lie in the same
 * plane and overlap (merged kit pieces, decals, planks or roofs set flush), which flicker at a distance
 * or as the camera moves. CPU positions only: meshes a TSL `positionNode` moves on the GPU (terrain,
 * water, wind sway) are skipped and listed. Double-sided faces count for both sides.
 */
export function auditCoplanar(root: Object3D, o: CoplanarAuditOptions = {}): CoplanarAudit {
  const dist = o.distance ?? 0.002;
  const margin = o.margin ?? 0.002;
  const maxTriangles = o.maxTriangles ?? 250_000;
  root.updateMatrixWorld(true);
  const owners: string[] = [];
  const skipped: CoplanarAudit['skipped'] = [];
  const buckets = new Map<string, Tri[]>();
  let triangles = 0;
  const world = new Matrix4();
  const instance = new Matrix4();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();

  const add = (owner: number, side: number, flip: boolean) => {
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ab.cross(ac);
    const len = ab.length();
    if (len < 2e-6) return;
    ab.divideScalar(len);
    if (flip) ab.negate();
    const both = side === DoubleSide;
    for (let s = 0; s < (both ? 2 : 1); s++) {
      const sign = (side === BackSide ? -1 : 1) * (s === 0 ? 1 : -1);
      const nx = ab.x * sign;
      const ny = ab.y * sign;
      const nz = ab.z * sign;
      const d = nx * a.x + ny * a.y + nz * a.z;
      const t: Tri = {
        owner,
        nx,
        ny,
        nz,
        d,
        p: Float64Array.of(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z),
        area: len / 2,
        minX: Math.min(a.x, b.x, c.x),
        maxX: Math.max(a.x, b.x, c.x),
        minY: Math.min(a.y, b.y, c.y),
        maxY: Math.max(a.y, b.y, c.y),
        minZ: Math.min(a.z, b.z, c.z),
        maxZ: Math.max(a.z, b.z, c.z),
      };
      const key = `${Math.round(nx / NORMAL_CELL)},${Math.round(ny / NORMAL_CELL)},${Math.round(nz / NORMAL_CELL)}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(t);
      triangles++;
    }
  };

  const collect = (mesh: Mesh, geometry: BufferGeometry, owner: number, matrix: Matrix4, flip: boolean) => {
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // A single material draws the whole range, whatever the groups say.
    const groups =
      Array.isArray(mesh.material) && geometry.groups.length
        ? geometry.groups
        : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    for (const g of groups) {
      const m = mats[g.materialIndex ?? 0];
      if (!m || !depthOpaque(m)) continue;
      const end = Math.min(g.start + g.count, index ? index.count : pos.count);
      for (let i = g.start; i + 2 < end; i += 3) {
        const i0 = index ? index.getX(i) : i;
        const i1 = index ? index.getX(i + 1) : i + 1;
        const i2 = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(matrix);
        b.fromBufferAttribute(pos, i1).applyMatrix4(matrix);
        c.fromBufferAttribute(pos, i2).applyMatrix4(matrix);
        add(owner, m.side, flip);
      }
    }
  };

  let meshes = 0;
  root.traverseVisible((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    if (o.skip?.(obj)) return;
    const name = objectPath(obj);
    if (obj instanceof SkinnedMesh) return void skipped.push({ name, reason: 'skinned' });
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mats.some(depthOpaque)) return;
    if (mats.some(displaced)) return void skipped.push({ name, reason: 'positionNode' });
    const geometry = mesh.geometry;
    const pos = geometry.getAttribute('position');
    const tris = (geometry.getIndex()?.count ?? pos.count) / 3;
    const inst = obj instanceof InstancedMesh ? obj : null;
    const copies = inst ? inst.count : 1;
    if (tris * copies > maxTriangles)
      return void skipped.push({ name, reason: `${tris * copies} triangles` });
    const owner = owners.push(name) - 1;
    meshes++;
    for (let k = 0; k < copies; k++) {
      world.copy(mesh.matrixWorld);
      if (inst) world.multiply(inst.getMatrixAt(k, instance));
      collect(mesh, geometry, owner, world, world.determinant() < 0);
    }
  });

  const found = new Map<string, CoplanarHit>();
  const cells = new Map<CoplanarHit, Map<string, { at: [number, number, number]; area: number }>>();
  const cosTol = Math.cos((0.5 * Math.PI) / 180);
  for (const list of buckets.values()) {
    list.sort((p, q) => p.minX - q.minX);
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const u = list[j]!;
        if (u.minX > t.maxX + dist) break;
        if (u.maxY < t.minY - dist || u.minY > t.maxY + dist) continue;
        if (u.maxZ < t.minZ - dist || u.minZ > t.maxZ + dist) continue;
        if (t.nx * u.nx + t.ny * u.ny + t.nz * u.nz < cosTol) continue;
        if (!onPlane(u.p, t, dist) || !overlaps(t, u, margin)) continue;
        const key = t.owner <= u.owner ? `${t.owner}|${u.owner}` : `${u.owner}|${t.owner}`;
        const area = Math.min(t.area, u.area);
        const cx = (t.p[0]! + t.p[3]! + t.p[6]!) / 3;
        const cy = (t.p[1]! + t.p[4]! + t.p[7]!) / 3;
        const cz = (t.p[2]! + t.p[5]! + t.p[8]!) / 3;
        let hit = found.get(key);
        if (hit) {
          hit.pairs++;
          hit.area += area;
        } else {
          hit = {
            a: owners[Math.min(t.owner, u.owner)]!,
            b: owners[Math.max(t.owner, u.owner)]!,
            pairs: 1,
            area,
            at: [cx, cy, cz],
            normal: [t.nx, t.ny, t.nz],
            spots: [],
          };
          found.set(key, hit);
          cells.set(hit, new Map());
        }
        const spots = cells.get(hit)!;
        const cell = `${Math.floor(cx / 2)},${Math.floor(cy / 2)},${Math.floor(cz / 2)}`;
        const spot = spots.get(cell);
        if (spot) spot.area += area;
        else
          spots.set(cell, {
            at: [Math.round(cx * 10) / 10, Math.round(cy * 100) / 100, Math.round(cz * 10) / 10],
            area,
          });
      }
    }
  }
  const hits = [...found.values()].sort((p, q) => q.area - p.area);
  for (const h of hits) {
    h.area = Math.round(h.area * 1000) / 1000;
    h.spots = [...cells.get(h)!.values()].sort((p, q) => q.area - p.area).slice(0, 5);
    for (const s of h.spots) s.area = Math.round(s.area * 1000) / 1000;
  }
  return { hits, meshes, triangles, skipped };
}

function onPlane(p: Float64Array, t: Tri, dist: number): boolean {
  for (let k = 0; k < 9; k += 3) {
    if (Math.abs(t.nx * p[k]! + t.ny * p[k + 1]! + t.nz * p[k + 2]! - t.d) > dist) return false;
  }
  return true;
}

const ua = new Vector3();
const va = new Vector3();
const n = new Vector3();
const p2a = new Float64Array(6);
const p2b = new Float64Array(6);

/** Whether two coplanar triangles overlap by more than `margin` (separating-axis test in the plane). */
function overlaps(t: Tri, u: Tri, margin: number): boolean {
  n.set(t.nx, t.ny, t.nz);
  ua.set(t.p[3]! - t.p[0]!, t.p[4]! - t.p[1]!, t.p[5]! - t.p[2]!).normalize();
  va.crossVectors(n, ua);
  for (let k = 0; k < 3; k++) {
    p2a[k * 2] = t.p[k * 3]! * ua.x + t.p[k * 3 + 1]! * ua.y + t.p[k * 3 + 2]! * ua.z;
    p2a[k * 2 + 1] = t.p[k * 3]! * va.x + t.p[k * 3 + 1]! * va.y + t.p[k * 3 + 2]! * va.z;
    p2b[k * 2] = u.p[k * 3]! * ua.x + u.p[k * 3 + 1]! * ua.y + u.p[k * 3 + 2]! * ua.z;
    p2b[k * 2 + 1] = u.p[k * 3]! * va.x + u.p[k * 3 + 1]! * va.y + u.p[k * 3 + 2]! * va.z;
  }
  return !separated(p2a, p2b, margin) && !separated(p2b, p2a, margin);
}

/** True if an edge normal of triangle `s` separates the two (with less than `margin` of overlap). */
function separated(s: Float64Array, o: Float64Array, margin: number): boolean {
  for (let e = 0; e < 3; e++) {
    const x0 = s[e * 2]!;
    const y0 = s[e * 2 + 1]!;
    const x1 = s[((e + 1) % 3) * 2]!;
    const y1 = s[((e + 1) % 3) * 2 + 1]!;
    let ax = y1 - y0;
    let ay = x0 - x1;
    const len = Math.hypot(ax, ay);
    if (len < 1e-9) return true;
    ax /= len;
    ay /= len;
    let sMin = Infinity;
    let sMax = -Infinity;
    let oMin = Infinity;
    let oMax = -Infinity;
    for (let k = 0; k < 3; k++) {
      const ps = s[k * 2]! * ax + s[k * 2 + 1]! * ay;
      const po = o[k * 2]! * ax + o[k * 2 + 1]! * ay;
      sMin = Math.min(sMin, ps);
      sMax = Math.max(sMax, ps);
      oMin = Math.min(oMin, po);
      oMax = Math.max(oMax, po);
    }
    if (Math.min(sMax, oMax) - Math.max(sMin, oMin) < margin) return true;
  }
  return false;
}
