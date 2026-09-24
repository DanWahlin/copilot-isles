import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { attribute, float, positionWorld, sin } from 'three/tsl';
import { world } from '../uniforms';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * The one additive "look here" material shared by hint glints and message bottles. Brightness lives in the
 * vertex colours (additive blending turns black into nothing), so shafts and stars fade out with no alpha.
 * It reads by day and night, unlike the kit's glow and halo, which only light up after dusk.
 */
export function createSparkleMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    vertexColors: true,
    fog: false,
  });
  m.forceSinglePass = true;
  const p = positionWorld as AnyNode;
  const pulse = sin((world.time as AnyNode).mul(3.1).add(p.x.mul(0.9)).add(p.z.mul(0.7)))
    .mul(0.28)
    .add(0.72);
  m.colorNode = (attribute('color', 'vec3') as AnyNode).mul(pulse).mul(float(1).sub(world.night.mul(0.35)));
  return m;
}

export interface SparkleOptions {
  /** Warm white by default. */
  rgb?: readonly [number, number, number];
  /** 0-1 overall brightness. */
  strength?: number;
}

/**
 * A soft vertical light shaft: `sides` crossed quads, brightest at the base and fading to black at the top
 * and the edges. Base at the origin.
 */
export function shaftGeometry(height: number, radius: number, o: SparkleOptions = {}): BufferGeometry {
  const [r, g, b] = o.rgb ?? [1, 0.93, 0.74];
  const k = o.strength ?? 0.55;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const planes = 3;
  const cols = 4;
  const rows = 4;
  for (let pI = 0; pI < planes; pI += 1) {
    const a = (pI / planes) * Math.PI;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const base = pos.length / 3;
    for (let j = 0; j <= rows; j += 1) {
      const v = j / rows;
      const w = radius * (1 - v * 0.35);
      for (let i = 0; i <= cols; i += 1) {
        const u = i / cols;
        const s = u * 2 - 1;
        pos.push(dx * s * w, v * height, dz * s * w);
        const edge = Math.max(0, 1 - s * s);
        const f = edge * (1 - v) * (1 - v) * k;
        col.push(r * f, g * f, b * f);
      }
    }
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const a0 = base + j * (cols + 1) + i;
        const a1 = a0 + 1;
        const b0 = a0 + cols + 1;
        const b1 = b0 + 1;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
  }
  return build(pos, col, idx);
}

/** A four-point star in two crossed planes, bright at the centre, for the glint itself. Centred on the origin. */
export function starGeometry(size: number, o: SparkleOptions = {}): BufferGeometry {
  const [r, g, b] = o.rgb ?? [1, 0.97, 0.86];
  const k = o.strength ?? 0.9;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const spikes = 8;
  for (const axis of [0, 1] as const) {
    const base = pos.length / 3;
    pos.push(0, 0, 0);
    col.push(r * k, g * k, b * k);
    for (let i = 0; i < spikes; i += 1) {
      const a = (i / spikes) * Math.PI * 2;
      const long = i % 2 === 0 ? 1 : 0.22;
      const x = Math.cos(a) * size * long;
      const y = Math.sin(a) * size * long;
      if (axis === 0) pos.push(x, y, 0);
      else pos.push(0, y, x);
      col.push(0, 0, 0);
    }
    for (let i = 0; i < spikes; i += 1) idx.push(base, base + 1 + i, base + 1 + ((i + 1) % spikes));
  }
  return build(pos, col, idx);
}

function build(pos: number[], col: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  return g;
}
