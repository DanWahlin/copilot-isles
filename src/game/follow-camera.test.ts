import { PerspectiveCamera } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { HeightField } from '../world/contracts';
import { CollisionWorld } from './collision';
import { FollowCamera } from './follow-camera';

const still = { lookX: 0, lookY: 0, zoom: 0 };
const target = { x: 0, y: 0, z: 0 };

function run(cam: FollowCamera, three: PerspectiveCamera, seconds: number, look = still): void {
  for (let t = 0; t < seconds; t += 1 / 60) cam.update(1 / 60, three, look, target, 0, false, null, t);
}

describe('FollowCamera.frame', () => {
  it('eases into a held shot, ignores look input, and hands back to the follow camera', () => {
    const cam = new FollowCamera();
    const three = new PerspectiveCamera();
    run(cam, three, 1);
    const follow = three.position.clone();

    cam.frame({ x: 20, y: 6, z: -10, tx: 0, ty: 1, tz: 0 });
    run(cam, three, 0.3);
    expect(cam.framing).toBe(true);
    expect(three.position.distanceTo(follow)).toBeGreaterThan(0.1);
    expect(three.position.x).toBeLessThan(20);

    run(cam, three, 2, { lookX: 0.2, lookY: 0.1, zoom: 1 });
    expect(three.position.x).toBeCloseTo(20, 5);
    expect(three.position.y).toBeCloseTo(6, 5);
    expect(three.position.z).toBeCloseTo(-10, 5);
    expect(cam.yaw).toBe(0);

    cam.frame(null);
    run(cam, three, 2);
    expect(cam.framing).toBe(false);
    expect(three.position.distanceTo(follow)).toBeLessThan(0.01);
  });
});

describe('FollowCamera shot changes', () => {
  it('eases from one held shot to the next instead of jumping', () => {
    const cam = new FollowCamera();
    const three = new PerspectiveCamera();
    run(cam, three, 0.5);
    cam.cut({ x: 30, y: 10, z: 0, tx: 0, ty: 0, tz: 0 });
    run(cam, three, 1 / 60);
    expect(three.position.x).toBeCloseTo(30, 5);

    cam.frame({ x: -30, y: 10, z: 0, tx: 0, ty: 0, tz: 0 });
    run(cam, three, 1 / 60);
    expect(three.position.x).toBeGreaterThan(29);
    run(cam, three, 0.5);
    expect(three.position.x).toBeLessThan(29);
    expect(three.position.x).toBeGreaterThan(-29);
    run(cam, three, 1);
    expect(three.position.x).toBeCloseTo(-30, 5);
  });

  it('follows a shot mutated in place exactly (a flyover)', () => {
    const cam = new FollowCamera();
    const three = new PerspectiveCamera();
    const shot = { x: 0, y: 20, z: 40, tx: 0, ty: 0, tz: 0 };
    cam.cut(shot);
    for (let i = 0; i < 30; i++) {
      shot.x = i;
      cam.frame(shot);
      run(cam, three, 1 / 60);
      expect(three.position.x).toBeCloseTo(i, 5);
    }
  });

  it('knows where it comes to rest behind a heading', () => {
    const cam = new FollowCamera();
    const three = new PerspectiveCamera();
    run(cam, three, 3);
    const rest = cam.restPose(target, 0, { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 });
    expect(three.position.x).toBeCloseTo(rest.x, 3);
    expect(three.position.y).toBeCloseTo(rest.y, 3);
    expect(three.position.z).toBeCloseTo(rest.z, 3);
  });
});

describe('FollowCamera clearance', () => {
  const flat: HeightField = {
    heightAt: () => 0,
    normalAt: (_x, _z, out) => {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
      return out;
    },
    masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
  };
  const lowSea = { heightAt: () => -5, velocityAt: (_x: number, _z: number, _t: number, o: number[]) => o };
  const world = (extra: Partial<ConstructorParameters<typeof CollisionWorld>[0]>) =>
    new CollisionWorld({ ground: flat, waves: lowSea, ...extra });
  const settle = (w: CollisionWorld) => {
    const cam = new FollowCamera();
    const three = new PerspectiveCamera();
    for (let t = 0; t < 3; t += 1 / 60) cam.update(1 / 60, three, still, target, 0, false, w, t);
    return three.position;
  };

  it('sits behind you with nothing in the way', () => {
    const p = settle(world({}));
    expect(p.z).toBeCloseTo(-6.2 * Math.cos(0.32), 1);
  });

  it('keeps out of a wall behind you, with room for the near plane', () => {
    const p = settle(world({ boxes: [{ x: 0, z: -3, hx: 5, hz: 0.3, rot: 0, height: 9 }] }));
    expect(p.z).toBeGreaterThan(-2.7 + 0.15);
    expect(p.z).toBeLessThan(0);
  });

  it('keeps out of a wall right behind you (it comes in close, not through)', () => {
    const p = settle(world({ boxes: [{ x: 0, z: -0.8, hx: 5, hz: 0.3, rot: 0, height: 9 }] }));
    expect(p.z).toBeGreaterThan(-0.5);
  });

  it('keeps out of small round colliders (posts, barrels)', () => {
    const p = settle(world({ circles: [{ x: 0, z: -2, r: 0.4, height: 3 }] }));
    const clear = Math.hypot(p.x, p.z + 2) > 0.4 + 0.15 || p.y > 3.15;
    expect(clear).toBe(true);
  });

  it('ducks under a low span over your head instead of sitting in it (a lamp head)', () => {
    // A lamp's arm and lantern just over the pivot (1.55 m), and a pitch looking steeply down.
    for (const y0 of [1.65, 1.4]) {
      const w = world({});
      const lamp = { x: 0.55, z: 0, hx: 0.6, hz: 0.22, rot: 0, y0, y1: y0 + 0.85 };
      w.addCameraBox(lamp);
      const cam = new FollowCamera();
      const three = new PerspectiveCamera();
      cam.pitch = 1.25;
      for (let t = 0; t < 3; t += 1 / 60) {
        cam.update(1 / 60, three, still, target, 0, false, w, t);
        const p = three.position;
        const inside = Math.abs(p.x - lamp.x) <= lamp.hx && Math.abs(p.z) <= lamp.hz && p.y >= y0 - 0.1;
        expect(inside).toBe(false);
        expect(Number.isFinite(p.y)).toBe(true);
      }
      expect(three.position.y).toBeLessThan(y0 - 0.1);
      expect(three.position.y).toBeGreaterThan(0.9);
    }
  });

  it('rises back to the usual pivot once you walk out from under a span', () => {
    const w = world({});
    w.addCameraBox({ x: 0.55, z: 0, hx: 0.6, hz: 0.22, rot: 0, y0: 1.65, y1: 2.5 });
    const cam = new FollowCamera();
    const three = new PerspectiveCamera();
    const away = { x: 10, y: 0, z: 0 };
    for (let t = 0; t < 1; t += 1 / 60) cam.update(1 / 60, three, still, target, 0, false, w, t);
    const ducked = three.position.y;
    let last = ducked;
    for (let t = 0; t < 4; t += 1 / 60) {
      cam.update(1 / 60, three, still, away, 0, false, w, t);
      // No jump up: the pivot eases back.
      expect(three.position.y - last).toBeLessThan(0.12);
      last = three.position.y;
    }
    expect(three.position.y).toBeCloseTo(1.55 + 6.2 * Math.sin(0.32), 1);
    expect(three.position.y).toBeGreaterThan(ducked);
  });

  it('keeps above a cliff top behind you', () => {
    const cliff = { ...flat, heightAt: (_x: number, z: number) => (z < -3 ? 4 : 0) };
    const p = settle(new CollisionWorld({ ground: cliff, waves: lowSea }));
    expect(p.z < -3 ? p.y > 4.3 : true).toBe(true);
    expect(p.y - (p.z < -3 ? 4 : 0)).toBeGreaterThan(0.3);
  });
});
