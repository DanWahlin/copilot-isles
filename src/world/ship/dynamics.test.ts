import { describe, expect, it } from 'vitest';
import type { CircleObstacle, HeightField, WaveSampler } from '../contracts';
import { COVE } from '../layout';
import { WaveField } from '../ocean/waves';
import { ShipDynamics, pointOfSailCurve } from './dynamics';
import { BRIGANTINE_CAPSULES, BRIGANTINE_DRAFT } from './lines';

const calm: WaveSampler = {
  heightAt: () => 0,
  velocityAt: (_x, _z, _t, out) => {
    out[0] = 0;
    out[1] = 0;
    return out;
  },
};

function stepMany(
  ship: ShipDynamics,
  seconds: number,
  trim: number,
  rudder: number,
  obstacles: readonly CircleObstacle[] = [],
): void {
  for (let i = 0; i < seconds * 60; i++)
    ship.step(1 / 60, { trim, rudder }, { waves: calm, ground: null, obstacles, t: i / 60 });
}

describe('ShipDynamics', () => {
  it('settles at rest in calm water without drifting', () => {
    const ship = new ShipDynamics(12, -4, 0.3);
    stepMany(ship, 60, 0, 0);
    expect(Math.hypot(ship.pose.x - 12, ship.pose.z + 4)).toBeLessThan(0.5);
    expect(Math.abs(ship.pose.heave)).toBeLessThan(0.02);
    expect(Math.abs(ship.pose.pitch)).toBeLessThan(0.02);
    expect(Math.abs(ship.pose.roll)).toBeLessThan(0.02);
  });

  it('survives a ten-minute random-input soak without NaNs or excessive attitude', () => {
    const waves = new WaveField();
    const ship = new ShipDynamics(0, 0, Math.PI * 0.35);
    let seed = 0x1234abcd;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 10 * 60 * 60; i++) {
      const trim = rand();
      const rudder = rand() * 2 - 1;
      ship.step(1 / 60, { trim, rudder }, { waves, ground: null, obstacles: [], t: i / 60 });
      expect(Number.isFinite(ship.pose.x)).toBe(true);
      expect(Number.isFinite(ship.pose.z)).toBe(true);
      expect(Number.isFinite(ship.pose.pitch)).toBe(true);
      expect(Number.isFinite(ship.pose.roll)).toBe(true);
      expect(Math.abs(ship.pose.pitch)).toBeLessThan(0.55);
      expect(Math.abs(ship.pose.roll)).toBeLessThan(0.65);
    }
  });

  it('keeps x/z untouched when only attitude springs update', () => {
    const waves = new WaveField();
    const ship = new ShipDynamics(5, -7, 0.4);
    const x = ship.pose.x;
    const z = ship.pose.z;
    for (let i = 0; i < 300; i++)
      ship.updateAttitudeOnly(1 / 60, { waves, ground: null, obstacles: [], t: i / 60 });
    expect(ship.pose.x).toBe(x);
    expect(ship.pose.z).toBe(z);
  });

  it('depenetrates the capsule chain outside circle obstacles', () => {
    const ship = new ShipDynamics(0, 0, 0);
    const obstacle = { x: 0, z: 0, r: 2.4 };
    stepMany(ship, 3, 0, 0, [obstacle]);
    const worldCaps = new Float32Array(BRIGANTINE_CAPSULES.length * 3);
    ship.writeWorldCapsules(worldCaps);
    for (let i = 0; i < BRIGANTINE_CAPSULES.length; i++) {
      const dx = worldCaps[i * 3] - obstacle.x;
      const dz = worldCaps[i * 3 + 1] - obstacle.z;
      const min = worldCaps[i * 3 + 2] + obstacle.r - 0.035;
      expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(min);
    }
  });

  it('grounding slows and nudges away from shallow ground', () => {
    const ground: HeightField = {
      heightAt: (x) => -BRIGANTINE_DRAFT + 0.7 + x * 0.02,
      normalAt: (_x, _z, out) => {
        out[0] = -0.02;
        out[1] = 1;
        out[2] = 0;
        return out;
      },
      masksAt: () => ({ sand: 1, grass: 0, rock: 0, cliff: 0 }),
    };
    const ship = new ShipDynamics(2, 0, Math.PI / 2);
    ship.forwardSpeed = 4;
    ship.step(1 / 60, { trim: 0, rudder: 0 }, { waves: calm, ground, obstacles: [], t: 0 });
    expect(ship.forwardSpeed).toBeLessThan(4);
    expect(ship.pose.x).toBeLessThan(2.1);
  });

  it('docking assist lies alongside within tolerance', () => {
    const ship = new ShipDynamics(-18, -12, 0.1);
    ship.dockAssist({ x: 0, z: 0, heading: Math.PI / 2 });
    for (let i = 0; i < 240 * 60 && !ship.dockComplete; i++) {
      ship.step(1 / 60, { trim: 0, rudder: 0 }, { waves: calm, ground: null, obstacles: [], t: i / 60 });
    }
    const posErr = Math.hypot(ship.pose.x, ship.pose.z);
    let headingErr = Math.abs(((Math.PI / 2 - ship.pose.heading + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (headingErr > Math.PI) headingErr = Math.PI * 2 - headingErr;
    expect(posErr).toBeLessThan(0.5);
    expect(headingErr).toBeLessThan((5 * Math.PI) / 180);
  });

  it('docking assist reaches the pier-side Test Cove mooring heading', () => {
    const ship = new ShipDynamics(COVE.mooring.x + 18, COVE.mooring.z - 34, Math.PI * 0.92);
    ship.dockAssist(COVE.mooring);
    for (let i = 0; i < 240 * 60 && !ship.dockComplete; i++) {
      ship.step(1 / 60, { trim: 0, rudder: 0 }, { waves: calm, ground: null, obstacles: [], t: i / 60 });
    }
    const posErr = Math.hypot(ship.pose.x - COVE.mooring.x, ship.pose.z - COVE.mooring.z);
    let headingErr = Math.abs(
      ((COVE.mooring.heading - ship.pose.heading + Math.PI) % (Math.PI * 2)) - Math.PI,
    );
    if (headingErr > Math.PI) headingErr = Math.PI * 2 - headingErr;
    expect(posErr).toBeLessThan(0.5);
    expect(headingErr).toBeLessThan((5 * Math.PI) / 180);
  });

  it('spline autopilot passes all waypoints and completes without input', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 0, z: 55 },
      { x: 36, z: 92 },
      { x: 92, z: 88 },
    ];
    const ship = new ShipDynamics(points[0].x, points[0].z, 0);
    ship.followSpline(points);
    for (let i = 0; i < 360 * 60 && !ship.autopilotComplete; i++) {
      ship.step(1 / 60, { trim: 0, rudder: 0 }, { waves: calm, ground: null, obstacles: [], t: i / 60 });
    }
    const last = points[points.length - 1]!;
    expect(ship.autopilotComplete).toBe(true);
    expect(ship.passedWaypointCount).toBe(points.length);
    expect(Math.hypot(ship.pose.x - last.x, ship.pose.z - last.z)).toBeLessThan(4.2);
  });

  it('dev-page buoy spline clears the new berth and completes from the mooring', () => {
    const points = [
      { x: COVE.mooring.x, z: COVE.mooring.z },
      { x: COVE.mooring.x, z: COVE.mooring.z - 18 },
      { x: COVE.mooring.x + 14, z: COVE.mooring.z - 42 },
      COVE.buoys[0],
      COVE.buoys[1],
      { x: COVE.buoys[1].x + 80, z: COVE.buoys[1].z - 60 },
    ];
    const ship = new ShipDynamics(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
    ship.followSpline(points);
    for (let i = 0; i < 360 * 60 && !ship.autopilotComplete; i++) {
      ship.step(1 / 60, { trim: 0, rudder: 0 }, { waves: calm, ground: null, obstacles: [], t: i / 60 });
    }
    expect(ship.autopilotComplete).toBe(true);
    expect(ship.passedWaypointCount).toBe(points.length);
    expect(ship.pose.z).toBeLessThan(COVE.mooring.z - 180);
  });

  it('point-of-sail curve is near zero head-to-wind and strongest on a broad reach', () => {
    const headToWind = pointOfSailCurve(-1);
    const beamReach = pointOfSailCurve(0);
    const broadReach = pointOfSailCurve(0.42);
    const running = pointOfSailCurve(1);
    expect(headToWind).toBeLessThan(0.03);
    expect(broadReach).toBeGreaterThan(beamReach);
    expect(broadReach).toBeGreaterThan(running);
    expect(broadReach).toBeGreaterThan(0.95);
  });
});
