import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STARFISH, starfishOn, type StarfishIsland } from '../world/starfish/spots';
import { ISLAND_TIPS, TIP_SPOTS } from './island-tips';

const lines = new Map(
  (
    JSON.parse(readFileSync(join(__dirname, '../../tools/voice/lines.testcove.json'), 'utf8')) as {
      lines: { id: string; text: string }[];
    }
  ).lines.map((l) => [l.id, l.text]),
);
const manifest = new Set(
  (
    JSON.parse(readFileSync(join(__dirname, '../../public/voice/testcove/manifest.json'), 'utf8')) as {
      lines: { id: string }[];
    }
  ).lines.map((l) => l.id),
);
const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

describe('island tips', () => {
  const islands = [...new Set(STARFISH.map((s) => s.island))] as StarfishIsland[];

  it('every island with starfish has its tips, written and voiced', () => {
    for (const island of islands) {
      const tips = ISLAND_TIPS[island];
      expect(tips, island).toBeDefined();
      for (const id of [tips.nav, tips.starfish]) {
        expect(lines.has(id), id).toBe(true);
        expect(manifest.has(id), `${id} voiced`).toBe(true);
        expect(TIP_SPOTS[id]?.length, `${id} lights something`).toBeGreaterThan(0);
      }
    }
  });

  it('says how many starfish the island holds, and where to look', () => {
    for (const island of islands) {
      const text = lines.get(ISLAND_TIPS[island].starfish)!.toLowerCase();
      expect(text).toContain(`${WORDS[starfishOn(island).length]} starfish`);
      expect(text).toContain('top right');
      const nav = lines.get(ISLAND_TIPS[island].nav)!.toLowerCase();
      expect(nav).toContain('top left');
      expect(nav).toContain('compass');
    }
  });
});
