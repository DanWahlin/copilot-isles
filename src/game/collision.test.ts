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

  it('keeps a thin pad when the pivot is only in a blocker pad (beside a wall)', () => {
    const w = new CollisionWorld({ ground: seabed });
    w.addCameraBox({ x: 0, z: 0, hx: 2, hz: 0.5, rot: 0, y0: -3, y1: 4 });
    // The pivot 0.5 m off the face, in the 0.7 m pad: the eye may come near the face, not onto it.
    expect(w.cameraBlockedAt(0, 2, 1.0, 0.7, 0, 2, 1.0)).toBe(false);
    expect(w.cameraBlockedAt(0, 2, 0.6, 0.7, 0, 2, 1.0)).toBe(true);
  });

  it('checks moving camera blockers (a pushed crate) where they are now', () => {
    const w = new CollisionWorld({ ground: seabed });
    const crate = { x: 0, z: 0, r: 0.7, height: 1.3 };
    w.addCameraDynamic(crate);
    expect(w.cameraBlockedAt(0, -2, 0.5, 0.2)).toBe(true);
    expect(w.cameraBlockedAt(0, -1, 0.5, 0.2)).toBe(false);
    crate.z = 20;
    expect(w.cameraBlockedAt(0, -2, 0.5, 0.2)).toBe(false);
    expect(w.cameraBlockedAt(0, -2, 20.5, 0.2)).toBe(true);
  });
});

describe('CollisionWorld.remove', () => {
  it("takes an unloaded island's colliders and camera blockers out, and leaves the rest", () => {
    const keepBox = { x: 0, z: 0, hx: 1, hz: 1, rot: 0, height: 2 };
    const box = { x: 40, z: 0, hx: 1, hz: 1, rot: 0, height: 2 };
    const circle = { x: 80, z: 0, r: 1 };
    const cameraBox = { x: 120, z: 0, hx: 1, hz: 1, rot: 0, height: 4 };
    const crate = { x: 160, z: 0, r: 0.6 };
    const w = new CollisionWorld({ ground: seabed, boxes: [keepBox, box], circles: [circle] });
    w.addCameraBox(cameraBox);
    w.addDynamic(crate);
    const pushed = (x: number) => {
      const p = { x, z: 0 };
      w.pushOut(p, 0.3);
      return p.x !== x;
    };
    expect(pushed(40.5)).toBe(true);
    expect(pushed(80.5)).toBe(true);
    expect(pushed(160.2)).toBe(true);
    expect(w.cameraBlockedAt(120, 1, 0, 0.25)).toBe(true);
    w.remove([box, circle, cameraBox, crate]);
    expect(pushed(40.5)).toBe(false);
    expect(pushed(80.5)).toBe(false);
    expect(pushed(160.2)).toBe(false);
    expect(w.cameraBlockedAt(120, 1, 0, 0.25)).toBe(false);
    expect(pushed(0.5)).toBe(true);
  });
});

describe('CollisionWorld.groundUnder', () => {
  it('reads the lower of the ground without and at the camera height, as two groundAt calls did', () => {
    const hills: HeightField = { ...seabed, heightAt: (x, z) => Math.sin(x * 0.3) * 2 + Math.cos(z * 0.2) };
    // A stair stacked over a deck: the level at y, or the lowest without it.
    const stacked = {
      heightAt: (x: number, z: number, y?: number) =>
        Math.abs(x) > 6 || Math.abs(z) > 6 ? null : y !== undefined && y > 5 ? 6 : 3,
      kind: 'stone' as const,
    };
    const w = new CollisionWorld({
      ground: hills,
      surfaces: [pier, stacked],
      inland: (x, _z, g, out) => {
        if (x < 12 || x > 20) return false;
        out.level = g + 0.5;
        out.floor = g - 0.3;
        return true;
      },
    });
    for (let x = -30; x <= 30; x += 0.7)
      for (let z = -10; z <= 10; z += 1.3)
        for (const y of [-2, 1, 4, 7, 12])
          expect(w.groundUnder(x, z, y)).toBe(Math.min(w.groundAt(x, z), w.groundAt(x, z, y)));
  });
});
