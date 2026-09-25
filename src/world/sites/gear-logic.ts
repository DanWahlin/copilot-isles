/**
 * Q0.5 Gear Check & Right Signature (POC §4.4). Pure logic (no three.js) for Bo's gear rack and
 * ledger, so the order of things is unit-tested.
 *
 * It follows the course's "Check your tools in Terminal" steps:
 * - Each tool gets a version check in the app's **Terminal** tab: `git --version`, `node -v`,
 *   `npm -v`, and `gh --version`. Each piece of gear stands for one.
 * - "Only install what's missing, then check again." The spyglass turns up without its lens, so
 *   its check fails (`command not found`) until you fetch a lens from the market and re-check.
 * - GitHub CLI has its own sign-in. `gh auth status` shows the wrong account until you run
 *   `gh auth login` (GitHub.com → Login with a web browser) and check again.
 */
export type GearId = 'compass' | 'lantern' | 'rope' | 'spyglass';
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

type PieceAt = 'loose' | 'carried' | 'hung';
/** The lens only turns up once the spyglass check has failed. */
type LensAt = 'hidden' | 'loose' | 'carried' | 'fitted';

export interface GearState {
  pieces: Record<GearId, PieceAt>;
  lens: LensAt;
  /** The ledger's `gh auth status` has been read (the wrong account showed). */
  ledgerRead: boolean;
  /** `gh auth login` ran and the ledger shows your signature. */
  signed: boolean;
}

export type GearPhase = 'gather' | 'lens' | 'ledger' | 'done';

type GearEvent =
  | { kind: 'picked'; id: LooseId }
  | { kind: 'checked'; id: GearId }
  | { kind: 'missing'; id: 'spyglass' }
  | { kind: 'fitted' }
  | { kind: 'all-checked' }
  | { kind: 'ledger-wrong' }
  | { kind: 'signed' }
  | { kind: 'nothing' };

export interface GearStep {
  state: GearState;
  event: GearEvent;
}

export function initialGear(): GearState {
  return {
    pieces: { compass: 'loose', lantern: 'loose', rope: 'loose', spyglass: 'loose' },
    lens: 'hidden',
    ledgerRead: false,
    signed: false,
  };
}

export const allChecked = (s: GearState): boolean =>
  GEAR_IDS.every((id) => s.pieces[id] === 'hung') && s.lens === 'fitted';

export function gearPhase(s: GearState): GearPhase {
  if (s.signed) return 'done';
  if (allChecked(s)) return 'ledger';
  if (s.lens !== 'hidden' && s.lens !== 'fitted') return 'lens';
  return 'gather';
}

/** What's still lying around the village (the lens only once it's turned up). */
export function looseLeft(s: GearState): LooseId[] {
  const out: LooseId[] = GEAR_IDS.filter((id) => s.pieces[id] === 'loose');
  if (s.lens === 'loose') out.push('lens');
  return out;
}

/** Picks up a loose piece. */
export function pickUp(s: GearState, id: LooseId): GearStep {
  if (id === 'lens') {
    if (s.lens !== 'loose') return { state: s, event: { kind: 'nothing' } };
    return { state: { ...s, lens: 'carried' }, event: { kind: 'picked', id } };
  }
  if (s.pieces[id] !== 'loose') return { state: s, event: { kind: 'nothing' } };
  return { state: { ...s, pieces: { ...s.pieces, [id]: 'carried' } }, event: { kind: 'picked', id } };
}

/** What E at the rack does next: fit the lens, or hang the first carried piece. */
export function rackAction(s: GearState): { kind: 'fit' } | { kind: 'hang'; id: GearId } | null {
  if (s.lens === 'carried' && s.pieces.spyglass === 'hung') return { kind: 'fit' };
  const id = GEAR_IDS.find((g) => s.pieces[g] === 'carried');
  return id ? { kind: 'hang', id } : null;
}

/**
 * E at the rack: hangs the next carried piece and runs its version check, or fits the lens and
 * re-checks the spyglass. A carried lens goes straight into a carried spyglass as it's hung.
 */
export function useRack(s: GearState): GearStep {
  const a = rackAction(s);
  if (!a) return { state: s, event: { kind: 'nothing' } };
  if (a.kind === 'fit') return finish({ ...s, lens: 'fitted' }, { kind: 'fitted' });
  const next: GearState = { ...s, pieces: { ...s.pieces, [a.id]: 'hung' } };
  if (a.id === 'spyglass') {
    if (next.lens === 'carried') return finish({ ...next, lens: 'fitted' }, { kind: 'fitted' });
    if (next.lens === 'hidden')
      return { state: { ...next, lens: 'loose' }, event: { kind: 'missing', id: 'spyglass' } };
    if (next.lens === 'loose') return { state: next, event: { kind: 'missing', id: 'spyglass' } };
  }
  return finish(next, { kind: 'checked', id: a.id });
}

/** Reports `all-checked` instead once the last check passes. */
function finish(s: GearState, ev: GearEvent): GearStep {
  return { state: s, event: allChecked(s) ? { kind: 'all-checked' } : ev };
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

const PIECE_CODE: readonly PieceAt[] = ['loose', 'carried', 'hung'];
const LENS_CODE: readonly LensAt[] = ['hidden', 'loose', 'carried', 'fitted'];

export function saveGear(s: GearState): number[] {
  return [
    ...GEAR_IDS.map((id) => PIECE_CODE.indexOf(s.pieces[id])),
    LENS_CODE.indexOf(s.lens),
    s.ledgerRead ? 1 : 0,
    s.signed ? 1 : 0,
  ];
}

/** Restores a saved state, repairing anything inconsistent (a fitted lens with no spyglass hung…). */
export function restoreGear(saved: readonly number[] | undefined, solved: boolean): GearState {
  if (solved) {
    return {
      pieces: { compass: 'hung', lantern: 'hung', rope: 'hung', spyglass: 'hung' },
      lens: 'fitted',
      ledgerRead: true,
      signed: true,
    };
  }
  const s = initialGear();
  if (!saved) return s;
  GEAR_IDS.forEach((id, i) => {
    const at = PIECE_CODE[saved[i] ?? 0];
    if (at) s.pieces[id] = at;
  });
  s.lens = LENS_CODE[saved[4] ?? 0] ?? 'hidden';
  if (s.lens === 'fitted' && s.pieces.spyglass !== 'hung') s.lens = 'carried';
  if (s.lens === 'hidden' && s.pieces.spyglass === 'hung') s.lens = 'loose';
  s.ledgerRead = saved[5] === 1 && allChecked(s);
  s.signed = saved[6] === 1 && s.ledgerRead;
  return s;
}

const YOUR_HANDLE = 'your-handle';
const WRONG_HANDLE = 'someone-else';

/** The terminal panel's readout at the rack: one version check per hung piece, in rack order. */
export function rackTerminal(s: GearState): string[] {
  const lines: string[] = [];
  for (const g of GEAR) {
    if (s.pieces[g.id] !== 'hung') continue;
    lines.push(`$ ${g.command}`);
    if (g.id === 'spyglass' && s.lens !== 'fitted') lines.push(`zsh: command not found: gh`);
    else lines.push(g.output);
  }
  if (!lines.length) return ['(hang a piece of gear to check it)'];
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

/** Which loose piece a tier-2/3 hint should point at: the nearest one still lying around. */
export function nearestLoose(
  s: GearState,
  from: { x: number; z: number },
  at: (id: LooseId) => { x: number; z: number },
): LooseId | null {
  let best: LooseId | null = null;
  let bd = Infinity;
  for (const id of looseLeft(s)) {
    const p = at(id);
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}
