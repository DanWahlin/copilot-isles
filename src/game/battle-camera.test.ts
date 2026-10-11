import { describe, expect, it } from 'vitest';
import { BattleCamera } from './battle-camera';

const look = { x: 0, y: 3, z: 0 };

function rig(rm = false, follow = false) {
  const dir = new BattleCamera(() => rm);
  dir.follow = follow;
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

  it('leaves broadsides to the follow view', () => {
    const { dir, step } = rig(false, true);
    dir.setFocus(true, 0, 80);
    step(1);
    dir.beat('broadside', 0, 80);
    expect(dir.current).toBeNull();
    dir.beat('strike', 0, 80);
    expect(dir.current).toBe('strike');
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

  it('keeps your ship and the watched raider in frame without the mouse', () => {
    const { dir, cam, target, step } = rig(false, true);
    // A raider 150 m off your starboard quarter (behind and to the side).
    dir.setFocus(true, -100, -110);
    step(8);
    const toRaider = Math.atan2(-100, -110);
    // The camera sits on the far side of your ship from the raider and looks past it toward her.
    const camDir = Math.atan2(-cam.x, -cam.z);
    expect(Math.abs(Math.atan2(Math.sin(camDir - toRaider), Math.cos(camDir - toRaider)))).toBeLessThan(0.35);
    expect(target.x * -100 + target.z * -110).toBeGreaterThan(0);
  });

  it('turns the follow view at a capped rate, and stands off while you drag', () => {
    const { dir, cam, step } = rig(false, true);
    dir.setFocus(true, 0, 150);
    step(6);
    const before = Math.atan2(-cam.x, -cam.z);
    dir.setFocus(true, 0, -150);
    step(0.5);
    const after = Math.atan2(-cam.x, -cam.z);
    expect(Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)))).toBeLessThan(0.6);
    dir.yieldToUser();
    const x = cam.x;
    step(2);
    expect(cam.x).toBeCloseTo(x, 3);
  });
});
