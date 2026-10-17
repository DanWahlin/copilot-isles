import type { ScriptStep } from './script';

/**
 * NPC beats (docs/specs/COURSE-PACKS.md §9, `quests/<island>.json` → `beats`): which script or line
 * each NPC offers for the quest state, as data. The first row for the NPC whose `when` holds wins;
 * no row means no beat (the NPC barks instead).
 */

/** A step a quest must (or mustn't) be at: a step name, `null` for not started, or a list of them. */
export type StepIs = string | null | readonly (string | null)[];

/** One condition on a quest: it is at one of these steps, or `{ "not": … }` it isn't. */
export type QuestCond = StepIs | { not: StepIs };

export interface Beat {
  /** The NPC (or NPCs) the row is for. */
  npc: string | readonly string[];
  /**
   * Every condition must hold: quest id → its step. A key starting with `$` is a session flag the
   * island passes in (Meridian's `$lettersFiled`), compared exactly.
   */
  when?: Readonly<Record<string, QuestCond | boolean>>;
  /** Plays a named script of the island. */
  script?: string;
  /** Plays one voiced line. */
  say?: string;
  /** Nothing to offer (the NPC barks instead). */
  none?: true;
}

export type BeatFlags = Readonly<Record<string, boolean | undefined>>;

const isAt = (step: string | undefined, want: StepIs): boolean =>
  Array.isArray(want) ? want.some((w) => isAt(step, w as string | null)) : (step ?? null) === want;

function holds(
  q: Readonly<Record<string, string>>,
  key: string,
  cond: QuestCond | boolean,
  flags: BeatFlags,
): boolean {
  if (key.startsWith('$')) return flags[key.slice(1)] === cond;
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond))
    return !isAt(q[key], (cond as { not: StepIs }).not);
  return isAt(q[key], cond as StepIs);
}

/** The NPC's beat for this quest state, or null. */
export function pickBeat(
  beats: readonly Beat[],
  npc: string,
  q: Readonly<Record<string, string>>,
  flags: BeatFlags = {},
): Beat | null {
  for (const b of beats) {
    const who = typeof b.npc === 'string' ? b.npc === npc : b.npc.includes(npc);
    if (!who) continue;
    if (Object.entries(b.when ?? {}).every(([k, c]) => holds(q, k, c, flags))) return b;
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
