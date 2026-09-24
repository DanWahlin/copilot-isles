import { describe, expect, it } from 'vitest';
import { createBrigantine } from './brigantine';
import { COVE } from '../layout';
import { deckHeightAt } from './index';

describe('createBrigantine', () => {
  it('keeps the hero asset inside the draw-call and high-tier triangle budget', () => {
    const ship = createBrigantine({ tier: 'high' });
    expect(ship.drawCallCount).toBeLessThanOrEqual(16);
    expect(ship.triangleCount).toBeGreaterThanOrEqual(25_000);
    expect(ship.triangleCount).toBeLessThanOrEqual(40_000);
    ship.dispose();
  });

  it('exposes local helm and pier-side boarding anchors', () => {
    const ship = createBrigantine({ tier: 'low' });
    expect(ship.anchors.helm.z).toBeLessThan(-8);
    expect(ship.anchors.helm.y).toBeCloseTo(deckHeightAt(-8) + 0.18, 6);
    expect(ship.anchors.helm.heading).toBe(0);
    expect(ship.anchors.boarding.x).toBeGreaterThan(0);
    expect(ship.anchors.boarding.y).toBeCloseTo(deckHeightAt(ship.anchors.boarding.z), 6);
    expect(ship.pipes.tube.x).toBeGreaterThan(0);
    expect(ship.pipes.hatch.x).toBeGreaterThan(0);

    ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
    const pose = ship.dynamics.pose;
    const worldX =
      pose.x +
      Math.cos(pose.heading) * ship.anchors.boarding.x +
      Math.sin(pose.heading) * ship.anchors.boarding.z;
    const worldZ =
      pose.z -
      Math.sin(pose.heading) * ship.anchors.boarding.x +
      Math.cos(pose.heading) * ship.anchors.boarding.z;
    expect(worldX).toBeLessThan(COVE.mooring.x);
    expect(worldZ).toBeCloseTo(COVE.mooring.z - ship.anchors.boarding.z, 6);
    expect(COVE.mooring.z - ship.pipes.tube.z).toBeGreaterThan(-106.6);
    expect(COVE.mooring.z - ship.pipes.tube.z).toBeLessThan(-103.8);
    expect(COVE.mooring.z - ship.pipes.hatch.z).toBeGreaterThan(-106.6);
    expect(COVE.mooring.z - ship.pipes.hatch.z).toBeLessThan(-103.8);
    ship.dispose();
  });

  it('exposes current world-space waterline, bow, and stern points', () => {
    const ship = createBrigantine({ tier: 'low' });
    ship.dynamics.reset(10, -20, Math.PI / 2);
    const poly = new Float32Array(64);
    const bow = new Float32Array(2);
    const stern = new Float32Array(2);
    ship.waterlinePolygon(poly);
    ship.bowWorld(bow);
    ship.sternWorld(stern);
    for (const v of poly) expect(Number.isFinite(v)).toBe(true);
    expect(poly.length).toBe(64);
    expect(bow[0]).toBeGreaterThan(stern[0]);
    expect(Math.abs(bow[1] - stern[1])).toBeLessThan(0.001);
    ship.dispose();
  });
});
