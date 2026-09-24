import { describe, expect, it } from 'vitest';
import { ALL_WAVES, heightAt, heightAtRest, WaveField, wavesForTier } from './waves';

describe('waves', () => {
  it('uses deep-water dispersion', () => {
    for (const w of ALL_WAVES) expect(w.w).toBeCloseTo(Math.sqrt(9.81 * w.k), 10);
  });

  it('keeps the longest waves for low tiers', () => {
    const low = wavesForTier(3);
    expect(low).toHaveLength(3);
    expect(low[0].k).toBeLessThan(low[2].k);
  });

  it('exact height matches the displaced Gerstner surface', () => {
    const t = 3.7;
    // Take a rest point, displace it, and check heightAt at the displaced world position.
    const x0 = 12.3,
      z0 = -4.1;
    let dx = 0,
      dz = 0;
    for (const W of ALL_WAVES) {
      const c = W.q * W.a * Math.cos(W.k * (W.dx * x0 + W.dz * z0) - W.w * t + W.ph);
      dx += c * W.dx;
      dz += c * W.dz;
    }
    const expected = heightAtRest(ALL_WAVES, x0, z0, t);
    expect(heightAt(ALL_WAVES, x0 + dx, z0 + dz, t)).toBeCloseTo(expected, 2);
  });

  it('fades with distance from the focus point', () => {
    const f = new WaveField();
    f.setFocus(0, 0);
    let near = 0,
      far = 0;
    for (let i = 0; i < 50; i++) {
      near = Math.max(near, Math.abs(f.heightAt(i, 0, i * 0.3)));
      far = Math.max(far, Math.abs(f.heightAt(2000 + i, 0, i * 0.3)));
    }
    expect(far).toBeLessThan(near * 0.01);
  });
});
