import type { HintTier, Puzzle, PuzzleHost } from './types';

export const BARD_ID = 'Q0.9.bard';
const QUEST = 'Q0.9';

/** Where Lyra sits and where you stand to talk to her (the hammock site's anchors). */
export interface BardSite {
  readonly seat: { x: number; y: number; z: number; heading: number };
  readonly spot: { x: number; y: number; z: number; heading: number };
}

/** Strums carry this far (metres) and come every few seconds while you're in earshot. */
const EARSHOT = 34;
const STRUM_MIN = 7;
const STRUM_SPREAD = 6;

/**
 * Lyra's soundcheck (POC §4.4, Q0.9, optional): once your first prompt's gone to the crew, lute
 * music drifts up from the lagoon. The conversation itself is Lyra's script in cove-quests.ts; this
 * plays her strums, announces the quest when it starts, and gives Wingman something to say.
 */
export function createBard(host: PuzzleHost, site: BardSite, talking: () => boolean): Puzzle {
  const step = () => host.quests()[QUEST];
  let seen = step();
  let announce = false;
  let strumIn = 2;
  let strums = 0;
  const near = (r: number) => Math.hypot(host.player.x - site.seat.x, host.player.z - site.seat.z) < r;

  return {
    id: BARD_ID,
    engaged: () => step() === 'start' && near(16),
    hintKey: () => step() ?? '-',
    hint(tier: HintTier) {
      if (step() !== 'start') return null;
      if (tier === 1)
        return 'Hear that lute? Lyra the bard’s down on the lagoon beach, south of the village.';
      return 'Follow the music to the hammock on the lagoon beach and talk to Lyra. It’s optional, but she tells it well.';
    },
    update(dt: number) {
      const s = step();
      if (s !== seen) {
        if (s === 'start' && !seen) announce = true;
        seen = s;
      }
      if (announce && host.canAct()) {
        announce = false;
        host.hud.toast('Lute music’s drifting up from the lagoon. Lyra the bard has a song for you.', 5);
      }
      if ((strumIn -= dt) > 0) return;
      strumIn = STRUM_MIN + Math.random() * STRUM_SPREAD;
      if (!near(EARSHOT) || talking()) return;
      strums++;
      host.audio?.sfx.oneShot('lute_strum', { x: site.seat.x, y: site.seat.y + 0.8, z: site.seat.z }, 0.7);
    },
    debug: {
      state: () => ({ quest: step() ?? null, strums }),
      seat: () => ({ ...site.seat }),
      spot: () => ({ ...site.spot }),
    },
    dispose() {},
  };
}
