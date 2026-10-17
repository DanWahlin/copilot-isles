import { describe, expect, it } from 'vitest';
import { MERIDIAN, meridianHeight } from '../world/islands/meridian';
import { COVE } from '../world/layout';
import { ISLANDS, islandAt, passageSky } from './islands';
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
