import type { QuestState, QuestTracker, TrackerStatus } from './cove-quests';
import type { ScriptStep } from './script';

/**
 * Port Meridian (Chapter 01: Tour the App), in the course's order: why use the app (Tobias), the work
 * surfaces (Mina's tour), chats (Lyra), project sessions (Anders and his crates), session modes (Rhea
 * and the Three Helms), model and effort (Oren, up the cliff lift), settings (Pell), then the
 * Admiral's Exam. Each talk is what you'll do → where it is in the app → one check → a Logbook page
 * → who's next (the compass points there).
 */
export const MERIDIAN_ISLAND = {
  name: 'Port Meridian',
  chapter: 'Chapter 01 · Tour the App',
  goal: 'Tour the GitHub Copilot app and earn the Seal of Meridian',
  next: 'Thousand-Bough Isle is next, and she’s still being charted. Until then these waters are yours.',
} as const;

interface MeridianQuestDef {
  id: string;
  /** The island's name for the step (pirate flavour). */
  title: string;
  /** What you're doing in the app, in plain words, for the tracker. */
  task: string;
  /** Step id → what the Logbook and tracker say to do next. `done` marks completion. */
  steps: Record<string, string>;
}

export const MERIDIAN_QUESTS: readonly MeridianQuestDef[] = [
  {
    id: 'Q1.1',
    title: 'The Merchant’s Table',
    task: 'Learn why to use the app',
    steps: {
      start: 'Tobias Crane has a table in the plaza, up the stair street from the quay.',
      done: 'The app gives agent work a place to run and be reviewed. Your editor stays for deep coding.',
    },
  },
  {
    id: 'Q1.2',
    title: 'The Harbour Tour',
    task: 'Tour the app’s work surfaces',
    steps: {
      start: 'Mina Solé, the harbour guide, is by the fountain in the plaza.',
      done: 'New, My work, Automations and Customize are the app’s work surfaces.',
    },
  },
  {
    id: 'Q1.3',
    title: 'Quick Questions',
    task: 'Start a chat',
    steps: {
      start: 'Lyra’s playing at the tavern, just west of the plaza.',
      done: 'Chats are for questions. They don’t make a branch or a worktree.',
    },
  },
  {
    id: 'Q1.4',
    title: 'The Shipyard',
    task: 'Start a project session',
    steps: {
      start: 'Anders Holt, the shipwright, is at the shipyard at the west end of the quay.',
      crates:
        'Push each crate onto its plate: chat work to the tavern plate, project work to the slipway plate.',
      solved: 'Every crate’s in place. Talk to Anders.',
      done: 'Project sessions are for work in your repository, on a New worktree by default.',
    },
  },
  {
    id: 'Q1.5',
    title: 'The Three Helms',
    task: 'Choose a session mode',
    steps: {
      start: 'Captain Rhea Marlowe is by your ship on the east arm.',
      helms: 'Board your ship and sail the three helms out in the bay: Interactive, Plan and Autopilot.',
      solved: 'You’ve sailed all three helms. Talk to Rhea on the east arm.',
      done: 'Interactive, Plan and Autopilot change the level of autonomy. Pick one for the task.',
    },
  },
  {
    id: 'Q1.6',
    title: 'The Observatory',
    task: 'Pick a model and reasoning effort',
    steps: {
      start: 'Ride the cliff lift at the top of the east arm, then find Oren Vey at the observatory.',
      done: 'The model and effort are below the prompt box. Auto picks a model, and it isn’t Autopilot.',
    },
  },
  {
    id: 'Q1.7',
    title: 'The Hall of Records',
    task: 'Find your way round Settings',
    steps: {
      start: 'Pell Winthrop keeps the Hall of Records in the citadel.',
      done: 'Settings has nine areas. App-wide instructions are under Sessions.',
    },
  },
  {
    id: 'Q1.8',
    title: 'The Admiral’s Exam',
    task: 'Pass the exam to earn the Seal',
    steps: {
      start: 'Admiral Vale is on her terrace, over the harbour.',
      exam: 'Admiral Vale’s exam is waiting whenever you’re ready.',
      done: 'The Seal of Meridian is yours.',
    },
  },
];

/** Where the compass points on Meridian for each quest step (interaction ids; the nearest usable wins). */
export const MERIDIAN_TARGETS: Readonly<
  Record<string, { ids: readonly string[]; label: string; labels?: Readonly<Record<string, string>> }>
> = {
  'Q1.1:start': { ids: ['npc:tobias'], label: 'Tobias' },
  'Q1.2:start': { ids: ['npc:mina'], label: 'Mina' },
  'Q1.3:start': { ids: ['npc:lyra_meridian'], label: 'Lyra' },
  'Q1.4:start': { ids: ['npc:anders'], label: 'Anders' },
  'Q1.4:crates': { ids: ['crates:*'], label: 'The crate yard' },
  'Q1.4:solved': { ids: ['npc:anders'], label: 'Anders' },
  'Q1.5:start': { ids: ['npc:rhea'], label: 'Rhea' },
  'Q1.5:helms': { ids: ['ship:board', 'helm:*'], label: 'The Three Helms' },
  'Q1.5:solved': { ids: ['npc:rhea'], label: 'Rhea' },
  // The lift is only usable from the bottom, so up top the compass moves on to Oren.
  'Q1.6:start': {
    ids: ['lift:bottom', 'npc:oren'],
    label: 'The lift to Oren',
    labels: { 'npc:oren': 'Oren' },
  },
  'Q1.7:start': { ids: ['npc:pell'], label: 'Pell' },
  'Q1.8:start': { ids: ['npc:admiral'], label: 'Admiral Vale' },
  'Q1.8:exam': { ids: ['npc:admiral'], label: 'Admiral Vale' },
};

const done = (q: QuestState, id: string) => q[id] === 'done';

/** The Meridian step you're on: the first unfinished one in order (it starts once you land). */
export function meridianCurrent(q: QuestState): { id: string; task: string; step: string } | null {
  const d = MERIDIAN_QUESTS.find((c) => q[c.id] !== 'done');
  return d ? { id: d.id, task: d.task, step: q[d.id] ?? 'start' } : null;
}

export function meridianTarget(
  q: QuestState,
): { ids: readonly string[]; label: string; labels?: Readonly<Record<string, string>> } | null {
  const c = meridianCurrent(q);
  return c ? (MERIDIAN_TARGETS[`${c.id}:${c.step}`] ?? null) : null;
}

/** The Meridian task list: the chapter's steps in order, the current one with what to do next. */
export function meridianTracker(q: QuestState): QuestTracker {
  const current = meridianCurrent(q);
  return {
    island: MERIDIAN_ISLAND.name,
    chapter: MERIDIAN_ISLAND.chapter,
    goal: MERIDIAN_ISLAND.goal,
    next: MERIDIAN_ISLAND.next,
    tasks: MERIDIAN_QUESTS.map((d) => {
      const status: TrackerStatus = done(q, d.id) ? 'done' : d.id === current?.id ? 'active' : 'upcoming';
      const detail = status === 'active' ? (d.steps[current!.step] ?? '') : '';
      return { id: d.id, title: d.title, task: d.task, detail, status, optional: false };
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
export const MERIDIAN_WELCOME = ['wingman.meridian.01', 'wingman.meridian.02'] as const;

const TOBIAS: readonly ScriptStep[] = [
  // Why use the app: the challenge, what the app adds (his table's four headaches), and the editor.
  { say: 'mer.tobias.01' },
  { say: 'mer.tobias.02' },
  { say: 'mer.tobias.03' },
  { say: 'mer.tobias.04' },
  { quiz: 'M1.1' },
  { say: 'mer.tobias.05' },
  {
    show: 'ch01/editor-vs-app',
    caption: 'Keep your editor for deep coding. Use the app to run and review agent work.',
  },
  { say: 'mer.tobias.06' },
  { hide: true },
  { page: 'pg1.why', doubloons: 15 },
  { file: 'pg1.editor' },
  { say: 'mer.tobias.logbook' },
  { say: 'mer.tobias.next' },
  { quest: 'Q1.1', step: 'done' },
  { quest: 'Q1.2', step: 'start' },
];

const MINA_TOUR: readonly ScriptStep[] = [
  // The sidebar's work surfaces as a walk round the plaza: each landmark, then its screen.
  { say: 'mer.mina.01' },
  { cue: 'tour:voyageOffice' },
  {
    show: 'ch01/app-new-page',
    caption: '**New**: the landing view. Start a chat or a project session, and choose a mode and model.',
  },
  { say: 'mer.mina.new' },
  { cue: 'tour:bountyBoard' },
  {
    show: 'ch01/app-my-work-page',
    caption: '**My work**: your issues, pull requests and review requests, including the practice items.',
  },
  { say: 'mer.mina.mywork' },
  { say: 'mer.mina.mywork2' },
  { cue: 'tour:clockTower' },
  {
    show: 'ch01/app-automations-page',
    caption: '**Automations**: agent tasks that run manually, daily, weekly or on events.',
  },
  { say: 'mer.mina.automations' },
  { cue: 'tour:outfitter' },
  {
    show: 'ch01/app-new-page',
    caption: '**Customize**: skills, MCP servers, plugins and extensions. You don’t need any yet.',
  },
  { say: 'mer.mina.customize' },
  { cue: 'tour:end' },
  { say: 'mer.mina.projects' },
  { hide: true },
  { quiz: 'H1.1' },
  { term: 'my-work' },
  { term: 'automations' },
  { term: 'customize' },
  { file: 'pg1.new' },
  { file: 'pg1.my-work' },
  { file: 'pg1.automations' },
  { file: 'pg1.customize' },
  { say: 'mer.mina.logbook' },
  { say: 'mer.mina.next' },
  { quest: 'Q1.2', step: 'done' },
  { quest: 'Q1.3', step: 'start' },
];

const LYRA: readonly ScriptStep[] = [
  // The control room comes before chats in the course; then start a chat and check the picker.
  { say: 'mer.lyra.01' },
  {
    show: 'ch01/producer-control-room-modes',
    caption: 'A producer doesn’t run every take the same way.',
  },
  { say: 'mer.lyra.02' },
  { say: 'mer.lyra.03' },
  {
    show: 'ch01/app-new-page',
    caption: 'Hover over **Chats** in the sidebar and select the **+** that appears.',
  },
  { say: 'mer.lyra.04' },
  { hide: true },
  { quiz: 'H1.2' },
  {
    show: 'ch01/app-quick-chat',
    caption: '① The **+** beside **Chats** · ② the project picker, with **Chat** selected.',
  },
  { say: 'mer.lyra.05' },
  { hide: true },
  { term: 'chat-session' },
  { file: 'pg1.projects-chats' },
  { page: 'pg1.chat', doubloons: 15 },
  { say: 'mer.lyra.06' },
  { say: 'mer.lyra.next' },
  { quest: 'Q1.3', step: 'done' },
  { quest: 'Q1.4', step: 'start' },
];

const ANDERS: readonly ScriptStep[] = [
  // Project sessions, New worktree by default and the Chapter 00 exception, the sample tour prompt,
  // then the crate yard as practice.
  { say: 'mer.anders.01' },
  { say: 'mer.anders.02' },
  {
    show: 'ch00/local-repository-workspace-selector',
    caption: 'Project sessions start on **New worktree** by default.',
  },
  { say: 'mer.anders.03' },
  { say: 'mer.anders.04' },
  { hide: true },
  { term: 'worktree' },
  { page: 'pg1.project', doubloons: 15 },
  { say: 'mer.anders.05' },
  { say: 'mer.anders.crates' },
  { quest: 'Q1.4', step: 'crates' },
];

/** Anders's beat when the crate yard's solved (played at once by the puzzle, or when you talk to him). */
export const ANDERS_SOLVED: readonly ScriptStep[] = [
  { say: 'mer.anders.solved' },
  { say: 'mer.anders.next' },
  { quest: 'Q1.4', step: 'done' },
  { quest: 'Q1.5', step: 'start' },
];

const RHEA: readonly ScriptStep[] = [
  { say: 'mer.rhea.01' },
  { say: 'mer.rhea.02' },
  {
    show: 'ch01/session-mode-decision-ladder',
    caption: 'Interactive, Plan and Autopilot. Pick one for the task.',
  },
  { say: 'mer.rhea.03' },
  { hide: true },
  { term: 'session-modes' },
  { say: 'mer.rhea.helms' },
  { quest: 'Q1.5', step: 'helms' },
];

const RHEA_DEBRIEF: readonly ScriptStep[] = [
  { say: 'mer.rhea.solved' },
  { quiz: 'M1.2' },
  { page: 'pg1.modes', doubloons: 15 },
  { say: 'mer.rhea.next' },
  { quest: 'Q1.5', step: 'done' },
  { quest: 'Q1.6', step: 'start' },
];

const OREN: readonly ScriptStep[] = [
  { say: 'mer.oren.01' },
  {
    show: 'ch01/app-new-page',
    caption: 'The model control is below the prompt, next to the mode selector.',
  },
  { say: 'mer.oren.02' },
  { hide: true },
  { quiz: 'H1.3' },
  { say: 'mer.oren.03' },
  { say: 'mer.oren.04' },
  { term: 'auto-model' },
  { say: 'mer.oren.05' },
  { say: 'mer.oren.06' },
  { term: 'reasoning-effort' },
  { file: 'pg1.model' },
  { page: 'pg1.try-controls', doubloons: 15 },
  { say: 'mer.oren.07' },
  { say: 'mer.oren.08' },
  { say: 'mer.oren.next' },
  { quest: 'Q1.6', step: 'done' },
  { quest: 'Q1.7', step: 'start' },
];

const PELL: readonly ScriptStep[] = [
  { say: 'mer.pell.01' },
  { show: 'ch01/app-settings', caption: '**Settings**: nine areas, from General to Experimental.' },
  { say: 'mer.pell.02' },
  { say: 'mer.pell.03' },
  { hide: true },
  { quiz: 'H1.4' },
  { say: 'mer.pell.04' },
  { term: 'model-providers' },
  { say: 'mer.pell.05' },
  { page: 'pg1.settings', doubloons: 15 },
  { file: 'pg1.voice' },
  // The chapter's troubleshooting, kept with the records.
  { file: 'B1.1' },
  { file: 'B1.2' },
  { file: 'B1.3' },
  { say: 'mer.pell.logbook' },
  { say: 'mer.pell.next' },
  { quest: 'Q1.7', step: 'done' },
  { quest: 'Q1.8', step: 'start' },
];

const EXAM_PASSED: readonly ScriptStep[] = [
  { cue: 'celebrate' },
  { say: 'mer.admiral.pass' },
  { cue: 'lighthouse' },
  { say: 'mer.admiral.next' },
  { page: 'pg1.next' },
  { quest: 'Q1.8', step: 'done' },
];

// Leaving the exam ends the script; next time the Admiral skips her introduction.
const ADMIRAL: readonly ScriptStep[] = [
  { say: 'mer.admiral.01' },
  { say: 'mer.admiral.02' },
  { quest: 'Q1.8', step: 'exam' },
  { trial: 'A1' },
  ...EXAM_PASSED,
];

const ADMIRAL_RETRY: readonly ScriptStep[] = [{ say: 'mer.admiral.retry' }, { trial: 'A1' }, ...EXAM_PASSED];

/**
 * The beat a Meridian NPC offers right now. NPCs ahead of the story point you back to whoever's
 * next; everyone's got a line once their part's done.
 */
export function meridianNpcScript(npc: string, q: QuestState): { steps: readonly ScriptStep[] } | null {
  const line = (id: string) => ({ steps: [{ say: id }] as readonly ScriptStep[] });
  switch (npc) {
    case 'tobias':
      return done(q, 'Q1.1') ? line('mer.tobias.done') : { steps: TOBIAS };
    case 'mina':
      if (!done(q, 'Q1.1')) return line('mer.mina.wait');
      return done(q, 'Q1.2') ? line('mer.mina.done') : { steps: MINA_TOUR };
    case 'lyra_meridian':
      if (!done(q, 'Q1.2')) return line('mer.lyra.wait');
      return done(q, 'Q1.3') ? line('mer.lyra.done') : { steps: LYRA };
    case 'anders': {
      if (!done(q, 'Q1.3')) return line('mer.anders.wait');
      const step = q['Q1.4'];
      if (step === 'crates') return line('mer.anders.crates.wait');
      if (step === 'solved') return { steps: ANDERS_SOLVED };
      return step === 'done' ? line('mer.anders.done') : { steps: ANDERS };
    }
    case 'rhea': {
      if (!done(q, 'Q1.4')) return line('mer.rhea.wait');
      const step = q['Q1.5'];
      if (step === 'helms') return line('mer.rhea.helms.wait');
      if (step === 'solved') return { steps: RHEA_DEBRIEF };
      return step === 'done' ? line('mer.rhea.done') : { steps: RHEA };
    }
    case 'oren':
      if (!done(q, 'Q1.5')) return line('mer.oren.wait');
      return done(q, 'Q1.6') ? line('mer.oren.done') : { steps: OREN };
    case 'pell':
      if (!done(q, 'Q1.6')) return line('mer.pell.wait');
      return done(q, 'Q1.7') ? line('mer.pell.done') : { steps: PELL };
    case 'admiral':
      if (!done(q, 'Q1.7')) return line('mer.admiral.wait');
      if (q['Q1.8'] === 'exam') return { steps: ADMIRAL_RETRY };
      return done(q, 'Q1.8') ? line('mer.admiral.done') : { steps: ADMIRAL };
    default:
      return null;
  }
}
