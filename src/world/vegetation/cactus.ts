import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return s / 4294967296;
  };
}

function tagged(g: BufferGeometry, rgb: readonly [number, number, number], part: number): BufferGeometry {
  const n = g.getAttribute('position').count;
  const color = new Float32Array(n * 3);
  const tag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    color.set(rgb, i * 3);
    tag[i] = part;
  }
  g.setAttribute('color', new BufferAttribute(color, 3));
  g.setAttribute('_part', new BufferAttribute(tag, 1));
  return g.index ? g.toNonIndexed() : g;
}

/**
 * A prickly pear (Opuntia), built in code: flat oval pads, each growing from the rim of the one
 * below, with a few red fruits on the top edges. Vertex colours, plus `_part` tags the vegetation
 * material reads (1 = leaf for the pads, 2 = fruit). About a metre and a half; the loader scales it.
 */
export function buildPricklyPear(seed = 7): BufferGeometry {
  const rand = seeded(seed);
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, rgb: readonly [number, number, number], part: number): void => {
    parts.push(tagged(g, rgb, part));
  };
  // Each pad: an oval disc standing on its edge. Grow outward and upward from the base pads.
  const pads: { x: number; y: number; z: number; ry: number; tilt: number; size: number; depth: number }[] =
    [];
  for (let i = 0; i < 3; i++)
    pads.push({
      x: (rand() - 0.5) * 0.3,
      y: 0.32,
      z: (rand() - 0.5) * 0.3,
      ry: (i / 3) * Math.PI + rand() * 0.4,
      tilt: (rand() - 0.5) * 0.4,
      size: 0.36 + rand() * 0.06,
      depth: 0,
    });
  for (let k = 0; k < pads.length && pads.length < 11; k++) {
    const p = pads[k]!;
    if (p.depth >= 2) continue;
    const kids = 1 + Math.floor(rand() * 2);
    for (let j = 0; j < kids; j++) {
      const side = j === 0 ? -1 : 1;
      const lean = p.tilt + side * (0.35 + rand() * 0.3);
      const rx = Math.sin(lean) * p.size * 1.25;
      const ry = Math.cos(lean) * p.size * 1.25;
      pads.push({
        x: p.x + Math.cos(p.ry) * rx,
        y: p.y + ry,
        z: p.z - Math.sin(p.ry) * rx,
        ry: p.ry + (rand() - 0.5) * 1.1,
        tilt: lean,
        size: p.size * (0.82 + rand() * 0.1),
        depth: p.depth + 1,
      });
    }
  }
  for (const p of pads) {
    const g = new SphereGeometry(1, 9, 6);
    g.scale(p.size * 0.78, p.size, 0.07 + p.size * 0.08);
    g.rotateZ(-p.tilt);
    g.rotateY(p.ry);
    g.translate(p.x, p.y, p.z);
    const k = 0.85 + rand() * 0.25;
    add(g, [0.46 * k, 0.6 * k, 0.3 * k], 1);
    if (p.depth === 2 && rand() < 0.75) {
      for (let f = 0; f < 2; f++) {
        const fruit = new SphereGeometry(0.06, 5, 4);
        fruit.scale(1, 1.3, 1);
        const a = p.tilt + (f - 0.5) * 0.7;
        fruit.translate(Math.sin(a) * p.size * 0.95, Math.cos(a) * p.size * 0.95, 0);
        fruit.rotateY(p.ry);
        fruit.translate(p.x, p.y, p.z);
        add(fruit, [0.8, 0.22, 0.28], 2);
      }
    }
  }
  // Keep the spheres' own (scaled) normals: smooth pads and foliage, not faceted gems.
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}

/**
 * A clump of Mediterranean brush (maquis: lentisk, rosemary, myrtle), built in code: overlapping
 * low domes of grey-green foliage, darker inside. Leaf-tagged, so it lights and sways like the
 * island's other leaves. About a metre high; the loader scales it.
 */
export function buildMaquisBush(seed = 3): BufferGeometry {
  const rand = seeded(seed);
  const parts: BufferGeometry[] = [];
  const blobs = 9;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rand() * 0.6;
    const d = i === 0 ? 0 : 0.3 + rand() * 0.38;
    const r = i === 0 ? 0.55 : 0.28 + rand() * 0.18;
    const g = new SphereGeometry(1, 6, 4);
    g.scale(r * 1.15, r * (0.75 + rand() * 0.2), r * 1.15);
    g.rotateY(rand() * Math.PI);
    g.translate(Math.cos(a) * d, r * 0.62 + (i === 0 ? 0.12 : 0), Math.sin(a) * d);
    const k = 0.8 + rand() * 0.3;
    const olive = rand();
    parts.push(tagged(g, [(0.36 + olive * 0.1) * k, (0.48 + olive * 0.04) * k, (0.3 - olive * 0.06) * k], 1));
  }
  // Keep the spheres' own (scaled) normals: smooth pads and foliage, not faceted gems.
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}
