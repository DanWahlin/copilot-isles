import type { ScriptStep } from './script';

/**
 * Test Cove's slice of the Anchorage Cay quest line (POC §4.4, trimmed for the spike): Nell's papers and
 * the palette stand, Ezra's fork, Bo's deck and gear, the sluice and crane, Juno's first words, Lyra's
 * soundcheck (optional), the Harbormaster's Trial at the lighthouse, and the christening.
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

const COVE_QUESTS: readonly QuestDef[] = [
  {
    id: 'Q0.2',
    title: 'Captain’s Papers',
    task: 'Sign in and pick a theme',
    link: { label: 'Download the Copilot app', url: APP_INSTALL_URL },
    steps: {
      start: 'Talk to Nell Tidewell by the harbourmaster’s door.',
      chest: 'Open the chest beside Nell’s door.',
      palette: 'Paint your sails at the palette stand by Nell’s door, then select Finish.',
      done: 'Signed in, theme picked, and the New page is open.',
    },
  },
  {
    id: 'Q0.3',
    title: 'Copy the Master Chart',
    task: 'Fork the course and add it to Projects',
    steps: {
      start: 'Ask Ezra Quill, the chartmaker, about forks.',
      done: 'Your fork is added under Projects.',
    },
  },
  {
    id: 'Q0.4',
    title: 'Your Own Deck',
    task: 'Choose Local repository for setup',
    steps: {
      start: 'Find Bo Marlin, the quartermaster, at the storehouse.',
      done: 'Your setup session runs on Local repository.',
    },
  },
  {
    id: 'Q0.5',
    title: 'Gear Check & Right Signature',
    task: 'Check your tools in Terminal',
    steps: {
      gear: 'Find Bo’s compass, lantern, rope coil, and spyglass around the village, and hang them on his gear rack.',
      ledger: 'Read Bo’s ledger beside the gear rack. Whose signature is on it?',
      done: 'Every tool checks out, and GitHub CLI is signed in as you.',
    },
  },
  {
    id: 'Q0.6',
    title: 'Open the Sluice',
    task: 'Turn on Actions for your fork',
    steps: {
      start: 'Find Suri Okoye at the mill race past the storehouse.',
      sluice: 'Pull the gate lever, then turn the channels until the water reaches the wheel.',
      solved: 'The wheel’s turning. Talk to Suri.',
      done: 'Workflows are on, so the practice checks can run on your fork.',
    },
  },
  {
    id: 'Q0.7',
    title: 'The Dry-Run Crane',
    task: 'Add the course practice items',
    steps: {
      start: 'Find Pim and Pol at the crane on the pier head.',
      crane: 'Aim the crane at your ship, preview with Dry-Run, check the Repository line, then pull --yes.',
      solved: 'Setup complete. Talk to Pol.',
      done: 'Your fork has its practice labels, issues, branches, and pull requests.',
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
      start: 'Take the Trial at the lighthouse door.',
      done: 'The Seal of Anchorage is yours.',
    },
  },
  {
    id: 'Q0.11',
    title: 'Christen Your Ship',
    task: 'Name your ship and set sail',
    steps: {
      start: 'Meet Nell by your bow at the pier head.',
      sail: 'The gangway’s down. Walk up it to take the helm.',
      done: 'Your ship has her name, and you’ve taken her out.',
    },
  },
];

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
  'Q0.2:chest': { ids: ['chest:C0.1'], label: 'Nell’s chest' },
  'Q0.2:palette': { ids: ['palette:stand'], label: 'Palette stand' },
  'Q0.3:start': { ids: ['npc:merchant'], label: 'Ezra Quill' },
  'Q0.4:start': { ids: ['npc:dockhand_b'], label: 'Bo Marlin' },
  'Q0.5:gear': { ids: ['gear:*'], label: 'Bo’s gear' },
  'Q0.5:ledger': { ids: ['gear:ledger'], label: 'Bo’s ledger' },
  'Q0.6:start': { ids: ['npc:suri'], label: 'Suri Okoye' },
  'Q0.6:sluice': { ids: ['mill:*'], label: 'The sluice' },
  'Q0.6:solved': { ids: ['npc:suri'], label: 'Suri Okoye' },
  'Q0.7:start': { ids: ['npc:pim', 'npc:pol'], label: 'Pim and Pol' },
  'Q0.7:crane': { ids: ['crane:*'], label: 'The crane' },
  'Q0.7:solved': { ids: ['npc:pol'], label: 'Pol' },
  'Q0.8:start': { ids: ['npc:juno'], label: 'Juno' },
  'Q0.8:pipes': { ids: ['pipe:*'], label: 'Your ship’s rail' },
  'Q0.10:start': { ids: ['trial:T0'], label: 'The lighthouse' },
  'Q0.11:start': { ids: ['npc:nell'], label: 'Nell Tidewell' },
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
  { id: 'C0.1', npc: 'nell', side: 2.1, back: 0.6 },
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
            // The course's order: prerequisites, what the app is, download, then sign in.
            { say: 'nell.papers.01' },
            { say: 'nell.papers.02' },
            { show: 'shared/github-copilot-app', caption: 'The **GitHub Copilot app**.' },
            { say: 'nell.papers.app' },
            {
              show: 'shared/github-copilot-app',
              caption: `Download and install it from [${APP_INSTALL_URL.replace('https://', '')}](${APP_INSTALL_URL}).`,
            },
            { say: 'nell.papers.03' },
            // The download link lives on in the Logbook (J) and the tracker once the spyglass closes,
            // and Nell says so: it's the first page most captains get.
            { hide: true },
            { page: 'pg.install' },
            { say: 'nell.papers.logbook' },
            { show: 'ch00/sign-in-to-app', caption: 'Open the app and select **Sign in to GitHub**.' },
            { say: 'nell.papers.signin' },
            { say: 'nell.papers.04' },
            { quiz: 'H0.1' },
            { hide: true },
            { page: 'pg.prereqs' },
            { say: 'nell.papers.05' },
            { show: 'ch00/pick-a-theme', caption: 'Pick a theme and select **Finish**.' },
            { say: 'nell.papers.06' },
            { hide: true },
            { say: 'nell.papers.07' },
            { quest: 'Q0.2', step: 'chest' },
          ],
        };
      }
      if (q['Q0.2'] === 'chest') return { steps: [{ say: 'nell.chest.01' }] };
      if (q['Q0.2'] === 'palette') return { steps: [{ say: 'nell.palette.01' }] };
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
            { say: 'ezra.fork.01' },
            { term: 'fork' },
            { say: 'ezra.fork.02' },
            {
              show: 'ch00/app-add-project',
              caption: '**+** next to **Projects** → **Add GitHub repository**.',
            },
            { quiz: 'H0.2' },
            { quiz: 'H0.3' },
            { say: 'ezra.fork.03' },
            { hide: true },
            { quiz: 'MC0.1' },
            { page: 'C0.4', doubloons: 10 },
            { say: 'ezra.fork.04' },
            { quest: 'Q0.3', step: 'done' },
            { quest: 'Q0.4', step: 'start' },
          ],
        };
      }
      return null;

    case 'dockhand_b':
      if (!done(q, 'Q0.3')) return null;
      if (!done(q, 'Q0.4')) {
        return {
          steps: [
            { say: 'bo.deck.01' },
            { term: 'project-session' },
            { say: 'bo.deck.02' },
            { quiz: 'H0.4' },
            { term: 'local-repository' },
            { term: 'worktree' },
            { page: 'C0.6', doubloons: 10 },
            { quest: 'Q0.4', step: 'done' },
            { say: 'bo.gear.brief.01' },
            { say: 'bo.gear.brief.02' },
            { say: 'bo.gear.brief.03' },
            { quest: 'Q0.5', step: 'gear' },
          ],
        };
      }
      if (q['Q0.5'] === 'gear')
        return {
          steps: [{ say: 'bo.gear.reminder.01' }],
        };
      if (q['Q0.5'] === 'ledger') return { steps: [{ say: 'bo.ledger.reminder.01' }] };
      return null;

    case 'suri': {
      const step = q['Q0.6'];
      if (!step) return { steps: [{ say: 'suri.idle.dry' }] };
      if (step === 'start') {
        return {
          steps: [
            { say: 'suri.brief.01' },
            { say: 'suri.brief.02' },
            { say: 'suri.brief.03' },
            { say: 'suri.brief.04' },
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
                  ? done(q, 'Q0.6')
                    ? 'pim.idle.ready'
                    : 'pim.idle.waiting'
                  : done(q, 'Q0.6')
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
  { say: 'wingman.sail.03' },
  { quest: 'Q0.11', step: 'sail' },
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

/** Juno's opening beat (Q0.8): the course's first prompt, and two fittings on the rail. */
const JUNO_BRIEF: readonly ScriptStep[] = [
  { say: 'juno.brief.01' },
  { say: 'juno.brief.02' },
  { say: 'juno.brief.03' },
  { say: 'juno.brief.04' },
  { say: 'juno.brief.05' },
  { quest: 'Q0.8', step: 'pipes' },
];

/** Suri's lines once the sluice is solved (P0.1), also used if you come back after quitting mid-way. */
export const SURI_SOLVED: readonly ScriptStep[] = [
  { say: 'suri.solved.01' },
  { page: 'pg.workflows', doubloons: 15 },
  { say: 'wingman.suri.01' },
  { say: 'suri.solved.02' },
  { quest: 'Q0.6', step: 'done' },
  { quest: 'Q0.7', step: 'start' },
];

/** Pim and Pol's opening beat (Q0.7): what the setup script adds, before P0.2. */
const CRANE_BRIEF: readonly ScriptStep[] = [
  { say: 'pim.brief.01' },
  { say: 'pol.brief.01' },
  { say: 'pim.brief.02' },
  { say: 'pol.brief.02' },
  { say: 'pim.brief.03' },
  { term: 'dry-run' },
  { say: 'pol.brief.03' },
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
