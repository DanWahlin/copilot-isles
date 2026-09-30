import { PerspectiveCamera } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
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
