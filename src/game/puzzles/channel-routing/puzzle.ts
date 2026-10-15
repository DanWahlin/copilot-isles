import { Vector3 } from 'three/webgpu';
import type { ThousandBoughSystem } from '../../../world/islands/thousand-bough/contract';
import { THOUSAND_BOUGH } from '../../../world/islands/thousand-bough/layout';
import type { SliceName } from '../../../audio/soundscape/bank';
import type { CameraShot } from '../../follow-camera';
import type { HintTier, Puzzle, PuzzleHost } from '../types';
import type { ScriptStep } from '../../script';
import { COLS, CREW_LOOK, ROWS } from './boards';
import { tileLabel } from './logic';
import { ChannelRoutingModel, END_LINE, TWIST_CHOICES, type RunResult, type TwistChoice } from './model';
import type { Crew } from './types';
import { createViewStore, type ChannelRoutingStore, type ChannelRoutingView } from './view';

/** What Channel Routing needs beyond the usual puzzle host: the camera, voices and the screen. */
export interface ChannelRoutingHost extends PuzzleHost {
  /** Frames a fixed shot (null hands the camera back to the follow camera). */
  frame(shot: CameraShot | null): void;
  /** Plays voice lines in order (resolves when they've finished). */
  say(ids: readonly string[]): Promise<void>;
  /** Wingman's unvoiced hint line. */
  wingman(text: string): void;
  /** World → CSS pixels on screen, or null when it's behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number; scale: number } | null;
  /** The board owns the keys and the camera while it's open. */
  setModal(on: boolean): void;
  reducedMotion(): boolean;
  /** Fen's closing beat (FEN_SOLVED), run once the twist's answered. */
  closing: readonly ScriptStep[];
  /** Fades the screen to black (true) and back, for the demo's cut to the board. */
  fade?(on: boolean, ms?: number): Promise<void>;
  /** The chart label for the board or the Spire twist (docs/specs/LOWER-THIRDS.md), once a save. */
  label?(id: 'puzzle:P2.1' | 'puzzle:P2.2'): void;
  /** Mounts the overlay (tests pass a stand-in; the game loads src/ui/puzzles/ChannelRouting.tsx). */
  mountUi?: (store: ChannelRoutingStore) => () => void;
}

const ID = 'P2.1';
/** Saved with the quests: the round you'd got to (a checkpoint at each round's start, POC §3.9). */
const SAVE = 'P2.1';
const TWIST_QUESTION =
  'Feature and Docs both want to show their work at Lookout 5173. Their channels are separate. So why are they stuck?';

/** The title cards over Fen's demo (spec §5.3, the cold open). */
const OLD_WAY = {
  kicker: 'The old way',
  title: 'One shared trough',
  text: 'Every crew’s water runs down the same trough, so it all mixes into mud.',
};
const NEW_WAY = {
  kicker: 'The new way',
  title: 'One channel per crew',
  text: 'Each crew’s water stays in its own channel, all the way to its own wheel.',
};

const crewName = (c: Crew) => CREW_LOOK[c].name;
/** “Feature’s”, “Docs’”. */
const whose = (c: Crew) => (crewName(c).endsWith('s') ? `${crewName(c)}’` : `${crewName(c)}’s`);
const where = (at: readonly [number, number] | null) =>
  at ? ` at row ${at[0] + 1}, column ${at[1] + 1}` : '';

/** The result in words, for the message box and screen readers (never colour alone). */
export function describeRun(run: RunResult, round: 1 | 2 | 3): string {
  if (run.solved)
    return round === 1
      ? 'Feature’s water turns Feature’s wheel. One crew, one channel.'
      : 'Every crew’s water turns its own wheel, and nothing mixed.';
  const p = run.problem!;
  const who = whose(p.crew);
  switch (p.end) {
    case 'mixed':
      return `${who} water mixed with another crew’s${where(p.at)}.`;
    case 'mainHall':
      return `${who} water spilled into the Great Hall: the main checkout.`;
    case 'wrongWheel': {
      const f = run.flows.find((x) => x.crew === p.crew);
      return `${who} water turned ${f?.wheel ? whose(f.wheel) : 'another crew’s'} wheel.`;
    }
    default:
      return `${who} water stops short${where(p.at)}.`;
  }
}

/**
 * P2.1 Channel Routing and P2.2 the Spire twist at the Flume Gallery (spec §5): Fen's cold open, three
 * rounds on the Gate Board, then two crews on one Lookout. The board plays from the overlay
 * (src/ui/puzzles/ChannelRouting.tsx) and the Flume Terrace view shows it in the world.
 */
export function createChannelRouting(
  host: ChannelRoutingHost,
  sys: ThousandBoughSystem,
): Puzzle & {
  open(): Promise<void>;
  demo(): Promise<void>;
  demoClear(): Promise<void>;
  readonly isOpen: boolean;
} {
  const saved = host.quests()[SAVE];
  const startRound = (saved === 'r3' ? 3 : saved === 'r2' ? 2 : 1) as 1 | 2 | 3;
  const model = new ChannelRoutingModel(startRound);
  let unmount: (() => void) | null = null;
  let mounting: Promise<void> | null = null;
  let hintAt = { key: '', n: 0 };
  let pulseUntil = 0;
  let lastHits = 0;
  let mixedSeen = false;

  const view = createViewStore<ChannelRoutingView>({
    open: false,
    round: model.state.round,
    phase: model.state.phase,
    board: model.state.board,
    live: model.state.live,
    cursor: model.state.cursor,
    flows: [],
    message: null,
    pulse: null,
    busy: false,
    twist: null,
    announce: '',
    card: null,
    hits: null,
  });
  const sync = (patch: Partial<ChannelRoutingView> = {}) => {
    const s = model.state;
    view.set({
      round: s.round,
      phase: s.phase,
      board: s.board,
      live: s.live,
      cursor: s.cursor,
      flows: s.flows,
      ...patch,
    });
    sys.flume.setCursor(view.get().open ? s.cursor : null);
  };

  const anchors = sys.anchors;
  const camShot = (name: 'puzzleCam' | 'twistCam'): CameraShot => {
    const a = THOUSAND_BOUGH.anchors[name];
    return { x: a.x, y: a.y, z: a.z, tx: a.look.x, ty: a.look.y, tz: a.look.z };
  };
  const step = () => host.quests()['Q2.5'];
  const playing = () => step() === 'channels' || step() === 'twist';
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const at = anchors.gateBoard;

  const sfx = (id: SliceName, gain: number) => host.audio?.sfx.oneShot(id, at, gain);

  // Before Fen's demo the old shared trough still stands over the board.
  if (!step() || step() === 'start') sys.flume.showSharedTrough(true);

  async function mount(): Promise<void> {
    if (unmount) return;
    mounting ??= host.mountUi
      ? Promise.resolve().then(() => void (unmount = host.mountUi!(store)))
      : import('../../../ui/puzzles/ChannelRouting').then(({ mountChannelRouting }) => {
          unmount = mountChannelRouting(store);
        });
    await mounting;
  }

  /** Opens the board at the Gate Board (E there, or straight after Fen's welcome). */
  async function open(): Promise<void> {
    if (view.get().open || !playing()) return;
    host.setModal(true);
    await mount();
    if (step() === 'twist') {
      view.set({ open: true });
      await twist();
      return;
    }
    host.frame(camShot('puzzleCam'));
    await sys.flume.setRound(model.state.round);
    sys.flume.setBoard(model.state.board, false);
    sync({
      open: true,
      card: null,
      message: null,
      announce: `Round ${model.state.round} of 3. ${liveCrews()} Use the arrow keys to pick a tile and E to turn it.`,
    });
    host.label?.('puzzle:P2.1');
  }

  const liveCrews = () => {
    const live = (['feature', 'bugfix', 'docs'] as const).filter((c) => model.state.live[c]).map(crewName);
    return live.length === 1 ? `${live[0]}’s gate is open.` : `${live.join(', ')} gates are open.`;
  };

  function close(): void {
    if (!view.get().open) return;
    view.set({ open: false, busy: false, twist: null, hits: null, pulse: null, card: null });
    sys.flume.setCursor(null);
    host.frame(null);
    host.setModal(false);
  }

  const turn = (r: number, c: number, dir: 1 | -1) => {
    const s = view.get();
    if (!s.open || s.busy || s.twist) return;
    if (model.state.phase === 'running') {
      model.drain();
      sys.flume.resetWater();
    }
    if (!model.turn([r, c], dir)) {
      model.setCursor([r, c]);
      sync();
      return;
    }
    sfx('lever', 0.35);
    sys.flume.setBoard(model.state.board, !host.reducedMotion());
    const t = model.state.board[r]![c]!;
    sync({ pulse: null, message: null, announce: tileLabel(t, r, c) });
  };

  async function runGates(): Promise<void> {
    const s = view.get();
    if (!s.open || s.busy || s.twist || model.state.phase !== 'routing') return;
    const run = model.run();
    sfx('gate_lift', 0.7);
    sync({ busy: true, pulse: null, message: { text: 'The gates are open…', tone: 'info' }, announce: '' });
    const longest = Math.max(0, ...run.flows.map((f) => f.cells.length));
    // The overlay's water takes about 0.22 s a tile; the terrace animates its own.
    await Promise.all([sys.flume.runFlows(run.flows), wait(longest * 220 + 500)]);
    if (!view.get().open) return;
    const text = describeRun(run, model.state.round);
    if (run.solved) {
      sfx('chime_solve', 0.9);
      sync({ message: { text, tone: 'good' }, announce: text });
      await solvedRound();
      return;
    }
    const p = run.problem!;
    if (p.end === 'mixed') mixedSeen = true;
    sync({ message: { text, crew: p.crew, tone: 'bad' }, pulse: p.at, announce: text });
    await host.say([END_LINE[p.end]]);
    if (!view.get().open) return;
    model.drain();
    sys.flume.resetWater();
    sync({ busy: false });
  }

  async function solvedRound(): Promise<void> {
    const round = model.state.round;
    if (round === 1) {
      await host.say(['tb.fen.round1']);
      model.startRound(2);
      host.setQuest(SAVE, 'r2');
      await sys.flume.setRound(2);
      sys.flume.resetWater();
      sync({ busy: false, message: null, announce: `Round 2 of 3. ${liveCrews()}` });
      return;
    }
    if (round === 2) {
      await host.say(['tb.fen.round2']);
      sfx('rock_tumble', 0.9);
      model.startRound(3);
      host.setQuest(SAVE, 'r3');
      await sys.flume.setRound(3);
      sys.flume.setBoard(model.state.board, false);
      sys.flume.resetWater();
      sync({
        message: { text: 'A boulder’s fallen into the middle of the board. New tiles!', tone: 'info' },
        announce: 'Round 3 of 3. A boulder blocks row 3, column 3. Every gate is open.',
      });
      await host.say(['tb.fen.rain']);
      sync({ busy: false });
      return;
    }
    await host.say(['tb.fen.round3']);
    host.setQuest('Q2.5', 'twist');
    await twist();
  }

  async function twist(): Promise<void> {
    model.setPhase('twist');
    sync({ busy: true, message: null, pulse: null, hits: null });
    host.frame(camShot('twistCam'));
    host.label?.('puzzle:P2.2');
    await host.say(['tb.fen.twist.01']);
    sfx('timber_creak_groan', 0.8);
    await sys.spire.playJam();
    await host.say(['tb.fen.twist.02']);
    sync({
      busy: false,
      twist: { question: TWIST_QUESTION, choices: TWIST_CHOICES.map(({ id, text }) => ({ id, text })) },
      announce: TWIST_QUESTION,
    });
  }

  async function choose(id: string): Promise<void> {
    const s = view.get();
    if (!s.open || s.busy || !s.twist) return;
    const c = model.twist(id as TwistChoice);
    view.set({
      busy: true,
      twist: { ...s.twist, picked: { id: c.id, right: c.right } },
      message: { text: c.right ? 'That’s it.' : 'Not quite. Listen to Fen.', tone: c.right ? 'good' : 'bad' },
      announce: `${c.text} ${c.right ? 'Right.' : 'Not quite.'}`,
    });
    if (!c.right) {
      if (id === 'share') {
        sfx('timber_creak_groan', 0.7);
        await sys.spire.playJam();
      }
      await host.say([c.line]);
      view.set({ busy: false });
      return;
    }
    if (id === 'closeOne') {
      sys.spire.preview('feature', 5173, false);
      sys.spire.preview('docs', 5173, true);
      await host.say([c.line]);
      await sys.spire.openSecondBridge();
    } else {
      await sys.spire.openSecondBridge();
      sys.spire.preview('feature', 5173, true);
      sys.spire.preview('docs', 5174, true);
      await host.say([c.line]);
    }
    await host.say(['wingman.tb.ports']);
    host.setQuest('Q2.5', 'solved');
    close();
    await host.beat(host.closing, 'Fen');
  }

  // Wingman's hints (spec §5.4). Tier 3 turns one wrong tile (this isn't a Trial).
  const hint = (tier: HintTier): string | null => {
    if (!view.get().open) return null;
    if (view.get().twist) return 'Their channels are fine. What else do two previews share?';
    const round = model.state.round;
    if (tier === 1)
      return round === 3
        ? 'Bug Fix can’t go through the boulder. Which side leaves Docs a way down?'
        : mixedSeen
          ? 'Follow each colour down from its gate. Where do two meet?'
          : 'Follow the water down from the gate. Where does it go wrong?';
    if (tier === 2) {
      const cell = round === 3 && model.state.board[1]![2]!.rot !== 3 ? ([1, 2] as const) : model.wrongTile();
      if (!cell) return 'Every tile’s right, Captain. Open the gates!';
      pulseUntil = performance.now() + 6000;
      sync({ pulse: cell, cursor: cell });
      model.setCursor(cell);
      return `That one, Captain: row ${cell[0] + 1}, column ${cell[1] + 1}.`;
    }
    const fixed = model.fixOne();
    if (!fixed) return 'Every tile’s right, Captain. Open the gates!';
    sys.flume.setBoard(model.state.board, !host.reducedMotion());
    sync({ pulse: fixed });
    return `I turned row ${fixed[0] + 1}, column ${fixed[1] + 1} for you.`;
  };

  const store: ChannelRoutingStore = {
    get: view.get,
    subscribe: view.subscribe,
    actions: {
      select: (r, c) => {
        model.setCursor([r, c]);
        sync();
      },
      turn,
      move: (dr, dc) => {
        model.moveCursor(dr, dc);
        sync();
      },
      openGates: () => void runGates(),
      undo: () => {
        if (view.get().busy || !model.undo()) return;
        sys.flume.setBoard(model.state.board, !host.reducedMotion());
        sync({ announce: 'Undone.' });
      },
      reset: () => {
        if (view.get().busy) return;
        model.reset();
        sys.flume.setBoard(model.state.board, !host.reducedMotion());
        sync({ pulse: null, message: null, announce: 'The board’s back to the start of the round.' });
      },
      hint: () => {
        // Same tiers as Wingman's Q: a nudge, then the tile, then one turned for you.
        const key = `${model.state.round}:${model.version}`;
        const n = hintAt.key === key ? Math.min(3, hintAt.n + 1) : 1;
        const line = hint(n as HintTier);
        hintAt = { key: `${model.state.round}:${model.version}`, n: n === 3 ? 0 : n };
        if (line) host.wingman(line);
      },
      leave: close,
      choose: (id) => void choose(id),
    },
  };

  // The board's interaction: E at the Gate Board.
  host.interactions.add({
    id: 'flume:board',
    label: () => (step() === 'twist' ? 'Go back to the Spire question' : 'Use the Gate Board'),
    x: at.x,
    y: at.y,
    z: at.z,
    radius: 2.6,
    enabled: () => host.canAct() && playing() && !view.get().open,
    onInteract: () => void open(),
  });

  // Gamepad (spec §5.5): d-pad or left stick moves, A/RB turn, LB turns back, X opens the gates,
  // Y hints, B leaves, View resets, d-pad down held undoes.
  const pad = { held: new Map<number, boolean>(), stickAt: 0, downFor: 0 };
  const padEdge = (p: Gamepad, i: number) => {
    const d = !!p.buttons[i]?.pressed;
    const was = pad.held.get(i) ?? false;
    pad.held.set(i, d);
    return d && !was;
  };
  function pollPad(dt: number): void {
    const p = navigator.getGamepads?.().find((g) => g && g.connected && g.mapping === 'standard');
    if (!p) return;
    const s = view.get();
    const a = store.actions;
    if (padEdge(p, 1) || padEdge(p, 9)) return a.leave();
    if (s.twist) {
      // Up/down picks, A answers.
      return;
    }
    if (padEdge(p, 12)) a.move(-1, 0);
    if (padEdge(p, 14)) a.move(1, 0);
    if (padEdge(p, 15)) a.move(0, 1);
    if (padEdge(p, 13)) a.move(0, -1);
    const ax = p.axes[0] ?? 0,
      ay = p.axes[1] ?? 0;
    pad.stickAt -= dt;
    if (Math.hypot(ax, ay) > 0.6 && pad.stickAt <= 0) {
      pad.stickAt = 0.22;
      if (Math.abs(ax) > Math.abs(ay)) a.move(0, Math.sign(ax));
      else a.move(Math.sign(ay), 0);
    } else if (Math.hypot(ax, ay) < 0.3) pad.stickAt = 0;
    const cur = s.cursor ?? [0, 1];
    if (padEdge(p, 0) || padEdge(p, 5)) a.turn(cur[0], cur[1], 1);
    if (padEdge(p, 4)) a.turn(cur[0], cur[1], -1);
    if (padEdge(p, 2)) a.openGates();
    if (padEdge(p, 3)) a.hint();
    if (padEdge(p, 8)) a.reset();
    pad.downFor = p.buttons[13]?.pressed ? pad.downFor + dt : 0;
    if (pad.downFor > 0.6) {
      pad.downFor = -10;
      a.undo();
    }
  }

  // Touch hit areas over the 3D tiles, refreshed a few times a second while the board is open.
  const centre = new Vector3();
  function refreshHits(): void {
    const hits: ({ x: number; y: number; size: number } | null)[] = [];
    let any = false;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        sys.flume.tileCenter(r, c, centre);
        const p = host.project(centre.x, centre.y, centre.z);
        if (p) any = true;
        hits.push(p ? { x: p.x, y: p.y, size: Math.max(44, 3.2 * p.scale * 0.92) } : null);
      }
    view.set({ hits: any ? hits : null });
  }

  return {
    id: ID,
    get isOpen() {
      return view.get().open;
    },
    open,
    /**
     * Fen's cold open, the old way (spec §5.3): the three gates pour into one shared trough and it
     * all runs to mud, under a title card. Resolves once the mud's in every chute (it keeps running).
     */
    async demo() {
      host.frame(camShot('puzzleCam'));
      await mount();
      view.set({ card: OLD_WAY });
      sfx('gate_lift', 0.7);
      await sys.flume.demoSharedTrough();
    },
    /** Then the gates shut, the trough drains, and a fade cuts to the board without it: the new way. */
    async demoClear() {
      sfx('lever', 0.4);
      await sys.flume.drainSharedTrough();
      const ms = host.reducedMotion() ? 240 : 380;
      await host.fade?.(true, ms);
      sys.flume.clearSharedTrough();
      sys.flume.setBoard(model.state.board, false);
      view.set({ card: NEW_WAY });
      await host.fade?.(false, ms);
    },
    engaged: () => view.get().open,
    hint,
    hintKey: () => `${model.state.round}:${model.version}:${view.get().twist ? 't' : ''}`,
    update(dt) {
      if (!view.get().open) {
        // Fen's beat ended without opening the board (it was cut short): no card left over, no water running.
        if (view.get().card && host.canAct()) {
          view.set({ card: null });
          void sys.flume.drainSharedTrough();
        }
        return;
      }
      pollPad(dt);
      if (view.get().pulse && pulseUntil && performance.now() > pulseUntil) {
        pulseUntil = 0;
        if (!view.get().busy) view.set({ pulse: null });
      }
      if (!view.get().twist && !view.get().busy && (lastHits += dt) > 0.4) {
        lastHits = 0;
        refreshHits();
      }
    },
    debug: {
      state: () => ({
        ...model.state,
        open: view.get().open,
        busy: view.get().busy,
        twist: !!view.get().twist,
      }),
      view: () => view.get(),
      open: () => open(),
      leave: () => close(),
      turn: (r: number, c: number, dir: 1 | -1 = 1) => turn(r, c, dir),
      run: () => runGates(),
      choose: (id: string) => choose(id),
      wrong: () => model.wrongTile(),
    },
    dispose() {
      host.interactions.remove('flume:board');
      if (view.get().open) close();
      unmount?.();
      unmount = null;
    },
  };
}
