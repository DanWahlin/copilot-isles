import type { CircleObstacle } from './contracts';
import type { VillageBoxCollider } from './village/kit';

export interface ExclusionSource {
  walkable: (x: number, z: number) => number | null;
  colliders: { circles: readonly CircleObstacle[]; boxes: readonly VillageBoxCollider[] };
}

/**
 * Rasterizes the village footprint (walkable quay/pier/plaza plus building and prop colliders)
 * into a 0.5 m bitmap once, so vegetation scatter can query it in O(1) for thousands of instances.
 */
export function villageExclusion(
  v: ExclusionSource,
  cell = 0.5,
  pad = 0.35,
): (x: number, z: number) => boolean {
  const steps = buildVillageExclusion(v, cell, pad);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same bitmap, a band of rows at a time: `breathe` runs between bands. */
export async function villageExclusionAsync(
  v: ExclusionSource,
  breathe: () => Promise<void>,
  cell = 0.5,
  pad = 0.35,
): Promise<(x: number, z: number) => boolean> {
  const steps = buildVillageExclusion(v, cell, pad);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await breathe();
  }
}

function* buildVillageExclusion(
  v: ExclusionSource,
  cell: number,
  pad: number,
): Generator<void, (x: number, z: number) => boolean, void> {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  const grow = (x: number, z: number, r: number) => {
    x0 = Math.min(x0, x - r);
    x1 = Math.max(x1, x + r);
    z0 = Math.min(z0, z - r);
    z1 = Math.max(z1, z + r);
  };
  for (const b of v.colliders.boxes) grow(b.x, b.z, Math.hypot(b.hx, b.hz) + pad);
  for (const c of v.colliders.circles) grow(c.x, c.z, c.r + pad);
  if (!Number.isFinite(x0)) return () => false;
  // Walkable surfaces (quay, pier, steps) extend past the colliders; sample a margin around them.
  x0 -= 30;
  x1 += 30;
  z0 -= 30;
  z1 += 30;
  const w = Math.ceil((x1 - x0) / cell),
    h = Math.ceil((z1 - z0) / cell);
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = z0 + (j + 0.5) * cell;
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * cell;
      if (v.walkable(x, z) !== null) mask[j * w + i] = 1;
    }
    if ((j & 7) === 7) yield;
  }
  const stamp = (cx: number, cz: number, r: number, inside: (x: number, z: number) => boolean) => {
    const i0 = Math.max(0, Math.floor((cx - r - x0) / cell)),
      i1 = Math.min(w - 1, Math.ceil((cx + r - x0) / cell));
    const j0 = Math.max(0, Math.floor((cz - r - z0) / cell)),
      j1 = Math.min(h - 1, Math.ceil((cz + r - z0) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (inside(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)) mask[j * w + i] = 1;
      }
  };
  for (const b of v.colliders.boxes) {
    const c = Math.cos(b.rot),
      s = Math.sin(b.rot);
    stamp(b.x, b.z, Math.hypot(b.hx, b.hz) + pad, (x, z) => {
      const dx = x - b.x,
        dz = z - b.z;
      return Math.abs(dx * c - dz * s) <= b.hx + pad && Math.abs(dx * s + dz * c) <= b.hz + pad;
    });
  }
  for (const k of v.colliders.circles)
    stamp(k.x, k.z, k.r + pad, (x, z) => Math.hypot(x - k.x, z - k.z) <= k.r + pad);

  return (x, z) => {
    const i = Math.floor((x - x0) / cell),
      j = Math.floor((z - z0) / cell);
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    return mask[j * w + i] === 1;
  };
}
