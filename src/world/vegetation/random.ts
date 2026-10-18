import { smoothstep } from '../../util/math';

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  nextU32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  next(): number {
    return this.nextU32() / 0x100000000;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  signed(scale = 1): number {
    return (this.next() * 2 - 1) * scale;
  }

  fork(salt: number): SeededRandom {
    return new SeededRandom((this.state ^ Math.imul(salt, 0x85ebca6b)) >>> 0);
  }
}

export function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(Math.floor(x * 73856093) ^ Math.floor(z * 19349663) ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/** Smooth value noise (0-1) on a `cell`-metre lattice (`hash2` at its corners, eased between). */
export function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smoothstep(0, 1, gx - ix);
  const fz = smoothstep(0, 1, gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
