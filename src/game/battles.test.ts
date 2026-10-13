import { describe, expect, it } from 'vitest';
import { tierSettings } from '../engine/quality';
import type { WaveSampler } from '../world/contracts';
import { BATTLE_PLANS, Battle } from '../world/battle/battle';
import { createBrigantine } from '../world/ship';
import {
  BATTLE_CLEARANCE,
  PASSAGE_BATTLES,
  battleDestination,
  battleStarts,
  inIslandWaters,
  nearHarbour,
  openWater,
  pendingBattle,
  savedBattles,
} from './battles';
import { ISLANDS, type IslandBerth } from './islands';

const SEAL_0 = { 'Q0.10': 'done' };
const SEAL_1 = { 'Q0.10': 'done', 'Q1.8': 'done' };

/** The registry before Chapter 02's island lands: Anchorage and Port Meridian only. */
const BEFORE_BOUGH: Readonly<Record<string, IslandBerth>> = {
  anchorage: ISLANDS.anchorage,
  meridian: ISLANDS.meridian,
};
const BOUGH = Object.values(ISLANDS).find((i) => /thousand.?bough/i.test(i.name));

describe('passage battles', () => {
  it('match the battle plans, one per passage', () => {
    for (const b of PASSAGE_BATTLES) expect(BATTLE_PLANS[b.plan]!.id).toBe(b.id);
    expect(new Set(PASSAGE_BATTLES.map((b) => b.from)).size).toBe(PASSAGE_BATTLES.length);
  });

  it('wait for the Seal, and never come back once fought or skipped', () => {
    expect(pendingBattle('anchorage', {}, new Set(), ISLANDS)).toBeNull();
    expect(pendingBattle('anchorage', SEAL_0, new Set(), ISLANDS)?.id).toBe('passage-anchorage-meridian');
    expect(pendingBattle('anchorage', SEAL_0, new Set(['passage-anchorage-meridian']), ISLANDS)).toBeNull();
    // Not on the way home, and not when Port Meridian's berth isn't open.
    expect(pendingBattle('meridian', SEAL_0, new Set(), ISLANDS)).toBeNull();
    expect(pendingBattle('anchorage', SEAL_0, new Set(), ISLANDS, (id) => id !== 'meridian')).toBeNull();
  });

  it('holds battle 2 until Thousand-Bough Isle is in the island registry', () => {
    const battle2 = PASSAGE_BATTLES[1]!;
    expect(battleDestination(battle2, BEFORE_BOUGH)).toBeNull();
    expect(pendingBattle('meridian', SEAL_1, new Set(), BEFORE_BOUGH)).toBeNull();
    expect(BOUGH).toBeDefined();
    expect(battleDestination(battle2, ISLANDS)).toBe(BOUGH!.id);
    expect(pendingBattle('meridian', SEAL_1, new Set(), ISLANDS)?.id).toBe(battle2.id);
    // It needs the Seal of Meridian.
    expect(pendingBattle('meridian', SEAL_0, new Set(), ISLANDS)).toBeNull();
  });

  it('starts out on open water about halfway across, clear of both harbours', () => {
    const b = pendingBattle('anchorage', SEAL_0, new Set(), ISLANDS);
    const from = ISLANDS.anchorage.mooring;
    const to = ISLANDS.meridian.mooring;
    expect(battleStarts(b, from.x, from.z, ISLANDS)).toBe(false);
    expect(battleStarts(b, to.x, to.z, ISLANDS)).toBe(false);
    expect(battleStarts(null, 300, -410, ISLANDS)).toBe(false);
    // Somewhere on the straight passage it starts, and wherever it does the zone is open water.
    let first = -1;
    for (let k = 0; k <= 100; k++) {
      const x = from.x + ((to.x - from.x) * k) / 100;
      const z = from.z + ((to.z - from.z) * k) / 100;
      if (!battleStarts(b, x, z, ISLANDS)) continue;
      if (first < 0) first = k;
      expect(inIslandWaters(x, z, ISLANDS)).toBe(false);
      expect(openWater(x, z, ISLANDS, BATTLE_CLEARANCE)).toBe(true);
    }
    expect(first).toBeGreaterThan(25);
    expect(first).toBeLessThan(60);
  });

  it('starts battle 2 on the passage out of Port Meridian toward Thousand-Bough Isle', () => {
    const b = pendingBattle('meridian', SEAL_1, new Set(), ISLANDS);
    const from = ISLANDS.meridian.mooring;
    const to = BOUGH!.mooring;
    expect(battleStarts(b, from.x, from.z, ISLANDS)).toBe(false);
    expect(battleStarts(b, to.x, to.z, ISLANDS)).toBe(false);
    // Out of Port Meridian's harbour, east along its south coast, then up the lane to the wharf: the
    // lookout calls sails somewhere on the way, out on open water.
    const route = [from, { x: 760, z: -470 }, { x: 1460, z: -480 }, { x: 1500, z: -800 }, to];
    let starts = 0;
    for (let leg = 0; leg + 1 < route.length; leg++)
      for (let k = 0; k < 50; k++) {
        const a = route[leg]!;
        const c = route[leg + 1]!;
        const x = a.x + ((c.x - a.x) * k) / 50;
        const z = a.z + ((c.z - a.z) * k) / 50;
        if (!battleStarts(b, x, z, ISLANDS)) continue;
        starts++;
        expect(openWater(x, z, ISLANDS)).toBe(true);
      }
    expect(starts).toBeGreaterThan(0);
  });

  it('keeps the raiders out of every harbour', () => {
    for (const i of Object.values(ISLANDS)) expect(nearHarbour(i.mooring.x, i.mooring.z, ISLANDS)).toBe(true);
    // Where battle 1 starts is well clear of both harbours.
    expect(nearHarbour(300, -410, ISLANDS)).toBe(false);
  });

  it('reads old and hand-edited saves', () => {
    expect(savedBattles(undefined)).toEqual([]);
    expect(savedBattles('passage-anchorage-meridian')).toEqual([]);
    expect(savedBattles(['passage-anchorage-meridian', 3, 'passage-anchorage-meridian', null])).toEqual([
      'passage-anchorage-meridian',
    ]);
  });
});

describe('a battle out of the zone', () => {
  const flat: WaveSampler = { heightAt: () => 0 } as unknown as WaveSampler;
  const make = () => {
    const player = createBrigantine({ tier: 'low' });
    player.dynamics.reset(300, -410, 2.2);
    return new Battle({ tier: tierSettings('low'), waves: flat, player, plan: BATTLE_PLANS[0]!.waves });
  };

  it('rests when you sail into an island’s waters, and the same wave comes back out of the fog', () => {
    const battle = make();
    battle.start(0);
    expect(battle.phase).toBe('intro');
    battle.suspend(1);
    expect(battle.phase).toBe('idle');
    expect(battle.raiders().every((r) => r.state === 'idle')).toBe(true);
    battle.resume(2);
    expect(battle.phase).toBe('intro');
    expect(battle.wave).toBe(0);
    expect(battle.raiders().filter((r) => r.state === 'afloat').length).toBe(2);
    battle.dispose();
  });

  it('brings raiders out of the fog only on open water', () => {
    const player = createBrigantine({ tier: 'low' });
    player.dynamics.reset(0, 0, 0);
    // Open water only to the south (+z): every raider spawns there, whatever the wind says.
    const battle = new Battle({
      tier: tierSettings('low'),
      waves: flat,
      player,
      openWater: (_x, z) => z > 100,
    });
    battle.start(0);
    for (const r of battle.raiders()) if (r.state === 'afloat') expect(r.z).toBeGreaterThan(100);
    battle.dispose();
  });

  it('stages every pool and raider for the warm-up, then puts them back', () => {
    const battle = make();
    const ships = battle.ships().slice(1);
    const restore = battle.stageWarm();
    for (const s of ships) {
      let hidden = 0;
      s.group.traverse((o) => (hidden += o.visible ? 0 : 1));
      expect(hidden).toBe(0);
    }
    battle.group.traverse((o) => {
      const m = o as { count?: number };
      if (m.count !== undefined) expect(m.count).toBeGreaterThan(0);
    });
    restore();
    for (const s of ships) expect(s.group.visible).toBe(false);
    battle.dispose();
  });
});
