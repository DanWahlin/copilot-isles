import { describe, expect, it } from 'vitest';
import { BattleCamera } from './battle-camera';

const look = { x: 0, y: 3, z: 0 };

function rig(rm = false) {
  const dir = new BattleCamera(() => rm);
  const cam = { x: -30, y: 18, z: -30 };
  const target = { x: 0, y: 3, z: 0 };
  let t = 0;
  const step = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      t += 1 / 60;
      dir.update(1 / 60, t, 0, 0, 0, look, cam, target);
    }
  };
  step(0.1);
  return { dir, cam, target, step };
}

describe('battle camera director', () => {
  it('frames a beat, then gives you your own view back', () => {
    const { dir, cam, target, step } = rig();
    dir.beat('intro', 0, 220);
    step(3);
    expect(dir.current).toBe('intro');
    expect(target.z).toBeGreaterThan(60);
    step(10);
    expect(dir.current).toBeNull();
    expect(cam.x).toBeCloseTo(-30, 0);
    expect(cam.y).toBeCloseTo(18, 0);
    expect(cam.z).toBeCloseTo(-30, 0);
    expect(target.z).toBeCloseTo(0, 1);
  });

  it('lets bigger beats cut in, not smaller ones', () => {
    const { dir, step } = rig();
    dir.beat('strike', 0, 80);
    step(0.5);
    dir.beat('broadside', 0, 80);
    expect(dir.current).toBe('strike');
    dir.beat('won', 0, 0);
    expect(dir.current).toBe('won');
  });

  it("doesn't chase every broadside", () => {
    const { dir, step } = rig();
    dir.beat('broadside', 0, 80);
    step(4);
    expect(dir.current).toBeNull();
    dir.beat('broadside', 0, 80);
    expect(dir.current).toBeNull();
    step(6);
    dir.beat('incoming', 0, 80);
    expect(dir.current).toBe('incoming');
  });

  it('stands off after you drag', () => {
    const { dir, step } = rig();
    dir.beat('intro', 0, 220);
    step(1);
    dir.yieldToUser();
    expect(dir.current).toBeNull();
    dir.beat('strike', 0, 80);
    expect(dir.current).toBeNull();
    dir.beat('won', 0, 0);
    expect(dir.current).toBe('won');
  });

  it('cuts instead of swooping with reduced motion', () => {
    const { dir, cam, step } = rig(true);
    dir.beat('intro', 0, 220);
    step(1 / 60);
    // One frame in, the camera is already on its mark (over your shoulder, low).
    expect(cam.y).toBeCloseTo(6.5, 3);
    step(9);
    expect(cam.y).toBeCloseTo(18, 3);
  });
});
