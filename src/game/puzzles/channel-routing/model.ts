import { COLS, CREWS, ROWS, roundBoard, roundLive, roundSolution } from './boards';
import { openGates, rotate, solved, wrongTile } from './logic';
import type { ChannelRoutingState, Crew, Flow, FlowEnd, Tile } from './types';

/**
 * Channel Routing's state machine (docs/specs/ISLAND-02-thousand-bough.md §5.3-5.6), free of the
 * world and the DOM so tests can play it: rounds, the cursor, turning tiles, undo and reset, opening
 * the gates, and the Spire twist's choice.
 */
export type TwistChoice = NonNullable<ChannelRoutingState['twistChoice']>;

/** What Fen says when a crew's water goes wrong (voice line ids), and the course section it teaches. */
export const END_LINE: Readonly<Record<Exclude<FlowEnd, 'wheel'>, string>> = {
  mixed: 'tb.fen.mixed',
  mainHall: 'tb.fen.mainhall',
  wrongWheel: 'tb.fen.wrongwheel',
  deadEnd: 'tb.fen.deadend',
};

/** The twist's four answers, in the order they're offered (keys 1-4). */
export const TWIST_CHOICES: readonly { id: TwistChoice; text: string; right: boolean; line: string }[] = [
  { id: 'redig', text: 'Dig them new channels.', right: false, line: 'tb.fen.twist.redig' },
  { id: 'port5174', text: 'Send Docs to Lookout 5174.', right: true, line: 'tb.fen.twist.port' },
  { id: 'closeOne', text: 'Close Feature’s lantern for now.', right: true, line: 'tb.fen.twist.close' },
  { id: 'share', text: 'Let them share. They’ll manage.', right: false, line: 'tb.fen.twist.share' },
];

export interface RunResult {
  flows: readonly Flow[];
  solved: boolean;
  /** The first crew (gate order) whose water went wrong, and how. */
  problem: { crew: Crew; end: Exclude<FlowEnd, 'wheel'>; at: readonly [number, number] | null } | null;
}

export class ChannelRoutingModel {
  private s: ChannelRoutingState;
  private history: (readonly (readonly Tile[])[])[] = [];
  /** Bumps on every change, so the UI and Wingman's hints know when you've made progress. */
  version = 0;

  constructor(round: 1 | 2 | 3 = 1) {
    this.s = {
      round,
      phase: 'routing',
      board: roundBoard(round),
      live: roundLive(round),
      cursor: [0, 1],
      flows: [],
    };
  }

  get state(): ChannelRoutingState {
    return this.s;
  }

  private set(patch: Partial<ChannelRoutingState>): void {
    this.s = { ...this.s, ...patch };
    this.version += 1;
  }

  /** Starts a round: round 2 keeps round 1's tiles; round 3 swaps in Board B. */
  startRound(round: 1 | 2 | 3, keepBoard = round === 2): void {
    this.history.length = 0;
    this.set({
      round,
      phase: 'routing',
      board: keepBoard ? this.s.board : roundBoard(round),
      live: roundLive(round),
      flows: [],
      twistChoice: undefined,
    });
  }

  setPhase(phase: ChannelRoutingState['phase']): void {
    this.set({ phase });
  }

  setCursor(cell: readonly [number, number] | null): void {
    this.set({ cursor: cell });
  }

  /** Moves the cursor one tile (it stops at the edges). */
  moveCursor(dr: number, dc: number): void {
    const [r, c] = this.s.cursor ?? [0, 1];
    this.set({
      cursor: [Math.max(0, Math.min(ROWS - 1, r + dr)), Math.max(0, Math.min(COLS - 1, c + dc))],
    });
  }

  /** Turns a tile (the cursor's by default). Returns false for a rock or while the water runs. */
  turn(cell: readonly [number, number] | null = this.s.cursor, dir: 1 | -1 = 1): boolean {
    if (!cell || this.s.phase !== 'routing') return false;
    const t = this.s.board[cell[0]]?.[cell[1]];
    if (!t || t.kind === 'rock') return false;
    this.history.push(this.s.board);
    this.set({ board: rotate(this.s.board, cell[0], cell[1], dir), cursor: cell, flows: [] });
    return true;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev || this.s.phase !== 'routing') return false;
    this.set({ board: prev, flows: [] });
    return true;
  }

  /** Back to the round's start (round 2 goes back to Board A's start too). */
  reset(): void {
    if (this.s.phase !== 'routing') return;
    this.history.push(this.s.board);
    this.set({ board: roundBoard(this.s.round), flows: [] });
  }

  /** Opens every live gate. The flows are copied, so they survive the next run. */
  run(): RunResult {
    const fl = openGates(this.s.board, this.s.live).map((f) => ({ ...f, cells: [...f.cells] }));
    const ok = solved(fl, this.s.live);
    this.set({ flows: fl, phase: ok ? 'solved' : 'running' });
    let problem: RunResult['problem'] = null;
    for (const crew of CREWS) {
      const f = fl.find((x) => x.crew === crew);
      if (f && f.end !== 'wheel') {
        problem = { crew, end: f.end, at: f.at ?? null };
        break;
      }
    }
    return { flows: fl, solved: ok, problem };
  }

  /** After a failed run: the water drains and you can turn tiles again. */
  drain(): void {
    if (this.s.phase === 'running') this.set({ phase: 'routing', flows: [] });
  }

  /** Tier 3 hint: turns one wrong tile the right way; returns it, or null when none's wrong. */
  fixOne(): readonly [number, number] | null {
    if (this.s.phase !== 'routing') return null;
    const cell = wrongTile(this.s.board, roundSolution(this.s.round));
    if (!cell) return null;
    this.history.push(this.s.board);
    let b = this.s.board;
    for (let i = 0; i < 4 && wrongTile(b, roundSolution(this.s.round)) === cell; i++)
      b = rotate(b, cell[0], cell[1]);
    this.set({ board: b, cursor: cell, flows: [] });
    return cell;
  }

  /** The first wrong tile for this round (tier 2 hints pulse it). */
  wrongTile(): readonly [number, number] | null {
    return wrongTile(this.s.board, roundSolution(this.s.round));
  }

  twist(choice: TwistChoice): (typeof TWIST_CHOICES)[number] {
    const c = TWIST_CHOICES.find((x) => x.id === choice)!;
    this.set({ twistChoice: choice, phase: c.right ? 'done' : 'twist' });
    return c;
  }
}
