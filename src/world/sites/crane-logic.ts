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
 * - "Preview first" is the course's rule rather than the script's, so Pol enforces it.
 */
export type Owner = 'you' | 'captain' | 'guild';

export interface CraneFacing {
  id: 'berth1' | 'berth2' | 'berth3' | 'quay';
  berth: 1 | 2 | 3 | null;
  /** Arm heading (0 = +z south, π/2 = +x east), the same convention as the player's heading. */
  heading: number;
  owner: Owner | null;
  repository: string | null;
}

export const YOUR_REPOSITORY = 'your-handle/copilot-app-for-beginners';

/** In the order the capstan turns them (clockwise seen from above): west, north, east, south. */
export const CRANE_FACINGS: readonly CraneFacing[] = [
  {
    id: 'berth2',
    berth: 2,
    heading: -Math.PI / 2,
    owner: 'captain',
    repository: 'm-reyes/copilot-app-for-beginners',
  },
  {
    id: 'berth3',
    berth: 3,
    heading: Math.PI,
    owner: 'guild',
    repository: 'harbour-guild/copilot-app-for-beginners',
  },
  { id: 'berth1', berth: 1, heading: Math.PI / 2, owner: 'you', repository: YOUR_REPOSITORY },
  { id: 'quay', berth: null, heading: 0, owner: null, repository: null },
];

/** The crane starts aimed at another captain's sloop (POC §4.5). */
export const CRANE_START = 0;
export const YOUR_FACING = CRANE_FACINGS.findIndex((f) => f.owner === 'you');

/** What the script stocks your repository with, one crate per kind (counts match the script). */
export const CRANE_CARGO = [
  { id: 'labels', title: 'Labels', count: 9, prop: 'pennants' },
  { id: 'issues', title: 'Issues', count: 5, prop: 'notices' },
  { id: 'branches', title: 'Practice branches', count: 7, prop: 'hulls' },
  { id: 'prs', title: 'Pull requests', count: 3, prop: 'seals' },
] as const;
export type CargoKind = (typeof CRANE_CARGO)[number]['id'];

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
export function dryRun(s: CraneState): CraneStep {
  if (s.complete) return { state: s, event: { kind: 'already' } };
  const f = CRANE_FACINGS[s.facing]!;
  if (!f.owner || !f.repository) return { state: { ...s, preview: null }, event: { kind: 'not-a-repo' } };
  return {
    state: { ...s, preview: s.facing },
    event: { kind: 'preview', facing: s.facing, owner: f.owner, repository: f.repository },
  };
}

/** `node .github/scripts/setup-training-scenarios.js --yes` */
export function confirmYes(s: CraneState): CraneStep {
  if (s.complete) return { state: s, event: { kind: 'already' } };
  const f = CRANE_FACINGS[s.facing]!;
  if (!f.owner || !f.repository) return { state: s, event: { kind: 'not-a-repo' } };
  if (s.preview !== s.facing) return { state: s, event: { kind: 'preview-first' } };
  if (f.owner !== 'you')
    return { state: s, event: { kind: 'refused', owner: f.owner, repository: f.repository } };
  return { state: { ...s, complete: true }, event: { kind: 'complete', repository: f.repository } };
}

/** The painted `Repository:` sign on the arm (two lines), after `event` (or the state alone). */
export function signLines(s: CraneState, event?: CraneEvent): [string, string] {
  if (s.complete) return [`Repository: ${YOUR_REPOSITORY}`, 'Setup complete.'];
  switch (event?.kind) {
    case 'not-a-repo':
      return ['Setup failed:', 'run it from the root of a cloned Git repository.'];
    case 'refused':
      return ['Refusing to change shared repository', event.repository];
    default:
      break;
  }
  const f = CRANE_FACINGS[s.facing]!;
  if (s.preview === s.facing && f.repository) return [`Repository: ${f.repository}`, 'Default branch: main'];
  return ['Repository:', '(pull Dry-Run to preview)'];
}

export const SETUP_COMMAND = '$ node …/setup-training-scenarios.js';

const planned = () => {
  const [labels, issues, branches, prs] = CRANE_CARGO.map((c) => c.count);
  return [`${labels} labels, ${issues} issues,`, `${branches} branches and ${prs} pull requests`];
};

/**
 * The terminal panel at the crane: what the setup script printed last, after `event` (or the
 * state alone). The arm sign carries the `Repository:` line; this is the whole readout.
 */
export function terminalLines(s: CraneState, event?: CraneEvent): string[] {
  const [a, b] = planned();
  if (s.complete)
    return [
      `${SETUP_COMMAND} --yes`,
      `Repository: ${YOUR_REPOSITORY}`,
      `Created ${a}`,
      `${b}.`,
      'Setup complete.',
    ];
  switch (event?.kind) {
    case 'not-a-repo':
      return [`${SETUP_COMMAND} --dry-run`, 'Run this script from the root', 'of a cloned Git repository.'];
    case 'refused':
      return [
        `${SETUP_COMMAND} --yes`,
        `Repository: ${event.repository}`,
        'Refusing to change shared or',
        'upstream repository.',
      ];
    default:
      break;
  }
  const f = CRANE_FACINGS[s.facing]!;
  if (s.preview === s.facing && f.repository)
    return [
      `${SETUP_COMMAND} --dry-run`,
      `Repository: ${f.repository}`,
      'Default branch: main',
      `[dry-run] would create ${a}`,
      `[dry-run] ${b}`,
    ];
  return [SETUP_COMMAND, '', '(pull Dry-Run to preview)'];
}

export type LineTone = 'cmd' | 'you' | 'other' | 'ok';

/** How a readout line is inked: the command, your fork, anyone else's (and failures), or success. */
export function lineTone(line: string): LineTone | undefined {
  const yourOwner = `${YOUR_REPOSITORY.split('/')[0]}/`;
  if (line.startsWith('$')) return 'cmd';
  if (line.includes(YOUR_REPOSITORY) || line === yourOwner) return 'you';
  if (/^Repository: .+|^[\w-]+\/$/.test(line) || /^(Refusing|Setup failed|Run this)/.test(line))
    return 'other';
  if (line === 'Setup complete.') return 'ok';
  return undefined;
}

/** Which berth to point at for hint tier 3, and whether you're already there. */
export function craneHintTarget(s: CraneState): { facing: number; turnsNeeded: number } {
  return { facing: YOUR_FACING, turnsNeeded: wrap(YOUR_FACING - s.facing) };
}
