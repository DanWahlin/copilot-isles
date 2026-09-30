import type { CrateYardSite } from '../../world/sites/crate-yard';
import {
  MERIDIAN_YARD,
  crateAt,
  initialState,
  push,
  solve,
  solved as isSolved,
  type YardLayout,
  type YardState,
} from '../../world/sites/crate-yard-logic';
import { ANDERS_SOLVED } from '../meridian-quests';
import type { HintTier, Puzzle, PuzzleHost } from './types';

const YARD_ID = 'P1.1';
const QUEST = 'Q1.4';

/**
 * P1.1 The Crate Yard (Anders, Q1.4): face a crate and press E to push it one cell. Chat work goes
 * to the tavern plates, project work to the slipway plates; a plate refuses the wrong crate and
 * says why. The lever by the gate resets the yard. Crate positions and solved are saved.
 */
export function createCrateYard(
  host: PuzzleHost,
  site: CrateYardSite,
  layout: YardLayout = MERIDIAN_YARD,
): Puzzle {
  const saved = host.learn?.progress.data.puzzles[YARD_ID];
  let state: YardState = initialState(layout);
  if (saved?.state?.length === layout.crates.length * 2) {
    const at = layout.crates.map(
      (_, i) => [saved.state![i * 2]!, saved.state![i * 2 + 1]!] as [number, number],
    );
    // Only restore a save that's still a valid arrangement (inside the yard, no two crates stacked).
    if (
      at.every(([x, z]) => x >= 0 && z >= 0 && x < layout.cols && z < layout.rows) &&
      new Set(at.map(String)).size === at.length
    )
      state = { at };
  }
  let solved = saved?.solved ?? false;
  let hintCrate = -1;
  let moves = 0;

  const started = () => {
    const q = host.quests()[QUEST];
    return q === 'crates' || q === 'solved' || q === 'done';
  };
  const save = () =>
    host.learn?.progress.setPuzzle(YARD_ID, { solved, state: state.at.flatMap(([x, z]) => [x, z]) });
  const home = () => state.at.map(([x, z], i) => plateHome(x, z, i));
  const plateHome = (x: number, z: number, i: number) =>
    (layout.crates[i]!.kind === 'chat' ? layout.chatPlates : layout.projectPlates).some(
      ([px, pz]) => px === x && pz === z,
    );

  if (solved) state = solvedState(layout);
  state.at.forEach((cell, i) => site.setCrate(i, cell, true));
  site.setHome(home());
  if (solved && host.quests()[QUEST] === 'crates') host.setQuest(QUEST, 'solved');

  /** The cell the player's standing in and the crate in front of them, if any. */
  const ahead = (): { from: [number, number]; dir: 'n' | 's' | 'e' | 'w'; crate: number } | null => {
    const p = host.player;
    if (Math.abs(p.y - site.top) > 0.8) return null;
    const from = site.cellAt(p.x, p.z);
    if (!from) {
      // Standing just outside the yard's edge, facing in.
      return null;
    }
    const dir = site.facing(p.heading);
    const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
    const crate = crateAt(state, from[0] + d[0]!, from[1] + d[1]!);
    return crate >= 0 ? { from, dir, crate } : null;
  };
  let focus: ReturnType<typeof ahead> = null;

  host.interactions.add({
    id: 'crates:push',
    label: () => 'Push the crate',
    get x() {
      return focus ? site.cellCenter(state.at[focus.crate]![0], state.at[focus.crate]![1]).x : 1e6;
    },
    get y() {
      return site.top;
    },
    get z() {
      return focus ? site.cellCenter(state.at[focus.crate]![0], state.at[focus.crate]![1]).z : 1e6;
    },
    radius: 2.4,
    enabled: () => host.canAct() && started() && !solved && !!focus && !site.sliding,
    onInteract: () => {
      if (focus) tryPush(focus.from, focus.dir);
    },
  });
  const lever = site.anchors.crateLever!;
  host.interactions.add({
    id: 'crates:reset',
    label: () => 'Reset the yard',
    x: lever.x,
    y: lever.y,
    z: lever.z,
    radius: 2,
    enabled: () => host.canAct() && started() && !solved && moves > 0,
    onInteract: () => reset(),
  });

  function tryPush(from: readonly [number, number], dir: 'n' | 's' | 'e' | 'w'): void {
    const r = push(layout, state, from, dir);
    const at = (i: number) => {
      const c = site.cellCenter(state.at[i]![0], state.at[i]![1]);
      return { x: c.x, y: site.top + 0.5, z: c.z };
    };
    if (!r.ok) {
      if (r.crate < 0) return;
      site.wobble(r.crate);
      host.audio?.sfx.oneShot('crate_thud', at(r.crate), 0.8);
      if (r.reason === 'wrong-plate') host.hud.toast(layout.crates[r.crate]!.why, 5);
      return;
    }
    moves += 1;
    site.setCrate(r.crate, r.to);
    host.audio?.sfx.oneShot('stone_turn', at(r.crate), 0.8);
    if (r.crate === hintCrate) setHint(-1);
    site.setHome(home());
    save();
    if (isSolved(layout, state)) void onSolved();
  }

  function reset(): void {
    state = initialState(layout);
    state.at.forEach((cell, i) => site.setCrate(i, cell));
    site.setHome(home());
    site.setLever(true);
    setTimeout(() => site.setLever(false), 600);
    host.audio?.sfx.oneShot('lever', { x: lever.x, y: lever.y + 1, z: lever.z }, 0.9);
    setHint(-1);
    moves = 0;
    save();
  }

  function setHint(i: number): void {
    hintCrate = i;
    site.setHint(i);
  }

  async function onSolved(): Promise<void> {
    solved = true;
    save();
    host.setQuest(QUEST, 'solved');
    setHint(-1);
    await new Promise((r) => setTimeout(r, 700));
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.8);
    const ok = await host.beat(ANDERS_SOLVED, 'Anders');
    if (!ok) host.hud.toast('Talk to Anders to finish up at the shipyard.', 3.5);
  }

  const near = () => {
    const c = site.cellCenter((layout.cols - 1) / 2, (layout.rows - 1) / 2);
    return Math.hypot(host.player.x - c.x, host.player.z - c.z) < 14;
  };
  const standing = () => {
    const p = host.player;
    return site.cellAt(p.x, p.z) ?? layout.entry;
  };

  return {
    id: YARD_ID,
    engaged: () => started() && !solved && near(),
    hintKey: () => state.at.map(String).join('|'),
    hint(tier: HintTier) {
      if (!started() || solved) return null;
      if (tier === 1) return 'Read each crate, Captain. Would that job change your repository?';
      const path = solve(layout, state, standing());
      if (!path?.length) return 'That yard’s jammed, Captain. Pull the lever by the gate to start it over.';
      const step = path[0]!;
      if (tier === 2) {
        setHint(step.crate);
        return 'Try the glowing crate next. Which plate does its job belong on?';
      }
      tryPush(step.from, step.dir);
      return 'There, I’ve pushed one for you. Keep going!';
    },
    update() {
      focus = host.canAct() && started() && !solved ? ahead() : null;
    },
    debug: {
      state: () => ({ at: state.at.map(([x, z]) => [x, z]), solved, moves, hint: hintCrate }),
      push: (x: number, z: number, dir: 'n' | 's' | 'e' | 'w') => tryPush([x, z], dir),
      solve: () => {
        for (const step of solve(layout, state, standing()) ?? []) tryPush(step.from, step.dir);
      },
      reset: () => reset(),
      spots: () => ({
        top: site.top,
        cells: layout.crates.map((_, i) => site.cellCenter(state.at[i]![0], state.at[i]![1])),
        lever: { x: lever.x, z: lever.z },
      }),
    },
    dispose() {
      host.interactions.remove('crates:push');
      host.interactions.remove('crates:reset');
    },
  };
}

/** Every crate on a plate of its kind, in order (for a save that's already solved). */
function solvedState(layout: YardLayout): YardState {
  const chat = [...layout.chatPlates],
    project = [...layout.projectPlates];
  return {
    at: layout.crates.map((c) => {
      const [x, z] = (c.kind === 'chat' ? chat : project).shift()!;
      return [x, z];
    }),
  };
}
