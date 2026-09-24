import type { ScriptStep } from './script';

/**
 * Test Cove's slice of the Anchorage Cay quest line (POC §4.4, trimmed for the spike): Nell's papers,
 * Ezra's fork, Bo's deck and gear, and the Harbormaster's Trial at the lighthouse.
 */
export interface QuestDef {
  id: string;
  title: string;
  /** Step id → what the Logbook says to do next. `done` marks completion. */
  steps: Record<string, string>;
}

export const COVE_QUESTS: readonly QuestDef[] = [
  {
    id: 'Q0.2',
    title: 'Captain’s Papers',
    steps: {
      start: 'Talk to Nell Tidewell by the harbourmaster’s door.',
      chest: 'Open the chest beside Nell’s door.',
      done: 'Signed in, theme picked, and the New page is open.',
    },
  },
  {
    id: 'Q0.3',
    title: 'Copy the Master Chart',
    steps: {
      start: 'Ask Ezra Quill, the chartmaker, about forks.',
      done: 'Your fork is added under Projects.',
    },
  },
  {
    id: 'Q0.4',
    title: 'Your Own Deck',
    steps: {
      start: 'Find Bo Marlin, the quartermaster, at the storehouse.',
      done: 'Your setup session runs on Local repository.',
    },
  },
  {
    id: 'Q0.5',
    title: 'Gear Check & Right Signature',
    steps: {
      gear: 'Find Bo’s compass, lantern, rope coil, and spyglass around the village, and hang them on his gear rack.',
      ledger: 'Read Bo’s ledger beside the gear rack. Whose signature is on it?',
      done: 'Every tool checks out, and GitHub CLI is signed in as you.',
    },
  },
  {
    id: 'Q0.6',
    title: 'Open the Sluice',
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
    steps: {
      start: 'Find Pim and Pol at the crane on the pier head.',
      crane: 'Aim the crane at your ship, preview with Dry-Run, check the Repository line, then pull --yes.',
      solved: 'Setup complete. Talk to Pol.',
      done: 'Your fork is stocked with labels, issues, practice branches, and pull requests.',
    },
  },
  {
    id: 'Q0.8',
    title: 'First Words',
    steps: {
      start: 'Find Juno, your first mate, on the pier beside your ship.',
      pipes: 'Send the course’s first prompt to the agent. Which fitting on your ship’s rail carries it?',
      done: 'Your first prompt went to the agent, and the crew answered.',
    },
  },
  {
    id: 'Q0.10',
    title: 'The Harbormaster’s Trial',
    steps: {
      start: 'Take the Trial at the lighthouse door.',
      done: 'The Seal of Anchorage is yours.',
    },
  },
];

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
            { say: 'nell.papers.01' },
            { text: 'First things first: download and install the GitHub Copilot app for your system.' },
            { show: 'ch00/sign-in-to-app', caption: 'Open the app and select **Sign in to GitHub**.' },
            { say: 'nell.papers.02' },
            {
              text: 'On Copilot Business or Enterprise, your org has to switch on the GitHub Copilot app policy. Now, show me how you’d sign in.',
            },
            { quiz: 'H0.1' },
            { hide: true },
            { page: 'pg.prereqs' },
            {
              text: 'At Connect your repositories, carry on without adding one. You’ll connect your fork shortly. Then pick a theme and select Finish.',
            },
            { show: 'ch00/pick-a-theme', caption: 'Pick a theme and select **Finish**.' },
            { say: 'nell.settings.01' },
            { hide: true },
            {
              text: 'There’s a chest by my door with your first Logbook page. Then go and see Ezra, the chartmaker.',
            },
            { quest: 'Q0.2', step: 'chest' },
          ],
        };
      }
      if (q['Q0.2'] === 'chest') return { steps: [{ text: 'The chest’s right beside my door, Captain.' }] };
      return {
        steps: [
          { text: done(q, 'Q0.10') ? 'A sealed captain! Fair winds.' : 'Papers in order. Off you go!' },
        ],
      };

    case 'merchant':
      if (!done(q, 'Q0.2'))
        return { steps: [{ text: 'Get your papers from Nell first, Captain. Then we’ll talk charts.' }] };
      if (!done(q, 'Q0.3')) {
        return {
          steps: [
            {
              text: 'Every captain needs their own chart. A fork is your own copy of the course repository, on GitHub.',
            },
            { term: 'fork' },
            { text: 'Once you’ve forked it, add it to the app. Where would you start?' },
            {
              show: 'ch00/app-add-project',
              caption: '**+** next to **Projects** → **Add GitHub repository**.',
            },
            { quiz: 'H0.2' },
            { quiz: 'H0.3' },
            {
              text: 'Then search for copilot-app-for-beginners and pick your fork. The app clones it and adds it to the sidebar.',
            },
            { hide: true },
            { quiz: 'MC0.1' },
            { page: 'C0.4', doubloons: 10 },
            { text: 'Bo, the quartermaster, will get your deck ready. You’ll find him at the storehouse.' },
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
            {
              text: 'Your project shows under Projects? Good. Select the + next to it to start a project session.',
            },
            { term: 'project-session' },
            {
              text: 'Now, the workspace selector below the prompt box. Don’t trust the checkmark, it just shows the default.',
            },
            { quiz: 'H0.4' },
            { term: 'local-repository' },
            { term: 'worktree' },
            { page: 'C0.6', doubloons: 10 },
            { quest: 'Q0.4', step: 'done' },
            {
              text: 'Next, your tools. Open View, then Toggle Review Panel, and pick the Terminal tab. No tab? Select + and then Terminal.',
            },
            {
              text: 'Every tool gets a version check there. Here, each tool is a piece of my gear, and four pieces have gone walkabout round the village.',
            },
            {
              text: 'My compass, a lantern, a rope coil, and my spyglass. Hang them on the rack by my door, and each hook runs its check.',
            },
            { quest: 'Q0.5', step: 'gear' },
          ],
        };
      }
      if (q['Q0.5'] === 'gear')
        return {
          steps: [{ text: 'Hang the gear on my rack, Captain. Each hook runs its version check.' }],
        };
      if (q['Q0.5'] === 'ledger')
        return { steps: [{ text: 'Read my ledger there on the lectern. Whose signature is on it?' }] };
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
          steps: [{ say: done(q, 'Q0.6') ? 'pim.idle.ready' : 'pol.idle.waiting' }],
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
          steps: [
            {
              text: 'It’s a request for the agent, not a command. Pick the fitting on the rail that carries it.',
            },
          ],
        };
      return {
        steps: [
          {
            text: done(q, 'Q0.10')
              ? 'The crew’s proud of you, Captain. Wherever you sail next, they’re listening.'
              : 'The crew knows the ship now. The Harbormaster’s Trial waits at the lighthouse.',
          },
        ],
      };
    }

    default:
      return null;
  }
}

/** Juno's opening beat (Q0.8): the course's first prompt, and two fittings on the rail. */
const JUNO_BRIEF: readonly ScriptStep[] = [
  { text: 'Juno, your first mate. Setup’s done, so let’s give the crew their first order.' },
  { text: 'In the app, you’d send this to the agent from your project session:' },
  {
    text: '“Give me an overview of the copilot-app-for-beginners course repository. Focus on the learning path and the samples/book-app-web folder.”',
  },
  {
    text: 'You’ve been running commands in Terminal all morning. This one’s different. It’s a request for the agent.',
  },
  {
    text: 'Two fittings on the rail, just behind me. The brass speaking tube goes up to the crew, and the iron hatch goes down to the engine room. Your call, Captain.',
  },
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
  {
    speaker: 'Pim',
    text: 'Your first mate’s waiting by your ship, Captain. Juno’s got your first order ready.',
  },
  { quest: 'Q0.7', step: 'done' },
  { quest: 'Q0.8', step: 'start' },
];

/** The quest log for the Logbook, in story order, for quests that have started. */
export function questLog(q: QuestState): { id: string; title: string; detail: string; done: boolean }[] {
  return COVE_QUESTS.filter((d) => q[d.id]).map((d) => ({
    id: d.id,
    title: d.title,
    detail: d.steps[q[d.id]!] ?? '',
    done: q[d.id] === 'done',
  }));
}
