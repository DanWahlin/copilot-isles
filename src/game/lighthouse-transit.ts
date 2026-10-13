import { COVE } from '../world/layout';
import {
  LIGHTHOUSE,
  LIGHTHOUSE_DOOR_HEADING,
  WATCH_DOOR_HEADING,
  lighthouseLevels,
} from '../world/islands/anchorage/lighthouse-stair';

/**
 * The point lighthouse's fast-forward (Dan: the long spiral climb, and the camera on the way down,
 * were too hard). Step onto the stair from the ground floor and a short fade puts you in the top
 * doorway on the gallery; step into the stairwell from the watch room and it puts you back just
 * inside the ground door. Pure numbers, so the session and the tests share them.
 */
export type LighthouseDirection = 'up' | 'down';

/** Where a fast-forward leaves you: feet, facing, and the follow camera's yaw. */
export interface LighthouseArrival {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** The camera's yaw (it looks along (sin yaw, cos yaw)), so it starts behind you. */
  cameraYaw: number;
  /** The camera's pitch to start at (null keeps yours). */
  cameraPitch: number | null;
}

/** A fade's timings in milliseconds: to black, held black (the fast-forward), and back. */
export interface LighthouseFade {
  out: number;
  hold: number;
  in: number;
  /** Quick footsteps during the hold, so it sounds like a run up (or down) the stair. */
  steps: number;
}

const L = COVE.lighthouse;
const levels = lighthouseLevels();
/** Feet this far over the ground floor (the second step) and under the deck count as on the stair. */
const STAIR_MARGIN = 0.3;
/** Within this of the tower's axis, on the ground floor or the watch-room floor, you're at the stair. */
const TOWARD_STAIR = 0.8;
/**
 * Coming in at the ground door, the climb starts once you're through the door's outer face (the
 * shaft is too narrow for the camera behind you, so you never stand about inside). The bottom
 * arrival, in the door's frame facing out, is outside this, so walking out from it doesn't start a
 * climb; turning round and walking back in does.
 */
export const DOOR_THRESHOLD = LIGHTHOUSE.rBottom - 0.15;

/**
 * The column the gallery camera keeps out of: the watch room with room for the camera's pad, so the
 * follow camera stays behind you and clear of the tower.
 */
export const GALLERY_CAMERA_COLUMN = { x: L.x, z: L.z, r: LIGHTHOUSE.watchR + 0.55 } as const;

/**
 * How far the top arrival turns from straight out of the watch-room door, toward the lookout's side:
 * straight behind someone facing out to sea is inside the tower, so you face out and along the
 * gallery, and the camera can sit right behind you.
 */
const GALLERY_TURN = -0.9;

const at = (
  heading: number,
  r: number,
  y: number,
  facing: number,
  pitch: number | null,
): LighthouseArrival => ({
  x: L.x + Math.sin(heading) * r,
  y,
  z: L.z + Math.cos(heading) * r,
  heading: facing,
  cameraYaw: facing,
  cameraPitch: pitch,
});

/** The top: out of the watch-room door onto the middle of the gallery, facing out and along it. */
export const LIGHTHOUSE_TOP: LighthouseArrival = at(
  WATCH_DOOR_HEADING,
  (LIGHTHOUSE.watchR + LIGHTHOUSE.railR) * 0.5,
  levels.deck,
  WATCH_DOOR_HEADING + GALLERY_TURN,
  null,
);

/**
 * The bottom: just inside the ground door, in its frame, facing out. The camera sits about 2 m
 * behind you on the door landing, level with your head and under the steps over the landing. It
 * can't sit further in: the newel, the solid lower steps and the walls of the narrow shaft are in
 * the way. Further into the shaft it folds onto your head.
 */
const BOTTOM_R = 2.6;
const BOTTOM_SIDE = 0.1;
export const LIGHTHOUSE_BOTTOM: LighthouseArrival = {
  x: L.x + Math.sin(LIGHTHOUSE_DOOR_HEADING) * BOTTOM_R + Math.cos(LIGHTHOUSE_DOOR_HEADING) * BOTTOM_SIDE,
  y: levels.floor,
  z: L.z + Math.cos(LIGHTHOUSE_DOOR_HEADING) * BOTTOM_R - Math.sin(LIGHTHOUSE_DOOR_HEADING) * BOTTOM_SIDE,
  heading: LIGHTHOUSE_DOOR_HEADING,
  cameraYaw: LIGHTHOUSE_DOOR_HEADING,
  cameraPitch: 0.12,
};

/**
 * Whether feet at (x, y, z) should fast-forward, and which way: up once you're through the ground
 * door (on the ground floor, inside `DOOR_THRESHOLD`); down once you walk on in from the watch-room
 * door toward the newel, or step into the stairwell; and on the stair itself, by its half. Both
 * arrival spots are clear of all of these, so a fast-forward never starts another. Mid-jump doesn't
 * count.
 */
export function lighthouseTransitAt(
  x: number,
  y: number,
  z: number,
  grounded: boolean,
): LighthouseDirection | null {
  if (!grounded) return null;
  const r = Math.hypot(x - L.x, z - L.z);
  // The ground floor is only the shaft and the door's passage, so this is through the door.
  if (r < DOOR_THRESHOLD && Math.abs(y - levels.floor) < STAIR_MARGIN) return 'up';
  if (r > LIGHTHOUSE.inner) return null;
  const half = (levels.floor + levels.deck) * 0.5;
  if (r < TOWARD_STAIR && Math.abs(y - levels.deck) < STAIR_MARGIN) return 'down';
  if (y < levels.floor + STAIR_MARGIN || y > levels.deck - STAIR_MARGIN) return null;
  return y < half ? 'up' : 'down';
}

/** Where the fast-forward ends. */
export function lighthouseArrival(dir: LighthouseDirection): LighthouseArrival {
  return dir === 'up' ? LIGHTHOUSE_TOP : LIGHTHOUSE_BOTTOM;
}

/** The fade for a fast-forward; with reduced motion (PLAN §9) a plain, shorter one. */
export function lighthouseFade(reducedMotion: boolean): LighthouseFade {
  return reducedMotion
    ? { out: 200, hold: 120, in: 260, steps: 0 }
    : { out: 280, hold: 360, in: 420, steps: 5 };
}

/**
 * Whether feet at (x, y, z) are out on the gallery (round the watch room, at deck height): the
 * follow camera keeps out of the tower there (`GALLERY_CAMERA_COLUMN`).
 */
export function onLighthouseGallery(x: number, y: number, z: number): boolean {
  const r = Math.hypot(x - L.x, z - L.z);
  return (
    r > LIGHTHOUSE.watchR - 0.05 &&
    r < LIGHTHOUSE.galleryR + 0.5 &&
    y > levels.deck - 0.3 &&
    y < levels.deck + 2
  );
}

/**
 * The interact prompts: one at the ground door (seen as you come up the path; walking on in climbs
 * too) and one at the head of the stairwell (from the watch room). Positions are feet height.
 */
export const LIGHTHOUSE_GROUND_DOOR = {
  x: L.x + Math.sin(LIGHTHOUSE_DOOR_HEADING) * LIGHTHOUSE.rBottom,
  y: levels.floor,
  z: L.z + Math.cos(LIGHTHOUSE_DOOR_HEADING) * LIGHTHOUSE.rBottom,
  radius: 1.7,
} as const;
export const LIGHTHOUSE_STAIR_HEAD = {
  x: L.x + Math.sin(WATCH_DOOR_HEADING) * 0.4,
  y: levels.deck,
  z: L.z + Math.cos(WATCH_DOOR_HEADING) * 0.4,
  radius: 1.6,
} as const;
