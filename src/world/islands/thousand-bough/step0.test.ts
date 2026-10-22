import { describe, expect, it } from 'vitest';
import { ARRIVALS } from '../../../game/arrivals';
import { ISLANDS, islandAt, passageSky } from '../../../game/islands';
import { MERIDIAN } from '../meridian';
import { createThousandBoughStub, thousandBoughAnchors } from './index';
import { HELIX, THOUSAND_BOUGH, atBearing, bearingOf, helixY, treeDeck } from './layout';

describe('Thousand-Bough step 0', () => {
  it('registers the island: berth, arrival, waters', () => {
    const tb = ISLANDS['thousand-bough'];
    expect(tb.arrival).toBe(ARRIVALS['thousand-bough']);
    expect(islandAt(tb.quay.x, tb.quay.z)).toBe('thousand-bough');
    expect(islandAt(tb.mooring.x, tb.mooring.z)).toBe('thousand-bough');
    expect(islandAt(MERIDIAN.harbor.landing.x, MERIDIAN.harbor.landing.z)).toBe('meridian');
    expect(islandAt(1300, -1300)).toBe('anchorage');
  });

  it('keeps Anchorage’s and Meridian’s skies, and eases into the dusk near Thousand-Bough', () => {
    const sky = { hours: 0, azimuth: 0 };
    passageSky(0, 0, sky);
    expect(sky).toEqual(ISLANDS.anchorage.sky);
    passageSky(MERIDIAN.harbor.berth.x, MERIDIAN.harbor.berth.z, sky);
    expect(sky.hours).toBeCloseTo(ISLANDS.meridian.sky.hours, 6);
    expect(sky.azimuth).toBeCloseTo(ISLANDS.meridian.sky.azimuth, 6);
    passageSky(THOUSAND_BOUGH.harbor.berth.x, THOUSAND_BOUGH.harbor.berth.z, sky);
    expect(sky.hours).toBeCloseTo(ISLANDS['thousand-bough'].sky.hours, 6);
    expect(sky.azimuth).toBeCloseTo(ISLANDS['thousand-bough'].sky.azimuth, 6);
    // Half way from Meridian it's already past Meridian's hour, never back toward Anchorage's.
    passageSky(1450, -1175, sky);
    expect(sky.hours).toBeGreaterThan(ISLANDS.meridian.sky.hours - 0.01);
    expect(sky.hours).toBeLessThan(ISLANDS['thousand-bough'].sky.hours + 0.01);
  });

  it('lays out the decks on the stair at the spec’s turn angles', () => {
    expect(helixY(HELIX.sweep)).toBeCloseTo(HELIX.topY, 6);
    for (const id of ['L1E', 'L2SW', 'L3SE'] as const) {
      const d = treeDeck(id);
      expect(d.y).toBeCloseTo(helixY(d.theta!), 6);
    }
    const ines = THOUSAND_BOUGH.anchors.ines;
    const p = atBearing(225, 26);
    expect(Math.hypot(p.x - ines.x, p.z - ines.z)).toBeLessThan(0.1);
    expect(bearingOf(2010, -1600)).toBeCloseTo(0, 6);
    expect(bearingOf(2050, -1560)).toBeCloseTo(90, 6);
  });

  it('gives the stub every anchor', () => {
    const s = createThousandBoughStub();
    expect(Object.keys(s.anchors).sort()).toEqual(Object.keys(thousandBoughAnchors()).sort());
    expect(Object.keys(s.anchors)).toHaveLength(27);
  });
});
