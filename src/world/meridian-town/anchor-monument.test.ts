import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry } from 'three/webgpu';
import { MONUMENT_TOP, anchorMonument } from './anchor-monument';

const triangles = (parts: BufferGeometry[]): number =>
  parts.reduce((n, g) => n + (g.index ? g.index.count : g.getAttribute('position').count) / 3, 0);

describe('the plaza fountain anchor monument', () => {
  it('stays within its triangle budget, cheaper on Lite', () => {
    const high = triangles(anchorMonument(0, 0, 0, false));
    const lite = triangles(anchorMonument(0, 0, 0, true));
    expect(high).toBeLessThanOrEqual(1500);
    expect(lite).toBeLessThan(high * 0.7);
  });

  it('stands inside the basin water and below the first-floor eaves', () => {
    const [x, y, z] = [668, 7, -797.2];
    for (const lite of [false, true]) {
      const bounds = new Box3();
      for (const g of anchorMonument(x, y, z, lite)) {
        g.computeBoundingBox();
        bounds.union(g.boundingBox!);
      }
      // The water disc's radius is 2.55 m; the basin's rim starts at 3.1 m.
      for (const [cx, cz] of [
        [bounds.min.x, bounds.min.z],
        [bounds.min.x, bounds.max.z],
        [bounds.max.x, bounds.min.z],
        [bounds.max.x, bounds.max.z],
      ])
        expect(Math.hypot(cx! - x, cz! - z)).toBeLessThan(2.0);
      // Its base step starts under the water (its surface is 0.61 m up).
      expect(bounds.min.y).toBeGreaterThan(y + 0.3);
      expect(bounds.min.y).toBeLessThan(y + 0.61);
      expect(bounds.max.y).toBeCloseTo(y + MONUMENT_TOP, 1);
      expect(bounds.max.y).toBeLessThanOrEqual(y + 4.5);
      expect(bounds.max.y).toBeGreaterThan(y + 3.8);
    }
  });

  it('gives every part the attributes the merged stone bucket needs', () => {
    for (const g of anchorMonument(0, 0, 0, true))
      for (const name of ['position', 'normal', 'uv', 'color']) expect(g.hasAttribute(name), name).toBe(true);
  });
});
