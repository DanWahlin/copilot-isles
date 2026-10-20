import type { ScriptStep } from './script';
import { whenHolds, type StoryFlags, type When } from './story';

/**
 * NPC beats (docs/specs/COURSE-PACKS.md §9, `quests/<island>.json` → `beats`): which script or line
 * each NPC offers for the quest state, as data. The first row for the NPC whose `when` holds wins;
 * no row means no beat (the NPC barks instead). A row's `when` is the story's (src/game/story.ts).
 */

export interface Beat {
  /** The NPC (or NPCs) the row is for. */
  npc: string | readonly string[];
  /** Every condition must hold: quest id → its step, or a `$flag` the island passes in. */
  when?: When;
  /** Plays a named script of the island. */
  script?: string;
  /** Plays one voiced line. */
  say?: string;
  /** Nothing to offer (the NPC barks instead). */
  none?: true;
}

/** The NPC's beat for this quest state, or null. */
export function pickBeat(
  beats: readonly Beat[],
  npc: string,
  q: Readonly<Record<string, string>>,
  flags: StoryFlags = {},
): Beat | null {
  for (const b of beats) {
    const who = typeof b.npc === 'string' ? b.npc === npc : b.npc.includes(npc);
    if (who && whenHolds(b.when, q, flags)) return b;
  }
  return null;
}

/** A beat's steps, with its scripts from `script(name)`; null when there's nothing to offer. */
export function beatSteps(
  beat: Beat | null,
  script: (name: string) => readonly ScriptStep[],
): { steps: readonly ScriptStep[] } | null {
  if (!beat || beat.none) return null;
  if (beat.say) return { steps: [{ say: beat.say }] };
  if (beat.script) return { steps: script(beat.script) };
  return null;
}
