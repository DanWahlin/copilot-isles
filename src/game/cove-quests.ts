import { meridianOpen } from './meridian-open';
import type { ScriptStep } from './script';

/**
 * Anchorage Cay's quest line, in Chapter 00's order along the harbour: Nell's papers (prerequisites,
 * install, sign in) and the palette stand (theme), Ezra's fork, Bo's session and tool checks at the
 * pier foot, Pim and Pol's crane (Actions, then the setup script), Juno's first prompt, and Nell's
 * Trial and christening at your bow. Suri's sluice and Lyra's soundcheck are optional.
 */
interface QuestDef {
  id: string;
  title: string;
  /** The plain-words task for the on-screen tracker (what the player is doing in the app). */
  task: string;
  /** Optional quests only appear in the tracker once they've started. */
  optional?: boolean;
  /** A link the tracker keeps under this task (e.g. where to download the app). */
  link?: { label: string; url: string };
  /** Step id → what the Logbook says to do next. `done` marks completion. */
  steps: Record<string, string>;
}

/** Chapter 00's "Download and install the GitHub Copilot app" link. */
const APP_INSTALL_URL = 'https://github.com/features/ai/github-app';
/** Chapter 00's "Fork the course repository on GitHub" link. */
const FORK_URL = 'https://github.com/github/copilot-app-for-beginners/fork';

const COVE_QUESTS: readonly QuestDef[] = [
  {
    id: 'Q0.2',
    title: 'Captain’s Papers',
    task: 'Install the app and sign in',
    link: { label: 'Download the Copilot app', url: APP_INSTALL_URL },
    steps: {
      start: 'Talk to Nell Tidewell by the harbourmaster’s door.',
      palette: 'Pick a theme: paint your sails at the palette stand beside Nell, then select Finish.',
      done: 'Signed in, theme picked, and the New page is open.',
    },
  },
  {
    id: 'Q0.3',
    title: 'Copy the Master Chart',
    task: 'Fork the course and add it to Projects',
    link: { label: 'Fork the course repository', url: FORK_URL },
    steps: {
      start: 'Find Ezra Quill at his chart table by the pier.',
      done: 'Your fork is added under Projects.',
    },
  },
  {
    id: 'Q0.4',
    title: 'Your Own Deck',
    task: 'Start a session and check your tools',
    steps: {
      start: 'Bo Marlin, the quartermaster, is at his gear rack beside Ezra.',
      done: 'Your session runs on Local repository, and every tool checks out in Terminal.',
    },
  },
  {
    id: 'Q0.7',
    title: 'The Dry-Run Crane',
    task: 'Add the course practice items',
    steps: {
      start: 'Find Pim and Pol at the crane at the end of the pier.',
      crane: 'Aim the crane at your ship, preview with Dry-Run, check the Repository line, then pull --yes.',
      solved: 'Setup complete. Talk to Pol.',
      done: 'Workflows are on, and your fork has its practice labels, issues, branches, and pull requests.',
    },
  },
  {
    id: 'Q0.8',
    title: 'First Words',
    task: 'Send your first prompt',
    steps: {
      start: 'Find Juno, your first mate, on the pier beside your ship.',
      pipes: 'Send the course’s first prompt to the agent. Which fitting on your ship’s rail carries it?',
      done: 'Your first prompt went to the agent, and the crew answered.',
    },
  },
  {
    id: 'Q0.6',
    title: 'Open the Sluice (optional)',
    task: 'See the practice checks run',
    optional: true,
    steps: {
      start: 'Suri Okoye’s mill past the storehouse shows what turning on Actions does.',
      sluice: 'Pull the gate lever, then turn the channels until the water reaches the wheel.',
      solved: 'The wheel’s turning. Talk to Suri.',
      done: 'With workflows on, GitHub runs the practice checks on your fork.',
    },
  },
  {
    id: 'Q0.9',
    title: 'Soundcheck (optional)',
    task: 'Hear the studio analogy',
    optional: true,
    steps: {
      start: 'Lute music’s drifting up from the lagoon. Find Lyra Wren, the bard, at her hammock.',
      done: 'Setting up the app is like prepping a studio before the first take.',
    },
  },
  {
    id: 'Q0.10',
    title: 'The Harbormaster’s Trial',
    task: 'Pass the Trial to earn the Seal',
    steps: {
      start: 'Nell’s waiting by your bow at the end of the pier.',
      done: 'The Seal of Anchorage is yours.',
    },
  },
  {
    id: 'Q0.11',
    title: 'Christen Your Ship',
    task: 'Name your ship and set sail',
    steps: {
      start: 'Talk to Nell by your bow at the end of the pier.',
      sail: 'The gangway’s down. Walk up it to take the helm.',
      done: 'Your ship has her name, and you’ve taken her out.',
    },
  },
];

/**
 * Brings an older save in line with today's quest line (each rule sets a step only if it's missing
 * or stale, so running it twice changes nothing):
 * - Nell's chest step is gone (she opens it while she talks), so a save waiting on it moves on.
 * - Bo's gear check (the old Q0.5) folded into Q0.4. Finished counts; half-done replays Bo.
 * - The crane follows Bo now, not Suri (whose sluice is optional). Suri opens once the crane's done.
 * - First Words brings the bard (Q0.9); the Trial is followed by the christening (Q0.11).
 */
export function migrateQuests(saved: QuestState, set: (id: string, step: string) => void): void {
  const q: Record<string, string> = { ...saved };
  const put = (id: string, step: string) => {
    q[id] = step;
    set(id, step);
  };
  const has = (id: string) => q[id] !== undefined;
  if (q['Q0.2'] === 'chest') put('Q0.2', 'palette');
  if (has('Q0.5')) {
    if (done(q, 'Q0.5') && !done(q, 'Q0.4')) put('Q0.4', 'done');
    else if (!done(q, 'Q0.5') && done(q, 'Q0.4')) put('Q0.4', 'start');
  }
  if (done(q, 'Q0.3') && !has('Q0.4')) put('Q0.4', 'start');
  if (done(q, 'Q0.4') && !has('Q0.7')) put('Q0.7', 'start');
  if (done(q, 'Q0.7') && !has('Q0.8')) put('Q0.8', 'start');
  if (done(q, 'Q0.7') && !has('Q0.6')) put('Q0.6', 'start');
  if (done(q, 'Q0.8') && !has('Q0.9')) put('Q0.9', 'start');
  if (done(q, 'Q0.8') && !has('Q0.10')) put('Q0.10', 'start');
  if (done(q, 'Q0.10') && !has('Q0.11')) put('Q0.11', 'start');
}

/**
 * The ship's gangway stays up until the christening: every task before it is on Anchorage, so there's
 * nowhere to sail yet. Christened (or an older save that already sailed), it's down whenever you're
 * ashore and she's moored.
 */
export function boardingOpen(q: QuestState): boolean {
  return q['Q0.11'] === 'sail' || q['Q0.11'] === 'done';
}

/** The main quest the player's on now: the first unfinished one in story order, or null when all done. */
export function currentQuest(q: QuestState): { id: string; task: string; step: string | null } | null {
  const d = COVE_QUESTS.find((c) => !c.optional && q[c.id] !== 'done');
  return d ? { id: d.id, task: d.task, step: q[d.id] ?? null } : null;
}

/**
 * Where the compass points for each quest step: interaction ids (a trailing `*` matches a prefix; the
 * nearest usable one wins) and the marker's label. Puzzles point at their parts, never at an answer.
 */
const QUEST_TARGETS: Readonly<Record<string, { ids: readonly string[]; label: string }>> = {
  'Q0.2:start': { ids: ['npc:nell'], label: 'Nell Tidewell' },
  'Q0.2:palette': { ids: ['palette:stand'], label: 'Palette stand' },
  'Q0.3:start': { ids: ['npc:merchant'], label: 'Ezra Quill' },
  'Q0.4:start': { ids: ['npc:dockhand_b'], label: 'Bo Marlin' },
  'Q0.7:start': { ids: ['npc:pim', 'npc:pol'], label: 'Pim and Pol' },
  'Q0.7:crane': { ids: ['crane:*'], label: 'The crane' },
  'Q0.7:solved': { ids: ['npc:pol'], label: 'Pol' },
  'Q0.8:start': { ids: ['npc:juno'], label: 'Juno' },
  'Q0.8:pipes': { ids: ['pipe:*'], label: 'Your ship’s rail' },
  'Q0.10:start': { ids: ['npc:nell'], label: 'Nell, by your bow' },
  'Q0.11:start': { ids: ['npc:nell'], label: 'Nell, by your bow' },
  'Q0.11:sail': { ids: ['ship:board'], label: 'The gangway' },
};

/** What the compass should point at ashore right now, or null once every task's done. */
export function questTarget(q: QuestState): { ids: readonly string[]; label: string } | null {
  const c = currentQuest(q);
  if (!c) return null;
  return QUEST_TARGETS[`${c.id}:${c.step ?? 'start'}`] ?? null;
}

/** The chests placed in the cove: chest id → which NPC it sits beside (metres to their right). */
export const COVE_CHESTS: readonly { id: string; npc: string; side: number; back: number }[] = [
  { id: 'C0.1', npc: 'nell', side: 2.1, back: 1.2 },
];

export type QuestState = Readonly<Record<string, string>>;

const done = (q: QuestState, id: string) => q[id] === 'done';

/** The scripted beat an NPC offers right now, or null to fall back to barks. */
export function npcScript(
  npc: string,
  q: QuestState,
): { steps: readonly ScriptStep[]; repeat?: string } | null {
  switch (npc) {
    case 'nell':
      if (!q['Q0.2'] || q['Q0.2'] === 'start') {
        return {
          steps: [
            // The course's order: prerequisites (the chest holds the list), what the app is, download,
            // sign in, then the theme. Signing in is one obvious button, so it's shown and told.
            { say: 'nell.papers.01' },
            { say: 'nell.papers.02' },
            { say: 'nell.papers.04' },
            { say: 'nell.papers.tools' },
            { cue: 'nell-chest' },
            { show: 'shared/github-copilot-app', caption: 'The **GitHub Copilot app**.' },
            { say: 'nell.papers.app' },
            {
              show: 'shared/github-copilot-app',
              caption: `Download and install it from [${APP_INSTALL_URL.replace('https://', '')}](${APP_INSTALL_URL}).`,
            },
            { say: 'nell.papers.03' },
            // The download link lives on in the Logbook (J) and the tracker once the spyglass closes.
            { hide: true },
            { page: 'pg.install' },
            { say: 'nell.papers.logbook' },
            { show: 'ch00/sign-in-to-app', caption: 'Open the app and select **Sign in to GitHub**.' },
            { say: 'nell.papers.signin' },
            { say: 'nell.papers.05' },
            { show: 'ch00/pick-a-theme', caption: 'Pick a theme and select **Finish**.' },
            { say: 'nell.papers.06' },
            { hide: true },
            { quest: 'Q0.2', step: 'palette' },
          ],
        };
      }
      if (q['Q0.2'] === 'palette') return { steps: [{ say: 'nell.palette.01' }] };
      if (q['Q0.10'] === 'start') return { steps: NELL_TRIAL };
      if (q['Q0.11'] === 'start') return { steps: CHRISTENING };
      if (boardingOpen(q)) return { steps: [{ say: 'nell.christen.03' }] };
      return { steps: [{ say: done(q, 'Q0.10') ? 'nell.done.02' : 'nell.done.01' }] };

    case 'lyra':
      if (q['Q0.9'] === 'start') return { steps: LYRA_SOUNDCHECK };
      return { steps: [{ say: done(q, 'Q0.9') ? 'lyra.done.01' : 'lyra.idle.01' }] };

    case 'merchant':
      if (!done(q, 'Q0.2')) return { steps: [{ say: 'ezra.wait.01' }] };
      if (!done(q, 'Q0.3')) {
        return {
          steps: [
            // The course's order: fork on GitHub (the link stays in the Logbook and tracker), then
            // add it from the New page: find the + (H0.2), see the menu it opens, and pick your fork
            // rather than the original (S0.3).
            { say: 'ezra.fork.01' },
            { term: 'fork' },
            { page: 'pg.fork' },
            { say: 'ezra.fork.link' },
            {
              show: 'shared/github-copilot-app',
              caption: 'Then add your fork to the app, starting from the **New** page.',
            },
            { say: 'ezra.fork.02' },
            { quiz: 'H0.2' },
            {
              show: 'ch00/app-add-project',
              caption: '**+** next to **Projects** → **Add GitHub repository**, then pick your fork.',
            },
            { say: 'ezra.fork.03' },
            { say: 'ezra.fork.careful' },
            { hide: true },
            { quiz: 'S0.3' },
            { page: 'C0.4', doubloons: 20 },
            { say: 'ezra.fork.04' },
            { quest: 'Q0.3', step: 'done' },
            { quest: 'Q0.4', step: 'start' },
          ],
        };
      }
      return null;

    case 'dockhand_b':
      if (!done(q, 'Q0.3') || done(q, 'Q0.4')) return null;
      return {
        steps: [
          // The course's "Check your tools in Terminal": a project session on Local repository, the
          // Terminal tab, the version checks (Bo's rack runs them, and they all pass), then GitHub
          // CLI's own sign-in.
          { say: 'bo.deck.01' },
          { term: 'project-session' },
          { say: 'bo.deck.02' },
          { quiz: 'H0.4' },
          { term: 'local-repository' },
          { term: 'worktree' },
          { page: 'C0.6', doubloons: 10 },
          {
            show: 'shared/app-review-panel',
            caption:
              '**View → Toggle Review Panel**, then the **Terminal** tab. No tab? **+** → **Terminal**.',
          },
          { say: 'bo.gear.brief.01' },
          { term: 'review-panel' },
          { hide: true },
          { say: 'bo.gear.brief.02' },
          { cue: 'gear-checks' },
          { say: 'bo.gear.brief.03' },
          { say: 'bo.gear.checked.02' },
          { quiz: 'S0.1' },
          { page: 'pg.terminal', doubloons: 10 },
          { say: 'bo.signed.02' },
          { quest: 'Q0.4', step: 'done' },
          { quest: 'Q0.7', step: 'start' },
        ],
      };

    case 'suri': {
      const step = q['Q0.6'];
      if (!step) return { steps: [{ say: 'suri.idle.dry' }] };
      if (step === 'start') {
        return {
          steps: [
            // Optional: Pim and Pol already had you turn workflows on; the mill shows what that does.
            { say: 'suri.brief.01' },
            { say: 'suri.brief.02' },
            { term: 'github-actions' },
            { say: 'suri.brief.05' },
            { quest: 'Q0.6', step: 'sluice' },
          ],
        };
      }
      if (step === 'sluice')
        return {
          steps: [{ say: 'suri.sluice.01' }],
        };
      if (step === 'solved') return { steps: SURI_SOLVED };
      return { steps: [{ say: 'suri.done.01' }] };
    }

    case 'pim':
    case 'pol': {
      const step = q['Q0.7'];
      if (!step)
        return {
          steps: [
            {
              say:
                npc === 'pim'
                  ? done(q, 'Q0.4')
                    ? 'pim.idle.ready'
                    : 'pim.idle.waiting'
                  : done(q, 'Q0.4')
                    ? 'pol.idle.ready'
                    : 'pol.idle.waiting',
            },
          ],
        };
      if (step === 'start') return { steps: CRANE_BRIEF };
      if (step === 'crane')
        return {
          steps: [{ say: npc === 'pim' ? 'pim.crane.01' : 'pol.crane.01' }],
        };
      if (step === 'solved') return { steps: POL_SOLVED };
      return {
        steps: [{ say: npc === 'pim' ? 'pim.done.01' : 'pol.done.01' }],
      };
    }

    case 'juno': {
      const step = q['Q0.8'];
      if (!step) return null;
      if (step === 'start') return { steps: JUNO_BRIEF };
      if (step === 'pipes')
        return {
          steps: [{ say: 'juno.pipes.01' }],
        };
      return {
        steps: [{ say: done(q, 'Q0.10') ? 'juno.done.sealed.01' : 'juno.done.01' }],
      };
    }

    default:
      return null;
  }
}

/**
 * The christening (Q0.11): Nell names the ship at the bow (the `christen` cue throws the coconut), Juno
 * reports the crew's aboard, and Wingman gives the sailing lesson. The naming line carries the
 * captain's own ship name, so it stays a subtitle.
 */
const CHRISTENING: readonly ScriptStep[] = [
  { say: 'nell.christen.01' },
  { text: 'I name this ship {ship}!' },
  { cue: 'christen' },
  { say: 'nell.christen.02' },
  { say: 'juno.christen.01' },
  { say: 'wingman.sail.01' },
  { say: 'wingman.sail.02' },
  // Port Meridian's open (the dev build, for now): point the way. Otherwise these waters are yours.
  { say: meridianOpen() ? 'wingman.sail.meridian' : 'wingman.sail.03' },
  { quest: 'Q0.11', step: 'sail' },
];

/**
 * The Harbormaster's Trial (Q0.10), with Nell at your bow once the first prompt's sent, so there's no
 * walk back up the harbour. Passing goes straight on to the christening.
 */
const NELL_TRIAL: readonly ScriptStep[] = [
  { say: 'nell.trial.01' },
  { say: 'wingman.trial.01' },
  { trial: 'T0' },
  { quest: 'Q0.10', step: 'done' },
  { say: 'nell.trial.02' },
  { quest: 'Q0.11', step: 'start' },
  ...CHRISTENING,
];

/** Lyra's soundcheck (Q0.9, optional): the course's recording-studio theme, and C0.5. */
const LYRA_SOUNDCHECK: readonly ScriptStep[] = [
  { say: 'lyra.soundcheck.01' },
  { say: 'lyra.soundcheck.02' },
  { page: 'C0.5', doubloons: 10 },
  { say: 'lyra.soundcheck.03' },
  { say: 'lyra.soundcheck.04' },
  { quest: 'Q0.9', step: 'done' },
];

/** Juno's opening beat (Q0.8): the course's first prompt, where it goes in the app, and two fittings on the rail. */
const JUNO_BRIEF: readonly ScriptStep[] = [
  { say: 'juno.brief.01' },
  { say: 'juno.brief.02' },
  { say: 'juno.brief.03' },
  {
    show: 'shared/app-review-panel',
    caption: 'Requests go in the **prompt box**. Commands go in **Terminal**.',
  },
  { say: 'juno.brief.04' },
  { hide: true },
  { say: 'juno.brief.05' },
  { quest: 'Q0.8', step: 'pipes' },
];

/** Suri's lines once the sluice is solved (P0.1, optional), also used if you come back after quitting. */
export const SURI_SOLVED: readonly ScriptStep[] = [
  { say: 'suri.solved.01' },
  { page: 'pg.checks', doubloons: 15 },
  { say: 'wingman.suri.01' },
  { say: 'suri.solved.02' },
  { quest: 'Q0.6', step: 'done' },
];

/**
 * Pim and Pol's opening beat (Q0.7), the course's "Add the course practice items": what the setup
 * script adds, turning on workflows in the fork's Actions tab (on GitHub.com), then P0.2.
 */
const CRANE_BRIEF: readonly ScriptStep[] = [
  { say: 'pim.brief.01' },
  { say: 'pol.brief.01' },
  { say: 'pim.brief.02' },
  { say: 'pol.brief.02' },
  { say: 'pim.brief.03' },
  { say: 'pol.brief.actions' },
  { say: 'pim.brief.actions' },
  { term: 'github-actions' },
  { page: 'pg.workflows', doubloons: 10 },
  { say: 'pol.brief.03' },
  { term: 'dry-run' },
  { say: 'pim.brief.04' },
  { quest: 'Q0.7', step: 'crane' },
];

/** Pol's closing beat once the crane's done (P0.2), also used if you come back after quitting. */
export const POL_SOLVED: readonly ScriptStep[] = [
  { say: 'pol.solved.01' },
  { say: 'pim.solved.01' },
  { page: 'P0.S', doubloons: 20 },
  { say: 'pol.solved.02' },
  { say: 'pim.solved.03' },
  { quest: 'Q0.7', step: 'done' },
  { quest: 'Q0.8', step: 'start' },
  { quest: 'Q0.6', step: 'start' },
];

/** The island this quest line belongs to, for the tracker's header. */
export const COVE_ISLAND = {
  name: 'Anchorage Cay',
  chapter: 'Chapter 00 · Setup',
  goal: 'Set up the Copilot app and earn the Seal of Anchorage',
  next: 'Port Meridian’s the next island, and she’s coming soon. Until then these waters are yours, and the compass points back to the pier.',
} as const;

export type TrackerStatus = 'done' | 'active' | 'upcoming';

export interface QuestTracker {
  island: string;
  chapter: string;
  goal: string;
  next: string;
  tasks: readonly {
    id: string;
    title: string;
    task: string;
    detail: string;
    status: TrackerStatus;
    optional: boolean;
    link?: { label: string; url: string };
  }[];
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
  return COVE_QUESTS.filter((d) => q[d.id]).map((d) => ({
    id: d.id,
    title: d.title,
    detail: d.steps[q[d.id]!] ?? '',
    done: q[d.id] === 'done',
  }));
}
