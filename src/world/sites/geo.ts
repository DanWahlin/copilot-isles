import {
  BoxGeometry,
  BufferAttribute,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Small geometry helpers for set pieces (puzzle sites): boxes and cylinders with a vertex colour
 * (the village kit materials multiply by it) and world-scaled planar UVs, collected into buckets
 * and merged into one geometry per material.
 */
export type Rgb = number;

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const v = new Vector3();
const one = new Vector3(1, 1, 1);

export function paint(g: BufferGeometry, hex: Rgb): BufferGeometry {
  const n = g.getAttribute('position').count;
  const r = ((hex >> 16) & 255) / 255,
    gg = ((hex >> 8) & 255) / 255,
    b = (hex & 255) / 255;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

/**
 * Planar UVs from the (already placed) positions, picked per vertex by the dominant normal axis, so
 * textures keep one texel density on every face. `scale` is UV units per metre (the village uses 3.25).
 */
export function worldUv(g: BufferGeometry, scale = 3.25): BufferGeometry {
  const p = g.getAttribute('position') as BufferAttribute;
  const n = g.getAttribute('normal') as BufferAttribute | undefined;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n?.getX(i) ?? 0),
      ny = Math.abs(n?.getY(i) ?? 1),
      nz = Math.abs(n?.getZ(i) ?? 0);
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x * scale;
      uv[i * 2 + 1] = z * scale;
    } else if (nx >= nz) {
      uv[i * 2] = z * scale;
      uv[i * 2 + 1] = y * scale;
    } else {
      uv[i * 2] = x * scale;
      uv[i * 2 + 1] = y * scale;
    }
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

export interface Placement {
  x?: number;
  y?: number;
  z?: number;
  /** Yaw, then pitch (x) and roll (z), radians. */
  ry?: number;
  rx?: number;
  rz?: number;
}

function place(g: BufferGeometry, p: Placement): BufferGeometry {
  e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, 'YXZ');
  q.setFromEuler(e);
  m4.compose(v.set(p.x ?? 0, p.y ?? 0, p.z ?? 0), q, one);
  g.applyMatrix4(m4);
  return g;
}

/** A box whose base sits at `y` (not its centre). */
export function box(
  w: number,
  h: number,
  d: number,
  p: Placement,
  hex: Rgb,
  uvScale = 3.25,
  local = false,
): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  place(g, p);
  if (!local) worldUv(g, uvScale);
  return paint(g, hex);
}

/**
 * Bands of the village kit's wood trim sheet (T_WoodTrim), in glTF v (which runs down the image):
 * light planks on top, dark planks below. The grain runs along u.
 */
export const TRIM = {
  light: [0.02, 0.28],
  dark: [0.34, 0.58],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * A timber (a box whose base sits at `y`) mapped onto one band of the kit's wood trim sheet: the
 * grain runs along its longest side, and the band spans at most `bandMetres` across, so thin posts
 * show one plank's grain instead of the sheet's stripes. `scale` is u per metre along the grain.
 */
export function plank(
  w: number,
  h: number,
  d: number,
  p: Placement,
  hex: Rgb,
  band: readonly [number, number] = TRIM.light,
  scale = 0.5,
  bandMetres = 0.7,
): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const ext = [w, h, d];
  const long = ext.indexOf(Math.max(w, h, d));
  const pos = g.getAttribute('position') as BufferAttribute;
  const nrm = g.getAttribute('normal') as BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  // A stable per-timber offset so neighbouring boards don't repeat the same streak.
  const seed = Math.abs(Math.sin((p.x ?? 0) * 12.9898 + (p.z ?? 0) * 78.233 + (p.y ?? 0) * 37.719 + w * 3.1));
  const bandH = band[1] - band[0];
  for (let i = 0; i < pos.count; i++) {
    const c = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i)), Math.abs(nrm.getZ(i))];
    const face = n[0]! >= n[1]! && n[0]! >= n[2]! ? 0 : n[1]! >= n[2]! ? 1 : 2;
    let along = long;
    if (face === long) {
      const others = [0, 1, 2].filter((a) => a !== long);
      along = ext[others[0]!]! >= ext[others[1]!]! ? others[0]! : others[1]!;
    }
    const across = 3 - along - face;
    const span = Math.min(1, ext[across]! / bandMetres) * bandH;
    const t = c[across]! / ext[across]! + 0.5;
    uv[i * 2] = c[along]! * scale + seed * 7.3;
    uv[i * 2 + 1] = band[0] + ((seed * 13.7) % 1) * (bandH - span) + t * span;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.translate(0, h / 2, 0);
  place(g, p);
  return paint(g, hex);
}

/** A cylinder standing on `y` (axis +y before rotation). */
export function cylinder(
  rTop: number,
  rBottom: number,
  h: number,
  p: Placement,
  hex: Rgb,
  segments = 10,
): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBottom, h, segments);
  g.translate(0, h / 2, 0);
  place(g, p);
  return paint(g, hex);
}

/** Merges and disposes the parts (returns an empty geometry for an empty list). */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  // Some three primitives are non-indexed after transforms; normalise so mergeGeometries accepts them.
  const indexed = parts.some((g) => g.index);
  const list = indexed ? parts.map((g) => (g.index ? g : withIndex(g))) : parts;
  const out = mergeGeometries(list, false) ?? new BoxGeometry(0, 0, 0);
  for (const g of parts) g.dispose();
  return out;
}

function withIndex(g: BufferGeometry): BufferGeometry {
  const n = g.getAttribute('position').count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}
