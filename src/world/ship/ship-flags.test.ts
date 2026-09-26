import { describe, expect, it } from 'vitest';
import { flagYaw } from './ship-flags';

/** Where ship-local +x ends up in world XZ after the flag yaw and the ship's heading. */
function streamDirection(heading: number, yaw: number): [number, number] {
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  return [lx * Math.cos(heading) + lz * Math.sin(heading), -lx * Math.sin(heading) + lz * Math.cos(heading)];
}

describe('flagYaw', () => {
  it('streams the flags toward the downwind direction whatever the heading', () => {
    for (const heading of [0, 0.7, Math.PI / 2, Math.PI, 4.3]) {
      for (const [dx, dz] of [
        [1, 0],
        [0.8, -0.6],
        [-0.3, 0.95],
      ]) {
        const [sx, sz] = streamDirection(heading, flagYaw(heading, dx, dz));
        const len = Math.hypot(dx, dz);
        expect(sx).toBeCloseTo(dx / len, 5);
        expect(sz).toBeCloseTo(dz / len, 5);
      }
    }
  });

  it('leaves the built pose alone when the wind already blows along local +x', () => {
    // Heading 0: local +x is world +x.
    expect(flagYaw(0, 5, 0)).toBeCloseTo(0);
  });
});
