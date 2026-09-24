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
