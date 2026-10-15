import type { Crew } from './types';

/**
 * Round 3 of Channel Routing (docs/specs/ISLAND-02-thousand-bough.md §5.3): every crew has its own
 * channel now, and you pick where each one works, as the workspace selector does for a session
 * (02 §Where a Session Runs: "The choices trade off speed against isolation"). Each crew's order is
 * one row of the course's "Choose it when..." column. A new worktree is never wrong where the order
 * leaves it open (the section's tip: "When in doubt, choose a new worktree"; Key Takeaway 2: "the safe
 * default"), so the quick look takes Current checkout or New worktree. Cloud is the only answer just
 * where the order asks to offload the work and keep the machine untouched.
 */
export type Workspace = 'worktree' | 'checkout' | 'cloud';

/** The three places, in the selector's order (keys 1-3), with the island's picture for each. */
export const WORKSPACES: readonly { id: Workspace; name: string; icon: string; island: string }[] = [
  { id: 'worktree', name: 'New worktree', icon: '🌿', island: 'Its own channel' },
  { id: 'checkout', name: 'Current checkout', icon: '🏛️', island: 'Through the Great Hall' },
  { id: 'cloud', name: 'Cloud', icon: '☁️', island: 'Up the gondola' },
];

export interface CrewOrder {
  /** What the crew's been asked to do (on screen). */
  order: string;
  /** The place the order describes (Wingman's hint puts the crew here). */
  best: Workspace;
  /** Every place that's right for the order (`best` and, where the order allows, New worktree). */
  accept: readonly Workspace[];
  /** What a right place says, where it says more than "fits this order". */
  right?: Readonly<Partial<Record<Workspace, string>>>;
  /** Why each other place isn't it (unvoiced; Fen says the voiced line for the best place). */
  why: Readonly<Partial<Record<Workspace, string>>>;
}

export const CREW_ORDERS: Readonly<Record<Crew, CrewOrder>> = {
  feature: {
    order: 'Build the reading list. Keep its changes, branch and diff apart from main, on your machine.',
    best: 'worktree',
    accept: ['worktree'],
    why: {
      checkout:
        'Feature’s changes ran through the Great Hall, your working folder. To keep them apart from main, pick New worktree.',
      cloud:
        'Cloud runs it off your machine. Feature wants its own folder and branch right here: New worktree.',
    },
  },
  bugfix: {
    order: 'A long job to offload. Keep your own machine untouched.',
    best: 'cloud',
    accept: ['cloud'],
    why: {
      worktree:
        'A new worktree still runs on your machine. To offload the work and keep your deck untouched, send it by Cloud.',
      checkout:
        'Current checkout works right in your folder, the opposite of untouched. Send Bug Fix by Cloud.',
    },
  },
  docs: {
    order: 'Just a quick, low-stakes look at the README. Touching your working folder is fine.',
    best: 'checkout',
    accept: ['checkout', 'worktree'],
    right: {
      checkout: 'Right: a quick, low-stakes look can run in your current checkout.',
      worktree:
        'That works too. A new worktree is the safe default; for a quick look, Current checkout is fine as well.',
    },
    why: {
      cloud:
        'Cloud offloads the work. For a quick, low-stakes look, Current checkout is fine, and a new worktree is the safe default.',
    },
  },
};

/** What Fen says when a crew's in the wrong place: why its best place fits (voice line ids). */
export const BEST_LINE: Readonly<Record<Workspace, string>> = {
  worktree: 'tb.fen.ws.worktree',
  checkout: 'tb.fen.ws.checkout',
  cloud: 'tb.fen.ws.cloud',
};

/** Whether a place suits a crew's order. */
export const fits = (crew: Crew, w: Workspace) => CREW_ORDERS[crew].accept.includes(w);

export const workspaceName = (w: Workspace) => WORKSPACES.find((x) => x.id === w)!.name;
