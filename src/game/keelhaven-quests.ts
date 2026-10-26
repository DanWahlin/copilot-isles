import { courseScript, hasIslandQuests, islandQuests, onCourse } from '../course/active';
import { COURSE, islandHooks, onCourseSelected, welcomeLines } from '../course/catalog';
import { PUZZLE_ISLANDS, puzzleMaybe, voiceLinesOf } from '../course/puzzles';
import type { QuestDef, QuestTarget } from '../course/pack';
import { beatSteps, pickBeat, type Beat } from './beats';
import { firstOpenQuest, islandTasks, optionalTargets, startedQuests, type QuestTracker } from './quest-list';
import type { ScriptStep } from './script';
import type { QuestState } from './story';

/**
 * Keelhaven's quest line: the logic (which beat each NPC offers, the tracker, the compass). The
 * quests' text, the compass labels and every script are the course pack's
 * (`courses/<id>/quests/keelhaven.json`, docs/specs/COURSE-PACKS.md). For the Copilot app course
 * (Chapter 03: Development and GitHub Workflows), in the course's order
 * (docs/specs/ISLAND-03-keelhaven.md §4): the two loops (Lyra's re-take), the evidence (Hester's board),
 * a drydock's worktree (Dory), the Drydock Ring's two laps (Cass), the rubber duck (Barty), the
 * harbour's views (Stroud), the Lock Flight (Stroud, then Arlo), and the Gate Light Trial (Ottoline).
 */
const ISLAND = 'keelhaven';

/** The tracker's header: the island's name (the game's) and the course's chapter, goal and next. */
export let KEELHAVEN_TRACKER: { name: string; chapter: string; goal: string; next: string } = {
  name: 'Keelhaven',
  chapter: '',
  goal: '',
  next: '',
};

/** The island's quests, in story order (the course pack's). */
export let KEELHAVEN_QUESTS: readonly QuestDef[] = [];

/** Where the compass points for each step (interaction ids; the nearest usable wins). */
let TARGETS: Readonly<Record<string, QuestTarget>> = {};
let MAIN: readonly QuestDef[] = [];
let BEATS: readonly Beat[] = [];

const script = (name: string) => courseScript(ISLAND, name);

/** The step you're on: the first unfinished main quest in order. */
export function keelhavenCurrent(q: QuestState): { id: string; task: string; step: string } | null {
  return firstOpenQuest(MAIN, q);
}

export function keelhavenTarget(q: QuestState): QuestTarget | null {
  const c = keelhavenCurrent(q);
  return c ? (TARGETS[`${c.id}:${c.step}`] ?? null) : null;
}

/** The optional quests you've started: where the compass's dimmer marker points for each. */
export function keelhavenOptionalTargets(q: QuestState): QuestTarget[] {
  return optionalTargets(KEELHAVEN_QUESTS, TARGETS, q);
}

/** The task list: the chapter's steps in order (the optional ones once started). */
export function keelhavenTracker(q: QuestState): QuestTracker {
  const current = keelhavenCurrent(q);
  return {
    island: KEELHAVEN_TRACKER.name,
    chapter: KEELHAVEN_TRACKER.chapter,
    goal: KEELHAVEN_TRACKER.goal,
    next: KEELHAVEN_TRACKER.next,
    tasks: islandTasks(KEELHAVEN_QUESTS, q, current),
  };
}

/** The island's quests for the Logbook's quest tab, once started. */
export function keelhavenLog(q: QuestState): { id: string; title: string; detail: string; done: boolean }[] {
  return startedQuests(KEELHAVEN_QUESTS, q);
}

/** Juno and Wingman on the first landfall, once the flyover lands behind the captain. */
export let KEELHAVEN_WELCOME: readonly string[] = [];
onCourseSelected(() => {
  KEELHAVEN_WELCOME = [...(islandHooks(ISLAND).landing ?? []), ...welcomeLines(ISLAND, false)];
});

/**
 * The beat a Keelhaven NPC offers right now: the first of the island's beats
 * (`quests/keelhaven.json` → `beats`) that fits.
 */
export function keelhavenNpcScript(npc: string, q: QuestState): { steps: readonly ScriptStep[] } | null {
  return beatSteps(pickBeat(BEATS, npc, q), script);
}

/** A script of the island's by name (a circuit's close, the Seal's beat). */
export function keelhavenScript(name: string): readonly ScriptStep[] {
  return script(name);
}

/** Every voice line the island's scripts and set pieces play (tests check each is voiced). */
export let KEELHAVEN_LINES: readonly string[] = [];

onCourse(() => {
  // A course without Keelhaven: nothing to do there (the island isn't open in it).
  if (!hasIslandQuests(ISLAND)) {
    KEELHAVEN_QUESTS = [];
    MAIN = [];
    BEATS = [];
    TARGETS = {};
    KEELHAVEN_LINES = [];
    return;
  }
  const q = islandQuests(ISLAND);
  KEELHAVEN_TRACKER = { name: 'Keelhaven', ...q.tracker };
  KEELHAVEN_QUESTS = q.quests;
  MAIN = KEELHAVEN_QUESTS.filter((d) => !d.optional);
  BEATS = q.beats;
  TARGETS = q.targets;
  const hooks = islandHooks(ISLAND);
  const puzzles = Object.entries(PUZZLE_ISLANDS).flatMap(([name, island]) => {
    const p = island === ISLAND ? puzzleMaybe(name) : null;
    return p && !p.disabled ? voiceLinesOf(p) : [];
  });
  KEELHAVEN_LINES = [
    ...new Set([
      ...KEELHAVEN_WELCOME,
      hooks.tips.nav,
      hooks.tips.starfish,
      ...Object.values(COURSE.hooks.setPieces),
      ...BEATS.flatMap((b) => (b.say ? [b.say] : [])),
      ...puzzles,
      ...Object.values(q.scripts).flatMap((steps) =>
        steps.flatMap((step) => ('say' in step ? [step.say] : [])),
      ),
    ]),
  ].filter(Boolean);
});
