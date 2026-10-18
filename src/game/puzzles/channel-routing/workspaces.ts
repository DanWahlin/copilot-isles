import { onCourse } from '../../../course/active';
import type { PuzzleFile } from '../../../course/pack';
import { lineOf, puzzleContent, puzzleMaybe } from '../../../course/puzzles';
import type { Crew } from './types';

/**
 * Round 3 of Channel Routing (docs/specs/ISLAND-02-thousand-bough.md §5.3): every crew has its own
 * channel now, and you pick where each one works, as the workspace selector does for a session
 * (02 §Where a Session Runs: "The choices trade off speed against isolation"). Each crew's order is
 * one row of the course's "Choose it when..." column. A new worktree is never wrong where the order
 * leaves it open (the section's tip: "When in doubt, choose a new worktree"; Key Takeaway 2: "the safe
 * default"), so the quick look takes Current checkout or New worktree. Cloud is the only answer just
 * where the order asks to offload the work and keep the machine untouched. The places' names and the
 * crews' orders are the course pack's `puzzles/workspaces.json`; what each place does to the water
 * is the game's (`ChannelRoutingModel.runWorkspaces`).
 */
export type Workspace = 'worktree' | 'checkout' | 'cloud';

export interface WorkspacePlace {
  id: Workspace;
  name: string;
  icon: string;
  /** The island's picture for it. */
  island: string;
}

/** `puzzles/workspaces.json` (match: each crew to the place its order fits). */
interface WorkspacesFile extends PuzzleFile {
  places: readonly WorkspacePlace[];
  orders: Readonly<Record<Crew, CrewOrder>>;
}

export const workspacesContent = () => puzzleContent<WorkspacesFile>('workspaces');

/** The three places, in the selector's order (keys 1-3), with the island's picture for each. */
export let WORKSPACES: readonly WorkspacePlace[] = [];

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

export let CREW_ORDERS: Readonly<Record<Crew, CrewOrder>> = {} as Record<Crew, CrewOrder>;

/** What Fen says when a crew's in the wrong place: why its best place fits (voice line ids). */
export let BEST_LINE: Readonly<Record<Workspace, string>> = {} as Record<Workspace, string>;

onCourse(() => {
  const c = puzzleMaybe<WorkspacesFile>('workspaces');
  WORKSPACES = c?.places ?? [];
  CREW_ORDERS = c?.orders ?? ({} as Record<Crew, CrewOrder>);
  const best = (k: string) => (c ? lineOf(c, `best.${k}`) : '');
  BEST_LINE = { worktree: best('worktree'), checkout: best('checkout'), cloud: best('cloud') };
});

/** Whether a place suits a crew's order. */
export const fits = (crew: Crew, w: Workspace) => CREW_ORDERS[crew].accept.includes(w);

export const workspaceName = (w: Workspace) => WORKSPACES.find((x) => x.id === w)!.name;
