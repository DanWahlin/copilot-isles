import { coursePack, hasActiveCourse } from '../course/active';
import { COURSE } from '../course/catalog';

/**
 * The quest skeleton (docs/specs/COURSE-PACKS.md, step 4): the game asks a course's story for named
 * conditions and events, never for a quest id. Each island's `quests/<island>.json` → `story` maps
 * the names to its own quests (`conditions`: name → a `When`; `events`: name → rules that set
 * steps), so a course with other quest ids drives the same game. The same `When` picks NPC beats
 * (src/game/beats.ts) and the course's save migrations (`course.json` → `migrations.quests`).
 */

/** A step a quest must (or mustn't) be at: a step name, `null` for not started, or a list of them. */
export type StepIs = string | null | readonly (string | null)[];

/** One condition on a quest: it is at one of these steps, or `{ "not": … }` it isn't. */
export type QuestCond = StepIs | { not: StepIs };

/**
 * Every condition must hold: quest id → its step. A key starting with `$` is a flag the game passes
 * in (Meridian's `$lettersFiled`), compared exactly.
 */
export type When = Readonly<Record<string, QuestCond | boolean>>;

export type StoryFlags = Readonly<Record<string, boolean | undefined>>;

export type QuestState = Readonly<Record<string, string>>;

/** A rule: when its `when` holds (always, without one), set each quest to its step. */
export interface StoryRule {
  when?: When;
  set: Readonly<Record<string, string>>;
}

/** `quests/<island>.json` → `story`: the island's named conditions and events. */
export interface IslandStory {
  conditions: Readonly<Record<string, When>>;
  /** Rules applied in order, each read against the steps the rules before it set. */
  events: Readonly<Record<string, readonly StoryRule[]>>;
}

/**
 * The conditions the game asks each island's story for, named by what the game does with them. A
 * course that uses an island defines every one of them (the content check holds it to that).
 * - `firstVisit`: Wingman's (and Juno's) first welcome there (on Anchorage, else his welcome back).
 * - `sealed`: the island's Seal is won: its lighthouse lights, the sea battle on the passage out
 *   waits, First Words' reply clears (Anchorage), the compass and Thousand-Bough open (Meridian),
 *   the lantern house's lever and the seal cascade (Thousand-Bough).
 * - `trialStarted` (Anchorage): Nell waits at the pier head for the Trial.
 * - `gangwayDown` (Anchorage): the ship's gangway comes down when you're ashore and she's moored.
 * - `gondolaOpen`, `basketOpen` (Thousand-Bough): the gondola's bell and the Sky Basket work.
 * - `secondBridge`: the Spire's second bridge and its previews are open, and the island's extras
 *   move on.
 * - `practiceStarted`: Rook's practice terminal shows its readout.
 * - `skipCrownView`: the crown's view (a cue) no longer plays.
 */
export const STORY_CONDITIONS = {
  anchorage: ['firstVisit', 'trialStarted', 'sealed', 'gangwayDown'],
  meridian: ['firstVisit', 'sealed'],
  'thousand-bough': [
    'firstVisit',
    'gondolaOpen',
    'secondBridge',
    'practiceStarted',
    'basketOpen',
    'skipCrownView',
    'sealed',
  ],
} as const;

/**
 * The events the game tells each island's story about:
 * - `landed` (Anchorage): a session starts (the voyage's first step).
 * - `setSail` (Anchorage): you take the helm.
 */
export const STORY_EVENTS = {
  anchorage: ['landed', 'setSail'],
  meridian: [],
  'thousand-bough': [],
} as const satisfies Readonly<Record<StoryIsland, readonly string[]>>;

export type StoryIsland = keyof typeof STORY_CONDITIONS;
export type StoryCondition<I extends StoryIsland> = (typeof STORY_CONDITIONS)[I][number];
export type StoryEvent<I extends StoryIsland> = (typeof STORY_EVENTS)[I][number];

const NO_FLAGS: StoryFlags = {};

function isAt(step: string | undefined, want: StepIs): boolean {
  if (!Array.isArray(want)) return (step ?? null) === want;
  for (let i = 0; i < want.length; i++) if ((step ?? null) === want[i]) return true;
  return false;
}

/** One condition of a `When`, read once: a quest (or a `$flag`, its name without the `$`) and its test. */
interface Clause {
  id: string;
  flag: boolean;
  cond: QuestCond | boolean;
}

const clauses = new WeakMap<When, readonly Clause[]>();

function clausesOf(when: When): readonly Clause[] {
  let c = clauses.get(when);
  if (!c) {
    c = Object.entries(when).map(([key, cond]) =>
      key.startsWith('$') ? { id: key.slice(1), flag: true, cond } : { id: key, flag: false, cond },
    );
    clauses.set(when, c);
  }
  return c;
}

function holds(q: QuestState, c: Clause, flags: StoryFlags): boolean {
  if (c.flag) return flags[c.id] === c.cond;
  const cond = c.cond as QuestCond;
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond))
    return !isAt(q[c.id], (cond as { not: StepIs }).not);
  return isAt(q[c.id], cond as StepIs);
}

/**
 * Whether every condition of `when` holds (an absent `when` always does). After its first read of a
 * `when` it allocates nothing, so per-frame checks can call it.
 */
export function whenHolds(when: When | undefined, q: QuestState, flags: StoryFlags = NO_FLAGS): boolean {
  if (!when) return true;
  const c = clausesOf(when);
  for (let i = 0; i < c.length; i++) if (!holds(q, c[i]!, flags)) return false;
  return true;
}

/** Applies rules in order, each read against the steps the ones before it set; `set` saves each step. */
export function applyRules(
  rules: readonly StoryRule[],
  quests: QuestState,
  set: (id: string, step: string) => void,
  flags: StoryFlags = NO_FLAGS,
): void {
  const q: Record<string, string> = { ...quests };
  for (const r of rules) {
    if (!whenHolds(r.when, q, flags)) continue;
    for (const id in r.set) {
      q[id] = r.set[id]!;
      set(id, r.set[id]!);
    }
  }
}

/** An island's story in the active course (none for an island the course doesn't use). */
export function storyOf(island: string): IslandStory | undefined {
  return hasActiveCourse() ? coursePack().quests[island]?.story : undefined;
}

/** Whether one of the island's story conditions holds (false in a course without the island). */
export function storyHolds<I extends StoryIsland>(
  island: I,
  name: StoryCondition<I>,
  quests: QuestState,
  flags: StoryFlags = NO_FLAGS,
): boolean {
  const when = storyOf(island)?.conditions[name];
  return !!when && whenHolds(when, quests, flags);
}

/** Tells the island's story an event happened: its rules set the steps they name (through `set`). */
export function storyEvent<I extends StoryIsland>(
  island: I,
  name: StoryEvent<I>,
  quests: QuestState,
  set: (id: string, step: string) => void,
  flags: StoryFlags = NO_FLAGS,
): void {
  const rules = storyOf(island)?.events[name];
  if (rules) applyRules(rules, quests, set, flags);
}

/**
 * Brings an older save in line with today's quest line: the course's `migrations.quests` rules
 * (each sets a step only if it's missing or stale, so running them twice changes nothing). Flags:
 * `workflowsOn`, whether the mill's gate lever was pulled (undefined without a save).
 */
export function migrateQuests(
  saved: QuestState,
  set: (id: string, step: string) => void,
  flags: StoryFlags = NO_FLAGS,
): void {
  const rules = COURSE.migrations?.quests;
  if (rules) applyRules(rules, saved, set, flags);
}
