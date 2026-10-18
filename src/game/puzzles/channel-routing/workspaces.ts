import { onCourse } from '../../../course/active';
import type { PuzzleFile } from '../../../course/pack';
import { lineOf, puzzleContent, puzzleMaybe, rekey } from '../../../course/puzzles';
import type { ChannelRoutingFile } from './boards';
import type { Crew } from './types';

/**
 * Round 3 of Channel Routing (docs/specs/ISLAND-02-thousand-bough.md §5.3): every crew has its own
 * channel now, and you pick where each one works. The game's places are what they do to the water
 * (`ChannelRoutingModel.runWorkspaces`): `channel` runs a crew down its own channel to its wheel,
 * `hall` runs it through the Great Hall, and `gondola` sends its work off the deck. The course pack's
 * `puzzles/workspaces.json` names its places (each bound to one, `acts`) and writes each crew's order
 * (for the Copilot app course: New worktree, Current checkout and Cloud, from 02 §Where a Session
 * Runs, where a new worktree is never wrong if the order leaves it open).
 */
export const WORKSPACE_IDS = ['channel', 'hall', 'gondola'] as const;
export type Workspace = (typeof WORKSPACE_IDS)[number];

export interface WorkspacePlace {
  id: Workspace;
  name: string;
  icon: string;
  /** The island's picture for it. */
  island: string;
}

/** A crew's order as the pack writes it: places by the course's ids. */
interface CrewOrderFile {
  order: string;
  best: string;
  accept: readonly string[];
  right?: Readonly<Record<string, string>> | null;
  why: Readonly<Record<string, string>>;
}

/** `puzzles/workspaces.json` (match: each crew to the place its order fits), by the course's ids. */
interface WorkspacesFile extends PuzzleFile {
  places: readonly (Omit<WorkspacePlace, 'id'> & { id: string; acts: Workspace })[];
  /** Keyed by the course's crew ids (`puzzles/channel-routing.json` → `crews`). */
  orders: Readonly<Record<string, CrewOrderFile>>;
}

export const workspacesContent = () => puzzleContent<WorkspacesFile>('workspaces');

/** The three places, in the selector's order (keys 1-3), with the island's picture for each. */
export let WORKSPACES: readonly WorkspacePlace[] = [];

export interface CrewOrder {
  /** What the crew's been asked to do (on screen). */
  order: string;
  /** The place the order describes (Wingman's hint puts the crew here). */
  best: Workspace;
  /** Every place that's right for the order (`best` and, where the order allows, others). */
  accept: readonly Workspace[];
  /** What a right place says, where it says more than "fits this order". */
  right?: Readonly<Partial<Record<Workspace, string>>> | null;
  /** Why each other place isn't it (unvoiced; Fen says the voiced line for the best place). */
  why: Readonly<Partial<Record<Workspace, string>>>;
}

export let CREW_ORDERS: Readonly<Record<Crew, CrewOrder>> = {} as Record<Crew, CrewOrder>;

/** What Fen says when a crew's in the wrong place: why its best place fits (voice line ids). */
export let BEST_LINE: Readonly<Record<Workspace, string>> = {} as Record<Workspace, string>;

onCourse(() => {
  const c = puzzleMaybe<WorkspacesFile>('workspaces');
  const crews = puzzleMaybe<ChannelRoutingFile>('channel-routing')?.crews;
  const acts = Object.fromEntries((c?.places ?? []).map((p) => [p.id, p.acts])) as Record<string, Workspace>;
  const byPlace = <T>(r: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [acts[k], v])) as Partial<Record<Workspace, T>>;
  WORKSPACES = (c?.places ?? []).map(({ acts: id, name, icon, island }) => ({ id, name, icon, island }));
  CREW_ORDERS =
    c && crews
      ? rekey(
          crews,
          Object.fromEntries(
            Object.entries(c.orders).map(([k, o]): [string, CrewOrder] => [
              k,
              {
                order: o.order,
                best: acts[o.best]!,
                accept: o.accept.map((a) => acts[a]!),
                right: o.right ? byPlace(o.right) : o.right,
                why: byPlace(o.why),
              },
            ]),
          ),
        )
      : ({} as Record<Crew, CrewOrder>);
  const best = (k: Workspace) => (c ? lineOf(c, `best.${k}`) : '');
  BEST_LINE = { channel: best('channel'), hall: best('hall'), gondola: best('gondola') };
});

/** Whether a place suits a crew's order. */
export const fits = (crew: Crew, w: Workspace) => CREW_ORDERS[crew].accept.includes(w);

export const workspaceName = (w: Workspace) => WORKSPACES.find((x) => x.id === w)!.name;
