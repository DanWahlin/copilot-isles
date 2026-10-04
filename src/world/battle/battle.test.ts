import { describe, expect, it } from 'vitest';
import type { WaveSampler } from '../contracts';
import { ShipDynamics } from '../ship/dynamics';
import { windAt } from '../wind';
import {
  GRAVITY,
  MUZZLE_SPEED,
  elevationFor,
  flightTime,
  insideHull,
  leadPoint,
  muzzleLocal,
} from './ballistics';
import {
  ARC_HALF_ANGLE,
  Battery,
  MAX_RANGE,
  PORT,
  RIPPLE_SECONDS,
  STARBOARD,
  bearing,
  gunStations,
  offBeam,
} from './gunnery';
import { haulDown } from './battle';
import { RaiderBrain, type RaiderHelm, type RaiderView } from './raider-ai';

/** Flies a ball with the same explicit step the battle uses and returns where it crosses height `y`. */
function fly(elevation: number, y0: number, yEnd: number): number {
  let x = 0;
  let y = y0;
  const vx = MUZZLE_SPEED * Math.cos(elevation);
  let vy = MUZZLE_SPEED * Math.sin(elevation);
  const h = 1 / 240;
  for (let i = 0; i < 240 * 20; i++) {
    vy -= GRAVITY * h;
    x += vx * h;
    y += vy * h;
    if (vy < 0 && y <= yEnd) return x;
  }
  return Number.NaN;
}

describe('ballistics', () => {
  it('lays a gun so the ball lands at the asked range', () => {
    for (const range of [25, 60, 110, 140]) {
      const e = elevationFor(range, -2.5);
      expect(Number.isFinite(e)).toBe(true);
      expect(Math.abs(fly(e, 2.5, 0) - range)).toBeLessThan(0.6);
    }
  });

  it('reports out-of-reach targets as NaN', () => {
    expect(elevationFor((MUZZLE_SPEED * MUZZLE_SPEED) / GRAVITY + 50, 0)).toBeNaN();
    expect(elevationFor(0, 0)).toBeNaN();
  });

  it('leads a moving target by its flight time', () => {
    const out = [0, 0];
    const t = leadPoint(0, 2.5, 0, 0, 1, 80, 4, 0, out);
    expect(t).toBeGreaterThan(1);
    expect(out[0]).toBeCloseTo(4 * t, 3);
    expect(
      flightTime(Math.hypot(out[0]!, out[1]!), elevationFor(Math.hypot(out[0]!, out[1]!), -1.5)),
    ).toBeCloseTo(t, 3);
  });

  it('knows the inside of the hull from the water round it', () => {
    expect(insideHull(0, 0.5, 0)).toBe(true);
    expect(insideHull(2.5, 1.0, 0)).toBe(true);
    expect(insideHull(4.5, 1.0, 0)).toBe(false);
    expect(insideHull(0, 6, 0)).toBe(false);
    expect(insideHull(0, 1, 13)).toBe(false);
    expect(insideHull(0, -4, 0)).toBe(false);
    // A cutter is the same hull, smaller.
    expect(insideHull(2.9, 1.0, 0)).toBe(true);
    expect(insideHull(2.9, 1.0, 0, 0.75)).toBe(false);
  });

  it('puts the muzzles outboard of the hull, on the right side', () => {
    const m = { x: 0, y: 0, z: 0 };
    for (const z of gunStations('high')) {
      muzzleLocal(PORT, z, m);
      expect(m.x).toBeGreaterThan(0);
      expect(insideHull(m.x + 0.6, m.y, m.z)).toBe(false);
      muzzleLocal(STARBOARD, z, m);
      expect(m.x).toBeLessThan(0);
    }
  });
});

describe('gunnery', () => {
  it('measures the angle off each beam (port is the hull’s +x)', () => {
    // Heading 0 faces +z; port's beam is +x.
    expect(offBeam(0, PORT, 1, 0)).toBeCloseTo(0);
    expect(offBeam(0, STARBOARD, -1, 0)).toBeCloseTo(0);
    expect(offBeam(0, PORT, 1, 1)).toBeCloseTo(Math.PI / 4);
    expect(offBeam(0, STARBOARD, -1, 1)).toBeCloseTo(Math.PI / 4);
    expect(Math.abs(offBeam(Math.PI / 2, PORT, 0, -1))).toBeCloseTo(0);
  });

  it('bears only inside the arc and the range', () => {
    expect(bearing(0, PORT, 60, 0)).toBeCloseTo(0);
    expect(bearing(0, STARBOARD, 60, 0)).toBeNaN();
    expect(bearing(0, PORT, 10, 0)).toBeNaN();
    expect(bearing(0, PORT, MAX_RANGE + 5, 0)).toBeNaN();
    expect(bearing(0, PORT, 0, 80)).toBeNaN();
    const edge = ARC_HALF_ANGLE + 0.01;
    expect(bearing(0, PORT, 100 * Math.cos(edge), 100 * Math.sin(edge), 0)).toBeNaN();
    expect(bearing(0, PORT, 100 * Math.cos(edge), 100 * Math.sin(edge), 12)).toBeGreaterThan(0);
  });

  it('ripples a broadside bow to stern, then reloads gun by gun', () => {
    const b = new Battery(PORT, gunStations('high'), 7);
    const order: number[] = [];
    const shot = (i: number) => order.push(i);
    expect(b.loadedCount()).toBe(6);
    expect(b.fire(10)).toBe(6);
    expect(b.loadedCount()).toBe(0);
    expect(b.fire(10)).toBe(0);
    let t = 10;
    for (let i = 0; i < 60; i++) b.update(1 / 60, (t += 1 / 60), shot);
    expect(order).toEqual([5, 4, 3, 2, 1, 0]);
    expect(b.firing()).toBe(false);
    const filled: number[] = [];
    for (let i = 0; i < 60 * 12; i++) {
      b.update(1 / 60, (t += 1 / 60), shot);
      for (let g = 0; g < b.count; g++) if (b.readiness(g) === 1 && !filled.includes(g)) filled.push(g);
    }
    expect(filled.length).toBe(6);
    expect(new Set(filled).size).toBe(6);
    expect(order.length).toBe(6);
    expect(RIPPLE_SECONDS).toBeGreaterThan(0);
  });

  it('carries three guns a side on Low and Lite', () => {
    expect(gunStations('low').length).toBe(3);
    expect(gunStations('lite').length).toBe(3);
    expect(gunStations('ultra').length).toBe(6);
  });
});

describe('raider helmsman', () => {
  const calm: WaveSampler = {
    heightAt: () => 0,
    velocityAt: (_x, _z, _t, out) => {
      out[0] = 0;
      out[1] = 0;
      return out;
    },
  };

  it('closes from the fog and brings a broadside to bear', () => {
    // The battle spawns raiders upwind or on the wind's beam (they hold the weather gauge).
    for (const start of [
      [-200, 150],
      [150, 200],
      [-150, -200],
    ] as const) {
      const ship = new ShipDynamics(start[0], start[1], Math.atan2(-start[0], -start[1]));
      const brain = new RaiderBrain(65);
      const helm: RaiderHelm = { trim: 0, rudder: 0 };
      const wind = [0, 0];
      const view: RaiderView = {
        x: 0,
        z: 0,
        heading: 0,
        headingRate: 0,
        targetX: 0,
        targetZ: 0,
        windX: 0,
        windZ: 0,
        loadedPort: 6,
        loadedStarboard: 6,
        hull: 1,
        avoidX: 0,
        avoidZ: 0,
      };
      let bore = 0;
      let minDist = Infinity;
      const seconds = 150;
      for (let i = 0; i < seconds * 60; i++) {
        const t = i / 60;
        windAt(ship.pose.x, ship.pose.z, t, wind);
        view.x = ship.pose.x;
        view.z = ship.pose.z;
        view.heading = ship.pose.heading;
        view.headingRate = ship.headingRate;
        view.windX = wind[0]!;
        view.windZ = wind[1]!;
        brain.steer(1 / 60, view, helm);
        ship.step(1 / 60, helm, { waves: calm, ground: null, obstacles: [], t });
        const dx = -ship.pose.x;
        const dz = -ship.pose.z;
        minDist = Math.min(minDist, Math.hypot(dx, dz));
        if (t > 60) {
          const h = ship.pose.heading;
          if (Number.isFinite(bearing(h, PORT, dx, dz)) || Number.isFinite(bearing(h, STARBOARD, dx, dz)))
            bore++;
        }
      }
      // It never rams, and once it's arrived it has the target in an arc much of the time.
      expect(minDist).toBeGreaterThan(18);
      expect(bore / ((seconds - 60) * 60)).toBeGreaterThan(0.6);
    }
  });
});

describe('animation beats', () => {
  it('kicks a gun back with an overshoot, holds it, then runs it out before it is loaded', () => {
    const b = new Battery(PORT, gunStations('high'), 7);
    expect(b.recoil(0, 0)).toBe(0);
    b.fire(10);
    const noop = () => undefined;
    let t = 10;
    b.update(1 / 60, (t += 1 / 60), noop);
    const fired = b.firedAt.findIndex((x) => x > 0);
    expect(fired).toBeGreaterThanOrEqual(0);
    let peak = 0;
    const samples: number[] = [];
    for (let i = 0; i < 60 * 9; i++) {
      b.update(1 / 60, (t += 1 / 60), noop);
      const r = b.recoil(fired, t);
      peak = Math.max(peak, r);
      samples.push(r);
    }
    expect(peak).toBeGreaterThan(0.8);
    expect(peak).toBeLessThan(0.95);
    // Back for a while, then out before the gun reads as loaded.
    expect(samples[60]).toBeGreaterThan(0.75);
    expect(b.readiness(fired)).toBe(1);
    expect(samples[samples.length - 1]).toBe(0);
  });

  it('hauls the colours down with a small lift first and ends at the deck', () => {
    expect(haulDown(0)).toBe(0);
    expect(haulDown(0.2)).toBeLessThan(0);
    expect(haulDown(1.5)).toBeGreaterThan(0);
    expect(haulDown(1.5)).toBeLessThan(haulDown(3));
    expect(haulDown(4)).toBe(1);
    expect(haulDown(10)).toBe(1);
  });
});
