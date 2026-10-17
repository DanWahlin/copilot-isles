import { COURSE_REPO, type ForkRef } from '../../learn/fork';
import type { GearRackSite } from '../../world/sites';
import { textOf } from '../../course/puzzles';
import { gearContent, gearReadout, gearTone, YOUR_HANDLE } from '../../world/sites/gear-logic';
import type { Puzzle, PuzzleHost, PuzzleTerminal } from './types';

const ID = 'gear.rack';

/**
 * Bo's gear rack as scenery (Q0.4): E there, or Bo's `gear-checks` cue while he explains them, runs
 * the course's version checks and `gh auth status` in the terminal panel, and every one passes. It
 * isn't a puzzle: the checks themselves are quick, so there's nothing to fetch or fix. Its content is
 * the course pack's `puzzles/gear-rack.json` (a checklist).
 */
export function createGearRack(host: PuzzleHost, site: GearRackSite): Puzzle & { cue(): void } {
  const spots = site.spots();
  // `gh auth status` names the account that owns your fork (its owner, once you've given it).
  let fork: ForkRef | null | undefined;
  let readout: PuzzleTerminal = { title: '', lines: [] };
  const current = (): PuzzleTerminal => {
    const now = host.learn?.progress.data.fork ?? null;
    if (now !== fork) {
      fork = now;
      const handle = now?.owner ?? YOUR_HANDLE;
      readout = {
        title: textOf(gearContent(), 'title', { repo: now?.repo ?? COURSE_REPO }),
        lines: gearReadout(handle, now?.host).map((text) => ({ text, tone: gearTone(text, handle) })),
      };
    }
    return readout;
  };
  let shown = false;
  const near = (r: number) => Math.hypot(host.player.x - spots.rack.x, host.player.z - spots.rack.z) < r;

  const run = () => {
    shown = true;
    host.audio?.sfx.oneShot('gear_hang', spots.rack, 0.35);
  };
  host.interactions.add({
    id: 'gear:rack',
    label: () => textOf(gearContent(), 'interact'),
    x: spots.rack.x,
    y: spots.rack.y,
    z: spots.rack.z,
    radius: 2.2,
    enabled: () => host.canAct(),
    onInteract: run,
  });

  return {
    id: ID,
    engaged: () => false,
    hint: () => null,
    hintKey: () => '-',
    cue: run,
    terminal(): PuzzleTerminal | null {
      if (!shown) return null;
      if (!near(7)) {
        shown = false;
        return null;
      }
      return current();
    },
    update() {},
    debug: {
      state: () => ({ shown }),
      run: () => run(),
      spots: () => ({ rack: site.anchors.gearRack ?? { x: spots.rack.x, z: spots.rack.z } }),
    },
    dispose() {
      host.interactions.remove('gear:rack');
    },
  };
}
