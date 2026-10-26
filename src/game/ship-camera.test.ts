import { describe, expect, it } from 'vitest';
import type { CircleObstacle } from '../world/contracts';
import { ShipCameraBlockers } from './ship-camera';

function make() {
  const added: CircleObstacle[] = [];
  const b = new ShipCameraBlockers({ addCameraDynamic: (c) => added.push(c) });
  return { b, added };
}

describe('ShipCameraBlockers', () => {
  it('adds its circles once and starts parked', () => {
    const { b, added } = make();
    expect(added.length).toBe(b.circles.length);
    expect(added.length).toBeGreaterThan(8);
    for (const c of added) expect(c.r).toBe(0);
  });

  it('follows the ship along her heading, hull to rails and rig over the deck', () => {
    const { b, added } = make();
    b.place(100, 0.2, 50, Math.PI / 2);
    // Heading π/2: her keel runs along +x, so every circle sits on z = 50.
    for (const c of added) expect(c.z).toBeCloseTo(50, 6);
    const xs = added.map((c) => c.x);
    expect(Math.min(...xs)).toBeLessThan(90);
    expect(Math.max(...xs)).toBeGreaterThan(110);
    // The hull reaches under the waterline; the rig stands over a captain's head on deck.
    expect(Math.min(...added.map((c) => c.y0!))).toBeLessThan(0);
    expect(Math.max(...added.map((c) => c.y1!))).toBeGreaterThan(18);
    for (const c of added) expect(c.r).toBeGreaterThan(0.5);
    for (const c of added) expect(c.r).toBeLessThan(4);
  });

  it('parks the circles out of reach and reuses them', () => {
    const { b, added } = make();
    const first = added[0];
    b.place(0, 0, 0, 0);
    b.park();
    expect(added[0]).toBe(first);
    for (const c of added) expect(Math.abs(c.x)).toBeGreaterThan(1000);
  });
});
