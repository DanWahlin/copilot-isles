import { describe, expect, it } from 'vitest';
import { MERIDIAN, meridianHeight } from '../world/islands/meridian';
import { COVE } from '../world/layout';
import { ISLANDS, islandAt, nextMorningFrom, nightAtSea, nightAtSeaSeconds, passageSky } from './islands';
import { MERIDIAN_QUESTS, meridianTracker } from './meridian-quests';

describe('islands', () => {
  it('knows which island a spot belongs to', () => {
    expect(islandAt(COVE.spawn.x, COVE.spawn.z)).toBe('anchorage');
    expect(islandAt(MERIDIAN.harbor.landing.x, MERIDIAN.harbor.landing.z)).toBe('meridian');
    // Open sea between them counts as Anchorage's waters (home port).
    expect(islandAt(400, -400)).toBe('anchorage');
    for (const b of Object.values(ISLANDS)) expect(islandAt(b.quay.x, b.quay.z)).toBe(b.id);
  });

  it('moors at Meridian in deep water with the quay on the port side', () => {
    const m = ISLANDS.meridian.mooring;
    // Port (ship-local +x) at heading 0 is world +x: the rail lies right against the east arm's face.
    const portX = m.x + Math.cos(m.heading) * 4.6;
    expect(Math.abs(portX - MERIDIAN.harbor.eastArm.x0)).toBeLessThan(0.3);
    expect(meridianHeight(m.x, m.z)).toBeLessThan(-4);
  });

  it('eases the light from Anchorage’s afternoon to Meridian’s golden hour on the passage', () => {
    const sky = { hours: 0, azimuth: 0 };
    passageSky(0, 0, sky);
    expect(sky).toEqual(ISLANDS.anchorage.sky);
    passageSky(MERIDIAN.center.x, MERIDIAN.center.z, sky);
    expect(sky.hours).toBeCloseTo(ISLANDS.meridian.sky.hours, 6);
    expect(sky.azimuth).toBeCloseTo(ISLANDS.meridian.sky.azimuth, 6);
    passageSky(450, -450, sky);
    expect(sky.hours).toBeGreaterThan(ISLANDS.anchorage.sky.hours);
    expect(sky.hours).toBeLessThan(ISLANDS.meridian.sky.hours);
  });

  it('holds Thousand-Bough’s dusk to the "next morning" cut, then Keelhaven’s morning', () => {
    expect(nextMorningFrom('thousand-bough')).toBe('keelhaven');
    expect(nextMorningFrom('keelhaven')).toBeNull();
    const tb = ISLANDS['thousand-bough'];
    const kh = ISLANDS.keelhaven;
    const sky = { hours: 0, azimuth: 0 };
    // Half way across, and close in to Keelhaven: no sky runs back through the afternoon.
    for (const t of [0.5, 0.8]) {
      const x = tb.center.x + (kh.center.x - tb.center.x) * t;
      const z = tb.center.z + (kh.center.z - tb.center.z) * t;
      passageSky(x, z, sky, { hold: 'thousand-bough', skip: 'keelhaven' });
      expect(sky).toEqual(tb.sky);
      passageSky(x, z, sky, { hold: 'keelhaven', skip: 'thousand-bough' });
      expect(sky).toEqual(kh.sky);
    }
  });

  it('passes the night at sea under a dim veil, the sun setting and rising, never a black frame', () => {
    const tb = ISLANDS['thousand-bough'].sky;
    const kh = ISLANDS.keelhaven.sky;
    const sky = { hours: 0, azimuth: 0 };
    let most = 0;
    let lastHours = tb.hours;
    let wrapped = false;
    for (let t = 0; t <= nightAtSeaSeconds + 0.05; t += 1 / 30) {
      const veil = nightAtSea(t, tb, kh, sky);
      most = Math.max(most, veil);
      expect(veil).toBeLessThan(0.8);
      // Time only runs forward (through midnight once).
      if (sky.hours < lastHours - 1e-9) {
        expect(wrapped).toBe(false);
        expect(veil).toBeGreaterThan(0.7);
        wrapped = true;
      }
      lastHours = sky.hours;
    }
    expect(most).toBeGreaterThan(0.6);
    expect(wrapped).toBe(true);
    expect(nightAtSea(nightAtSeaSeconds, tb, kh, sky)).toBe(0);
    expect(sky).toEqual(kh);
  });
});

describe('Meridian tracker', () => {
  it('lists the chapter in order with the first unfinished step active', () => {
    const fresh = meridianTracker({});
    expect(fresh.island).toBe('Port Meridian');
    expect(fresh.tasks.map((t) => t.id)).toEqual(MERIDIAN_QUESTS.filter((q) => !q.optional).map((q) => q.id));
    expect(fresh.tasks[0]!.status).toBe('active');
    expect(fresh.tasks.slice(1).every((t) => t.status === 'upcoming')).toBe(true);
    const later = meridianTracker({ 'Q1.1': 'done', 'Q1.2': 'done' });
    expect(later.tasks.map((t) => t.status).slice(0, 3)).toEqual(['done', 'done', 'active']);
  });
});
