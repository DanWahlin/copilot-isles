import {
  DataTexture,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
  type Node,
} from 'three/webgpu';
import { texture } from 'three/tsl';
import { mulberry32 } from '../util/math';

/**
 * The opening's shared noise: one small tiling value-noise texture, read with a texture fetch (much
 * cheaper per pixel than evaluating 3D Perlin noise in the shader, which the cabin did on most of
 * the screen).
 */
/** A small tiling value-noise texture (one red channel), shared: cheaper than 3D Perlin per pixel. */
let noiseTex: DataTexture | null = null;
export function noiseTexture(): DataTexture {
  if (noiseTex) return noiseTex;
  const N = 128;
  const lattice = new Float32Array(32 * 32);
  const rand = mulberry32(0x9015e);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const at = (x: number, y: number) => lattice[(y & 31) * 32 + (x & 31)]!;
  const data = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // Two octaves of smooth value noise on a 32-cell lattice (tiles seamlessly).
      let v = 0;
      let amp = 0.65;
      for (const cells of [8, 32]) {
        const fx = (x / N) * cells;
        const fy = (y / N) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = (fx - ix) ** 2 * (3 - 2 * (fx - ix));
        const ty = (fy - iy) ** 2 * (3 - 2 * (fy - iy));
        const s = 32 / cells;
        const a = at(ix * s, iy * s);
        const b = at((ix + 1) * s, iy * s);
        const c = at(ix * s, (iy + 1) * s);
        const d = at((ix + 1) * s, (iy + 1) * s);
        v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        amp = 0.35;
      }
      data[y * N + x] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
  noiseTex = new DataTexture(data, N, N, RedFormat, UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping;
  noiseTex.magFilter = noiseTex.minFilter = LinearFilter;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

/** The shared noise (0-1) at a 2D coordinate (repeats every unit). */
export function noiseAt(p: Node<'vec2'>): Node<'float'> {
  return texture(noiseTexture(), p).r;
}
