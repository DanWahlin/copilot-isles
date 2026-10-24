import type { SoundLoopHandle } from '../../audio/soundscape/soundscape';
import type { MillCellWater, MillSite } from '../../world/sites';
import {
  ANCHORAGE_SLUICE,
  flow,
  nearestBreak,
  openings,
  rotatable,
  shortestTurn,
  solutionPath,
  type SluiceLayout,
} from '../../world/sites/sluice-logic';
import { SURI_SOLVED } from '../cove-quests';
import type { HintTier, Puzzle, PuzzleHost } from './types';
import { tileFocus } from './tile-focus';
import { lineOf, puzzleContent, puzzleQuest, puzzleSteps, textOf } from '../../course/puzzles';

/** The mill race's words and lines (`puzzles/sluice.json`). */
const T = (key: string) => textOf(puzzleContent('sluice'), key);
const L = (key: string) => lineOf(puzzleContent('sluice'), key);

/** Its save key and id: the gate lever's flag (`gate`) is read when old saves are brought in line. */
export const SLUICE_ID = 'P0.1';

/**
 * P0.1 Sluice & Waterwheel (POC §4.5), in two parts:
 * - **The gate lever** (required): pull the lever under the gate's sign (the course's words,
 *   `puzzles/sluice.json`) to lift the gate. It moves the crane's quest from its `gate` step on to
 *   `brief` (the crew's briefing at the crane), and the crane's confirm lever can run.
 * - **The channels** (optional, once the quest `puzzleQuest('sluice')` names reaches its `sluice`
 *   step): turn channel tiles (E clockwise, Shift+E back) until the water reaches both outlets: the
 *   wheel turns and the check gate stays jammed (the check that fails on purpose). The lanterns light,
 *   the quest moves on to its `solved` step, and Suri closes it.
 * Tile turns, the lever, and solved are saved.
 */
export function createSluice(
  host: PuzzleHost,
  site: MillSite,
  layout: SluiceLayout = ANCHORAGE_SLUICE,
): Puzzle {
  const quest = puzzleQuest('sluice');
  /** Pim and Pol's crane job: its `gate` step is this lever. */
  const craneQuest = puzzleQuest('crane');
  const S = puzzleSteps('sluice');
  const C = puzzleSteps('crane');
  const path = solutionPath(layout);
  const saved = host.learn?.progress.data.puzzles[SLUICE_ID];
  const rots = layout.tiles.map((t, i) => {
    const v = saved?.state?.[i];
    return Number.isInteger(v) ? ((v! % 4) + 4) % 4 : t.start;
  });
  let gate = saved?.flags?.includes('gate') ?? false;
  let solved = saved?.solved ?? false;
  let hintCell = -1;

  /** The mill race's quest is under way: the channels can turn. */
  const started = () => {
    const q = host.quests()[quest];
    return q === S.sluice || q === S.solved || q === 'done';
  };
  /** The crane job is waiting on the gate (or an older save never pulled it). */
  const actionsStep = () => {
    const q = host.quests()[craneQuest];
    return q === C.gate || q === C.brief || q === C.crane;
  };
  const leverOpen = () => !gate && (actionsStep() || started());
  const tilesOpen = () => gate && started() && !solved;

  const save = () =>
    host.learn?.progress.setPuzzle(SLUICE_ID, { solved, state: rots.slice(), flags: gate ? ['gate'] : [] });

  const refresh = () => {
    const f = flow(layout, rots, gate, 2.4);
    const cells: MillCellWater[] = f.cells.map((c, i) => ({
      wet: c.wet,
      entry: c.entry,
      mask: openings(layout.tiles[i]!.kind, rots[i]!),
      through: c.through,
      pooled: c.pooled,
      distance: c.distance,
    }));
    site.setWater(cells, gate, f.wheel, f.check);
    return f.solved;
  };

  /**
   * Keeps the gate and the crane job in step: a finished crane means the gate is up (older saves
   * finished it before the lever was part of it), and a lever pulled before the crane job asked for
   * it moves that job on to its briefing at the crane.
   */
  const syncGate = (): void => {
    const q = host.quests()[craneQuest];
    if (!gate && (q === C.solved || q === 'done')) {
      gate = true;
      site.setLever(true, true);
      save();
      refresh();
    } else if (gate && q === C.gate) host.setQuest(craneQuest, C.brief);
  };

  rots.forEach((r, i) => site.setRotation(i, r, true));
  site.setLever(gate, true);
  // A solved sluice stays solved even if a save's tiles were edited.
  if (solved)
    layout.tiles.forEach((t, i) => rotatable(t) && site.setRotation(i, (rots[i] = t.solution), true));
  refresh();
  syncGate();
  // Solved but the closing beat never ran (quit mid-way): Suri finishes it when you talk to her.
  if (solved && host.quests()[quest] === S.sluice) host.setQuest(quest, S.solved);

  const pos = (x: number, y: number, z: number) => ({ x, y, z });
  const spoutAt = site.anchors.millGate!;
  const wheelAt = site.anchors.millWheel!;
  let loops: { spout: SoundLoopHandle; stream: SoundLoopHandle; wheel: SoundLoopHandle } | null = null;

  const centres = layout.tiles.map((_, i) => site.cellCenter(i));
  const turns = (i: number) => rotatable(layout.tiles[i]!);
  /** The tile you're facing (1 m ahead, else underfoot), held at edges and corners (`tileFocus`). */
  const target = (): number => {
    const p = host.player;
    if (Math.abs(p.y - site.top) > 0.6) return -1;
    return tileFocus(site, centres, turns, focus, p.x, p.z, p.heading);
  };
  let focus = -1;

  host.interactions.add({
    id: 'mill:lever',
    label: () => T('lever'),
    x: site.anchors.millLever!.x,
    y: site.top,
    z: site.anchors.millLever!.z,
    radius: 2.1,
    enabled: () => host.canAct() && leverOpen(),
    onInteract: () => pullLever(),
  });
  host.interactions.add({
    id: 'mill:tile',
    label: () => T('turn'),
    get x() {
      return focus >= 0 ? site.cellCenter(focus).x : 1e6;
    },
    get y() {
      return site.top;
    },
    get z() {
      return focus >= 0 ? site.cellCenter(focus).z : 1e6;
    },
    radius: 2.6,
    enabled: () => host.canAct() && tilesOpen() && focus >= 0 && !site.turning,
    onInteract: (back) => turn(focus, back),
  });

  /** `quiet`: Wingman's hint pulled it, so he does the talking. */
  function pullLever(quiet = false): void {
    if (gate) return;
    gate = true;
    site.setLever(true);
    host.audio?.sfx.oneShot(
      'lever',
      pos(site.anchors.millLever!.x, site.top + 1, site.anchors.millLever!.z),
      0.9,
    );
    setTimeout(() => host.audio?.sfx.oneShot('gate_lift', pos(spoutAt.x, site.top, spoutAt.z), 1), 350);
    save();
    refresh();
    if (actionsStep()) {
      // That was the crane job's `gate` step: on to the crew's briefing, and its confirm lever can run.
      if (host.quests()[craneQuest] === C.gate) host.setQuest(craneQuest, C.brief);
      host.hud.toast(T('enabledCrane'), 4.5);
      if (!quiet) void host.beat([{ say: L('workflowsOn') }], 'Suri');
    } else host.hud.toast(T('enabledTurn'), 5);
  }

  function turn(i: number, back = false): void {
    if (i < 0 || solved) return;
    rots[i] = (rots[i]! + (back ? 3 : 1)) % 4;
    site.setRotation(i, rots[i]!, false, back);
    const c = site.cellCenter(i);
    host.audio?.sfx.oneShot('stone_turn', pos(c.x, site.top, c.z), 0.85);
    if (i === hintCell) {
      hintCell = -1;
      site.setHint(-1);
    }
    const now = refresh();
    save();
    if (now && !solved) void onSolved();
  }

  async function onSolved(): Promise<void> {
    solved = true;
    save();
    host.setQuest(quest, S.solved);
    hintCell = -1;
    site.setHint(-1);
    // Let the water reach the wheel before anyone talks.
    await new Promise((r) => setTimeout(r, 1900));
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.8);
    const ok = await host.beat(SURI_SOLVED, 'Suri');
    if (!ok) host.hud.toast(T('finishWithSuri'), 3.5);
  }

  const near = () => {
    const p = host.player;
    return Math.hypot(p.x - (spoutAt.x + wheelAt.x) / 2, p.z - (spoutAt.z + wheelAt.z) / 2) < 16;
  };

  return {
    id: SLUICE_ID,
    engaged: () => (leverOpen() || tilesOpen()) && near(),
    hintKey: () => (gate ? `tiles:${rots.join('')}` : 'gate'),
    hint(tier: HintTier) {
      if (leverOpen()) {
        if (tier === 1) return T('hintGate1');
        if (tier === 2) return T('hintGate2');
        pullLever(true);
        return actionsStep() ? T('hintGate3Crane') : T('hintGate3');
      }
      if (!tilesOpen()) return null;
      if (tier === 1) return T('hintFlow1');
      const i = nearestBreak(layout, rots, path);
      if (i < 0) return null;
      if (tier === 2) {
        hintCell = i;
        site.setHint(i);
        return shortestTurn(layout.tiles[i]!.kind, rots[i]!, layout.tiles[i]!.solution) < 0
          ? T('hintFlow2Back')
          : T('hintFlow2');
      }
      const t = layout.tiles[i]!;
      rots[i] = t.solution;
      site.setRotation(i, rots[i]!);
      hintCell = -1;
      site.setHint(-1);
      const now = refresh();
      save();
      if (now && !solved) void onSolved();
      return T('hintFlow3');
    },
    update() {
      syncGate();
      focus = host.canAct() && tilesOpen() ? target() : -1;
      site.setFocus(focus === hintCell ? -1 : focus);
      // Positional water sounds only while you're nearby.
      const p = host.player;
      const d = Math.hypot(p.x - wheelAt.x, p.z - (spoutAt.z + wheelAt.z) / 2);
      if (host.audio && d < 45 && !loops) {
        loops = {
          spout: host.audio.sfx.loop('waterfall_small', pos(spoutAt.x, site.top + 0.6, spoutAt.z + 1.2), 0.7),
          stream: host.audio.sfx.loop(
            'stream',
            pos(spoutAt.x - 2.4, site.top, (spoutAt.z + wheelAt.z) / 2),
            0,
          ),
          wheel: host.audio.sfx.loop('wheel_creak', pos(wheelAt.x, wheelAt.y + 1.5, wheelAt.z), 0),
        };
      } else if (loops && d > 55) {
        loops.spout.stop();
        loops.stream.stop();
        loops.wheel.stop();
        loops = null;
      }
      if (loops) {
        loops.stream.setGain(gate ? (solved ? 0.75 : 0.4) : 0);
        loops.wheel.setGain(solved ? 0.6 : 0);
      }
    },
    debug: {
      state: () => ({ rots: rots.slice(), gate, solved, focus, hint: hintCell, turning: site.turning }),
      solve: () => {
        if (!gate) pullLever(true);
        layout.tiles.forEach((tile, i) => {
          if (rotatable(tile) && openings(tile.kind, rots[i]!) !== openings(tile.kind, tile.solution)) {
            rots[i] = tile.solution;
            site.setRotation(i, rots[i]!);
          }
        });
        const now = refresh();
        save();
        if (now && !solved) void onSolved();
      },
      turn: (i: number, back = false) => turn(i, back),
      lever: () => pullLever(),
      /** Where things are, so tests can walk up and press E like a player. */
      spots: () => ({
        top: site.top,
        lever: { x: site.anchors.millLever!.x, z: site.anchors.millLever!.z },
        cells: layout.tiles.map((t, i) => ({ ...site.cellCenter(i), turns: rotatable(t) })),
      }),
    },
    dispose() {
      host.interactions.remove('mill:lever');
      host.interactions.remove('mill:tile');
      if (loops) {
        loops.spout.stop();
        loops.stream.stop();
        loops.wheel.stop();
      }
      loops = null;
    },
  };
}
