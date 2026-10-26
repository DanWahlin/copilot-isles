import { describe, expect, it } from 'vitest';
import {
  KRAKEN_ATLAS,
  KRAKEN_COLORS,
  KRAKEN_GLOW_RED,
  hexToLinear,
  recolourTentacle,
  srgbToLinear,
} from './kraken-palette';

const lin = (hex: number) => {
  const out = [0, 0, 0];
  hexToLinear(hex, out);
  return out;
};

describe('kraken palette', () => {
  it('draws the back dark teal-green and the sucker side pale sea-green, the suckers amber', () => {
    // Four vertices: the sides facing away, the sides facing the sucker side, the back stripe, a sucker.
    const colors = new Float32Array([
      ...lin(KRAKEN_ATLAS.sides),
      ...lin(KRAKEN_ATLAS.sides),
      ...lin(KRAKEN_ATLAS.back),
      ...lin(KRAKEN_ATLAS.sucker),
    ]);
    const normals = new Float32Array([0, 1, 0, 0, -1, 0, 0, 1, 0, 0, -1, 0]);
    const positions = new Float32Array(12);
    expect(recolourTentacle(colors, normals, positions, 1)).toBe(0);
    const back = lin(KRAKEN_COLORS.back);
    const under = lin(KRAKEN_COLORS.under);
    expect(colors[1]).toBeGreaterThan(colors[0]!); // green over red
    expect(colors[4]).toBeCloseTo(under[1]!, 3);
    expect(colors[1]! / back[1]!).toBeGreaterThan(0.6);
    expect(colors[9]).toBeGreaterThan(colors[11]! * 4); // amber: red well over blue
  });

  it('only the eyes glow: their amber is over the glow line, the suckers well under', () => {
    expect(lin(KRAKEN_COLORS.eye)[0]!).toBeGreaterThan(KRAKEN_GLOW_RED);
    for (const hex of [
      KRAKEN_COLORS.sucker,
      KRAKEN_COLORS.suckerRim,
      KRAKEN_COLORS.under,
      KRAKEN_COLORS.glint,
    ])
      expect(lin(hex)[0]!).toBeLessThan(KRAKEN_GLOW_RED - 0.03);
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
  });
});
