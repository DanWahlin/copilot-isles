import { BufferAttribute, Mesh, type BufferGeometry, type Material } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cone, rod, type Buckets } from '../../village/pieces';

/** A lamp head's shape: its glass (a box `w` wide, `h` tall, centred at `y`) and its iron cap. */
export interface LampHeadSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  yaw: number;
  /** The cap's base radius and height. */
  capR: number;
  capH: number;
  capColour: number;
}

/** The collar's depth over the glass's top edge, and its height above it (the cap sits on that). */
const COLLAR_DOWN = 0.015;
const COLLAR_UP = 0.008;

/**
 * A lamp's head: the glass into `glassInto`, and into `b` a thin iron collar round the glass's top
 * edge with the cap seated on it, so no sky shows between the cap and the glass. The cap's bottom is
 * `COLLAR_UP` over the glass's top, the collar hides the glass's top face, and no two faces lie in
 * one plane (no z-fighting).
 */
export function lampHead(
  b: Buckets,
  glassInto: Buckets,
  s: LampHeadSpec,
): { glass: BufferGeometry; collar: BufferGeometry; cap: BufferGeometry } {
  const glass = box(glassInto, 'glow', s.x, s.y, s.z, s.w, s.h, s.w, s.yaw, 0xffffff);
  const top = s.y + s.h / 2;
  const collar = rod(
    b,
    'metal',
    { x: s.x, y: top - COLLAR_DOWN, z: s.z },
    { x: s.x, y: top + COLLAR_UP, z: s.z },
    s.capR,
    6,
    s.capColour,
  );
  const cap = cone(b, 'metal', s.x, top + COLLAR_UP, s.z, s.capR, s.capH, 6, s.capColour);
  return { glass, collar, cap };
}

/**
 * The island's lamps that change (the circuits' station lamps, the lock lamps, Gate 2's four lamps and
 * the Gate Light's lantern): their glass, one mesh in the village kit's glow material (the same shader
 * as every other lantern, no new one), each lamp a run of its vertices whose colour is set in place.
 * The glow material shows a lamp's paint at 0.18 by day, so a lit colour is painted bright.
 */

/** A lamp's glass, built with the village pieces (`box`, `rod`) and kept out of the buckets. */
export interface LampPiece {
  key: string;
  geo: BufferGeometry;
}

/** The looks a lamp can have (paint before the material's day dimming). */
export const LAMP_LOOKS = {
  /** Unlit glass. */
  dark: [0.55, 0.55, 0.6],
  /** Amber: running. */
  running: [5.6, 3.5, 0.7],
  /** Green: ready. */
  ready: [0.9, 4.8, 1.3],
  /** Red: not ready. */
  notReady: [5.4, 1.0, 0.6],
  /** The Gate Light's lantern before the Seal: lit glass, but faint. */
  banked: [1.6, 1.5, 1.3],
  /** White-gold: the Gate Light kindled. */
  kindled: [7.8, 5.9, 2.6],
} as const;
export type LampLook = keyof typeof LAMP_LOOKS;

export class LampSet {
  readonly mesh: Mesh | null;
  private readonly ranges = new Map<string, { start: number; count: number }>();
  private readonly colour: BufferAttribute | null;
  private readonly looks = new Map<string, LampLook>();

  constructor(pieces: readonly LampPiece[], material: Material) {
    const keys: string[] = [];
    const byKey = new Map<string, BufferGeometry[]>();
    for (const p of pieces) {
      const flat = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      if (flat !== p.geo) p.geo.dispose();
      let list = byKey.get(p.key);
      if (!list) {
        list = [];
        byKey.set(p.key, list);
        keys.push(p.key);
      }
      list.push(flat);
    }
    const ordered: BufferGeometry[] = [];
    let start = 0;
    for (const k of keys) {
      let count = 0;
      for (const g of byKey.get(k)!) {
        ordered.push(g);
        count += g.getAttribute('position').count;
      }
      this.ranges.set(k, { start, count });
      start += count;
    }
    const geometry = ordered.length ? mergeGeometries(ordered, false) : null;
    for (const g of ordered) g.dispose();
    if (!geometry) {
      this.mesh = null;
      this.colour = null;
      return;
    }
    geometry.computeBoundingSphere();
    this.colour = geometry.getAttribute('color') as BufferAttribute;
    const mesh = new Mesh(geometry, material);
    mesh.name = 'keelhaven-lamps';
    // As the kit's glow chunks are (pieces.ts `meshesFromBuckets`): no shadows either way.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
  }

  has(key: string): boolean {
    return this.ranges.has(key);
  }

  /** Paints lamp `key` with `look` (a no-op if it has it already). */
  set(key: string, look: LampLook): void {
    const r = this.ranges.get(key);
    if (!r || !this.colour || this.looks.get(key) === look) return;
    this.looks.set(key, look);
    const c = LAMP_LOOKS[look];
    const a = this.colour.array as Float32Array;
    for (let i = r.start; i < r.start + r.count; i++) {
      a[i * 3] = c[0];
      a[i * 3 + 1] = c[1];
      a[i * 3 + 2] = c[2];
    }
    this.colour.needsUpdate = true;
  }

  look(key: string): LampLook | null {
    return this.looks.get(key) ?? null;
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
  }
}
