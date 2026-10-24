import { describe, expect, it } from 'vitest';
import TOOLS from '../../tools/lib/islands.json';
import { islandAt } from '../game/islands';
import { CHART_ISLANDS } from '../opening/chart-map';
import { ARCHIPELAGO } from '../ui/chart/archipelago';
import { STARFISH } from '../world/starfish/spots';
import { HOME_ISLAND, ISLAND_IDS, ISLAND_LIST, STREAMED_ISLANDS } from './registry';

describe('the island registry', () => {
  it('has one home island (built with the world) and streams every other one', () => {
    expect(ISLAND_LIST.filter((e) => !e.stream).map((e) => e.id)).toEqual([HOME_ISLAND]);
    expect(STREAMED_ISLANDS.map((e) => e.id)).toEqual(ISLAND_IDS.filter((id) => id !== HOME_ISLAND));
  });

  it("keeps the tools' island list in step (ids, order, URL flags, names, home)", () => {
    expect(TOOLS.islands.map(({ id, flag, name, home }) => ({ id, flag, name, home }))).toEqual(
      ISLAND_LIST.map((e) => ({ id: e.id, flag: e.flag, name: e.name, home: e.id === HOME_ISLAND })),
    );
  });

  it('gives every island its chart place, its 3D chart miniature and its own URL flag', () => {
    for (const e of ISLAND_LIST) {
      expect(
        ARCHIPELAGO.some((a) => a.id === e.id),
        `${e.id} on the archipelago chart`,
      ).toBe(true);
      expect(
        CHART_ISLANDS.some((c) => c.id === e.id),
        `${e.id} on the 3D chart`,
      ).toBe(true);
    }
    expect(new Set(ISLAND_LIST.map((e) => e.flag)).size).toBe(ISLAND_LIST.length);
  });

  it('finds each island at its berth, and its starfish are its own', () => {
    for (const e of ISLAND_LIST) {
      expect(islandAt(e.quay.x, e.quay.z), `${e.id} quay`).toBe(e.id);
      expect(
        e.starfish.every((s) => s.island === e.id),
        `${e.id} starfish`,
      ).toBe(true);
    }
    expect(STARFISH.length).toBe(ISLAND_LIST.reduce((n, e) => n + e.starfish.length, 0));
  });

  it("orders each island's ranges: shown before it's freed, loaded before it's shown", () => {
    for (const e of ISLAND_LIST) {
      const r = e.ranges;
      expect(r.show, `${e.id} show < load`).toBeLessThan(r.load);
      expect(r.load, `${e.id} load < unload`).toBeLessThan(r.unload);
    }
  });

  it('loads each island as code of its own, with a stream for every streamed island', async () => {
    for (const e of ISLAND_LIST) {
      const code = await e.code();
      expect(!!code.stream, `${e.id} stream`).toBe(!!e.stream);
      expect(!!code.content, `${e.id} content`).toBe(!!e.stream);
      expect(code.quests.log({}), `${e.id} quest log`).toBeInstanceOf(Array);
    }
  });
});
