import { describe, expect, it } from 'vitest';
import { FlyoverPath, glide, type FlyKey } from './flyover';

const key = (x: number, y: number, z: number, pace?: number): FlyKey => ({
  x,
  y,
  z,
  tx: x,
  ty: 0,
  tz: z + 10,
  pace,
});

describe('glide', () => {
  it('starts and ends still and never runs backwards', () => {
    expect(glide(0)).toBe(0);
    expect(glide(1)).toBeCloseTo(1, 12);
    expect(glide(-1)).toBe(0);
    expect(glide(2)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 200; i++) {
      const g = glide(i / 200);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
    // Gentle at both ends: the first and last hundredth barely move.
    expect(glide(0.01)).toBeLessThan(0.002);
    expect(1 - glide(0.99)).toBeLessThan(0.001);
  });
});

describe('FlyoverPath', () => {
  const shot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };

  it('runs from the first key to the last and reports when it lands', () => {
    const path = new FlyoverPath([key(0, 10, 0), key(0, 20, 100), key(50, 5, 150)], 10);
    expect(path.sample(0, shot)).toBe(false);
    expect(shot.x).toBeCloseTo(0, 6);
    expect(shot.y).toBeCloseTo(10, 6);
    expect(shot.tz).toBeCloseTo(10, 6);
    expect(path.sample(9.9, shot)).toBe(false);
    expect(path.sample(10, shot)).toBe(true);
    expect(shot.x).toBeCloseTo(50, 5);
    expect(shot.y).toBeCloseTo(5, 5);
    expect(shot.z).toBeCloseTo(150, 5);
  });

  it('moves at an even speed along a straight line at an even pace', () => {
    const path = new FlyoverPath([key(0, 0, 0), key(0, 0, 50), key(0, 0, 100)], 10);
    expect(path.length).toBeCloseTo(100, 1);
    for (const x of [0.3, 0.5, 0.6]) {
      path.sample(x * 10, shot);
      expect(shot.z / 100).toBeCloseTo(glide(x), 2);
    }
  });

  it('spends longer where the pace is slow', () => {
    const even = new FlyoverPath([key(0, 0, 0), key(0, 0, 50), key(0, 0, 100)], 10);
    const slowEnd = new FlyoverPath([key(0, 0, 0), key(0, 0, 50), key(0, 0, 100, 0.3)], 10);
    even.sample(5, shot);
    const evenZ = shot.z;
    slowEnd.sample(5, shot);
    // Hurrying through the first half leaves more time for the slow finish.
    expect(shot.z).toBeGreaterThan(evenZ + 5);
  });
});
