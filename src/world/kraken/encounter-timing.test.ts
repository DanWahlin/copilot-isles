import { describe, expect, it } from 'vitest';
import { KRAKEN_TIMING, KRAKEN_TIMING_GENTLE, KRAKEN_TIMING_QUICK, wrapBeats } from './encounter';
import {
  HAZARD_SPECS,
  hazardHitsHull,
  hazardImpactAt,
  planTell,
  type HazardKind,
  type TellPlan,
} from './hazards';

describe('kraken timing (data the battle can tune)', () => {
  it('beats come in order, each a couple of seconds or more', () => {
    for (const t of [KRAKEN_TIMING, KRAKEN_TIMING_GENTLE])
      for (const arms of [4, 8]) {
        const b = wrapBeats(t, arms);
        const order = [
          b.tips,
          b.lastRise,
          b.arc,
          b.hang,
          b.grip,
          b.squeeze,
          b.break,
          b.foam,
          b.withdraw,
          b.finale,
          b.end,
        ];
        for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
        expect(b.hang - b.arc).toBeGreaterThanOrEqual(2);
        expect(b.squeeze - b.grip).toBeGreaterThanOrEqual(2);
      }
  });

  it('wraps in about 35–40 s without its finale (the battle), a little longer with it', () => {
    const b = wrapBeats(KRAKEN_TIMING, 8);
    expect(b.end).toBeGreaterThanOrEqual(35);
    expect(b.end).toBeLessThanOrEqual(40);
    expect(b.hasFinale).toBe(false);
    const f = wrapBeats(KRAKEN_TIMING, 8, true);
    expect(f.hasFinale).toBe(true);
    expect(f.end - b.end).toBeGreaterThan(3);
    expect(f.end - b.end).toBeLessThan(7);
    // The end is tight: squeeze, tear, under, withdraw.
    expect(KRAKEN_TIMING.squeeze).toBeLessThanOrEqual(4);
    expect(KRAKEN_TIMING.apart).toBeLessThanOrEqual(3);
    expect(KRAKEN_TIMING.withdraw).toBeLessThanOrEqual(4);
  });

  it('takes a raider caught mid-fight in 10–15 s', () => {
    for (const arms of [4, 5]) {
      const b = wrapBeats(KRAKEN_TIMING_QUICK, arms);
      expect(b.end).toBeGreaterThanOrEqual(10);
      expect(b.end).toBeLessThanOrEqual(15);
      expect(b.break).toBeLessThan(b.end - 3);
    }
  });

  it('is slow for its size: rise, reach and coil take 2–3× the first prototype', () => {
    expect(KRAKEN_TIMING.riseEach).toBeGreaterThanOrEqual(2.6 * 1.7);
    expect(KRAKEN_TIMING.grip).toBeGreaterThanOrEqual(3.5 * 1.7);
    expect(KRAKEN_TIMING.swayPeriod).toBeGreaterThan(5);
  });

  it('strikes fast only at the end of a slow wind-up, with a heavy follow-through', () => {
    for (const spec of Object.values(HAZARD_SPECS)) {
      expect(spec.windUp).toBeGreaterThan(spec.fall * 1.8);
      expect(spec.follow).toBeGreaterThan(spec.fall);
      expect(hazardImpactAt(spec)).toBeCloseTo(spec.tell + spec.windUp + spec.fall, 6);
    }
  });
});

describe('where a tell goes', () => {
  const HALF = 15;
  const BEAM = 4;
  /** Where a ship is at `t` s: straight on, or turned `turn` radians at `at` s. */
  const sail = (x: number, z: number, h: number, v: number, t: number, turn = 0, at = Infinity) => {
    const t1 = Math.min(t, at);
    let px = x + Math.sin(h) * v * t1;
    let pz = z + Math.cos(h) * v * t1;
    const h2 = h + turn;
    if (t > at) {
      px += Math.sin(h2) * v * (t - at);
      pz += Math.cos(h2) * v * (t - at);
    }
    return { x: px, z: pz, h: t > at ? h2 : h };
  };
  const hit = (plan: TellPlan, s: { x: number; z: number; h: number }) => {
    const a = {
      x: plan.x,
      z: plan.z,
      radius: plan.radius,
      heading: plan.heading,
      arc: HAZARD_SPECS[plan.kind].arc,
    };
    return hazardHitsHull(
      a,
      s.x + Math.sin(s.h) * HALF,
      s.z + Math.cos(s.h) * HALF,
      s.x - Math.sin(s.h) * HALF,
      s.z - Math.cos(s.h) * HALF,
      BEAM,
    );
  };
  const plan = { x: 0, z: 0, heading: 0, kind: 'slam', radius: 0, tell: 0, eta: 0 } as TellPlan;

  for (const kind of ['slam', 'sweep'] as HazardKind[])
    it(`${kind}: on a raider's course takes her if she sails on; near the player, a turn away clears it`, () => {
      const target = { x: 10, z: -40, heading: 0.7, speed: 7 };
      planTell(plan, target, kind, 'intercept');
      expect(plan.eta).toBeCloseTo(hazardImpactAt(HAZARD_SPECS[kind]), 6);
      expect(plan.radius).toBe(HAZARD_SPECS[kind].radius);
      expect(hit(plan, sail(10, -40, 0.7, 7, plan.eta))).toBe(true);
      for (const side of [-1, 1]) {
        planTell(plan, target, kind, 'dodge', side);
        // Sailing on into it is a hit; reading the tell and turning hard away (60°, the other side) soon after it shows is a miss.
        expect(hit(plan, sail(10, -40, 0.7, 7, plan.eta))).toBe(true);
        expect(hit(plan, sail(10, -40, 0.7, 7, plan.eta, -side * 1.05, plan.tell * 0.6))).toBe(false);
      }
    });
});
