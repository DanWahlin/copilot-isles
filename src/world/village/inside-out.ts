import type { Mesh, Object3D } from 'three/webgpu';

/** One triangle whose winding disagrees with its vertex normals, at its centroid in world space. */
export interface InsideOutTriangle {
  mesh: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Triangles under `root` (meshes `accept` picks) wound against their normals. A negative box size or
 * a mirroring transform baked into the vertices does this; double-sided town materials then light the face from behind, so it
 * shades unlit. Smoothed meshes (terrain, foam) can trip it on purpose, so pick flat-shaded ones.
 */
export function insideOutTriangles(root: Object3D, accept: (mesh: Mesh) => boolean): InsideOutTriangle[] {
  const out: InsideOutTriangle[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !accept(mesh)) return;
    const p = mesh.geometry.getAttribute('position');
    const n = mesh.geometry.getAttribute('normal');
    if (!p || !n) return;
    const index = mesh.geometry.index;
    const count = index ? index.count : p.count;
    const e = mesh.matrixWorld.elements;
    for (let t = 0; t < count; t += 3) {
      const a = index ? index.getX(t) : t;
      const b = index ? index.getX(t + 1) : t + 1;
      const c = index ? index.getX(t + 2) : t + 2;
      const e1x = p.getX(b) - p.getX(a),
        e1y = p.getY(b) - p.getY(a),
        e1z = p.getZ(b) - p.getZ(a);
      const e2x = p.getX(c) - p.getX(a),
        e2y = p.getY(c) - p.getY(a),
        e2z = p.getZ(c) - p.getZ(a);
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      // Collinear slivers have no area to see, and their winding is rounding noise.
      const longest = Math.max(e1x * e1x + e1y * e1y + e1z * e1z, e2x * e2x + e2y * e2y + e2z * e2z);
      if (Math.hypot(cx, cy, cz) <= 1e-6 * Math.max(longest, 1e-3)) continue;
      const nx = n.getX(a) + n.getX(b) + n.getX(c);
      const ny = n.getY(a) + n.getY(b) + n.getY(c);
      const nz = n.getZ(a) + n.getZ(b) + n.getZ(c);
      if (cx * nx + cy * ny + cz * nz >= 0) continue;
      const lx = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
      const ly = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
      const lz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      out.push({
        mesh: mesh.name,
        x: e[0]! * lx + e[4]! * ly + e[8]! * lz + e[12]!,
        y: e[1]! * lx + e[5]! * ly + e[9]! * lz + e[13]!,
        z: e[2]! * lx + e[6]! * ly + e[10]! * lz + e[14]!,
      });
    }
  });
  return out;
}

/** `insideOutTriangles` as "mesh: count" lines, for a readable test failure. */
export function insideOutSummary(root: Object3D, accept: (mesh: Mesh) => boolean): string[] {
  const counts = new Map<string, number>();
  for (const t of insideOutTriangles(root, accept)) counts.set(t.mesh, (counts.get(t.mesh) ?? 0) + 1);
  return [...counts].map(([name, n]) => `${name}: ${n}`);
}
