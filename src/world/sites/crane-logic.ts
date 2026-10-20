/**
 * P0.2 The Dry-Run Crane (POC §4.5). Pure logic (no three.js) for the capstan, the Dry-Run and
 * `--yes` levers, and what the `Repository:` sign says, so the guards are unit-tested.
 *
 * It follows the course's real setup script (.github/scripts/setup-training-scenarios.js):
 * - `--dry-run` prints `Repository: owner/name` and the planned changes for whatever repository the
 *   clone points at, without changing anything.
 * - `--yes` refuses a repository you don't own ("Refusing to change shared or upstream
 *   repository…") unless `--allow-shared-repository` is added.
 * - Outside a clone it stops with "Run this script from the root of a cloned Git repository."
 * - While your fork's GitHub Actions workflows are off (Suri's gate is down), `--dry-run` warns
 *   `[dry-run] GitHub Actions is not active. Enable workflows at …/actions before running with
 *   --yes.` and `--yes` stops with `Setup failed: The Book app web workflow is not active. Open
 *   …/actions, enable workflows for the fork, then rerun the setup script.` (the script's own words;
 *   Chapter 00 · Add the Course Practice Items, steps 1–3, come before the dry run). The other
 *   captains' forks have theirs on.
 * - "Preview first" is the course's rule rather than the script's, so Pol enforces it.
 *
 * Your berth shows your own fork when you've given it (Ezra's register or the crane's form), passed
 * in as `yours`; otherwise the placeholder (`FORK_PLACEHOLDER`).
 *
 * The game owns the berths, their headings and the guards (a procedure with a dry run); whose ship
 * is at each berth, what the script stocks and prints, and what Pim and Pol say are the course
 * pack's (`puzzles/crane.json`).
 */
import { onCourse } from '../../course/active';
import type { PuzzleFile } from '../../course/pack';
import { fill, puzzleContent, puzzleMaybe, textOf } from '../../course/puzzles';
import { FORK_PLACEHOLDER } from '../../learn/fork';

type Owner = 'you' | 'captain' | 'guild';

export interface CraneFacing {
  id: 'berth1' | 'berth2' | 'berth3' | 'quay';
  berth: 1 | 2 | 3 | null;
  /** Arm heading (0 = +z south, π/2 = +x east), the same convention as the player's heading. */
  heading: number;
  owner: Owner | null;
  repository: string | null;
  /** Whose sloop it is, for Pim's remark (another captain's berth only). */
  captain?: string;
}

export const YOUR_REPOSITORY = FORK_PLACEHOLDER;

type Spare = { repository: string; captain?: string };

/** `puzzles/crane.json`. */
export interface CraneFile extends PuzzleFile {
  /** Whose ship is at each berth (`you`: the player's fork), and nobody's over the quay. */
  targets: Readonly<
    Record<CraneFacing['id'], { owner: Owner | null; repository?: string; captain?: string }>
  >;
  /** Stand-ins for the other berths if the player's own fork happens to share an owner with one. */
  spares: Readonly<Record<'captain' | 'guild', Spare>>;
  /** What the script stocks your repository with, one crate per kind. */
  cargo: readonly { id: string; acts: CargoProp; title: string; count: number }[];
  /** The command line the terminal shows (its flags are text). */
  command: string;
  /** Your fork's Actions tab, `{repository}` filled in. */
  actionsUrl: string;
  /** How the readout inks lines: someone else's or a failure (prefixes), and success. */
  tones: { other: readonly string[]; ok: readonly string[]; okPrefix: readonly string[] };
}

export const craneContent = () => puzzleContent<CraneFile>('crane');
const T = (key: string, v?: Readonly<Record<string, string | number>>) => textOf(craneContent(), key, v);

/** The game's berths, in the order the capstan turns them (clockwise from above): west, north, east, south. */
const BERTHS: readonly Pick<CraneFacing, 'id' | 'berth' | 'heading'>[] = [
  { id: 'berth2', berth: 2, heading: -Math.PI / 2 },
  { id: 'berth3', berth: 3, heading: Math.PI },
  { id: 'berth1', berth: 1, heading: Math.PI / 2 },
  { id: 'quay', berth: null, heading: 0 },
];

/** The berths with the course's ships (your berth shows the placeholder). */
export let CRANE_FACINGS: readonly CraneFacing[] = [];
let DECOY_SPARES: Readonly<Record<'captain' | 'guild', Spare>> = {
  captain: { repository: '' },
  guild: { repository: '' },
};

const ownerOf = (repo: string) => repo.split('/')[0]!.toLowerCase();

/**
 * The berths with your own fork on yours. The other captains' forks stay as decoys, swapped for a
 * spare if one shares your fork's owner (so only your berth ever shows your name).
 */
export function craneFacings(yours: string = YOUR_REPOSITORY): readonly CraneFacing[] {
  if (yours === YOUR_REPOSITORY) return CRANE_FACINGS;
  return CRANE_FACINGS.map((f) => {
    if (f.owner === 'you') return { ...f, repository: yours };
    if ((f.owner === 'captain' || f.owner === 'guild') && ownerOf(f.repository!) === ownerOf(yours))
      return { ...f, ...DECOY_SPARES[f.owner] };
    return f;
  });
}

/** The crane starts aimed at another captain's sloop (POC §4.5). */
export const CRANE_START = 0;
export let YOUR_FACING = 2;

/** The crates' props the yard can land (the game's art): a course binds each of its kinds to one. */
export const CARGO_PROPS = ['pennants', 'notices', 'hulls', 'seals'] as const;
export type CargoProp = (typeof CARGO_PROPS)[number];
export interface CraneCargo {
  /** The course's id for the kind. */
  id: string;
  title: string;
  count: number;
  prop: CargoProp;
}

/** What the script stocks your repository with, one crate per kind (counts match the script). */
export let CRANE_CARGO: readonly CraneCargo[] = [];
export let SETUP_COMMAND = '';

onCourse(() => {
  // A course that turns the crane off keeps it as scenery: nobody's ships, no cargo, blank boards.
  const c = puzzleMaybe<CraneFile>('crane');
  if (!c?.targets) {
    CRANE_FACINGS = BERTHS.map((b) => ({ ...b, owner: null, repository: null }));
    YOUR_FACING = -1;
    CRANE_CARGO = [];
    SETUP_COMMAND = '';
    return;
  }
  CRANE_FACINGS = BERTHS.map((b) => {
    const t = c.targets[b.id];
    return {
      ...b,
      owner: t.owner,
      repository: t.owner === 'you' ? YOUR_REPOSITORY : (t.repository ?? null),
      ...(t.captain ? { captain: t.captain } : {}),
    };
  });
  DECOY_SPARES = c.spares;
  YOUR_FACING = CRANE_FACINGS.findIndex((f) => f.owner === 'you');
  CRANE_CARGO = c.cargo.map((k) => ({ id: k.id, title: k.title, count: k.count, prop: k.acts }));
  SETUP_COMMAND = c.command;
});

export interface CraneState {
  facing: number;
  /** The facing the last finished dry run previewed (cleared when the capstan turns). */
  preview: number | null;
  /** `--yes` ran on your repository: "Setup complete." */
  complete: boolean;
}

export type CraneEvent =
  | { kind: 'turned'; facing: number }
  | { kind: 'preview'; facing: number; owner: Owner; repository: string }
  | { kind: 'not-a-repo' }
  | { kind: 'preview-first' }
  | { kind: 'refused'; owner: Exclude<Owner, 'you'>; repository: string }
  /** `--yes` on your fork while its workflows are off. */
  | { kind: 'gate-shut'; repository: string }
  | { kind: 'complete'; repository: string }
  | { kind: 'already' };

export interface CraneStep {
  state: CraneState;
  event: CraneEvent;
}

const wrap = (i: number) => ((i % CRANE_FACINGS.length) + CRANE_FACINGS.length) % CRANE_FACINGS.length;

export function initialCrane(): CraneState {
  return { facing: CRANE_START, preview: null, complete: false };
}

/** Restores a saved state, falling back to the start for anything out of range. */
export function restoreCrane(saved: readonly number[] | undefined, solved: boolean): CraneState {
  if (solved) return { facing: YOUR_FACING, preview: YOUR_FACING, complete: true };
  const f = saved?.[0];
  const p = saved?.[1];
  const facing = Number.isInteger(f) ? wrap(f!) : CRANE_START;
  const preview = Number.isInteger(p) && p! >= 0 && wrap(p!) === facing ? facing : null;
  return { facing, preview, complete: false };
}

export function saveCrane(s: CraneState): number[] {
  return [s.facing, s.preview ?? -1];
}

/** One quarter turn of the capstan. A new target needs a new preview. */
export function turnCapstan(s: CraneState): CraneStep {
  if (s.complete) return { state: s, event: { kind: 'already' } };
  const facing = wrap(s.facing + 1);
  return { state: { ...s, facing, preview: null }, event: { kind: 'turned', facing } };
}

/** `node .github/scripts/setup-training-scenarios.js --dry-run` */
export function dryRun(s: CraneState, yours: string = YOUR_REPOSITORY): CraneStep {
  if (s.complete) return { state: s, event: { kind: 'already' } };
  const f = craneFacings(yours)[s.facing]!;
  if (!f.owner || !f.repository) return { state: { ...s, preview: null }, event: { kind: 'not-a-repo' } };
  return {
    state: { ...s, preview: s.facing },
    event: { kind: 'preview', facing: s.facing, owner: f.owner, repository: f.repository },
  };
}

/**
 * `node .github/scripts/setup-training-scenarios.js --yes`. `actionsOn`: your fork's workflows are
 * enabled (the script checks after the shared-repository guard, as here).
 */
export function confirmYes(s: CraneState, yours: string = YOUR_REPOSITORY, actionsOn = true): CraneStep {
  if (s.complete) return { state: s, event: { kind: 'already' } };
  const f = craneFacings(yours)[s.facing]!;
  if (!f.owner || !f.repository) return { state: s, event: { kind: 'not-a-repo' } };
  if (s.preview !== s.facing) return { state: s, event: { kind: 'preview-first' } };
  if (f.owner !== 'you')
    return { state: s, event: { kind: 'refused', owner: f.owner, repository: f.repository } };
  if (!actionsOn) return { state: s, event: { kind: 'gate-shut', repository: f.repository } };
  return { state: { ...s, complete: true }, event: { kind: 'complete', repository: f.repository } };
}

/** Your fork's Actions tab, as the script prints it. */
export const actionsUrl = (repository: string): string => fill(craneContent().actionsUrl, { repository });

/** The script's dry-run warning while the fork's workflows are off (its exact words). */
export const actionsWarning = (repository: string): string =>
  T('actionsWarning', { url: actionsUrl(repository) });

/** The script's `--yes` failure while the fork's workflows are off (its exact words). */
export const actionsFailure = (repository: string): string =>
  T('actionsFailure', { url: actionsUrl(repository) });

/** The painted `Repository:` sign on the arm (two lines), after `event` (or the state alone). */
export function signLines(
  s: CraneState,
  event?: CraneEvent,
  yours: string = YOUR_REPOSITORY,
): [string, string] {
  if (s.complete) return [T('repository', { repository: yours }), T('complete')];
  switch (event?.kind) {
    case 'not-a-repo':
      return [T('failed'), T('notARepoSign')];
    case 'refused':
      return [T('refusedSign'), event.repository];
    case 'gate-shut':
      return [T('failed'), T('actionsOffSign')];
    default:
      break;
  }
  const f = craneFacings(yours)[s.facing]!;
  if (s.preview === s.facing && f.repository)
    return [T('repository', { repository: f.repository }), T('defaultBranch')];
  return [T('repositoryEmpty'), T('pullDryRun')];
}

const planned = () => {
  const counts = Object.fromEntries(CRANE_CARGO.map((c) => [c.id, c.count]));
  return [T('plannedA', counts), T('plannedB', counts)];
};
const cmd = (flag: 'dryRunFlag' | 'yesFlag') => `${SETUP_COMMAND} ${T(flag)}`;

/**
 * The terminal panel at the crane: what the setup script printed last, after `event` (or the
 * state alone). The arm sign carries the `Repository:` line; this is the whole readout.
 * `actionsOn`: your fork's workflows are enabled (else its dry run carries the script's warning).
 */
export function terminalLines(
  s: CraneState,
  event?: CraneEvent,
  yours: string = YOUR_REPOSITORY,
  actionsOn = true,
): string[] {
  const [a, b] = planned();
  if (s.complete)
    return [
      cmd('yesFlag'),
      T('repository', { repository: yours }),
      T('created', { a: a! }),
      T('plannedEnd', { b: b! }),
      T('complete'),
    ];
  switch (event?.kind) {
    case 'not-a-repo':
      return [cmd('dryRunFlag'), T('notARepo1'), T('notARepo2')];
    case 'refused':
      return [
        cmd('yesFlag'),
        T('repository', { repository: event.repository }),
        T('refused1'),
        T('refused2'),
      ];
    case 'gate-shut':
      return [
        cmd('yesFlag'),
        T('repository', { repository: event.repository }),
        T('defaultBranch'),
        actionsFailure(event.repository),
      ];
    default:
      break;
  }
  const f = craneFacings(yours)[s.facing]!;
  if (s.preview === s.facing && f.repository)
    return [
      cmd('dryRunFlag'),
      T('repository', { repository: f.repository }),
      T('defaultBranch'),
      ...(f.owner === 'you' && !actionsOn ? [actionsWarning(f.repository)] : []),
      T('wouldCreate', { a: a! }),
      T('wouldCreateMore', { b: b! }),
      T('dryRunDone'),
    ];
  return [SETUP_COMMAND, '', T('pullDryRun')];
}

export type LineTone = 'cmd' | 'you' | 'other' | 'ok';

/** How a readout line is inked: the command, your fork, anyone else's (and failures), or success. */
export function lineTone(line: string, yours: string = YOUR_REPOSITORY): LineTone | undefined {
  const yourOwner = `${yours.split('/')[0]}/`;
  if (line.startsWith('$')) return 'cmd';
  const repo = repositoryIn(line);
  if (repo === yours || line.endsWith(` ${yours}`) || line === yours || line === yourOwner) return 'you';
  const c = craneContent();
  if (repo !== null || /^[\w-]+\/$/.test(line) || c.tones.other.some((p) => line.startsWith(p)))
    return 'other';
  if (c.tones.ok.includes(line) || c.tones.okPrefix.some((p) => line.startsWith(p))) return 'ok';
  return undefined;
}

/** The pack's `repository` line around its `{repository}`: the words before it and after it. */
function repositoryWords(): { before: string; after: string } | null {
  const t = T('repository');
  const at = t.indexOf('{repository}');
  return at < 0 ? null : { before: t.slice(0, at), after: t.slice(at + '{repository}'.length) };
}

/** The repository a readout line names, if it's the pack's `repository` line; else null. */
export function repositoryIn(line: string): string | null {
  const w = repositoryWords();
  if (!w || line.length <= w.before.length + w.after.length) return null;
  if (!line.startsWith(w.before) || !line.endsWith(w.after)) return null;
  return line.slice(w.before.length, line.length - w.after.length);
}

/**
 * The arm sign's lettering: the pack's `repository` line splits so the owner gets a line of its own,
 * big enough to read from the levers, and its `defaultBranch` line stays in the terminal.
 */
export function jibLines(lines: readonly string[]): string[] {
  const branch = T('defaultBranch');
  return lines.flatMap((l) => {
    if (l === branch) return [];
    const repo = repositoryIn(l);
    const slash = repo?.indexOf('/') ?? -1;
    if (!repo || slash <= 0) return [l];
    const w = repositoryWords()!;
    const label = w.before.trim();
    const owner = repo.slice(0, slash + 1);
    const name = repo.slice(slash + 1) + w.after;
    return label ? [label, owner, name] : [owner, name];
  });
}

/** Which berth to point at for hint tier 3, and whether you're already there. */
export function craneHintTarget(s: CraneState): { facing: number; turnsNeeded: number } {
  return { facing: YOUR_FACING, turnsNeeded: wrap(YOUR_FACING - s.facing) };
}
