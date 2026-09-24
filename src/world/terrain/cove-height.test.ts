import { describe, expect, it } from 'vitest';
import { COVE } from '../layout';
import { CoveHeightField, coveHeight, coveMasks } from './cove-height';

describe('coveHeight', () => {
  it('places the harbor basin, quay, village, lagoon, reef, cliffs, and seabed at expected elevations', () => {
    expect(coveHeight(COVE.harbor.center.x, COVE.harbor.center.z)).toBeCloseTo(-COVE.harbor.depth, 0);
    expect(coveHeight(-110, -64)).toBeCloseTo(COVE.quay.height, 1);
    expect(coveHeight(COVE.village.center.x, COVE.village.center.z)).toBeCloseTo(COVE.village.height, 1);
    expect(coveHeight(COVE.lagoon.center.x, COVE.lagoon.center.z)).toBeCloseTo(-COVE.lagoon.depth, 0);
    expect(coveHeight(COVE.reef.center.x, COVE.reef.center.z + COVE.reef.radius)).toBeCloseTo(
      COVE.reef.crest,
      0,
    );
    expect(coveHeight(176, 0)).toBeGreaterThanOrEqual(30);
    expect(coveHeight(COVE.seaStack.x, COVE.seaStack.z)).toBeGreaterThanOrEqual(29);
    expect(coveHeight(COVE.seabedRadius, 0)).toBeCloseTo(-COVE.deepDepth, 0);
  });

  it('returns unit normals from the height field', () => {
    const field = new CoveHeightField();
    const out = new Float32Array(3);
    field.normalAt(20, 20, out);
    expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(1, 5);
  });

  it('returns normalized placement masks', () => {
    for (const [x, z] of [
      [0, 104],
      [-115, -45],
      [176, 0],
      [COVE.lagoon.center.x, COVE.lagoon.center.z],
    ]) {
      const masks = coveMasks(x, z);
      const sum = masks.sand + masks.grass + masks.rock + masks.cliff;
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
      expect(Math.min(masks.sand, masks.grass, masks.rock, masks.cliff)).toBeGreaterThanOrEqual(0);
    }
  });
});
