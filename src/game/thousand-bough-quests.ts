import type { QuestState, QuestTracker, TrackerStatus } from './cove-quests';
import type { ScriptStep } from './script';

/**
 * Thousand-Bough Isle (Chapter 02: Sessions, Worktrees, and Context), in the course's order
 * (docs/specs/ISLAND-02-thousand-bough.md §4): what a session holds (Tamsin), the recording booths
 * (Lyra), worktrees and why (Saffi), where a session runs (Oak), parallel crews and ports (Fen's
 * Channel Routing), context syntax (Ines's flags), the first exercise (Rook), the second (Pip), then
 * the Canopy Trial (the Elder). Each stop is what you'll do → where it is in the app → one check → a
 * Logbook page → who's next (the compass points there).
 */
export const THOUSAND_BOUGH_ISLAND = {
  name: 'Thousand-Bough Isle',
  chapter: 'Chapter 02 · Sessions, Worktrees & Context',
  goal: 'Give every task its own treehouse, and earn the Seal of Thousand-Bough',
  next: 'Keelhaven is next, and she’s still being charted. Until then these waters are yours.',
} as const;

/** The course's assignment, linked from the optional Lantern House task. */
const ASSIGNMENT_URL =
  'https://github.com/github/copilot-app-for-beginners/blob/main/02-sessions-worktrees-context/README.md#assignment';

interface TbQuestDef {
  id: string;
  title: string;
  task: string;
  steps: Record<string, string>;
  optional?: boolean;
  link?: { label: string; url: string };
}

export const THOUSAND_BOUGH_QUESTS: readonly TbQuestDef[] = [
  {
    id: 'Q2.1',
    title: 'The Root Wharf',
    task: 'Learn what a session can hold',
    steps: {
      start: 'Tamsin Reed waits under the little banyan at the end of the wharf.',
      done: 'A session can have its own branch, folder, plan, diff, terminal output, preview and GitHub context.',
    },
  },
  {
    id: 'Q2.2',
    title: 'The Booth Pools',
    task: 'Hear the Bard’s tale',
    steps: {
      start: 'Lyra’s playing by the Booth Pools, up the Fern Walk.',
      done: 'A worktree is like a recording booth: its own folder and branch, the same song.',
    },
  },
  {
    id: 'Q2.3',
    title: 'One Trunk, Many Houses',
    task: 'Learn what a worktree is',
    steps: {
      start: 'Saffi Rootwell keeps the Root Hall at the foot of the great tree.',
      done: 'A Git worktree is another working folder for the same repository, usually on its own branch.',
    },
  },
  {
    id: 'Q2.4',
    title: 'The Three Landings',
    task: 'Choose where a session runs',
    steps: {
      start: 'Climb the Great Stair to Oak at the Three Landings.',
      done: 'New worktree is the safe default. Base branch sets where it starts. Create from always makes a new worktree.',
    },
  },
  {
    id: 'Q2.5',
    title: 'Channel Routing',
    task: 'Run crews in parallel',
    steps: {
      start: 'Fen Marrow’s at the Flume Gallery, along the boardwalk from the Three Landings.',
      channels: 'Route each crew’s water to its own wheel at the Gate Board.',
      twist: 'Both crews want the Lookout.',
      solved: 'Talk to Fen.',
      done: 'Worktrees separate files and branches, not ports. Use different ports for parallel previews.',
    },
  },
  {
    id: 'Q2.6',
    title: 'Four Flags',
    task: 'Add context to a prompt',
    steps: {
      start: 'Ines Calloway runs the Signal Deck, higher up the stair.',
      done: '@ files and folders, # issues and pull requests, / commands, & other sessions. Less is often more.',
    },
  },
  {
    id: 'Q2.7',
    title: 'The Practice Bough',
    task: 'Start a session from a branch',
    steps: {
      start: 'Cross the Signal Bridge to Rook on the Practice Bough.',
      done: 'Create from, Branches, Plan, attach {issue}, then review the plan and the diff.',
    },
  },
  {
    id: 'Q2.8',
    title: 'The Chronicle Loft',
    task: 'Check a session',
    steps: {
      start: 'Pip Hollow keeps the Chronicle Loft, near the top.',
      done: '/chronicle standup recaps your day. /context shows tokens, context and AI credits.',
    },
  },
  {
    id: 'Q2.9',
    title: 'The Canopy Trial',
    task: 'Pass the Trial to earn the Seal',
    steps: {
      start: 'Elder Maren waits on the Crown Deck.',
      exam: 'The Elder’s Trial is ready whenever you are.',
      done: 'The Seal of Thousand-Bough is yours.',
    },
  },
  {
    id: 'Q2.A',
    title: 'The Lantern House',
    task: 'Your turn: a light and dark theme',
    optional: true,
    link: { label: 'Try it in the app ↗', url: ASSIGNMENT_URL },
    steps: {
      start: 'Rook’s on the Practice Bough with one more job for you.',
      try: 'Add a light and dark theme to the Book App in its own worktree, without touching main. The Lantern House’s shutters on the Three Landings show the idea.',
      done: 'A light and dark theme in its own worktree, without touching main.',
    },
  },
];

type Target = { ids: readonly string[]; label: string; labels?: Readonly<Record<string, string>> };

/** Where the compass points for each step (interaction ids; the nearest usable wins). */
export const THOUSAND_BOUGH_TARGETS: Readonly<Record<string, Target>> = {
  'Q2.1:start': { ids: ['npc:tamsin'], label: 'Tamsin' },
  'Q2.2:start': { ids: ['npc:lyra_bough'], label: 'Lyra' },
  'Q2.3:start': { ids: ['npc:saffi'], label: 'Saffi' },
  'Q2.4:start': { ids: ['npc:oak'], label: 'Oak' },
  'Q2.5:start': { ids: ['npc:fen'], label: 'Fen' },
  'Q2.5:channels': { ids: ['flume:board'], label: 'The Gate Board' },
  'Q2.5:twist': { ids: ['flume:board'], label: 'The Gate Board' },
  'Q2.5:solved': { ids: ['npc:fen'], label: 'Fen' },
  'Q2.6:start': { ids: ['npc:ines'], label: 'Ines' },
  'Q2.7:start': { ids: ['npc:rook'], label: 'Rook' },
  'Q2.8:start': { ids: ['npc:pip'], label: 'Pip' },
  // Once the Elder's sent the basket down, it's the quick way up.
  'Q2.9:start': { ids: ['npc:elder'], label: 'Elder Maren' },
  'Q2.9:exam': { ids: ['npc:elder'], label: 'Elder Maren' },
};

const done = (q: QuestState, id: string) => q[id] === 'done';
const MAIN = THOUSAND_BOUGH_QUESTS.filter((d) => !d.optional);

/** The step you're on: the first unfinished main quest in order. */
export function thousandBoughCurrent(q: QuestState): { id: string; task: string; step: string } | null {
  const d = MAIN.find((c) => q[c.id] !== 'done');
  return d ? { id: d.id, task: d.task, step: q[d.id] ?? 'start' } : null;
}

export function thousandBoughTarget(q: QuestState): Target | null {
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
export const THOUSAND_BOUGH_WELCOME = ['juno.tb.arrive', 'wingman.tb.01', 'wingman.tb.02'] as const;

const TAMSIN: readonly ScriptStep[] = [
  { say: 'tb.tamsin.01' },
  { say: 'tb.tamsin.02' },
  { say: 'tb.tamsin.03' },
  { quiz: 'K2.1' },
  { page: 'pg2.session', doubloons: 15 },
  { say: 'tb.tamsin.next' },
  { quest: 'Q2.1', step: 'done' },
  { quest: 'Q2.2', step: 'start' },
];

const LYRA: readonly ScriptStep[] = [
  { say: 'tb.lyra.01' },
  { show: 'ch02/recording-booths-worktrees', caption: 'One song, three musicians, each in their own booth.' },
  { say: 'tb.lyra.02' },
  { say: 'tb.lyra.03' },
  { hide: true },
  { quiz: 'K2.2' },
  { say: 'tb.lyra.chest' },
  { cue: 'tb-chest:C2.1' },
  { say: 'tb.lyra.next' },
  { quest: 'Q2.2', step: 'done' },
  { quest: 'Q2.3', step: 'start' },
];

const SAFFI: readonly ScriptStep[] = [
  { say: 'tb.saffi.01' },
  { say: 'tb.saffi.02' },
  { say: 'tb.saffi.03' },
  {
    show: 'ch02/one-repo-many-worktrees',
    caption: 'One repository, and a worktree for each task: **Feature**, **Bug Fix** and **Docs**.',
  },
  { say: 'tb.saffi.04' },
  { hide: true },
  { quiz: 'M2.1' },
  { say: 'tb.saffi.05' },
  { term: 'git-worktree' },
  { page: 'pg2.worktree', doubloons: 15 },
  { file: 'pg2.why' },
  { say: 'tb.saffi.next' },
  { quest: 'Q2.3', step: 'done' },
  { quest: 'Q2.4', step: 'start' },
];

const OAK: readonly ScriptStep[] = [
  { say: 'tb.oak.01' },
  {
    show: 'ch02/app-where-sessions-run',
    caption: 'The workspace selector, below the prompt box: **Where to work**.',
  },
  { say: 'tb.oak.02' },
  { say: 'tb.oak.03' },
  { say: 'tb.oak.04' },
  { cue: 'tb-gondola' },
  { say: 'tb.oak.05' },
  { say: 'tb.oak.06' },
  { say: 'tb.oak.07' },
  { hide: true },
  { quiz: 'H2.1' },
  { say: 'tb.oak.08' },
  { term: 'new-worktree' },
  { term: 'base-branch' },
  { term: 'create-from' },
  { term: 'workspace-selector' },
  { term: 'cloud-sandbox' },
  { page: 'pg2.where', doubloons: 15 },
  { say: 'tb.oak.next' },
  { quest: 'Q2.4', step: 'done' },
  { quest: 'Q2.5', step: 'start' },
];

/**
 * Fen's welcome: the shared trough (Without isolation): the crews' water mixes while he says why,
 * then the trough comes down and the Gate Board opens.
 */
const FEN: readonly ScriptStep[] = [
  { say: 'tb.fen.01' },
  { cue: 'tb-flume-demo' },
  { say: 'tb.fen.02' },
  { cue: 'tb-flume-clear' },
  { say: 'tb.fen.03' },
  { quest: 'Q2.5', step: 'channels' },
  { cue: 'tb-flume-open' },
];

/** Fen's close once the twist's settled (played at once by the puzzle, or when you talk to him). */
export const FEN_SOLVED: readonly ScriptStep[] = [
  { say: 'tb.fen.close' },
  { say: 'tb.fen.oneatatime' },
  { term: 'context' },
  { file: 'pg2.parallel' },
  { page: 'pg2.ports', doubloons: 15 },
  { say: 'tb.fen.next' },
  { quest: 'Q2.5', step: 'done' },
  { quest: 'Q2.6', step: 'start' },
];

const INES: readonly ScriptStep[] = [
  { say: 'tb.ines.01' },
  { say: 'tb.ines.02' },
  { say: 'tb.ines.03' },
  { say: 'tb.ines.04' },
  { cue: 'tb-flag-hoist' },
  { quiz: 'M2.2' },
  { say: 'tb.ines.05' },
  { say: 'tb.ines.06' },
  { say: 'tb.ines.07' },
  { term: 'context-syntax' },
  { term: 'slash-command' },
  { page: 'pg2.context-syntax', doubloons: 15 },
  { file: 'pg2.attach' },
  { file: 'pg2.slash' },
  { say: 'tb.ines.next' },
  { quest: 'Q2.6', step: 'done' },
  { quest: 'Q2.7', step: 'start' },
];

const ROOK: readonly ScriptStep[] = [
  { say: 'tb.rook.01' },
  {
    show: 'ch02/app-create-from-icon',
    caption: 'Point to the project, then select the **Create from** icon next to it.',
  },
  { say: 'tb.rook.02' },
  // The player's own session: the working branch the app gave it, then their practice issue's number
  // (Rook's recorded line says "hash three", the course's number; the captions use theirs).
  { askSetup: 'branch' },
  { say: 'tb.rook.03' },
  { askSetup: 'issue' },
  {
    show: 'ch02/app-plan-from-issue',
    caption:
      'Type `{issue}` and pick **Improve the empty state copy**. The plan opens in the **Plan** tab, and **Review plan** replaces the prompt box.',
  },
  { say: 'tb.rook.04' },
  { hide: true },
  { quiz: 'H2.3' },
  {
    show: 'ch02/app-book-app-empty-state-before',
    caption: 'The baseline: `zzzz-no-match` shows the empty state. Note it before you change anything.',
  },
  { say: 'tb.rook.05' },
  { say: 'tb.rook.06' },
  { hide: true },
  { term: 'empty-state' },
  { file: 'pg2.create-from' },
  { file: 'pg2.plan' },
  { page: 'pg2.preview', doubloons: 15 },
  { say: 'tb.rook.next' },
  { quest: 'Q2.7', step: 'done' },
  { quest: 'Q2.8', step: 'start' },
];

const PIP: readonly ScriptStep[] = [
  { say: 'tb.pip.01' },
  {
    show: 'ch02/app-chronicle-standup-output',
    caption: '`/chronicle standup`: your work from the last day, with this session on `{branch}`.',
  },
  { say: 'tb.pip.02' },
  {
    show: 'ch02/app-context-information',
    caption: '`/context` opens the usage popup below the prompt box.',
  },
  { say: 'tb.pip.03' },
  { say: 'tb.pip.04' },
  { hide: true },
  { quiz: 'H2.6' },
  { say: 'tb.pip.05' },
  { say: 'tb.pip.06' },
  { term: 'chronicle-standup' },
  { term: 'context-command' },
  { file: 'pg2.chronicle' },
  { file: 'pg2.context' },
  { page: 'pg2.details', doubloons: 15 },
  { say: 'tb.pip.next' },
  { quest: 'Q2.8', step: 'done' },
  { quest: 'Q2.9', step: 'start' },
];

const TRIAL_PASSED: readonly ScriptStep[] = [
  { cue: 'celebrate' },
  { say: 'tb.elder.pass' },
  { cue: 'tb-seal' },
  { say: 'tb.elder.next' },
  { page: 'pg2.takeaways' },
  { file: 'pg2.next' },
  { quest: 'Q2.9', step: 'done' },
  { quest: 'Q2.A', step: 'start' },
];

// Leaving the Trial ends the script; next time the Elder skips her introduction.
const ELDER: readonly ScriptStep[] = [
  { cue: 'tb-crown-view' },
  { say: 'tb.elder.01' },
  { say: 'tb.elder.02' },
  { quest: 'Q2.9', step: 'exam' },
  { trial: 'T2' },
  ...TRIAL_PASSED,
];

const ELDER_RETRY: readonly ScriptStep[] = [{ say: 'tb.elder.retry' }, { trial: 'T2' }, ...TRIAL_PASSED];

const ROOK_ASSIGNMENT: readonly ScriptStep[] = [
  { say: 'tb.rook.assignment' },
  { page: 'pg2.assignment', doubloons: 15 },
  { quest: 'Q2.A', step: 'try' },
];

/**
 * The beat a Thousand-Bough NPC offers right now. NPCs ahead of the story point you back to whoever's
 * next; everyone's got a line once their part's done.
 */
export function thousandBoughNpcScript(npc: string, q: QuestState): { steps: readonly ScriptStep[] } | null {
  const line = (id: string) => ({ steps: [{ say: id }] as readonly ScriptStep[] });
  switch (npc) {
    case 'tamsin':
      return done(q, 'Q2.1') ? line('tb.tamsin.done') : { steps: TAMSIN };
    case 'lyra_bough':
      if (!done(q, 'Q2.1')) return line('tb.lyra.wait');
      return done(q, 'Q2.2') ? line('tb.lyra.done') : { steps: LYRA };
    case 'saffi':
      if (!done(q, 'Q2.2')) return line('tb.saffi.wait');
      return done(q, 'Q2.3') ? line('tb.saffi.done') : { steps: SAFFI };
    case 'oak':
      if (!done(q, 'Q2.3')) return line('tb.oak.wait');
      return done(q, 'Q2.4') ? line('tb.oak.done') : { steps: OAK };
    case 'fen': {
      if (!done(q, 'Q2.4')) return line('tb.fen.wait');
      const step = q['Q2.5'];
      if (step === 'channels' || step === 'twist') return line('tb.fen.channels');
      if (step === 'solved') return { steps: FEN_SOLVED };
      return step === 'done' ? line('tb.fen.done') : { steps: FEN };
    }
    case 'ines':
      if (!done(q, 'Q2.5')) return line('tb.ines.wait');
      return done(q, 'Q2.6') ? line('tb.ines.done') : { steps: INES };
    case 'rook':
      if (!done(q, 'Q2.6')) return line('tb.rook.wait');
      if (!done(q, 'Q2.7')) return { steps: ROOK };
      // After the Seal, Rook offers the assignment (the Lantern House).
      if (q['Q2.A'] === 'start') return { steps: ROOK_ASSIGNMENT };
      return line('tb.rook.done');
    case 'pip':
      if (!done(q, 'Q2.7')) return line('tb.pip.wait');
      return done(q, 'Q2.8') ? line('tb.pip.done') : { steps: PIP };
    case 'elder':
      if (!done(q, 'Q2.8')) return line('tb.elder.wait');
      if (q['Q2.9'] === 'exam') return { steps: ELDER_RETRY };
      return done(q, 'Q2.9') ? line('tb.elder.done') : { steps: ELDER };
    default:
      return null;
  }
}

/** Every voice line the island's scripts and set pieces play (tests check each is voiced). */
export const THOUSAND_BOUGH_LINES: readonly string[] = [
  ...THOUSAND_BOUGH_WELCOME,
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
  'tb.fen.rain',
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
  'tb.ines.flag.ok',
  'tb.rook.wait',
  'tb.rook.done',
  'tb.pip.wait',
  'tb.pip.done',
  'tb.elder.wait',
  'tb.elder.retry',
  'tb.elder.done',
  ...[TAMSIN, LYRA, SAFFI, OAK, FEN, FEN_SOLVED, INES, ROOK, PIP, ELDER, ROOK_ASSIGNMENT].flatMap((s) =>
    s.flatMap((step) => ('say' in step ? [step.say] : [])),
  ),
];
