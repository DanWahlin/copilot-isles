import type { GearRackSite } from '../../world/sites';
import { gearReadout, gearTone } from '../../world/sites/gear-logic';
import type { Puzzle, PuzzleHost, PuzzleTerminal } from './types';

const ID = 'gear.rack';
const TITLE = 'Terminal · copilot-app-for-beginners';

/**
 * Bo's gear rack as scenery (Q0.4): E there, or Bo's `gear-checks` cue while he explains them, runs
 * the course's version checks and `gh auth status` in the terminal panel, and every one passes. It
 * isn't a puzzle: the checks themselves are quick, so there's nothing to fetch or fix.
 */
export function createGearRack(host: PuzzleHost, site: GearRackSite): Puzzle & { cue(): void } {
  const spots = site.spots();
  const lines = gearReadout().map((text) => ({ text, tone: gearTone(text) }));
  let shown = false;
  const near = (r: number) => Math.hypot(host.player.x - spots.rack.x, host.player.z - spots.rack.z) < r;

  const run = () => {
    shown = true;
    host.audio?.sfx.oneShot('gear_hang', spots.rack, 0.35);
  };
  host.interactions.add({
    id: 'gear:rack',
    label: () => 'Run Bo’s version checks',
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
      return { title: TITLE, lines };
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
