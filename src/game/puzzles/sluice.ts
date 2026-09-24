import type { SoundLoopHandle } from '../../audio/soundscape/soundscape';
import type { MillCellWater, MillSite } from '../../world/sites';
import {
  ANCHORAGE_SLUICE,
  flow,
  nearestBreak,
  openings,
  rotatable,
  solutionPath,
  type SluiceLayout,
} from '../../world/sites/sluice-logic';
import { SURI_SOLVED } from '../cove-quests';
import type { HintTier, Puzzle, PuzzleHost } from './types';

export const SLUICE_ID = 'P0.1';
const QUEST = 'Q0.6';

/**
 * P0.1 Sluice & Waterwheel (POC §4.5): pull the lever under the "Workflows aren't being run" sign to
 * lift the gate, then turn channel tiles (E) until the spring's water reaches the wheel. The wheel
 * turns, the lanterns light, and Suri closes Q0.6. Tile turns, the lever, and solved are saved.
 */
export function createSluice(
  host: PuzzleHost,
  site: MillSite,
  layout: SluiceLayout = ANCHORAGE_SLUICE,
): Puzzle {
  const path = solutionPath(layout);
  const saved = host.learn?.progress.data.puzzles[SLUICE_ID];
  const rots = layout.tiles.map((t, i) => {
    const v = saved?.state?.[i];
    return Number.isInteger(v) ? ((v! % 4) + 4) % 4 : t.start;
  });
  let gate = saved?.flags?.includes('gate') ?? false;
  let solved = saved?.solved ?? false;
  let hintCell = -1;

  const started = () => {
    const q = host.quests()[QUEST];
    return q === 'sluice' || q === 'solved' || q === 'done';
  };

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
    site.setWater(cells, gate, f.solved);
    return f.solved;
  };

  rots.forEach((r, i) => site.setRotation(i, r, true));
  site.setLever(gate, true);
  // A solved sluice stays solved even if a save's tiles were edited.
  if (solved)
    layout.tiles.forEach((t, i) => rotatable(t) && site.setRotation(i, (rots[i] = t.solution), true));
  refresh();
  // Solved but the closing beat never ran (quit mid-way): Suri finishes it when you talk to her.
  if (solved && host.quests()[QUEST] === 'sluice') host.setQuest(QUEST, 'solved');

  const pos = (x: number, y: number, z: number) => ({ x, y, z });
  const spoutAt = site.anchors.millGate!;
  const wheelAt = site.anchors.millWheel!;
  let loops: { spout: SoundLoopHandle; stream: SoundLoopHandle; wheel: SoundLoopHandle } | null = null;

  const target = (): number => {
    const p = host.player;
    if (Math.abs(p.y - site.top) > 0.6) return -1;
    const fx = Math.sin(p.heading),
      fz = Math.cos(p.heading);
    const ahead = site.cellAt(p.x + fx * 1.0, p.z + fz * 1.0);
    const i = ahead >= 0 && rotatable(layout.tiles[ahead]!) ? ahead : site.cellAt(p.x, p.z);
    return i >= 0 && rotatable(layout.tiles[i]!) ? i : -1;
  };
  let focus = -1;

  host.interactions.add({
    id: 'mill:lever',
    label: () => 'Pull the lever',
    x: site.anchors.millLever!.x,
    y: site.top,
    z: site.anchors.millLever!.z,
    radius: 2.1,
    enabled: () => host.canAct() && started() && !gate,
    onInteract: () => pullLever(),
  });
  host.interactions.add({
    id: 'mill:tile',
    label: () => 'Turn the channel',
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
    enabled: () => host.canAct() && started() && !solved && focus >= 0 && !site.turning,
    onInteract: () => turn(focus),
  });

  function pullLever(): void {
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
    host.hud.toast('Workflows enabled. Now turn the channels (E) to carry the water to the wheel.', 4.5);
  }

  function turn(i: number): void {
    if (i < 0 || solved) return;
    rots[i] = (rots[i]! + 1) % 4;
    site.setRotation(i, rots[i]!);
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
    host.setQuest(QUEST, 'solved');
    hintCell = -1;
    site.setHint(-1);
    // Let the water reach the wheel before anyone talks.
    await new Promise((r) => setTimeout(r, 1900));
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.8);
    const ok = await host.beat(SURI_SOLVED, 'Suri');
    if (!ok) host.hud.toast('Talk to Suri to finish up at the mill.', 3.5);
  }

  const near = () => {
    const p = host.player;
    return Math.hypot(p.x - (spoutAt.x + wheelAt.x) / 2, p.z - (spoutAt.z + wheelAt.z) / 2) < 16;
  };

  return {
    id: SLUICE_ID,
    engaged: () => started() && !solved && near(),
    hintKey: () => (gate ? `tiles:${rots.join('')}` : 'gate'),
    hint(tier: HintTier) {
      if (!started() || solved) return null;
      if (!gate) {
        if (tier === 1) return 'Read the sign over the gate, Captain. That’s the Actions tab talking.';
        if (tier === 2)
          return 'The lever by the basin: “I understand my workflows, go ahead and enable them.”';
        pullLever();
        return 'I’ve pulled it for you. Workflows are on.';
      }
      if (tier === 1) return 'Follow the water from the spring. Where does it stop?';
      const i = nearestBreak(layout, rots, path);
      if (i < 0) return null;
      if (tier === 2) {
        hintCell = i;
        site.setHint(i);
        return 'That glowing tile is where the water stops. Turn it until the channel lines up.';
      }
      const t = layout.tiles[i]!;
      rots[i] = t.solution;
      site.setRotation(i, rots[i]!);
      hintCell = -1;
      site.setHint(-1);
      const now = refresh();
      save();
      if (now && !solved) void onSolved();
      return 'There, I’ve turned that one. Keep going!';
    },
    update() {
      focus = host.canAct() && started() && !solved ? target() : -1;
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
        if (!gate) pullLever();
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
      turn: (i: number) => turn(i),
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
