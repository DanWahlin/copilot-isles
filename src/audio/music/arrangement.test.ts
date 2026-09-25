import { describe, expect, it } from 'vitest';
import { createAnchoragePlan, eightBarSignature, type MusicPalette } from './arrangement';
import { ANCHORAGE_BPM } from './theory';

const PALETTES: readonly MusicPalette[] = ['harbour', 'tropical'];

describe('Anchorage arrangement', () => {
  it('keeps the shared tempo in the requested relaxed range', () => {
    expect(ANCHORAGE_BPM).toBeGreaterThanOrEqual(72);
    expect(ANCHORAGE_BPM).toBeLessThanOrEqual(92);
  });

  it('uses 60-100 second generated movements', () => {
    for (const palette of PALETTES) {
      const plan = createAnchoragePlan(0x5151, 64, palette);
      const seconds = (plan.formBars * plan.beatsPerBar * 60) / ANCHORAGE_BPM;
      expect(seconds, palette).toBeGreaterThanOrEqual(60);
      expect(seconds, palette).toBeLessThanOrEqual(100);
    }
  });

  it('does not repeat an exact 8-bar block within a ten-minute seeded run', () => {
    for (const palette of PALETTES) {
      const probe = createAnchoragePlan(0xdecafbad, 8, palette);
      const bars = Math.ceil((10 * 60 * ANCHORAGE_BPM) / probe.beatsPerBar / 60);
      const plan = createAnchoragePlan(0xdecafbad, bars + 8, palette);
      const seen = new Set<string>();
      for (let bar = 0; bar < bars; bar++) {
        const signature = eightBarSignature(plan, bar);
        expect(seen.has(signature), `${palette}: repeated 8-bar block at bar ${bar}`).toBe(false);
        seen.add(signature);
      }
    }
  });
});
