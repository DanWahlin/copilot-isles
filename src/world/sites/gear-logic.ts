import { onCourse } from '../../course/active';
import type { PuzzleFile } from '../../course/pack';
import { fill, puzzleContent, puzzleMaybe, textOf } from '../../course/puzzles';

/**
 * Bo's gear check (Q0.4, POC §4.4), a checklist. Pure logic (no three.js): one piece of gear per tool
 * on Bo's rack, and what Terminal prints when you run the checks there. Every check passes: the game
 * can't see your machine, so it never claims a tool is missing. The checks themselves are the course
 * pack's (`puzzles/gear-rack.json`: for the Copilot app course, "Check your tools in Terminal").
 */
export type GearId = 'compass' | 'lantern' | 'rope' | 'spyglass';

export interface GearDef {
  id: GearId;
  name: string;
  tool: string;
  command: string;
  output: string;
}

/** `puzzles/gear-rack.json`. */
export interface GearRackFile extends PuzzleFile {
  /** In hanging order, left to right on the rack. */
  checks: readonly GearDef[];
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
  const c = gearContent();
  for (const g of c.checks) lines.push(`$ ${g.command}`, g.output);
  lines.push(textOf(c, 'signIn'), textOf(c, 'signedIn', { host, handle }));
  return lines;
}

export type GearTone = 'cmd' | 'you' | 'ok';

/** How a readout line is inked: commands, your account, and version numbers. */
export function gearTone(line: string, handle: string = YOUR_HANDLE): GearTone | undefined {
  if (line.startsWith('$')) return 'cmd';
  // The signed-in line ends with your account (whatever the host).
  const signedIn = textOf(gearContent(), 'signedIn');
  if (line.endsWith(fill(signedIn.slice(signedIn.indexOf('{host}') + '{host}'.length), { handle })))
    return 'you';
  if (gear().some((g) => g.output === line)) return 'ok';
  return undefined;
}
