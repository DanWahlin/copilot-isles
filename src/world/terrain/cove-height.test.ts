import { describe, expect, it } from 'vitest';
import { COVE } from '../layout';
import {
  CoveHeightField,
  coveHeight,
  coveMasks,
  TERRAIN_DEEP_DEPTH,
  villageGroundWeight,
  villageWear,
} from './cove-height';

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
    // The sea stack is a mesh; the height field only holds its plinth, hidden inside the waterline notch.
    expect(coveHeight(COVE.seaStack.x, COVE.seaStack.z)).toBeGreaterThan(0);
    expect(coveHeight(COVE.seaStack.x, COVE.seaStack.z)).toBeLessThan(1.5);
    expect(coveHeight(COVE.seaStack.x + COVE.seaStack.radius * 1.6, COVE.seaStack.z)).toBeLessThan(-6);
    expect(coveHeight(COVE.seabedRadius, 0)).toBeCloseTo(-TERRAIN_DEEP_DEPTH, 0);
    expect(coveHeight(0, 295)).toBeLessThanOrEqual(-45);
  });

  it('wears the village lawns into earth round the square and along the door paths, not the shore', () => {
    const c = COVE.village.center;
    const rim = COVE.village.squareRadius + 0.6;
    for (const a of [0.4, 1.9, 2.6, 4.1]) {
      const x = c.x + Math.cos(a) * rim;
      const z = c.z + Math.sin(a) * rim;
      expect(villageWear(x, z), `curb at ${a}`).toBeGreaterThan(0.5);
    }
    // A desire line from the south street to the sky-blue house door.
    expect(villageWear(-110.6, -34.7)).toBeGreaterThan(0.7);
    expect(coveMasks(-110.6, -34.7).sand).toBeGreaterThan(0.6);
    // Open lawn between them stays grass.
    expect(coveMasks(-100, -40).grass).toBeGreaterThan(0.8);
    // The quay shore and the beach are outside the village ground.
    expect(villageGroundWeight(-115, -76, coveHeight(-115, -76))).toBe(0);
    expect(villageGroundWeight(-160, -40, 1.0)).toBe(0);
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
