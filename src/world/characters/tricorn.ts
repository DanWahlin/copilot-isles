import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Atlas swatch centres (uv, flipY off) in the Quaternius character atlas the hat shares. */
export interface HatSwatches {
  felt: readonly [number, number];
  trim: readonly [number, number];
  band: readonly [number, number];
}

/** Anne's atlas: warm near-black felt, antique gold, and oxblood red. */
export const ANNE_HAT_SWATCHES: HatSwatches = {
  felt: [176 / 1024, 368 / 1024],
  trim: [592 / 1024, 240 / 1024],
  band: [176 / 1024, 16 / 1024],
};

/** Fit to the head it sits on, in metres in the Head bone's frame (y up, z toward the face). */
export interface TricornFit {
  /** Height of the crown's base (where the brim folds). */
  base: number;
  /** Crown half-width, and its reach to the front and back of the head. */
  rx: number;
  front: number;
  back: number;
  /** Crown height above the base. */
  crown: number;
  /** How far the brim reaches beyond the crown before it's cocked up. */
  brim: number;
  /** A small forward tilt (radians), so it sits on the brow rather than the crown of the head. */
  tilt: number;
}

/** Measured from Anne's head (anne.glb): hair tops out ~0.5 m above the Head bone. */
export const ANNE_TRICORN_FIT: TricornFit = {
  base: 0.24,
  rx: 0.345,
  front: 0.315,
  back: 0.375,
  crown: 0.4,
  brim: 0.34,
  tilt: 0.12,
};

const SEGMENTS = 48;

/**
 * A cocked tricorn: a felt crown with a red hatband, and a brim turned up on three sides so it forms
 * a triangle with one point to the front, edged with gold. Position, normal, and uv only, so it can
 * share the character's atlas material (and its program).
 */
export function createTricornGeometry(fit: TricornFit, swatch: HatSwatches): BufferGeometry {
  const parts = [crown(fit, swatch), ...brim(fit, swatch)];
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.rotateX(fit.tilt);
  g.computeBoundingSphere();
  return g;
}

/** The crown's radius at angle `a` (0 = front, +x at π/2), scaled by `k`. */
function crownRadius(fit: TricornFit, a: number, k = 1): [number, number] {
  const z = Math.cos(a);
  const rz = z >= 0 ? fit.front : fit.back;
  return [Math.sin(a) * fit.rx * k, z * rz * k];
}

function crown(fit: TricornFit, s: HatSwatches): BufferGeometry {
  // (height above base, radius scale, swatch): the red band sits just above the fold.
  const rings: [number, number, readonly [number, number]][] = [
    [0, 1.0, s.band],
    [0.07, 0.995, s.band],
    [0.07, 0.995, s.felt],
    [0.2, 0.975, s.felt],
    [0.31, 0.92, s.felt],
    [0.37, 0.78, s.felt],
    [0.4, 0.52, s.felt],
    [0.41, 0.2, s.felt],
    [0.412, 0, s.felt],
  ];
  const b = new Builder();
  for (const [h, k, uv] of rings) {
    for (let i = 0; i < SEGMENTS; i++) {
      const [x, z] = crownRadius(fit, (i / SEGMENTS) * Math.PI * 2, k);
      b.vertex(x, fit.base + (h / 0.412) * fit.crown, z, uv);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    if (rings[r]![0] === rings[r + 1]![0]) continue;
    for (let i = 0; i < SEGMENTS; i++) {
      const j = (i + 1) % SEGMENTS;
      const a = r * SEGMENTS + i;
      const c = r * SEGMENTS + j;
      const d = (r + 1) * SEGMENTS + i;
      const e = (r + 1) * SEGMENTS + j;
      b.tri(a, c, d);
      b.tri(c, e, d);
    }
  }
  return b.geometry();
}

/**
 * The brim, as two skins (outside and underside) so it reads from every angle with back-face
 * culling on. Each angle's profile runs flat from the crown to the fold, then out and up along the
 * cock angle: nearly flat at the three points, nearly upright mid-side.
 */
function brim(fit: TricornFit, s: HatSwatches): BufferGeometry[] {
  // Profile stations: 0 = crown, 1 = fold, then out along the brim; the gold edge is a doubled ring.
  const stations: [number, readonly [number, number]][] = [
    [-1, s.felt],
    [0, s.felt],
    [0.35, s.felt],
    [0.7, s.felt],
    [0.88, s.felt],
    [0.88, s.trim],
    [1.0, s.trim],
  ];
  const at = (i: number, t: number): [number, number, number] => {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const [cx, cz] = crownRadius(fit, a);
    const len = Math.hypot(cx, cz);
    const ox = cx / len;
    const oz = cz / len;
    const fold = len + 0.045;
    if (t < 0) return [cx, fit.base, cz];
    // 0 at the three points (front and the two back corners), 1 mid-side.
    const side = Math.pow(Math.abs(Math.sin(1.5 * a)), 0.7);
    const cock = 0.22 + side * 1.08;
    // Slight curl: the cock steepens toward the edge.
    const ang = cock * (0.75 + 0.25 * t);
    const out = fold + fit.brim * t * Math.cos(ang);
    const up = fit.brim * t * Math.sin(ang) + (1 - side) * 0.02 * t;
    return [ox * out, fit.base + up, oz * out];
  };
  const skin = (flip: boolean) => {
    const b = new Builder();
    for (const [t, uv] of stations) for (let i = 0; i < SEGMENTS; i++) b.vertex(...at(i, t), uv);
    for (let r = 0; r < stations.length - 1; r++) {
      if (stations[r]![0] === stations[r + 1]![0]) continue;
      for (let i = 0; i < SEGMENTS; i++) {
        const j = (i + 1) % SEGMENTS;
        const a = r * SEGMENTS + i;
        const c = r * SEGMENTS + j;
        const d = (r + 1) * SEGMENTS + i;
        const e = (r + 1) * SEGMENTS + j;
        if (flip) {
          b.tri(a, d, c);
          b.tri(c, d, e);
        } else {
          b.tri(a, c, d);
          b.tri(c, e, d);
        }
      }
    }
    return b.geometry();
  };
  return [skin(false), skin(true)];
}

class Builder {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];
  vertex(x: number, y: number, z: number, uv: readonly [number, number]): void {
    this.pos.push(x, y, z);
    this.uv.push(uv[0], uv[1]);
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}
