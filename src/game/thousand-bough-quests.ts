import { courseScript, hasIslandQuests, islandQuests, onCourse } from '../course/active';
import { COURSE, islandHooks, onCourseSelected, welcomeLines } from '../course/catalog';
import { PUZZLE_ISLANDS, puzzleMaybe, voiceLinesOf } from '../course/puzzles';
import type { QuestDef, QuestTarget } from '../course/pack';
import { beatSteps, pickBeat, type Beat } from './beats';
import { firstOpenQuest, islandTasks, optionalTargets, startedQuests, type QuestTracker } from './quest-list';
import type { ScriptStep } from './script';
import type { QuestState } from './story';

/**
 * Thousand-Bough Isle's quest line: the logic (which beat each NPC offers, the tracker, the compass).
 * The quests' text, the compass labels and every script are the course pack's
 * (`courses/<id>/quests/thousand-bough.json`, docs/specs/COURSE-PACKS.md). For the Copilot app course
 * (Chapter 02: Sessions, Worktrees, and Context), in the course's order
 * (docs/specs/ISLAND-02-thousand-bough.md §4): what a session holds (Tamsin), the recording booths
 * (Lyra), worktrees and why (Saffi), where a session runs (Oak), parallel crews and ports (Fen's
 * Channel Routing), context syntax (Ines's flags), the first exercise (Rook), the second (Pip), then
 * the Canopy Trial (the Elder). Each stop is what you'll do → where it is in the app → one check → a
 * Logbook page → who's next (the compass points there).
 */
const ISLAND = 'thousand-bough';

/**
 * The island this quest line belongs to, for the tracker's header (its name is the game's). `nextSail`
 * replaces `next` once the island after it is open (src/game/thousand-bough-island.ts).
 */
export let THOUSAND_BOUGH_ISLAND: {
  name: string;
  chapter: string;
  goal: string;
  next: string;
  nextSail?: string;
} = {
  name: 'Thousand-Bough Isle',
  chapter: '',
  goal: '',
  next: '',
};

/** The island's quests, in story order (the course pack's). */
export let THOUSAND_BOUGH_QUESTS: readonly QuestDef[] = [];

/** Where the compass points for each step (interaction ids; the nearest usable wins). */
export let THOUSAND_BOUGH_TARGETS: Readonly<Record<string, QuestTarget>> = {};

/** Fen's close once the twist's settled (played at once by the puzzle, or when you talk to him). */
export let FEN_SOLVED: readonly ScriptStep[] = [];

let MAIN: readonly QuestDef[] = [];
let BEATS: readonly Beat[] = [];

const script = (name: string) => courseScript(ISLAND, name);

/** The step you're on: the first unfinished main quest in order. */
export function thousandBoughCurrent(q: QuestState): { id: string; task: string; step: string } | null {
  return firstOpenQuest(MAIN, q);
}

export function thousandBoughTarget(q: QuestState): QuestTarget | null {
  const c = thousandBoughCurrent(q);
  return c ? (THOUSAND_BOUGH_TARGETS[`${c.id}:${c.step}`] ?? null) : null;
}

/** The optional quests you've started: where the compass's dimmer marker points for each. */
export function thousandBoughOptionalTargets(q: QuestState): QuestTarget[] {
  return optionalTargets(THOUSAND_BOUGH_QUESTS, THOUSAND_BOUGH_TARGETS, q);
}

/** The task list: the chapter's steps in order (the optional one once started). */
export function thousandBoughTracker(q: QuestState): QuestTracker {
  const current = thousandBoughCurrent(q);
  return {
    island: THOUSAND_BOUGH_ISLAND.name,
    chapter: THOUSAND_BOUGH_ISLAND.chapter,
    goal: THOUSAND_BOUGH_ISLAND.goal,
    next: THOUSAND_BOUGH_ISLAND.next,
    tasks: islandTasks(THOUSAND_BOUGH_QUESTS, q, current),
  };
}

/** The island's quests for the Logbook's quest tab, once started. */
export function thousandBoughLog(
  q: QuestState,
): { id: string; title: string; detail: string; done: boolean }[] {
  return startedQuests(THOUSAND_BOUGH_QUESTS, q);
}

/** Juno and Wingman on the first landfall, once the flyover lands behind the captain. */
export let THOUSAND_BOUGH_WELCOME: readonly string[] = [];
onCourseSelected(() => {
  THOUSAND_BOUGH_WELCOME = [
    ...(islandHooks('thousand-bough').landing ?? []),
    ...welcomeLines('thousand-bough', false),
  ];
});

/**
 * The beat a Thousand-Bough NPC offers right now: the first of the island's beats
 * (`quests/thousand-bough.json` → `beats`) that fits. NPCs ahead of the story point you back to
 * whoever's next; everyone's got a line once their part's done.
 */
export function thousandBoughNpcScript(npc: string, q: QuestState): { steps: readonly ScriptStep[] } | null {
  return beatSteps(pickBeat(BEATS, npc, q), script);
}

/** Every voice line the island's scripts and set pieces play (tests check each is voiced). */
export let THOUSAND_BOUGH_LINES: readonly string[] = [];

onCourse(() => {
  // A course without Thousand-Bough: nothing to do there (the island isn't open in it).
  if (!hasIslandQuests(ISLAND)) {
    THOUSAND_BOUGH_QUESTS = [];
    MAIN = [];
    BEATS = [];
    THOUSAND_BOUGH_TARGETS = {};
    FEN_SOLVED = [];
    THOUSAND_BOUGH_LINES = [];
    return;
  }
  const q = islandQuests(ISLAND);
  THOUSAND_BOUGH_ISLAND = { name: 'Thousand-Bough Isle', ...q.tracker };
  THOUSAND_BOUGH_QUESTS = q.quests;
  MAIN = THOUSAND_BOUGH_QUESTS.filter((d) => !d.optional);
  BEATS = q.beats;
  THOUSAND_BOUGH_TARGETS = q.targets;
  FEN_SOLVED = script('fen.solved');
  // The welcome and tips, the set pieces' lines, the beats' lines, the island's puzzles' lines and
  // every script's, from the course pack.
  const hooks = islandHooks(ISLAND);
  const puzzles = Object.entries(PUZZLE_ISLANDS).flatMap(([name, island]) => {
    const p = island === ISLAND ? puzzleMaybe(name) : null;
    return p && !p.disabled ? voiceLinesOf(p) : [];
  });
  THOUSAND_BOUGH_LINES = [
    ...new Set([
      ...THOUSAND_BOUGH_WELCOME,
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
