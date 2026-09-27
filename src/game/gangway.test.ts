import { describe, expect, it } from 'vitest';
import { plankHeightAt, plankProgress, plankSurface, type PlankSpan } from './gangway';

// The Anchorage berth: foot on the pier at x -106.4, top at the rail ~2.2 m east and 0.5 m up.
const span: PlankSpan = {
  foot: { x: -106.4, y: 1.835, z: -112.35 },
  top: { x: -104.2, y: 2.38, z: -112.35 },
  halfWidth: 0.3,
  tread: 0.06,
};

describe('gangplank walk surface', () => {
  it('rises from the pier to the rail along the plank', () => {
    expect(plankHeightAt(span, -106.4, -112.35)).toBeCloseTo(1.895, 3);
    expect(plankHeightAt(span, -105.3, -112.35)).toBeCloseTo((1.835 + 2.38) / 2 + 0.06, 3);
    expect(plankHeightAt(span, -104.2, -112.2)).toBeCloseTo(2.44, 3);
  });

  it('is only there over the plank itself', () => {
    expect(plankHeightAt(span, -106.6, -112.35)).toBeNull(); // behind the foot, on the pier
    expect(plankHeightAt(span, -104.0, -112.35)).toBeNull(); // past the rail
    expect(plankHeightAt(span, -105.3, -111.95)).toBeNull(); // off the side, over the water
  });

  it('reports how far up you are, for boarding at the top', () => {
    expect(plankProgress(span, -106.4, -112.35)).toBeCloseTo(0, 5);
    expect(plankProgress(span, -104.64, -112.35)).toBeCloseTo(0.8, 5);
  });

  it('follows the rail as the ship moves, and vanishes when raised', () => {
    let down = true;
    const surface = plankSurface(span, () => down);
    const moving: PlankSpan = { ...span, top: { ...span.top } };
    const riding = plankSurface(moving, () => true);
    moving.top.y += 0.2;
    expect(riding.heightAt(-104.2, -112.35)).toBeCloseTo(2.64, 3);
    expect(surface.heightAt(-105.3, -112.35)).not.toBeNull();
    down = false;
    expect(surface.heightAt(-105.3, -112.35)).toBeNull();
  });
});
