import { describe, expect, it } from 'vitest';
import { KRAKEN_TIMING, KRAKEN_TIMING_GENTLE, wrapBeats } from './encounter';
import { HAZARD_SPECS, hazardImpactAt } from './hazards';

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
