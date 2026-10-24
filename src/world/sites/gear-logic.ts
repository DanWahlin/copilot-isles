import { onCourse } from '../../course/active';
import type { PuzzleFile } from '../../course/pack';
import { fill, puzzleContent, puzzleMaybe, textOf } from '../../course/puzzles';
import type { OsId } from '../../learn/setup';
import type { ScriptStep } from '../../game/script';

/**
 * Bo's gear check (POC §4.4), a checklist. Pure logic (no three.js): one piece of gear per tool
 * on Bo's rack, and what the terminal prints when you run each check there. The game can't see your
 * machine, so it never claims a tool is missing: a check prints its version, or, the first time, the
 * out-of-date one the course wants you to catch (`stale`), and the next run prints the right one. The
 * checks themselves are the course pack's (`puzzles/gear-rack.json`: for the Copilot app course,
 * "Check your tools in Terminal").
 */
export type GearId = 'compass' | 'lantern' | 'rope' | 'spyglass';

export interface GearDef {
  id: GearId;
  name: string;
  tool: string;
  command: string;
  output: string;
  /**
   * What the first run prints instead (an out-of-date version), and the script of the file's
   * `scripts` it plays then. The next run prints `output`.
   */
  stale?: { output: string; script: string };
  /** A tip shown with its result on one kind of computer (Bo's caption). */
  notes?: Partial<Record<OsId, string>>;
}

/** `puzzles/gear-rack.json`. */
export interface GearRackFile extends PuzzleFile {
  /** In hanging order, left to right on the rack. */
  checks: readonly GearDef[];
  /**
   * `intro` plays at the first press while the quest is at its checks, `checked` once every check has
   * passed, and a stale check plays the one it names.
   */
  scripts?: Readonly<Record<string, readonly ScriptStep[]>>;
}

export const gearContent = () => puzzleContent<GearRackFile>('gear-rack');
/** The rack's gear, all four hung. A course that turns the rack off keeps it as scenery, plaques blank. */
const BLANK_GEAR: readonly GearDef[] = (['compass', 'lantern', 'rope', 'spyglass'] as const).map((id) => ({
  id,
  name: '',
  tool: '',
  command: '',
  output: '',
}));
const gear = () => puzzleMaybe<GearRackFile>('gear-rack')?.checks ?? BLANK_GEAR;

export let GEAR_IDS: readonly GearId[] = [];
onCourse(() => {
  GEAR_IDS = gear().map((g) => g.id);
});
export const gearDef = (id: GearId): GearDef => gear().find((g) => g.id === id)!;

/** The handle the game shows for your own GitHub account. */
export const YOUR_HANDLE = 'your-handle';

/**
 * Terminal after the four version checks and `gh auth status`, run at Bo's rack. `handle` is the
 * account that owns the player's fork, once they've given it.
 */
export function gearReadout(handle: string = YOUR_HANDLE, host = 'github.com'): string[] {
  const lines: string[] = [];
  for (const g of gearContent().checks) lines.push(`$ ${g.command}`, g.output);
  lines.push(...signInLines(handle, host));
  return lines;
}

export type GearTone = 'cmd' | 'you' | 'ok' | 'other';

/** How a readout line is inked: commands, your account, and version numbers. */
export function gearTone(line: string, handle: string = YOUR_HANDLE): GearTone | undefined {
  if (line.startsWith('$')) return 'cmd';
  // The signed-in line ends with your account (whatever the host).
  const signedIn = textOf(gearContent(), 'signedIn');
  if (line.endsWith(fill(signedIn.slice(signedIn.indexOf('{host}') + '{host}'.length), { handle })))
    return 'you';
  if (gear().some((g) => g.output === line)) return 'ok';
  if (gear().some((g) => g.stale?.output === line)) return 'other';
  return undefined;
}

/** Where you are in the checks at the rack: the next one to run, and what Terminal shows so far. */
export interface GearRun {
  /** The index of the next check to run (`checks.length` once every one has passed). */
  readonly next: number;
  /** The next check has printed its out-of-date output, so its next run prints the right one. */
  readonly staleShown: boolean;
  readonly lines: readonly string[];
}

export const GEAR_START: GearRun = { next: 0, staleShown: false, lines: [] };

/** One press at the rack: runs the next check and says what it printed. */
export function runGearCheck(
  run: GearRun,
  checks: readonly GearDef[],
): { run: GearRun; check: GearDef | null; stale: boolean; done: boolean } {
  const check = checks[run.next];
  if (!check) return { run, check: null, stale: false, done: true };
  const stale = !!check.stale && !run.staleShown;
  const lines = [...run.lines, `$ ${check.command}`, stale ? check.stale!.output : check.output];
  const next = stale ? run.next : run.next + 1;
  return {
    run: { next, staleShown: stale, lines },
    check,
    stale,
    done: next >= checks.length,
  };
}

/** The checks' readout with GitHub CLI's sign-in after it (`gearReadout`'s last two lines). */
export function signInLines(handle: string = YOUR_HANDLE, host = 'github.com'): string[] {
  const c = gearContent();
  return [textOf(c, 'signIn'), textOf(c, 'signedIn', { host, handle })];
}
