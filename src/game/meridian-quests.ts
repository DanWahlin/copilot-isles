import { courseScript, islandQuests, onCourse } from '../course/active';
import { welcomeLines } from '../course/catalog';
import type { QuestDef, QuestTarget } from '../course/pack';
import { beatSteps, pickBeat, type Beat } from './beats';
import type { QuestState, QuestTracker, TrackerStatus } from './cove-quests';
import type { ScriptStep } from './script';

/**
 * Port Meridian's quest line: the logic (which beat each NPC offers, the tracker, the compass). The
 * quests' text, the compass labels and every script are the course pack's
 * (`courses/<id>/quests/meridian.json`, docs/specs/COURSE-PACKS.md). For the Copilot app course
 * (Chapter 01: Tour the App), in the course's order: why use the app (Tobias), the work surfaces
 * (Mina's tour), chats (Lyra), project sessions (Anders and his crates), session modes (Rhea and the
 * Three Helms), model and effort (Oren, up the cliff lift), settings (Pell), then the Admiral's Exam.
 * Each talk is what you'll do → where it is in the app → one check → a Logbook page → who's next
 * (the compass points there).
 */
const ISLAND = 'meridian';

/** The island this quest line belongs to, for the tracker's header (its name is the game's). */
export let MERIDIAN_ISLAND = { name: 'Port Meridian', chapter: '', goal: '', next: '' };

/** The island's quests, in story order (the course pack's). */
export let MERIDIAN_QUESTS: readonly QuestDef[] = [];

let MAIN: readonly QuestDef[] = [];
let BEATS: readonly Beat[] = [];

/** Where the compass points on Meridian for each quest step (interaction ids; the nearest usable wins). */
export let MERIDIAN_TARGETS: Readonly<Record<string, QuestTarget>> = {};

/** Anders's beat when the crate yard's solved (played at once by the puzzle, or when you talk to him). */
export let ANDERS_SOLVED: readonly ScriptStep[] = [];
/** What the alcoves stand for, on the course's screenshot (P1.3's debrief). */
export let PELL_LETTERS_DEBRIEF: readonly ScriptStep[] = [];
/** Pell's debrief once the letters are filed (played at once by the puzzle, or when you talk to him). */
export let PELL_SOLVED: readonly ScriptStep[] = [];

const script = (name: string) => courseScript(ISLAND, name);

onCourse(() => {
  const q = islandQuests(ISLAND);
  MERIDIAN_ISLAND = { name: 'Port Meridian', ...q.tracker };
  MERIDIAN_QUESTS = q.quests;
  MAIN = MERIDIAN_QUESTS.filter((d) => !d.optional);
  BEATS = q.beats;
  MERIDIAN_TARGETS = q.targets;
  ANDERS_SOLVED = script('anders.solved');
  PELL_LETTERS_DEBRIEF = script('pell.letters.debrief');
  PELL_SOLVED = script('pell.solved');
});

const done = (q: QuestState, id: string) => q[id] === 'done';

/** The Meridian step you're on: the first unfinished one in order (it starts once you land). */
export function meridianCurrent(q: QuestState): { id: string; task: string; step: string } | null {
  const d = MAIN.find((c) => q[c.id] !== 'done');
  return d ? { id: d.id, task: d.task, step: q[d.id] ?? 'start' } : null;
}

export function meridianTarget(
  q: QuestState,
): { ids: readonly string[]; label: string; labels?: Readonly<Record<string, string>> } | null {
  const c = meridianCurrent(q);
  return c ? (MERIDIAN_TARGETS[`${c.id}:${c.step}`] ?? null) : null;
}

/** The Meridian task list: the chapter's steps in order, the current one with what to do next (and the optional market once started). */
export function meridianTracker(q: QuestState): QuestTracker {
  const current = meridianCurrent(q);
  return {
    island: MERIDIAN_ISLAND.name,
    chapter: MERIDIAN_ISLAND.chapter,
    goal: MERIDIAN_ISLAND.goal,
    next: MERIDIAN_ISLAND.next,
    // The optional market shows once it's started (Gilda's hello).
    tasks: MERIDIAN_QUESTS.filter((d) => !d.optional || q[d.id]).map((d) => {
      const optionalStep = d.optional ? q[d.id] : undefined;
      const status: TrackerStatus = done(q, d.id)
        ? 'done'
        : d.id === current?.id || optionalStep
          ? 'active'
          : 'upcoming';
      const step = d.optional ? optionalStep : current?.step;
      const detail = status === 'active' && step ? (d.steps[step] ?? '') : '';
      return { id: d.id, title: d.title, task: d.task, detail, status, optional: !!d.optional };
    }),
  };
}

/** Meridian quests for the Logbook's quest tab, once started. */
export function meridianLog(q: QuestState): { id: string; title: string; detail: string; done: boolean }[] {
  return MERIDIAN_QUESTS.filter((d) => q[d.id]).map((d) => ({
    id: d.id,
    title: d.title,
    detail: d.steps[q[d.id]!] ?? '',
    done: q[d.id] === 'done',
  }));
}

/** Wingman's lines on the first landfall, once the flyover lands behind the captain. */
export const MERIDIAN_WELCOME: readonly string[] = welcomeLines('meridian', false);

/**
 * The beat a Meridian NPC offers right now: the first of the island's beats (`quests/meridian.json` →
 * `beats`) that fits. NPCs ahead of the story point you back to whoever's next; everyone's got a line
 * once their part's done. `lettersFiled` is whether P1.3's letters are all filed (a save that finished
 * Pell before the letters existed hears there's a new bundle).
 */
export function meridianNpcScript(
  npc: string,
  q: QuestState,
  o: { lettersFiled?: boolean } = {},
): { steps: readonly ScriptStep[] } | null {
  return beatSteps(pickBeat(BEATS, npc, q, { lettersFiled: o.lettersFiled }), script);
}
