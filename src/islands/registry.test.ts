import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MUSIC_TRACKS } from '../audio/music/tracks';
import { MARKET_STALLS } from '../game/market/stalls';
import { ISLAND_FLORA_PALETTES } from '../world/islands/flora-palettes';
import { ISLAND_TERRAIN_REGIONS } from '../world/islands/terrain-regions';
import TOOLS from '../../tools/lib/islands.json';
import { GAME_PUZZLES, PUZZLE_ISLANDS, SHARED_PUZZLES } from '../course/puzzle-islands';
import { islandAt } from '../game/islands';
import { CHART_ISLANDS } from '../opening/chart-map';
import { ARCHIPELAGO } from '../ui/chart/archipelago';
import { STARFISH } from '../world/starfish/spots';
import { HOME_ISLAND, ISLAND_IDS, ISLAND_LIST, ISLANDS_IN_BUILD, STREAMED_ISLANDS } from './registry';

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

  it('puts every puzzle on an island in the registry, and names only real puzzles', () => {
    // The course pack split (src/course/split.ts) reads PUZZLE_ISLANDS in Node and in the Vite
    // config, without the world's code, so the list stays there; this keeps it on the registry's ids.
    for (const [puzzle, island] of Object.entries(PUZZLE_ISLANDS))
      expect(ISLAND_IDS as readonly string[], `${puzzle} on ${island}`).toContain(island);
    expect(Object.keys(PUZZLE_ISLANDS).sort()).toEqual(Object.keys(GAME_PUZZLES).sort());
    for (const p of SHARED_PUZZLES) expect(GAME_PUZZLES[p], p).toBeDefined();
  });

  it('loads each island as code of its own, with a stream for every streamed island', async () => {
    for (const e of ISLAND_LIST) {
      const code = await e.code();
      expect(!!code.stream, `${e.id} stream`).toBe(!!e.stream);
      expect(!!code.content, `${e.id} content`).toBe(!!e.stream);
      expect(code.quests.log({}), `${e.id} quest log`).toBeInstanceOf(Array);
    }
  });

  it('derives the shared tables from the entries, in voyage order', () => {
    expect(ISLAND_TERRAIN_REGIONS).toEqual(
      [...ISLAND_LIST, ...ISLANDS_IN_BUILD].map((e) => e.terrainRegions),
    );
    expect(ISLAND_FLORA_PALETTES).toEqual([
      ...ISLAND_LIST.map((e) => e.floraPalette),
      ...ISLANDS_IN_BUILD.flatMap((e) => (e.floraPalette ? [e.floraPalette] : [])),
    ]);
    for (const e of ISLAND_LIST) expect(MUSIC_TRACKS[e.music], e.id).toBe(e.theme);
    expect(MARKET_STALLS.map((m) => m.island)).toEqual(ISLAND_LIST.filter((e) => e.market).map((e) => e.id));
  });

  it('imports only data: no three.js objects and no world code (the course split reads it in Node)', () => {
    // Follows the registry's runtime imports (not `import type`, not the dynamic `code` and `chart`).
    const seen = new Set<string>();
    const bare = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gms)) {
        const spec = m[1]!;
        if (!spec.startsWith('.')) {
          bare.add(spec);
          continue;
        }
        const base = resolve(dirname(file), spec);
        const hit = ['', '.ts', '.tsx', '/index.ts']
          .map((x) => base + x)
          .find((f) => existsSync(f) && statSync(f).isFile());
        if (hit) walk(hit);
      }
    };
    walk(resolve(__dirname, 'registry.ts'));
    const files = [...seen].map((f) => relative(resolve(__dirname, '../..'), f));
    expect(
      [...bare].filter((b) => b !== 'three/tsl'),
      'bare imports',
    ).toEqual([]);
    expect(
      files.filter((f) => /terrain-material|world\/islands\/meridian\.ts$|stream|session|cove-scene/.test(f)),
    ).toEqual([]);
  });
});
