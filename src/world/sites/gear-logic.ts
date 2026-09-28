/**
 * Q0.5 Gear Check & Right Signature (POC §4.4). Pure logic (no three.js) for Bo's gear rack and
 * ledger, so the order of things is unit-tested.
 *
 * It follows the course's "Check your tools in Terminal" steps:
 * - Four version checks run in the app's **Terminal** tab: `git --version`, `node -v`, `npm -v`, and
 *   `gh --version`. Bo's rack holds a piece of gear for each, and one E at the rack runs them all, the
 *   way you'd paste the course's block into Terminal. Developers don't need a hunt for `node -v`.
 * - "Only install what's missing, then check again." The spyglass has no lens, so `gh` is
 *   `command not found` until you fetch a lens from the market and check again.
 * - GitHub CLI has its own sign-in. `gh auth status` shows the wrong account until you run
 *   `gh auth login` (GitHub.com → Login with a web browser) and check again.
 */
export type GearId = 'compass' | 'lantern' | 'rope' | 'spyglass';
/** What the rack site can show lying in the village. Only the lens turns up in this quest. */
export type LooseId = GearId | 'lens';

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

/** The lens only turns up once the spyglass check has failed. */
type LensAt = 'hidden' | 'loose' | 'carried' | 'fitted';

export interface GearState {
  /** The four version checks have run at the rack. */
  ran: boolean;
  lens: LensAt;
  /** The ledger's `gh auth status` has been read (the wrong account showed). */
  ledgerRead: boolean;
  /** `gh auth login` ran and the ledger shows your signature. */
  signed: boolean;
}

export type GearPhase = 'check' | 'lens' | 'ledger' | 'done';

type GearEvent =
  | { kind: 'picked'; id: 'lens' }
  | { kind: 'missing'; id: 'spyglass' }
  | { kind: 'all-checked' }
  | { kind: 'ledger-wrong' }
  | { kind: 'signed' }
  | { kind: 'nothing' };

export interface GearStep {
  state: GearState;
  event: GearEvent;
}

export function initialGear(): GearState {
  return { ran: false, lens: 'hidden', ledgerRead: false, signed: false };
}

export const allChecked = (s: GearState): boolean => s.ran && s.lens === 'fitted';

export function gearPhase(s: GearState): GearPhase {
  if (s.signed) return 'done';
  if (allChecked(s)) return 'ledger';
  if (s.ran) return 'lens';
  return 'check';
}

/** What's lying around the village: the lens, once the spyglass check has sent you for it. */
export function looseLeft(s: GearState): LooseId[] {
  return s.lens === 'loose' ? ['lens'] : [];
}

/** Picks up the lens. */
export function pickUp(s: GearState, id: LooseId): GearStep {
  if (id !== 'lens' || s.lens !== 'loose') return { state: s, event: { kind: 'nothing' } };
  return { state: { ...s, lens: 'carried' }, event: { kind: 'picked', id } };
}

/** What E at the rack does next: run the four checks, or fit the lens and check again. */
export function rackAction(s: GearState): { kind: 'run' } | { kind: 'fit' } | null {
  if (!s.ran) return { kind: 'run' };
  if (s.lens === 'carried') return { kind: 'fit' };
  return null;
}

/**
 * E at the rack: runs all four version checks (the spyglass's fails, and its lens turns up at the
 * market), or fits the lens and checks again.
 */
export function useRack(s: GearState): GearStep {
  const a = rackAction(s);
  if (!a) return { state: s, event: { kind: 'nothing' } };
  if (a.kind === 'run')
    return { state: { ...s, ran: true, lens: 'loose' }, event: { kind: 'missing', id: 'spyglass' } };
  return { state: { ...s, lens: 'fitted' }, event: { kind: 'all-checked' } };
}

/** E at the ledger: `gh auth status` first shows someone else; S0.1 then leads to the sign-in. */
export function readLedger(s: GearState): GearStep {
  if (s.signed || !allChecked(s)) return { state: s, event: { kind: 'nothing' } };
  return { state: { ...s, ledgerRead: true }, event: { kind: 'ledger-wrong' } };
}

/** `gh auth login` ran (after S0.1): the ledger shows your signature. */
export function signIn(s: GearState): GearStep {
  if (s.signed || !s.ledgerRead) return { state: s, event: { kind: 'nothing' } };
  return { state: { ...s, signed: true }, event: { kind: 'signed' } };
}

const LENS_CODE: readonly LensAt[] = ['hidden', 'loose', 'carried', 'fitted'];

export function saveGear(s: GearState): number[] {
  return [s.ran ? 1 : 0, LENS_CODE.indexOf(s.lens), s.ledgerRead ? 1 : 0, s.signed ? 1 : 0];
}

/**
 * Restores a saved state, repairing anything inconsistent. Saves from the old gear hunt (seven
 * numbers: four pieces, then lens, ledger, signed) count as run once every piece was hung.
 */
export function restoreGear(saved: readonly number[] | undefined, solved: boolean): GearState {
  if (solved) return { ran: true, lens: 'fitted', ledgerRead: true, signed: true };
  const s = initialGear();
  if (!saved) return s;
  const legacy = saved.length === 7;
  const at = legacy ? 4 : 1;
  s.ran = legacy ? saved.slice(0, 4).every((n) => n === 2) : saved[0] === 1;
  s.lens = LENS_CODE[saved[at] ?? 0] ?? 'hidden';
  if (s.lens !== 'hidden') s.ran = true;
  else if (s.ran) s.lens = 'loose';
  s.ledgerRead = saved[at + 1] === 1 && allChecked(s);
  s.signed = saved[at + 2] === 1 && s.ledgerRead;
  return s;
}

const YOUR_HANDLE = 'your-handle';
const WRONG_HANDLE = 'someone-else';

/** The terminal panel's readout at the rack: the four version checks, then the re-check once fixed. */
export function rackTerminal(s: GearState): string[] {
  if (!s.ran) return ['(run the version checks at the rack)'];
  const lines: string[] = [];
  for (const g of GEAR) {
    lines.push(`$ ${g.command}`);
    lines.push(g.id === 'spyglass' ? 'zsh: command not found: gh' : g.output);
  }
  if (s.lens === 'fitted') lines.push(`$ ${gearDef('spyglass').command}`, gearDef('spyglass').output);
  return lines;
}

/** The terminal panel at the ledger: `gh auth status`, before and after `gh auth login`. */
export function ledgerTerminal(s: GearState): string[] {
  if (s.signed)
    return [
      '$ gh auth login',
      '? Where do you use GitHub? GitHub.com',
      '? How would you like to authenticate GitHub CLI? Login with a web browser',
      `✓ Logged in as ${YOUR_HANDLE}`,
      '$ gh auth status',
      `✓ Logged in to github.com account ${YOUR_HANDLE}`,
    ];
  if (s.ledgerRead)
    return [
      '$ gh auth status',
      'github.com',
      `  ✓ Logged in to github.com account ${WRONG_HANDLE}`,
      '  - Active account: true',
    ];
  return ['$ gh auth status', '', '(read the ledger)'];
}

export type GearTone = 'cmd' | 'you' | 'other' | 'ok';

/** How a gear readout line is inked: commands, your account, failures and the wrong account, successes. */
export function gearTone(line: string): GearTone | undefined {
  if (line.startsWith('$')) return 'cmd';
  if (line.includes(YOUR_HANDLE)) return 'you';
  if (line.includes('command not found') || line.includes(WRONG_HANDLE)) return 'other';
  if (GEAR.some((g) => g.output === line)) return 'ok';
  return undefined;
}
