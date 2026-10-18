import { courseScript, hasIslandQuests, islandQuests, onCourse } from '../course/active';
import { islandHooks, onCourseSelected, welcomeLines } from '../course/catalog';
import type { QuestDef, QuestTarget } from '../course/pack';
import { beatSteps, pickBeat, type Beat } from './beats';
import type { QuestState, QuestTracker, TrackerStatus } from './cove-quests';
import type { ScriptStep } from './script';

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

/** The island this quest line belongs to, for the tracker's header (its name is the game's). */
export let THOUSAND_BOUGH_ISLAND = { name: 'Thousand-Bough Isle', chapter: '', goal: '', next: '' };

/** The island's quests, in story order (the course pack's). */
export let THOUSAND_BOUGH_QUESTS: readonly QuestDef[] = [];

/** Where the compass points for each step (interaction ids; the nearest usable wins). */
export let THOUSAND_BOUGH_TARGETS: Readonly<Record<string, QuestTarget>> = {};

/** Fen's close once the twist's settled (played at once by the puzzle, or when you talk to him). */
export let FEN_SOLVED: readonly ScriptStep[] = [];

let MAIN: readonly QuestDef[] = [];
let BEATS: readonly Beat[] = [];

const script = (name: string) => courseScript(ISLAND, name);

const done = (q: QuestState, id: string) => q[id] === 'done';

/** The step you're on: the first unfinished main quest in order. */
export function thousandBoughCurrent(q: QuestState): { id: string; task: string; step: string } | null {
  const d = MAIN.find((c) => q[c.id] !== 'done');
  return d ? { id: d.id, task: d.task, step: q[d.id] ?? 'start' } : null;
}

export function thousandBoughTarget(q: QuestState): QuestTarget | null {
  const c = thousandBoughCurrent(q);
  return c ? (THOUSAND_BOUGH_TARGETS[`${c.id}:${c.step}`] ?? null) : null;
}

/** The task list: the chapter's steps in order (the optional one once started). */
export function thousandBoughTracker(q: QuestState): QuestTracker {
  const current = thousandBoughCurrent(q);
  return {
    island: THOUSAND_BOUGH_ISLAND.name,
    chapter: THOUSAND_BOUGH_ISLAND.chapter,
    goal: THOUSAND_BOUGH_ISLAND.goal,
    next: THOUSAND_BOUGH_ISLAND.next,
    tasks: THOUSAND_BOUGH_QUESTS.filter((d) => !d.optional || q[d.id]).map((d) => {
      const optionalStep = d.optional ? q[d.id] : undefined;
      const status: TrackerStatus = done(q, d.id)
        ? 'done'
        : d.id === current?.id || optionalStep
          ? 'active'
          : 'upcoming';
      const step = d.optional ? optionalStep : current?.step;
      const detail = status === 'active' && step ? (d.steps[step] ?? '') : '';
      return { id: d.id, title: d.title, task: d.task, detail, status, optional: !!d.optional, link: d.link };
    }),
  };
}

/** The island's quests for the Logbook's quest tab, once started. */
export function thousandBoughLog(
  q: QuestState,
): { id: string; title: string; detail: string; done: boolean }[] {
  return THOUSAND_BOUGH_QUESTS.filter((d) => q[d.id]).map((d) => ({
    id: d.id,
    title: d.title,
    detail: d.steps[q[d.id]!] ?? '',
    done: q[d.id] === 'done',
  }));
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

/** The voice lines the island's set pieces and NPC switch play (besides its scripts' and welcome's). */
const SET_PIECE_LINES: readonly string[] = [
  'wingman.tb.03',
  'wingman.starfish.thousand-bough',
  'wingman.tb.ports',
  'tb.tamsin.done',
  'tb.lyra.wait',
  'tb.lyra.done',
  'tb.saffi.wait',
  'tb.saffi.done',
  'tb.oak.wait',
  'tb.oak.done',
  'tb.oak.gondola',
  'tb.fen.wait',
  'tb.fen.channels',
  'tb.fen.done',
  'tb.fen.mixed',
  'tb.fen.mainhall',
  'tb.fen.wrongwheel',
  'tb.fen.deadend',
  'tb.fen.round1',
  'tb.fen.round2',
  'tb.fen.r3.intro',
  'tb.fen.ws.worktree',
  'tb.fen.ws.checkout',
  'tb.fen.ws.cloud',
  'tb.fen.round3',
  'tb.fen.twist.01',
  'tb.fen.twist.02',
  'tb.fen.twist.redig',
  'tb.fen.twist.port',
  'tb.fen.twist.close',
  'tb.fen.twist.share',
  'tb.ines.wait',
  'tb.ines.done',
  'tb.ines.order.1',
  'tb.ines.order.2',
  'tb.ines.order.3',
  'tb.ines.order.4',
  'tb.ines.order.5',
  'tb.ines.order.6',
  'tb.ines.flag.ok',
  'tb.rook.wait',
  'tb.rook.done',
  'tb.pip.wait',
  'tb.pip.done',
  'tb.elder.wait',
  'tb.elder.retry',
  'tb.elder.done',
];

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
  THOUSAND_BOUGH_LINES = [
    ...THOUSAND_BOUGH_WELCOME,
    ...SET_PIECE_LINES,
    ...[
      'tamsin',
      'lyra',
      'saffi',
      'oak',
      'fen',
      'fen.solved',
      'ines',
      'rook',
      'pip',
      'elder',
      'rook.assignment',
    ].flatMap((name) => script(name).flatMap((step) => ('say' in step ? [step.say] : []))),
  ];
});
