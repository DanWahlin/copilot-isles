import { describe, expect, it } from 'vitest';
import { tierSettings } from '../../engine/quality';
import type { WaveSampler } from '../contracts';
import { COVE } from '../layout';
import { CoveHeightField } from '../terrain/cove-height';
import { createVillage } from '../village/index';
import { ShipDynamics } from './dynamics';

const calm: WaveSampler = {
  heightAt: () => 0,
  velocityAt: (_x, _z, _t, out) => {
    out[0] = 0;
    out[1] = 0;
    return out;
  },
};

function headingErr(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Docking inside the real harbour: pier piles, quay edge, boats and the analytic terrain as ground. */
describe('dock assist in the Test Cove harbour', async () => {
  const ground = new CoveHeightField();
  const village = await createVillage({ tier: tierSettings('low'), heightField: ground });
  const env = { waves: calm, ground, obstacles: village.shipObstacles, t: 0 };

  const run = (ship: ShipDynamics, seconds: number, trim = 0, rudder = 0) => {
    for (let i = 0; i < seconds * 60 && !ship.dockComplete; i++) {
      env.t += 1 / 60;
      ship.step(1 / 60, { trim, rudder }, env);
    }
  };

  const cases: [string, () => ShipDynamics][] = [
    [
      'after a short sail north and a port turn (the playtest route)',
      () => {
        const ship = new ShipDynamics(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
        run(ship, 1.3, 0.55, 0);
        run(ship, 5, 0.55, 0);
        run(ship, 1.5, 0.55, 1);
        run(ship, 2.5, 0.55, 0.4);
        run(ship, 1.5, 0.2, 0);
        return ship;
      },
    ],
    ['overshot north of the berth, still bow-north', () => new ShipDynamics(-102.9, -120, Math.PI)],
    ['coming in from the east of the basin', () => new ShipDynamics(-80, -125, -Math.PI / 2)],
  ];
  // Bow-south arrivals can't turn inside the basin; the session fades and moors them after a few seconds.

  for (const [name, make] of cases) {
    it(`docks ${name}`, () => {
      const ship = make();
      ship.dockAssist(COVE.mooring);
      run(ship, 90);
      expect(ship.dockComplete).toBe(true);
      expect(Math.hypot(ship.pose.x - COVE.mooring.x, ship.pose.z - COVE.mooring.z)).toBeLessThan(0.5);
      expect(headingErr(ship.pose.heading, COVE.mooring.heading)).toBeLessThan((5 * Math.PI) / 180);
    });
  }
});
