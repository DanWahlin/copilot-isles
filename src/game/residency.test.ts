import { describe, expect, it } from 'vitest';
import type { IslandId } from './islands';
import { Residency, type ResidencyInput } from './residency';
import type { StreamState } from '../world/stream-lifecycle';

const RULES = [
  { id: 'meridian' as const, x: 850, z: -850, load: 900, unload: 1150 },
  { id: 'thousand-bough' as const, x: 2050, z: -1500, load: 1100, unload: 1350 },
];

function world(states: Partial<Record<IslandId, StreamState>> = {}) {
  const s: Record<string, StreamState> = { meridian: 'absent', 'thousand-bough': 'absent', ...states };
  const input = (o: Partial<ResidencyInput>): ResidencyInput => ({
    now: 0,
    x: 0,
    z: 0,
    on: 'anchorage',
    target: null,
    busy: false,
    state: (id) => s[id] ?? 'absent',
    held: () => false,
    ...o,
  });
  return { s, input };
}

describe('Residency', () => {
  it('streams in the island you sail to at low priority, and one in range at once', () => {
    const r = new Residency(RULES);
    const { input } = world();
    const sailing = r.update(input({ target: 'meridian' }));
    expect(sailing.load).toEqual([{ id: 'meridian', priority: 'low' }]);
    expect(sailing.unload).toEqual([]);
    const near = r.update(input({ x: 300, z: -300 }));
    expect(near.load).toEqual([{ id: 'meridian', priority: 'auto' }]);
    // Ashore at Anchorage with nothing near, nothing loads.
    expect(r.update(input({})).load).toEqual([]);
  });

  it("frees an island you've left once you're past its range for long enough", () => {
    const r = new Residency(RULES, 20);
    const { input } = world({ meridian: 'resident' });
    // On Meridian: wanted.
    r.update(input({ now: 0, x: 850, z: -850, on: 'meridian' }));
    // Back home at Anchorage's harbour (1360 m away): not yet, then after 20 s away.
    expect(r.update(input({ now: 5, x: -110, z: -115 })).unload).toEqual([]);
    expect(r.update(input({ now: 19, x: -110, z: -115 })).unload).toEqual([]);
    expect(r.update(input({ now: 21, x: -110, z: -115 })).unload).toEqual(['meridian']);
  });

  it('keeps an island inside its unload range (hysteresis) and the one you sail to', () => {
    const r = new Residency(RULES, 1);
    const { input } = world({ meridian: 'resident', 'thousand-bough': 'resident' });
    r.update(input({ now: 0, x: 850, z: -850, on: 'meridian' }));
    // Anchorage's east beach, 1090 m out: past load range but inside unload range.
    expect(r.update(input({ now: 10, x: 170, z: 0 })).unload).toEqual(['thousand-bough']);
    expect(r.update(input({ now: 30, x: 170, z: 0, target: 'thousand-bough' })).unload).toEqual([]);
  });

  it('never frees while the world is busy, warming, or still streaming', () => {
    const r = new Residency(RULES, 1);
    const { s, input } = world({ meridian: 'resident' });
    r.update(input({ now: 0, x: 850, z: -850, on: 'meridian' }));
    expect(r.update(input({ now: 10, busy: true })).unload).toEqual([]);
    expect(r.update(input({ now: 10, held: () => true })).unload).toEqual([]);
    s.meridian = 'loading';
    expect(r.update(input({ now: 10 })).unload).toEqual([]);
    s.meridian = 'resident';
    expect(r.update(input({ now: 10 })).unload).toEqual(['meridian']);
  });

  it('streams an island back in when you return while it frees, and counts a save there from now', () => {
    const r = new Residency(RULES, 20);
    const { input } = world({ 'thousand-bough': 'unloading' });
    expect(r.update(input({ on: 'thousand-bough', x: 2000, z: -1500 })).load).toEqual([
      { id: 'thousand-bough', priority: 'auto' },
    ]);
    // A save on Thousand-Bough that's never been wanted this voyage, seen from Anchorage: not at once.
    const fresh = new Residency(RULES, 20);
    const w = world({ 'thousand-bough': 'resident' });
    expect(fresh.update(w.input({ now: 100 })).unload).toEqual([]);
    expect(fresh.update(w.input({ now: 121 })).unload).toEqual(['thousand-bough']);
  });
});
