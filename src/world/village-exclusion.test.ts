import { describe, expect, it } from 'vitest';
import { Interactions } from '../game/interaction';
import { villageExclusion } from './village-exclusion';

describe('villageExclusion', () => {
  const ex = villageExclusion({
    walkable: (x, z) => (x >= 0 && x <= 10 && z >= 0 && z <= 4 ? 2.4 : null),
    colliders: {
      circles: [{ x: 20, z: 20, r: 1 }],
      boxes: [{ x: 30, z: 0, hx: 2, hz: 1, rot: Math.PI / 2 }],
    },
  });

  it('excludes walkable surfaces', () => {
    expect(ex(5, 2)).toBe(true);
    expect(ex(5, 6)).toBe(false);
  });

  it('excludes circles and rotated boxes with padding', () => {
    expect(ex(20.9, 20)).toBe(true);
    expect(ex(22, 20)).toBe(false);
    // rot π/2 swaps the box's extents: hx runs along world z.
    expect(ex(30, 1.8)).toBe(true);
    expect(ex(31.8, 0)).toBe(false);
  });

  it('is false far outside the raster', () => {
    expect(ex(500, 500)).toBe(false);
  });
});

describe('Interactions', () => {
  it('prefers the closer item in front of the player', () => {
    const it = new Interactions();
    const hits: string[] = [];
    it.add({
      id: 'ahead',
      label: () => 'A',
      x: 0,
      y: 0,
      z: 2,
      radius: 3,
      onInteract: () => hits.push('ahead'),
    });
    it.add({
      id: 'behind',
      label: () => 'B',
      x: 0,
      y: 0,
      z: -1.6,
      radius: 3,
      onInteract: () => hits.push('behind'),
    });
    expect(it.update(0, 0, 0, 0)?.id).toBe('ahead');
    it.fire();
    expect(hits).toEqual(['ahead']);
  });

  it('skips disabled and out-of-range items', () => {
    const it = new Interactions();
    it.add({
      id: 'off',
      label: () => '',
      x: 0,
      y: 0,
      z: 1,
      radius: 3,
      enabled: () => false,
      onInteract() {},
    });
    it.add({ id: 'far', label: () => '', x: 0, y: 0, z: 9, radius: 3, onInteract() {} });
    expect(it.update(0, 0, 0, 0)).toBeNull();
    expect(it.fire()).toBe(false);
  });
});
