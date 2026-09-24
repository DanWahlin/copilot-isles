import { describe, expect, it } from 'vitest';
import { TitleOrbit } from './title-orbit';

const step = (o: TitleOrbit, seconds: number, reduced = false) => {
  for (let t = 0; t < seconds; t += 1 / 60) o.update(1 / 60, reduced);
};

describe('TitleOrbit', () => {
  it('turns the view as you drag and tilts it within limits', () => {
    const o = new TitleOrbit(0);
    o.down(500, 400, 0);
    o.move(300, 400, 0.1);
    expect(o.yaw).toBeCloseTo(200 * TitleOrbit.YAW_PER_PX, 6);
    o.move(300, 2000, 0.2);
    expect(o.height).toBe(TitleOrbit.HEIGHT[1]);
    o.move(300, -2000, 0.3);
    expect(o.height).toBe(TitleOrbit.HEIGHT[0]);
  });

  it('holds still while dragging, coasts after a flick, then eases back into the auto-orbit', () => {
    const o = new TitleOrbit(0);
    o.down(600, 400, 0);
    o.move(560, 400, 0.016);
    o.move(520, 400, 0.032);
    const held = o.yaw;
    step(o, 0.5);
    expect(o.yaw).toBe(held);
    o.up(0.04);
    step(o, 0.3);
    const coasted = o.yaw - held;
    expect(coasted).toBeGreaterThan(0.1);
    step(o, 3);
    const a = o.yaw;
    step(o, 1);
    expect(o.yaw - a).toBeCloseTo(TitleOrbit.AUTO, 3);
  });

  it("doesn't flick if you pause before letting go, or with reduced motion", () => {
    const paused = new TitleOrbit(0);
    paused.down(600, 400, 0);
    paused.move(400, 400, 0.016);
    paused.up(0.5);
    const y = paused.yaw;
    step(paused, 0.2);
    expect(paused.yaw - y).toBeLessThan(0.01);

    const reduced = new TitleOrbit(0);
    reduced.down(600, 400, 0);
    reduced.move(400, 400, 0.016);
    reduced.up(0.02);
    const r = reduced.yaw;
    step(reduced, 2, true);
    expect(reduced.yaw).toBe(r);
  });

  it('zooms within limits', () => {
    const o = new TitleOrbit();
    o.zoom(-100000);
    expect(o.radius).toBe(TitleOrbit.RADIUS[0]);
    o.zoom(100000);
    expect(o.radius).toBe(TitleOrbit.RADIUS[1]);
  });
});
