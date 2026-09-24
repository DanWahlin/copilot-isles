import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three/webgpu';

export interface PolarGridOptions {
  /** Radial spacing of the first ring (m). */
  dr0: number;
  /** Geometric growth of the radial spacing per ring. */
  growth: number;
  /** Outer radius (m). */
  radius: number;
  /** Angular segments. */
  segments: number;
}

/**
 * Camera-centred polar grid for the ocean (PLAN §6): dense under the camera, geometrically coarser
 * outward, reaching the horizon in one draw. `aSpan` carries each vertex's local spacing so the
 * shader can filter detail it can't resolve.
 */
export function createPolarGrid(o: PolarGridOptions): BufferGeometry {
  const radii: number[] = [0];
  let dr = o.dr0;
  while (radii[radii.length - 1] < o.radius) {
    radii.push(Math.min(o.radius, radii[radii.length - 1] + dr));
    dr *= o.growth;
  }
  const rings = radii.length;
  const S = o.segments;
  // Ring 0 is a single centre vertex.
  const vCount = 1 + (rings - 1) * S;
  const pos = new Float32Array(vCount * 3);
  const span = new Float32Array(vCount);
  span[0] = o.dr0;
  let v = 1;
  for (let r = 1; r < rings; r++) {
    const R = radii[r];
    const sp = Math.max(radii[r] - radii[r - 1], (2 * Math.PI * R) / S);
    for (let a = 0; a < S; a++) {
      const t = (a / S) * Math.PI * 2;
      pos[v * 3] = Math.cos(t) * R;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = Math.sin(t) * R;
      span[v] = sp;
      v++;
    }
  }
  const tris = S + (rings - 2) * S * 2;
  const idx = vCount > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let i = 0;
  // Centre fan (wound so the surface faces +y).
  for (let a = 0; a < S; a++) {
    idx[i++] = 0;
    idx[i++] = 1 + ((a + 1) % S);
    idx[i++] = 1 + a;
  }
  for (let r = 1; r < rings - 1; r++) {
    const b0 = 1 + (r - 1) * S,
      b1 = 1 + r * S;
    for (let a = 0; a < S; a++) {
      const a1 = (a + 1) % S;
      idx[i++] = b0 + a;
      idx[i++] = b0 + a1;
      idx[i++] = b1 + a;
      idx[i++] = b0 + a1;
      idx[i++] = b1 + a1;
      idx[i++] = b1 + a;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aSpan', new BufferAttribute(span, 1));
  g.setIndex(new BufferAttribute(idx, 1));
  g.boundingSphere = new Sphere(new Vector3(), o.radius);
  return g;
}
