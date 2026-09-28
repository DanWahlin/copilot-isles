import { describe, expect, it } from 'vitest';
import { ATLAS_EYES, ATLAS_SWATCHES } from './npc-palettes';

describe('NPC palettes', () => {
  it('never paints over an atlas family’s eye cell', () => {
    for (const [family, eye] of Object.entries(ATLAS_EYES)) {
      const painted = Object.values(ATLAS_SWATCHES[family as keyof typeof ATLAS_SWATCHES]).flat();
      expect(painted, family).not.toContainEqual(eye);
    }
  });
});
