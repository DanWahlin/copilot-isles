import { COLS, CREWS, ROWS, roundBoard, roundLive, roundSolution } from './boards';
import { openGates, rotate, solved, wrongTile } from './logic';
import type { ChannelRoutingState, Crew, Flow, FlowEnd, Tile } from './types';
import { CREW_ORDERS, fits, type Workspace } from './workspaces';
import { onCourse } from '../../../course/active';
import { lineOf, puzzleMaybe } from '../../../course/puzzles';
import type { ChannelRoutingFile } from './boards';

/**
 * Channel Routing's state machine (docs/specs/ISLAND-02-thousand-bough.md §5.3-5.6), free of the
 * world and the DOM so tests can play it: rounds, the cursor, turning tiles, undo and reset, opening
 * the gates, round 3's workspace for each crew, and the Spire twist's choice.
 */
export type TwistChoice = NonNullable<ChannelRoutingState['twistChoice']>;

export interface TwistAnswer {
  id: TwistChoice;
  text: string;
  right: boolean;
  /** Fen's voiced reply. */
  line: string;
}

/** What Fen says when a crew's water goes wrong (voice line ids), and the course section it teaches. */
export let END_LINE: Readonly<Record<Exclude<FlowEnd, 'wheel'>, string>> = {} as Record<
  Exclude<FlowEnd, 'wheel'>,
  string
>;

/** The twist's four answers, in the order they're offered (keys 1-4). */
export let TWIST_CHOICES: readonly TwistAnswer[] = [];

onCourse(() => {
  const c = puzzleMaybe<ChannelRoutingFile>('channel-routing');
  const end = (k: string) => (c ? lineOf(c, `end.${k}`) : '');
  END_LINE = {
    mixed: end('mixed'),
    mainHall: end('mainHall'),
    wrongWheel: end('wrongWheel'),
    deadEnd: end('deadEnd'),
  };
  TWIST_CHOICES = c?.twist.choices ?? [];
});

export interface RunResult {
  flows: readonly Flow[];
  solved: boolean;
  /** The first crew (gate order) whose water went wrong, and how. */
  problem: { crew: Crew; end: Exclude<FlowEnd, 'wheel'>; at: readonly [number, number] | null } | null;
}

/** Round 3's run: where each crew went, and whether that suits its order. */
export interface WorkspaceRun {
  flows: readonly Flow[];
  solved: boolean;
  verdicts: Readonly<Record<Crew, { pick: Workspace; right: boolean }>>;
  /** The first crew (gate order) in the wrong place. */
  problem: { crew: Crew; pick: Workspace; best: Workspace } | null;
}

export type Picks = Readonly<Record<Crew, Workspace | null>>;
const NO_PICKS: Picks = { feature: null, bugfix: null, docs: null };

export class ChannelRoutingModel {
  private s: ChannelRoutingState;
  /** Round 3: where each crew works (null until you pick). */
  picks: Picks = NO_PICKS;
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

  /** Starts a round: round 2 keeps round 1's tiles; round 3 starts with every channel dug. */
  startRound(round: 1 | 2 | 3, keepBoard = round === 2): void {
    this.history.length = 0;
    this.picks = NO_PICKS;
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

  /** Turns a tile (the cursor's by default). Returns false for a rock, while the water runs, or in round 3. */
  turn(cell: readonly [number, number] | null = this.s.cursor, dir: 1 | -1 = 1): boolean {
    if (!cell || this.s.phase !== 'routing' || this.s.round === 3) return false;
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

  /** Back to the round's start (round 2 goes back to Board A's start too; round 3 clears the picks). */
  reset(): void {
    if (this.s.phase !== 'routing') return;
    if (this.s.round === 3) {
      this.picks = NO_PICKS;
      this.set({ flows: [] });
      return;
    }
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

  /** Round 3: where a crew works. Returns false outside round 3 or while the water runs. */
  pick(crew: Crew, w: Workspace): boolean {
    if (this.s.round !== 3 || this.s.phase !== 'routing') return false;
    this.picks = { ...this.picks, [crew]: w };
    this.set({ flows: [] });
    return true;
  }

  /** Every crew has a place (round 3's gates can open). */
  get picked(): boolean {
    return CREWS.every((c) => this.picks[c] !== null);
  }

  /**
   * Round 3's gates: a crew on a new worktree runs down its own channel to its wheel; one on the
   * current checkout runs into the Great Hall (main); one in the cloud doesn't touch the board (its
   * work goes off your deck). Null until every crew has a place.
   */
  runWorkspaces(): WorkspaceRun | null {
    if (this.s.round !== 3 || this.s.phase !== 'routing' || !this.picked) return null;
    const live = {
      feature: this.picks.feature !== 'cloud',
      bugfix: this.picks.bugfix !== 'cloud',
      docs: this.picks.docs !== 'cloud',
    };
    const fl: Flow[] = openGates(this.s.board, live).map((f) =>
      this.picks[f.crew] === 'checkout'
        ? { crew: f.crew, cells: [...f.cells], end: 'mainHall' as const }
        : { ...f, cells: [...f.cells] },
    );
    const verdicts = {} as Record<Crew, { pick: Workspace; right: boolean }>;
    let problem: WorkspaceRun['problem'] = null;
    for (const crew of CREWS) {
      const pick = this.picks[crew]!;
      const best = CREW_ORDERS[crew].best;
      const right = fits(crew, pick);
      verdicts[crew] = { pick, right };
      if (!right && !problem) problem = { crew, pick, best };
    }
    this.set({ flows: fl, phase: problem ? 'running' : 'solved' });
    return { flows: fl, solved: !problem, verdicts, problem };
  }

  /** After a failed run: the water drains and you can turn tiles again. */
  drain(): void {
    if (this.s.phase === 'running') this.set({ phase: 'routing', flows: [] });
  }

  /** Tier 3 hint: turns one wrong tile the right way; returns it, or null when none's wrong. */
  fixOne(): readonly [number, number] | null {
    if (this.s.phase !== 'routing' || this.s.round === 3) return null;
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

  /** Round 3: the first crew (gate order) not yet in a place that fits its order, or null. */
  wrongCrew(): Crew | null {
    if (this.s.round !== 3) return null;
    return CREWS.find((c) => this.picks[c] === null || !fits(c, this.picks[c]!)) ?? null;
  }

  twist(choice: TwistChoice): (typeof TWIST_CHOICES)[number] {
    const c = TWIST_CHOICES.find((x) => x.id === choice)!;
    this.set({ twistChoice: choice, phase: c.right ? 'done' : 'twist' });
    return c;
  }
}
