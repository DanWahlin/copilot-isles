/**
 * Bo's gear check (Q0.4, POC §4.4). Pure logic (no three.js): the course's "Check your tools in
 * Terminal" version checks, one piece of gear per tool on Bo's rack, and what Terminal prints when
 * you run them there. Every check passes: the game can't see your machine, so it never claims a
 * tool is missing. The course's own advice ("install only what's missing") is told, not staged.
 */
export type GearId = 'compass' | 'lantern' | 'rope' | 'spyglass';

export interface GearDef {
  id: GearId;
  name: string;
  tool: string;
  command: string;
  output: string;
}

/** In hanging order, left to right on the rack. */
const GEAR: readonly GearDef[] = [
  { id: 'compass', name: 'compass', tool: 'Git', command: 'git --version', output: 'git version 2.49.0' },
  { id: 'lantern', name: 'lantern', tool: 'Node.js', command: 'node -v', output: 'v22.16.0' },
  { id: 'rope', name: 'rope coil', tool: 'npm', command: 'npm -v', output: '10.9.2' },
  {
    id: 'spyglass',
    name: 'spyglass',
    tool: 'GitHub CLI',
    command: 'gh --version',
    output: 'gh version 2.74.0',
  },
];

export const GEAR_IDS: readonly GearId[] = GEAR.map((g) => g.id);
export const gearDef = (id: GearId): GearDef => GEAR.find((g) => g.id === id)!;

/** The handle the game shows for your own GitHub account. */
export const YOUR_HANDLE = 'your-handle';

/** Terminal after the four version checks and `gh auth status`, run at Bo's rack. */
export function gearReadout(): string[] {
  const lines: string[] = [];
  for (const g of GEAR) lines.push(`$ ${g.command}`, g.output);
  lines.push('$ gh auth status', `✓ Logged in to github.com account ${YOUR_HANDLE}`);
  return lines;
}

export type GearTone = 'cmd' | 'you' | 'ok';

/** How a readout line is inked: commands, your account, and version numbers. */
export function gearTone(line: string): GearTone | undefined {
  if (line.startsWith('$')) return 'cmd';
  if (line.includes(YOUR_HANDLE)) return 'you';
  if (GEAR.some((g) => g.output === line)) return 'ok';
  return undefined;
}
