import { describe, expect, it } from 'vitest';
import { QuietSea } from '../life/quiet-sea';
import {
  SIGHTING_RULES,
  SightingsPlanner,
  deepWaterAt,
  sightingPixels,
  type SightingView,
} from './sightings';

const view = (o: Partial<SightingView> = {}): SightingView => ({
  x: 0,
  y: 6,
  z: 0,
  forwardX: 1,
  forwardZ: 0,
  fovDeg: 50,
  aspect: 16 / 9,
  viewportHeight: 720,
  zoom: 1,
  ...o,
});

describe('SightingsPlanner', () => {
  it('is seeded: the same seed plans the same sightings', () => {
    const a = new SightingsPlanner(42);
    const b = new SightingsPlanner(42);
    expect(a.nextAt).toBe(b.nextAt);
    for (let i = 0; i < 20; i++)
      expect(a.plan(i * 300, view(), {}, false)).toEqual(b.plan(i * 300, view(), {}, false));
  });

  it('waits minutes between sightings', () => {
    const p = new SightingsPlanner(7);
    expect(p.nextAt).toBeGreaterThanOrEqual(SIGHTING_RULES.firstAfter);
    expect(p.due(10)).toBe(false);
    for (let i = 0; i < 50; i++) {
      p.scheduleAfter(1000);
      expect(p.nextAt - 1000).toBeGreaterThanOrEqual(SIGHTING_RULES.minGap);
      expect(p.nextAt - 1000).toBeLessThanOrEqual(SIGHTING_RULES.maxGap);
    }
  });

  it('plans 300–900 m off, in view, and big enough to see', () => {
    const p = new SightingsPlanner(3);
    const v = view();
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const plan = p.plan(i, v, {}, false);
      if (!plan) continue;
      n++;
      const d = Math.hypot(plan.x - v.x, plan.z - v.z);
      expect(d).toBeGreaterThanOrEqual(SIGHTING_RULES.minDistance - 1e-6);
      expect(d).toBeLessThanOrEqual(SIGHTING_RULES.maxDistance + 1e-6);
      // In front of the camera, well inside its view.
      expect(Math.abs(Math.atan2(plan.z - v.z, plan.x - v.x))).toBeLessThan(0.7);
      expect(sightingPixels(plan.kind, Math.hypot(d, v.y), v)).toBeGreaterThanOrEqual(
        SIGHTING_RULES.minPixels,
      );
    }
    expect(n).toBeGreaterThan(150);
  });

  it('skips a sighting that would be only a few pixels tall', () => {
    // A tiny window: nothing 150 m off is 8 px tall in it.
    const p = new SightingsPlanner(5);
    expect(p.plan(0, view({ viewportHeight: 30 }), {}, false)).toBeNull();
    expect(p.nextAt).toBeGreaterThan(0);
  });

  it('keeps out of quiet seas, closed gates and the player’s path', () => {
    const quiet = new QuietSea();
    const off = quiet.add({ x: 0, z: 0, r: Infinity });
    const p = new SightingsPlanner(9);
    expect(p.plan(0, view(), { quiet }, false)).toBeNull();
    off();
    expect(p.plan(0, view(), { allowed: () => false }, false)).toBeNull();
    // The ship sails the way the camera looks: no sighting may land on her course.
    const player = { x: 0, z: 0, heading: Math.PI / 2, speed: 8 };
    for (let i = 0; i < 100; i++) {
      const plan = p.plan(i, view(), { player }, false);
      if (!plan) continue;
      // Her course: 90 s at 8 m/s, 720 m along +x.
      const along = Math.min(720, Math.max(0, plan.x));
      expect(Math.hypot(plan.x - along, plan.z)).toBeGreaterThan(SIGHTING_RULES.pathClearance - 1e-6);
    }
  });

  it('plans a single tip on Lite', () => {
    const p = new SightingsPlanner(11);
    for (let i = 0; i < 40; i++) {
      const plan = p.plan(i, view(), {}, true);
      if (plan) {
        expect(plan.kind).toBe('tip');
        expect(plan.arms).toBe(1);
      }
    }
  });

  it('takes a forced kind and distance (the dev page) under the same rules', () => {
    const p = new SightingsPlanner(13);
    const plan = p.plan(0, view(), {}, false, { kind: 'group', distance: 600 });
    expect(plan?.kind).toBe('group');
    expect(Math.hypot(plan!.x, plan!.z)).toBeCloseTo(600, 3);
    expect(p.plan(0, view(), { allowed: () => false }, false, { kind: 'arc', distance: 600 })?.kind).toBe(
      'arc',
    );
  });
});

describe('deepWaterAt', () => {
  const field = (land: (x: number, z: number) => boolean) => ({
    heightAt: (x: number, z: number) => (land(x, z) ? 4 : -30),
    normalAt: (_x: number, _z: number, out: number[]) => out,
    masksAt: () => ({ sand: 0, grass: 0, rock: 0, cliff: 0 }),
  });

  it('is open sea far from land, and not near a shore', () => {
    const island = field((x, z) => Math.hypot(x, z) < 200);
    expect(deepWaterAt(island as never, 600, 0)).toBe(true);
    expect(deepWaterAt(island as never, 260, 0)).toBe(false);
    expect(deepWaterAt(island as never, 100, 0)).toBe(false);
  });
});
