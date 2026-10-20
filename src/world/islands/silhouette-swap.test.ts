import { describe, expect, it } from 'vitest';
import { drawsSilhouette, SilhouetteSwap, SWAP_HYSTERESIS } from './silhouette-swap';

describe('drawsSilhouette', () => {
  const show = 760;
  const band = SWAP_HYSTERESIS;

  it('swaps to the silhouette only past the band going out', () => {
    expect(drawsSilhouette(false, show, show)).toBe(false);
    expect(drawsSilhouette(false, show + band, show)).toBe(false);
    expect(drawsSilhouette(false, show + band + 0.1, show)).toBe(true);
  });

  it('swaps back to the island only inside the band coming in', () => {
    expect(drawsSilhouette(true, show, show)).toBe(true);
    expect(drawsSilhouette(true, show - band + 0.1, show)).toBe(true);
    expect(drawsSilhouette(true, show - band, show)).toBe(false);
  });

  it('takes its band', () => {
    expect(drawsSilhouette(false, show + 5, show, 0)).toBe(true);
    expect(drawsSilhouette(true, show - 5, show, 0)).toBe(false);
  });
});

describe('SilhouetteSwap', () => {
  it('starts by the swap distance alone, then holds through the band', () => {
    const out = new SilhouetteSwap(700);
    expect(out.update(705)).toBe(true);
    const near = new SilhouetteSwap(700);
    expect(near.update(695)).toBe(false);
    // A camera orbiting across the line doesn't flicker.
    const seen: boolean[] = [];
    for (const d of [695, 705, 712, 698, 719, 701, 721, 700, 690, 681, 699, 680, 650])
      seen.push(near.update(d));
    expect(seen).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});
