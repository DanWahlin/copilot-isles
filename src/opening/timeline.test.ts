import { describe, expect, it } from 'vitest';
import { CHART_D, CHART_ISLANDS, CHART_W, worldToPaper } from './chart-map';
import {
  flashIn,
  latchOpen,
  lidOpen,
  openingBeats,
  paperSettle,
  popUp,
  unrollAmount,
  waterReach,
} from './timeline';

describe('opening timeline', () => {
  const b = openingBeats('voyage');

  it('runs its beats in order and is ready before 15 s', () => {
    const order = [
      b.latch,
      b.lid,
      b.rise,
      b.unroll,
      b.unrollEnd,
      b.water,
      b.anchorage,
      b.meridian,
      b.ship,
      b.ready,
    ];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!);
    expect(b.ready).toBeLessThan(15);
    expect(openingBeats('continue').ready).toBeLessThan(2);
  });

  it('anticipates before the lid opens and settles fully open', () => {
    expect(lidOpen(b.lidDip - 0.01, b)).toBe(0);
    expect(lidOpen((b.lidDip + b.lid) / 2, b)).toBeLessThan(0);
    expect(
      Math.max(...[0.3, 0.4, 0.5].map((x) => lidOpen(b.lid + (b.lidEnd - b.lid) * x, b))),
    ).toBeGreaterThan(1);
    expect(lidOpen(b.lidEnd + 1, b)).toBeCloseTo(1, 5);
  });

  it('lifts the latch a little before it snaps open', () => {
    expect(latchOpen(b.latchLift - 0.01, b)).toBe(0);
    const lifted = latchOpen(b.latch - 0.001, b);
    expect(lifted).toBeGreaterThan(0);
    expect(lifted).toBeLessThan(0.1);
    expect(latchOpen(b.latch + 1, b)).toBeCloseTo(1, 5);
  });

  it('unrolls, settles, and spreads the water to the corners', () => {
    expect(unrollAmount(b.unroll, b)).toBe(0);
    expect(unrollAmount(b.unrollEnd, b)).toBe(1);
    expect(paperSettle(b.settleEnd + 0.1, b)).toBe(0);
    expect(waterReach(b.waterEnd, b)).toBe(1);
    expect(popUp(b.anchorage, b.anchorage)).toBe(0);
    expect(popUp(b.anchorage + 5, b.anchorage)).toBeCloseTo(1, 5);
  });

  it('peaks the spray flash exactly at the end of the dive', () => {
    expect(flashIn(0, b)).toBe(0);
    expect(flashIn(b.dive, b)).toBe(1);
  });
});

describe('chart map', () => {
  it('keeps every real island on the sheet', () => {
    const p = { x: 0, y: 0, z: 0 };
    for (const isl of CHART_ISLANDS) {
      for (const [x, z] of [
        [isl.minX, isl.minZ],
        [isl.maxX, isl.maxZ],
      ] as const) {
        worldToPaper(isl, x, 0, z, p);
        expect(Math.abs(p.x)).toBeLessThan(CHART_W / 2);
        expect(Math.abs(p.z)).toBeLessThan(CHART_D / 2);
      }
    }
  });
});
