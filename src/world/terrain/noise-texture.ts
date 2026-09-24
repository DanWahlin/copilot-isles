import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  type Texture,
} from 'three/webgpu';

const SIZE = 256;
const CHANNELS = 4;

let cached: Texture | null = null;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash(ix: number, iy: number, seed: number): number {
  let h = seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

function valueNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const ix0 = ((x0 % period) + period) % period;
  const iy0 = ((y0 % period) + period) % period;
  const ix1 = (ix0 + 1) % period;
  const iy1 = (iy0 + 1) % period;
  const a = hash(ix0, iy0, seed);
  const b = hash(ix1, iy0, seed);
  const c = hash(ix0, iy1, seed);
  const d = hash(ix1, iy1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function fbm(x: number, y: number, seed: number, basePeriod: number): number {
  let sum = 0;
  let amp = 0.55;
  let norm = 0;
  for (let octave = 0; octave < 5; octave += 1) {
    const period = basePeriod << octave;
    const freq = period;
    sum += valueNoise(x * freq, y * freq, period, seed + octave * 4099) * amp;
    norm += amp;
    amp *= 0.52;
  }
  return sum / norm;
}

export function terrainNoiseTexture(): Texture {
  if (cached) return cached;
  const data = new Uint8Array(SIZE * SIZE * CHANNELS);
  const seeds = [0x51e1, 0x71a3, 0xa11c, 0xd09e];
  const periods = [4, 5, 7, 9];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const u = x / SIZE;
      const v = y / SIZE;
      const o = (y * SIZE + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c += 1) {
        const n = fbm(u, v, seeds[c], periods[c]);
        data[o + c] = Math.max(0, Math.min(255, Math.round(n * 255)));
      }
    }
  }
  cached = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  cached.name = 'terrain-tileable-fbm-noise';
  cached.wrapS = RepeatWrapping;
  cached.wrapT = RepeatWrapping;
  cached.magFilter = LinearFilter;
  cached.minFilter = LinearMipmapLinearFilter;
  cached.generateMipmaps = true;
  cached.colorSpace = NoColorSpace;
  cached.needsUpdate = true;
  return cached;
}
