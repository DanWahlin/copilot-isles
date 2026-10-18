import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { setBladeMorph } from '../vegetation/blade-bands';
import type { HeadForm } from './types';

/**
 * The flower plants' shared geometries, in unit space: y runs from the ground (0) to the tallest head
 * (1) and x and z are in head radii, so a plant's instance matrix scales x and z by its head's radius
 * (m) and y by its stem's height (m). Each is a small plant: a few heads (or spikes, caps, fronds) of
 * their own heights over a rosette of leaves. Every form has the grass blades' attributes (`vegPart`,
 * `shade`, `uv`, and a zero `bladeMorph`), so all of them draw with the one grass material, which dishes each head by its
 * species (`cup`, `throat`) and colours it from its instance tint and the species table.
 *
 * `vegPart`: 3 the flowers (a head's petals, a spike's florets, a cap, a frond), 5 stems and leaves.
 * `uv` on a head is (angle / 2π, radius: 0 at the eye … 1 at the rim); on a spike or a frond it's
 * (side, how far along: 0 at its base … 1 at its tip). `shade` is 0 at the ground and 1 up top.
 */
const PETAL = 3;
const LEAF = 5;
/** How far a bloom's face tips (stem units per head radius from its middle). */
const BLOOM_TIP = 0.08;

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  parts: number[];
  shade: number[];
}

type V3 = readonly [number, number, number];

function vertex(b: Builder, p: V3, n: V3, u: number, v: number, part: number, shade: number): void {
  b.positions.push(p[0], p[1], p[2]);
  b.normals.push(n[0], n[1], n[2]);
  b.uvs.push(u, v);
  b.parts.push(part);
  b.shade.push(shade);
}

/** A quad strip's quad (two triangles), its uvs and shades per corner. */
function quad(
  b: Builder,
  corners: readonly [V3, V3, V3, V3],
  uv: readonly [number, number, number, number, number, number, number, number],
  shade: readonly [number, number, number, number],
  n: V3,
  part: number,
): void {
  for (const k of [0, 1, 2, 0, 2, 3]) vertex(b, corners[k]!, n, uv[k * 2]!, uv[k * 2 + 1]!, part, shade[k]!);
}

/** A thin stem from `foot` (on the ground) to `top`, a quad facing across the plant's spokes. */
function stem(b: Builder, foot: V3, top: V3, width: number, crossed = false): void {
  const dx = top[0] - foot[0];
  const dz = top[2] - foot[2];
  const len = Math.hypot(dx, dz);
  // Across the lean (or along x for an upright stem).
  const sx = len > 1e-4 ? -dz / len : 1;
  const sz = len > 1e-4 ? dx / len : 0;
  const sides: [number, number][] = crossed
    ? [
        [sx, sz],
        [-sz, sx],
      ]
    : [[sx, sz]];
  for (const [ax, az] of sides) {
    const w0 = width;
    const w1 = width * 0.6;
    quad(
      b,
      [
        [foot[0] - ax * w0, foot[1], foot[2] - az * w0],
        [foot[0] + ax * w0, foot[1], foot[2] + az * w0],
        [top[0] + ax * w1, top[1], top[2] + az * w1],
        [top[0] - ax * w1, top[1], top[2] - az * w1],
      ],
      [0, 0, 1, 0, 1, 1, 0, 1],
      [0, 0, 0.7, 0.7],
      [az, 0.35, -ax],
      LEAF,
    );
  }
}

/**
 * A rosette of `count` leaves at the plant's foot, reaching `reach` head radii out and rising to
 * `rise` of the plant's height, each a pointed blade of two triangles.
 */
function rosette(b: Builder, count: number, reach: number, rise: number, width: number, turn: number): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + turn;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const base: V3 = [cx * 0.15, 0.01, cz * 0.15];
    const mid = reach * 0.5;
    const left: V3 = [cx * mid - cz * width, rise, cz * mid + cx * width];
    const right: V3 = [cx * mid + cz * width, rise, cz * mid - cx * width];
    const tip: V3 = [cx * reach, rise * 0.55, cz * reach];
    const n: V3 = [cx * 0.25, 0.95, cz * 0.25];
    vertex(b, base, n, 0.5, 0, LEAF, 0.15);
    vertex(b, right, n, 1, 0.5, LEAF, 0.5);
    vertex(b, tip, n, 0.5, 1, LEAF, 0.4);
    vertex(b, base, n, 0.5, 0, LEAF, 0.15);
    vertex(b, tip, n, 0.5, 1, LEAF, 0.4);
    vertex(b, left, n, 0, 0.5, LEAF, 0.5);
  }
}

/** One plant's heads: where each stands (head radii), its height (0-1) and its own radius. */
interface Head {
  x: number;
  z: number;
  y: number;
  r: number;
}

const BLOOMS: readonly Head[] = [
  { x: 0.2, z: 0.1, y: 1, r: 1 },
  { x: 2.3, z: 0.9, y: 0.8, r: 0.84 },
  { x: -1.4, z: -2.0, y: 0.64, r: 0.74 },
];

const SPIKES: readonly Head[] = [
  { x: 0, z: 0, y: 1, r: 1 },
  { x: 1.5, z: 0.5, y: 0.86, r: 0.9 },
  { x: -1.1, z: 1.2, y: 0.8, r: 0.9 },
  { x: -0.7, z: -1.5, y: 0.92, r: 0.95 },
  { x: 1.2, z: -1.3, y: 0.72, r: 0.85 },
];

const CAPS: readonly Head[] = [
  { x: 0, z: 0, y: 1, r: 1 },
  { x: 1.7, z: 0.9, y: 0.72, r: 0.72 },
  { x: -1.2, z: 1.4, y: 0.52, r: 0.56 },
];

/**
 * A round head: five petals (two triangles each: the eye, a shoulder, the tip, the other shoulder)
 * round its centre, or for a cap a fan of eight round its crown.
 */
function head(b: Builder, h: Head, form: 'bloom' | 'cap', turn: number): void {
  const up: V3 = [0, 1, 0];
  const centre: V3 = [h.x, h.y, h.z];
  // A bloom's face tips out from the plant's middle (the middle one toward +x+z), so from any side
  // some heads face you; the tip is in stem units, so it's steepest on tall stems' wide heads.
  const out = Math.hypot(h.x, h.z);
  const dx = out > 0.5 ? h.x / out : 0.6;
  const dz = out > 0.5 ? h.z / out : 0.8;
  const tip = form === 'bloom' ? BLOOM_TIP : 0;
  const at = (a: number, r: number): V3 => {
    const ox = Math.cos(a) * r * h.r;
    const oz = Math.sin(a) * r * h.r;
    return [h.x + ox, h.y + (ox * dx + oz * dz) * tip, h.z + oz];
  };
  if (form === 'cap') {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + turn;
      const a1 = ((i + 1) / n) * Math.PI * 2 + turn;
      vertex(b, centre, up, (i + 0.5) / n, 0, PETAL, 1);
      vertex(b, at(a1, 1), up, (i + 1) / n, 1, PETAL, 1);
      vertex(b, at(a0, 1), up, i / n, 1, PETAL, 1);
    }
    return;
  }
  const petals = 5;
  const half = (Math.PI / petals) * 0.86;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + turn;
    const u = i / petals;
    const left = at(a - half, 0.62);
    const right = at(a + half, 0.62);
    const end = at(a, 1);
    vertex(b, centre, up, u, 0, PETAL, 1);
    vertex(b, right, up, u + 0.05, 0.62, PETAL, 1);
    vertex(b, end, up, u, 1, PETAL, 1);
    vertex(b, centre, up, u, 0, PETAL, 1);
    vertex(b, end, up, u, 1, PETAL, 1);
    vertex(b, left, up, u - 0.05, 0.62, PETAL, 1);
  }
}

/** A spike of florets on the top part of its stem: two crossed diamonds, their tips a little apart. */
function spike(b: Builder, h: Head, turn: number): void {
  const y0 = h.y * 0.55;
  const y1 = h.y;
  stem(b, [h.x * 0.25, 0, h.z * 0.25], [h.x, y0 + 0.02, h.z], 0.12);
  for (let k = 0; k < 2; k++) {
    const a = (k / 2) * Math.PI + turn;
    const sx = Math.cos(a) * h.r;
    const sz = Math.sin(a) * h.r;
    const n: V3 = [-Math.sin(a) * 0.5, 0.7, Math.cos(a) * 0.5];
    const lo: V3 = [h.x, y0, h.z];
    const hi: V3 = [h.x + sx * 0.1, y1, h.z + sz * 0.1];
    const ym = y0 + (y1 - y0) * 0.4;
    const w = 0.7;
    const left: V3 = [h.x - sx * w, ym, h.z - sz * w];
    const right: V3 = [h.x + sx * w, ym, h.z + sz * w];
    vertex(b, lo, n, 0.5, 0, PETAL, 0.7);
    vertex(b, right, n, 1, 0.4, PETAL, 0.85);
    vertex(b, hi, n, 0.5, 1, PETAL, 1);
    vertex(b, lo, n, 0.5, 0, PETAL, 0.7);
    vertex(b, hi, n, 0.5, 1, PETAL, 1);
    vertex(b, left, n, 0, 0.4, PETAL, 0.85);
  }
}

/**
 * Fern fronds arching from the crown to `reach` head radii: each a midrib of `pairs` leaflet pairs,
 * every leaflet one triangle from the midrib out and forward to the next midrib point, longest at
 * the middle of the frond, so its edge reads as leaflets.
 */
function fronds(b: Builder, count: number, reach: number, pairs: number): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (i % 2) * 0.35;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const len = reach * (0.82 + (i % 3) * 0.09);
    const rib = (t: number): V3 => {
      const along = 0.1 + t * len;
      // Rises to the top by about half-way, then arches over toward the ground.
      const y = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.55) * 0.8);
      return [cx * along, y, cz * along];
    };
    const n: V3 = [cx * 0.3, 0.9, cz * 0.3];
    for (let s = 0; s < pairs; s++) {
      const t0 = s / pairs;
      const t1 = (s + 1) / pairs;
      const p0 = rib(t0);
      const p1 = rib(t1);
      // The leaflet's tip: out to the side and a little forward, longest mid-frond.
      const w = Math.sin(Math.PI * Math.min(1, (t0 + 0.5 / pairs) * 0.92 + 0.06)) * 0.55;
      const fwd = rib(Math.min(1, t0 + 0.7 / pairs));
      for (const side of [-1, 1]) {
        const tip: V3 = [fwd[0] - cz * w * side, fwd[1] - w * 0.12, fwd[2] + cx * w * side];
        const shade = 0.55 + t0 * 0.45;
        vertex(b, p0, n, 0.5, t0, PETAL, shade);
        vertex(b, side < 0 ? tip : p1, n, side < 0 ? 0 : 0.5, side < 0 ? t0 : t1, PETAL, shade);
        vertex(b, side < 0 ? p1 : tip, n, side < 0 ? 0.5 : 1, side < 0 ? t1 : t0, PETAL, shade);
      }
    }
  }
}

/**
 * Winds every triangle to face along its shading normal. The material is double-sided and lights a
 * back face with its normal flipped, so a leaflet or petal wound the other way would shade darker
 * than its neighbours (a frond read as a checkerboard).
 */
function faceAlongNormals(b: Builder): void {
  const p = b.positions;
  const swap = (list: number[], size: number, i: number, j: number) => {
    for (let k = 0; k < size; k++) {
      const t = list[i * size + k]!;
      list[i * size + k] = list[j * size + k]!;
      list[j * size + k] = t;
    }
  };
  for (let v = 0; v < p.length / 3; v += 3) {
    const ax = p[v * 3]!,
      ay = p[v * 3 + 1]!,
      az = p[v * 3 + 2]!;
    const ux = p[v * 3 + 3]! - ax,
      uy = p[v * 3 + 4]! - ay,
      uz = p[v * 3 + 5]! - az;
    const wx = p[v * 3 + 6]! - ax,
      wy = p[v * 3 + 7]! - ay,
      wz = p[v * 3 + 8]! - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const n = b.normals;
    if (nx * n[v * 3]! + ny * n[v * 3 + 1]! + nz * n[v * 3 + 2]! >= 0) continue;
    swap(p, 3, v + 1, v + 2);
    swap(n, 3, v + 1, v + 2);
    swap(b.uvs, 2, v + 1, v + 2);
    swap(b.parts, 1, v + 1, v + 2);
    swap(b.shade, 1, v + 1, v + 2);
  }
}

/** One plant's geometry for a form (see the module's note on units and attributes). */
export function createFlowerGeometry(form: HeadForm): BufferGeometry {
  const b: Builder = { positions: [], normals: [], uvs: [], parts: [], shade: [] };
  if (form === 'bloom') {
    rosette(b, 3, 2.6, 0.2, 0.42, 0.4);
    BLOOMS.forEach((h, i) => {
      stem(b, [h.x * 0.3, 0, h.z * 0.3], [h.x, h.y - 0.02, h.z], 0.1);
      head(b, h, 'bloom', i * 1.1);
    });
  } else if (form === 'spike') {
    rosette(b, 2, 1.8, 0.14, 0.3, 1.1);
    SPIKES.forEach((h, i) => spike(b, h, i * 0.7));
  } else if (form === 'cap') {
    CAPS.forEach((h, i) => {
      stem(b, [h.x, 0, h.z], [h.x, h.y - 0.02, h.z], 0.18 * h.r, true);
      head(b, h, 'cap', i * 0.5);
    });
  } else {
    fronds(b, 7, 2.8, 7);
  }
  faceAlongNormals(b);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(b.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(b.normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(b.uvs, 2));
  geometry.setAttribute('vegPart', new Float32BufferAttribute(b.parts, 1));
  geometry.setAttribute('shade', new Float32BufferAttribute(b.shade, 1));
  setBladeMorph(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
