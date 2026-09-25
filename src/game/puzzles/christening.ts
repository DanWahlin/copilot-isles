import type { VillageAnchor } from '../../world/village';
import type { CameraShot } from '../follow-camera';
import type { HintTier, Puzzle, PuzzleHost } from './types';
import { sleep } from '../../util/math';

export const CHRISTENING_ID = 'Q0.11.christen';
const QUEST = 'Q0.11';

/** What the christening needs from the brigantine. */
export interface ChristeningShip {
  setName(name: string | null): void;
  /** Throws a coconut from `from` at the bow stem and resolves once the spray settles. */
  christen(from: { x: number; y: number; z: number }): Promise<void>;
}

/** Nell, and a way to send her to the pier head and back home. */
export interface ChristeningNell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Faces this point (the bow) instead of the player while set. */
  face(target: { x: number; z: number } | null): void;
  moveTo(spot: VillageAnchor | null): void;
}

export interface ChristeningOptions {
  ship: ChristeningShip;
  nell: ChristeningNell;
  /** Where Nell stands for the christening, on the pier facing the way you walk up. */
  spot: VillageAnchor;
  /** The bow stem the coconut aims for (world space, for her to face). */
  bow: () => { x: number; z: number };
  /** The name the ship gets, from captain select. */
  shipName: () => string;
  /** Holds the camera on the bow for the naming (null hands it back to the follow camera). */
  frame?: (shot: CameraShot | null) => void;
  /** The shot that frames the bow name board, from where it's moored now. */
  shot?: () => CameraShot;
}

/** How long the camera lingers on the new name after the spray settles, before handing back. */
const HOLD_MS = 3200;

/**
 * The Christening (POC §4.8, Q0.11): once you've passed the Harbormaster's Trial, Nell waits at the
 * pier head by your bow. Talking to her names the ship (the `christen` cue throws the coconut), Juno
 * reports the crew's aboard, and Wingman runs the berth's sailing lesson. The name board on the
 * transom stays blank until then.
 */
export function createChristening(
  host: PuzzleHost,
  o: ChristeningOptions,
): Puzzle & {
  /** Plays the coconut (the `christen` script cue). */
  cue(): Promise<void>;
} {
  let named: string | null = null;
  let atPier = false;
  let thrown = false;

  const step = () => host.quests()[QUEST];
  const paintName = () => {
    const name = step() === 'done' || thrown ? o.shipName() : null;
    if (name !== named) {
      named = name;
      o.ship.setName(name);
    }
  };
  paintName();

  const far = () => Math.hypot(host.player.x - o.nell.x, host.player.z - o.nell.z) > 30;

  let release: ReturnType<typeof setTimeout> | null = null;
  const frame = (on: boolean) => {
    if (release) clearTimeout(release);
    release = null;
    o.frame?.(on && o.shot ? o.shot() : null);
  };

  async function cue(): Promise<void> {
    const bow = o.bow();
    o.nell.face(bow);
    frame(true);
    await sleep(900);
    thrown = true;
    host.audio?.sfx.oneShot('step_wood', { x: o.nell.x, y: o.nell.y, z: o.nell.z }, 0.5);
    const at = { x: bow.x, y: o.nell.y + 0.4, z: bow.z };
    // The coconut's flight takes 0.6 s (ship/christening.ts), then it cracks on the stem.
    setTimeout(() => host.audio?.sfx.oneShot('coconut_crack', at, 0.9), 600);
    setTimeout(() => host.audio?.sfx.oneShot('crowd_cheer_small', undefined, 0.55), 900);
    await o.ship.christen({ x: o.nell.x, y: o.nell.y + 1.45, z: o.nell.z });
    paintName();
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.8);
    o.nell.face(null);
    release = setTimeout(() => frame(false), HOLD_MS);
  }

  return {
    id: CHRISTENING_ID,
    engaged: () => step() === 'start' && Math.hypot(host.player.x - o.spot.x, host.player.z - o.spot.z) < 12,
    hintKey: () => step() ?? '-',
    hint(tier: HintTier) {
      if (step() !== 'start') return null;
      if (tier === 1) return 'Every ship needs a name before her first voyage. Nell’s waiting by your bow.';
      return 'Talk to Nell at the end of the pier, Captain. She’s got a coconut with your name on it.';
    },
    cue,
    update() {
      const s = step();
      // Nell walks down to the pier head for the ceremony, and home again once you've sailed off.
      const want = s === 'start' || (s === 'done' && atPier && !far());
      if (want !== atPier) {
        atPier = want;
        o.nell.moveTo(want ? o.spot : null);
      }
      paintName();
    },
    debug: {
      state: () => ({ quest: step() ?? null, atPier, named, thrown }),
      spot: () => ({ ...o.spot }),
      cue: () => cue(),
      /** Holds (or releases) the christening shot of the bow, for screenshots. */
      frame: (on: boolean) => frame(on),
    },
    dispose() {
      frame(false);
      o.nell.face(null);
    },
  };
}
