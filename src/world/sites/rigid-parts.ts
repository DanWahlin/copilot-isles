import type { BufferAttribute, BufferGeometry, Matrix4 } from 'three/webgpu';
import { merge } from './geo';

/**
 * Parts of one merged geometry that move as rigid bodies (a turning mill tile, a sliding crate). They
 * share their mesh's draw with the static parts; a move rewrites only that part's positions and
 * normals on the CPU, so it costs no new mesh, material, or shader. Use it for parts that move now
 * and then, not every frame.
 */
export class RigidParts {
  private readonly position: BufferAttribute;
  private readonly normal: BufferAttribute | null;
  private dirty = false;

  constructor(
    readonly geometry: BufferGeometry,
    private readonly parts: readonly { start: number; pos: Float32Array; nrm: Float32Array | null }[],
    /** Recompute the bounding sphere on `commit()` (parts that travel; not ones that turn in place). */
    private readonly bounds: boolean,
  ) {
    this.position = geometry.getAttribute('position') as BufferAttribute;
    this.normal = (geometry.getAttribute('normal') as BufferAttribute | undefined) ?? null;
  }

  get count(): number {
    return this.parts.length;
  }

  /**
   * Places part `i` with a matrix from its own frame. Normals use the same matrix and aren't
   * renormalised, so keep scale out, except a zero scale (a hidden part) or one that leaves the
   * normals' direction alone (a flat board scaled in its own plane).
   */
  set(i: number, m: Matrix4): void {
    const part = this.parts[i];
    if (!part) return;
    const e = m.elements;
    const pos = this.position.array as Float32Array;
    const o = part.start * 3;
    const src = part.pos;
    for (let k = 0; k < src.length; k += 3) {
      const x = src[k]!,
        y = src[k + 1]!,
        z = src[k + 2]!;
      pos[o + k] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      pos[o + k + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      pos[o + k + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
    }
    if (this.normal && part.nrm) {
      const nrm = this.normal.array as Float32Array;
      const n = part.nrm;
      for (let k = 0; k < n.length; k += 3) {
        const x = n[k]!,
          y = n[k + 1]!,
          z = n[k + 2]!;
        nrm[o + k] = e[0]! * x + e[4]! * y + e[8]! * z;
        nrm[o + k + 1] = e[1]! * x + e[5]! * y + e[9]! * z;
        nrm[o + k + 2] = e[2]! * x + e[6]! * y + e[10]! * z;
      }
    }
    this.dirty = true;
  }

  /** Uploads the parts moved since the last commit (call once a frame). */
  commit(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.position.needsUpdate = true;
    if (this.normal) this.normal.needsUpdate = true;
    if (this.bounds) this.geometry.computeBoundingSphere();
  }
}

/**
 * Merges `fixed` and `moving` into one geometry (`merge` rules: the parts are disposed). Each moving
 * part keeps a copy of its own-frame positions and normals and starts where it was built; place it
 * with `set()`.
 */
export function mergeWithRigidParts(
  fixed: BufferGeometry[],
  moving: BufferGeometry[],
  o: { bounds?: boolean } = {},
): RigidParts {
  let start = 0;
  for (const g of fixed) start += g.getAttribute('position').count;
  const parts = moving.map((g) => {
    const pos = (g.getAttribute('position').array as Float32Array).slice();
    const n = g.getAttribute('normal') as BufferAttribute | undefined;
    const part = { start, pos, nrm: n ? (n.array as Float32Array).slice() : null };
    start += g.getAttribute('position').count;
    return part;
  });
  const geometry = merge([...fixed, ...moving]);
  geometry.computeBoundingSphere();
  return new RigidParts(geometry, parts, o.bounds ?? false);
}
