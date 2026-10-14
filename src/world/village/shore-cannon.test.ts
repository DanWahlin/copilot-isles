import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { cannonParts, earClip, extrudeX, lathe } from './shore-cannon';

/** Each triangle's geometric normal must agree with its stored normals (outward-facing winding). */
function windingAgrees(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const idx = g.index;
  const count = idx ? idx.count : p.count;
  let bad = 0;
  for (let t = 0; t < count; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k)) as [number, number, number];
    const e1 = [p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a)];
    const e2 = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)];
    const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
    const cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
    const cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    if (Math.hypot(cx, cy, cz) < 1e-10) continue;
    const nx = n.getX(a) + n.getX(b) + n.getX(c);
    const ny = n.getY(a) + n.getY(b) + n.getY(c);
    const nz = n.getZ(a) + n.getZ(b) + n.getZ(c);
    if (cx * nx + cy * ny + cz * nz <= 0) bad++;
  }
  return bad;
}

describe('shore cannon hand-built geometry', () => {
  it('ear-clips a notched polygon into triangles that cover its area', () => {
    const poly: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 3],
      [3, 3],
      [2.5, 2],
      [2, 3],
      [0, 3],
    ];
    const tris = earClip(poly);
    expect(tris.length).toBe((poly.length - 2) * 3);
    let area = 0;
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [poly[tris[t]!]!, poly[tris[t + 1]!]!, poly[tris[t + 2]!]!];
      const s = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      expect(s).toBeGreaterThan(0);
      area += s;
    }
    expect(area).toBeCloseTo(12 - 0.5, 6);
  });

  it('extrudes and turns with outward winding', () => {
    const outline: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0.5, 0.6],
      [0, 1],
    ];
    expect(windingAgrees(extrudeX(outline, 0, 0.1))).toBe(0);
    expect(windingAgrees(extrudeX([...outline].reverse(), -0.1, 0))).toBe(0);
    expect(
      windingAgrees(
        lathe(
          [
            [0, 0],
            [0.3, 0.1],
            [0.25, 1],
            [0, 1.1],
          ],
          12,
        ),
      ),
    ).toBe(0);
  });

  it('builds every detail level with outward-facing barrels and cheeks', () => {
    for (const detail of ['full', 'mid', 'lite'] as const) {
      const parts = cannonParts(detail);
      expect(parts.metal.length).toBeGreaterThan(0);
      expect(parts.wood.length).toBeGreaterThan(0);
      // The barrel (first metal piece) and both cheeks (first wood pieces) are the hand-built ones.
      expect(windingAgrees(parts.metal[0]!)).toBe(0);
      expect(windingAgrees(parts.wood[0]!)).toBe(0);
      expect(windingAgrees(parts.wood[1]!)).toBe(0);
    }
  });
});
