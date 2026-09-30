import { describe, expect, it } from 'vitest';
import { ATLAS_EYES, ATLAS_SWATCHES, NPC_PALETTES } from './npc-palettes';
import { CHARACTER_BODIES, PLAYER_BODIES, type NpcId } from './types';

describe('NPC palettes', () => {
  const npcBodies = CHARACTER_BODIES.filter(
    (body): body is NpcId => !(PLAYER_BODIES as readonly string[]).includes(body),
  );
  const meridianBodies = [
    'tobias',
    'mina',
    'anders',
    'rhea',
    'oren',
    'pell',
    'admiral',
    'mer_fisher',
    'mer_matron',
    'mer_vendor',
    'mer_kid_a',
    'mer_kid_b',
    'mer_guard',
  ] as const;

  it('uses the dedicated atlas eye cell and no clothing slot for each family', () => {
    for (const [family, eye] of Object.entries(ATLAS_EYES)) {
      const swatches = ATLAS_SWATCHES[family as keyof typeof ATLAS_SWATCHES];
      expect(swatches.eyes, family).toContainEqual(eye);
      const nonEyeSlots = Object.entries(swatches)
        .filter(([slot]) => slot !== 'eyes')
        .flatMap(([, cells]) => cells);
      expect(nonEyeSlots, family).not.toContainEqual(eye);
    }
  });

  it('has a palette for every NPC body', () => {
    for (const body of npcBodies) expect(NPC_PALETTES[body], body).toBeDefined();
  });

  it('keeps eye colours distinct from skin, hair and trousers', () => {
    for (const [body, palette] of Object.entries(NPC_PALETTES)) {
      expect(palette.eyes, `${body} eyes vs skin`).not.toBe(palette.skin);
      expect(palette.eyes, `${body} eyes vs hair`).not.toBe(palette.hair);
      expect(palette.eyes, `${body} eyes vs trousers`).not.toBe(palette.trousers);
    }
  });

  it('gives the Meridian cast unique palette signatures', () => {
    const signatures = new Set(meridianBodies.map((body) => JSON.stringify(NPC_PALETTES[body])));
    expect(signatures.size).toBe(meridianBodies.length);
  });
});
