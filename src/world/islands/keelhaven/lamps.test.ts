import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { makeBuckets } from '../../village/pieces';
import { lampHead } from './lamps';

const bounds = (g: BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('lamp heads', () => {
  // Every size the island builds: station posts, lock lamps, the quay head's lamp, door lanterns, lamp posts.
  const SIZES = [
    { w: 0.24, h: 0.3, capR: 0.2, capH: 0.18 },
    { w: 0.26, h: 0.34, capR: 0.24, capH: 0.2 },
    { w: 0.3, h: 0.4, capR: 0.27, capH: 0.22 },
    { w: 0.2, h: 0.28, capR: 0.18, capH: 0.15 },
    { w: 0.22, h: 0.3, capR: 0.2, capH: 0.16 },
  ];

  it('seats the cap on the glass: its bottom within 1 cm of the glass top, the collar over the seam', () => {
    for (const s of SIZES) {
      const b = makeBuckets();
      const head = lampHead(b, b, { x: 3, y: 2.5, z: -4, yaw: 0.7, capColour: 0x222222, ...s });
      const glass = bounds(head.glass);
      const cap = bounds(head.cap);
      const collar = bounds(head.collar);
      const top = glass.max.y;
      expect(top).toBeCloseTo(2.5 + s.h / 2, 5);
      // No sky between them: the cap starts at the glass top (within 1 cm), never under it.
      expect(cap.min.y - top).toBeGreaterThanOrEqual(0);
      expect(cap.min.y - top).toBeLessThanOrEqual(0.01);
      // The collar wraps the glass's top edge and meets the cap's base exactly.
      expect(collar.min.y).toBeLessThan(top);
      expect(collar.max.y).toBeCloseTo(cap.min.y, 5);
      // It covers the glass's top face (wider than the glass), so no two faces share a plane.
      expect(collar.max.x - collar.min.x).toBeGreaterThan(s.w);
    }
  });
});
