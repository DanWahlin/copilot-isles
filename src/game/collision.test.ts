import { describe, expect, it } from 'vitest';
import type { HeightField } from '../world/contracts';
import { CollisionWorld } from './collision';

const seabed: HeightField = {
  heightAt: () => -3,
  normalAt: (_x, _z, out) => {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 1, grass: 0, rock: 0, cliff: 0 }),
};
/** A pier deck 2 m up over |x| < 10. */
const pier = { heightAt: (x: number) => (Math.abs(x) < 10 ? 2 : null), kind: 'wood' as const };

describe('CollisionWorld.cameraBlockedAt', () => {
  it('stands a box on the walkable surface at its centre (a shed on a pier, not the seabed)', () => {
    const w = new CollisionWorld({
      ground: seabed,
      surfaces: [pier],
      boxes: [{ x: 0, z: 0, hx: 1, hz: 1, rot: 0, height: 2 }],
    });
    expect(w.cameraBlockedAt(0, 3.5, 0, 0.25)).toBe(true);
    expect(w.cameraBlockedAt(0, 4.4, 0, 0.25)).toBe(false);
    expect(w.cameraBlockedAt(0, 3.5, 1.2, 0.25)).toBe(true);
    expect(w.cameraBlockedAt(0, 3.5, 1.4, 0.25)).toBe(false);
  });

  it('lets a building roof rise over its top near the walls', () => {
    const w = new CollisionWorld({
      ground: seabed,
      boxes: [{ x: 0, z: 0, hx: 3, hz: 3, rot: 0, height: 6 }],
    });
    // Top -3 + 6 = 3: just over the top at the wall line it's still the roof, beyond the eaves it isn't.
    expect(w.cameraBlockedAt(0, 3.4, 3, 0.7)).toBe(true);
    expect(w.cameraBlockedAt(0, 3.4, 3.8, 0.7)).toBe(false);
  });

  it('counts small round colliders up to their height, and spans', () => {
    const w = new CollisionWorld({
      ground: seabed,
      circles: [
        { x: 0, z: 0, r: 0.3 },
        { x: 5, z: 0, r: 0.3, y0: 4, y1: 6 },
      ],
    });
    expect(w.cameraBlockedAt(0, -1.5, 0.4, 0.2)).toBe(true);
    expect(w.cameraBlockedAt(0, -0.6, 0, 0.2)).toBe(false);
    expect(w.cameraBlockedAt(5, 5, 0, 0.2)).toBe(true);
    expect(w.cameraBlockedAt(5, 2, 0, 0.2)).toBe(false);
  });

  it('keeps camera-only blockers out of walking and sight lines, and skips them round the pivot', () => {
    const w = new CollisionWorld({ ground: seabed });
    w.addCameraBox({ x: 0, z: 0, hx: 2, hz: 1, rot: 0, y0: -3, y1: 4 });
    w.addCameraCircle({ x: 10, z: 0, r: 1.5, y0: -3, y1: 1 });
    const p = { x: 0, z: 0 };
    expect(w.pushOut(p, 0.3)).toBe(false);
    expect(w.sightBlockedAt(0, 0, 0)).toBe(false);
    expect(w.occludedAt(0, 0, 0)).toBe(false);
    expect(w.boxes()).toHaveLength(0);
    expect(w.cameraBlockedAt(1.5, 2, 0, 0.2)).toBe(true);
    expect(w.cameraBlockedAt(1.5, 4.5, 0, 0.2)).toBe(false);
    expect(w.cameraBlockedAt(10, 0, 1, 0.2)).toBe(true);
    // The pivot outside: blocked. The pivot in the same blocker (walking through it): not.
    expect(w.cameraBlockedAt(1.5, 2, 0, 0.2, 6, 2, 0)).toBe(true);
    expect(w.cameraBlockedAt(1.5, 2, 0, 0.2, -1, 1, 0)).toBe(false);
    expect(w.cameraBlockedAt(10, 0, 1, 0.2, 10, 0.5, 0)).toBe(false);
  });
});
