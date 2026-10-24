import { courseScript, islandQuests, onCourse } from '../course/active';
import { COURSE } from '../course/catalog';
import type { QuestDef, QuestTarget } from '../course/pack';
import { beatSteps, pickBeat, type Beat } from './beats';
import { meridianOpen } from './meridian-open';
import { optionalTargets, startedQuests, type QuestTracker, type TrackerStatus } from './quest-list';
import type { ScriptStep } from './script';
import type { QuestState } from './story';

/**
 * Anchorage Cay's quest line: the logic (which beat each NPC offers, the tracker, the compass). Old
 * saves and the gangway are the course's (its migrations and story: src/game/story.ts); the quests'
 * text, the compass labels and every script are the course pack's
 * (`courses/<id>/quests/anchorage.json`, docs/specs/COURSE-PACKS.md). For the Copilot app course,
 * in Chapter 00's order along the harbour: Nell's papers (prerequisites, install, sign in) and the
 * palette stand (theme), Ezra's fork, Bo's session and tool checks at the pier foot, Pim and Pol's
 * crane (Actions first, at the lever of Suri's sluice gate, then the setup script), Juno's first
 * prompt, and Nell's Trial and christening at your bow. Suri's mill race (the practice checks) and
 * Lyra's soundcheck are optional.
 */
const ISLAND = 'anchorage';

/** The island's quests, in story order (the course pack's). */
let COVE_QUESTS: readonly QuestDef[] = [];
/** Where the compass points for each quest step (the course pack's `targets`). */
let QUEST_TARGETS: Readonly<Record<string, QuestTarget>> = {};
/** Suri's lines once the mill race is solved (P0.1), also used if you come back after quitting. */
export let SURI_SOLVED: readonly ScriptStep[] = [];
/** Pol and Pim's closing beat once the crane's done (P0.2), also used if you come back after quitting. */
export let POL_SOLVED: readonly ScriptStep[] = [];
/** The island this quest line belongs to, for the tracker's header (its name is the game's). */
export let COVE_ISLAND: { name: string; chapter: string; goal: string; next: string; nextSail?: string } = {
  name: 'Anchorage Cay',
  chapter: '',
  goal: '',
  next: '',
};
let BEATS: readonly Beat[] = [];
/** The island's scripts as its NPCs play them (Wingman's sail line follows Meridian's gate). */
let SCRIPTS: Readonly<Record<string, readonly ScriptStep[]>> = {};

const script = (name: string) => courseScript(ISLAND, name);

/**
 * Port Meridian's open (the dev build, for now): Wingman's last sailing line points the way there.
 * Otherwise these waters are yours (the course's line).
 */
const pointToMeridian = (steps: readonly ScriptStep[]): readonly ScriptStep[] => {
  const { line, meridianOpen: open } = COURSE.hooks.sail;
  return meridianOpen() && open
    ? steps.map((s) => ('say' in s && s.say === line ? { say: open } : s))
    : steps;
};

onCourse(() => {
  const q = islandQuests(ISLAND);
  COVE_QUESTS = q.quests;
  QUEST_TARGETS = q.targets;
  // The mill race's and the crane's closing beats (a course that turns those puzzles off has none).
  SURI_SOLVED = q.scripts['suri.solved'] ?? [];
  POL_SOLVED = q.scripts['pol.solved'] ?? [];
  COVE_ISLAND = { name: 'Anchorage Cay', ...q.tracker };
  BEATS = q.beats;
  SCRIPTS = Object.fromEntries(Object.entries(q.scripts).map(([k, v]) => [k, pointToMeridian(v)]));
});

/** The main quest the player's on now: the first unfinished one in story order, or null when all done. */
export function currentQuest(q: QuestState): { id: string; task: string; step: string | null } | null {
  const d = COVE_QUESTS.find((c) => !c.optional && q[c.id] !== 'done');
  return d ? { id: d.id, task: d.task, step: q[d.id] ?? null } : null;
}

/** What the compass should point at ashore right now, or null once every task's done. */
export function questTarget(q: QuestState): { ids: readonly string[]; label: string } | null {
  const c = currentQuest(q);
  if (!c) return null;
  return QUEST_TARGETS[`${c.id}:${c.step ?? 'start'}`] ?? null;
}

/** The optional quests you've started: where the compass's dimmer marker points for each. */
export function questOptionalTargets(q: QuestState): QuestTarget[] {
  return optionalTargets(COVE_QUESTS, QUEST_TARGETS, q);
}

/** Port Meridian's chest: Lyra's, on the tavern stage beside her (the control-room page). */
export const MERIDIAN_CHESTS: readonly { id: string; npc: string; side: number; back: number }[] = [
  { id: 'C1.1', npc: 'lyra_meridian', side: 1.7, back: 0.6 },
];

/** The chests placed in the cove: chest id → which NPC it sits beside (metres to their right). */
export const COVE_CHESTS: readonly { id: string; npc: string; side: number; back: number }[] = [
  { id: 'C0.1', npc: 'nell', side: 2.1, back: 1.2 },
];

export type { QuestState };

/**
 * The scripted beat an NPC offers right now, or null to fall back to barks: the first of the island's
 * beats (`quests/anchorage.json` → `beats`) that fits the quest state.
 */
export function npcScript(
  npc: string,
  q: QuestState,
): { steps: readonly ScriptStep[]; repeat?: string } | null {
  return beatSteps(pickBeat(BEATS, npc, q), (name) => SCRIPTS[name] ?? script(name));
}

/**
 * The on-screen task list: every main quest in story order (optional ones once started), so the
 * player always sees the island's goal, what's done, and what to do next.
 */
export function questTracker(q: QuestState): QuestTracker {
  const current = currentQuest(q)?.id;
  const tasks = COVE_QUESTS.filter((d) => !d.optional || q[d.id]).map((d) => {
    // The current task shows its first step even before anyone's set it (Ezra's fork starts when
    // you talk to him, so until then it would read as upcoming with nothing to do).
    const step = q[d.id] ?? (d.id === current ? 'start' : undefined);
    const status: TrackerStatus = step === 'done' ? 'done' : step ? 'active' : 'upcoming';
    const detail = step ? (d.steps[step] ?? '') : '';
    return { id: d.id, title: d.title, task: d.task, detail, status, optional: !!d.optional, link: d.link };
  });
  return {
    island: COVE_ISLAND.name,
    chapter: COVE_ISLAND.chapter,
    goal: COVE_ISLAND.goal,
    next: COVE_ISLAND.next,
    tasks,
  };
}

/** The quest log for the Logbook, in story order, for quests that have started. */
export function questLog(q: QuestState): { id: string; title: string; detail: string; done: boolean }[] {
  return startedQuests(COVE_QUESTS, q);
}
