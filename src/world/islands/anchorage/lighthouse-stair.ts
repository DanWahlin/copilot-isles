import { COVE } from '../../layout';

/**
 * The point lighthouse's shape and its climb (Dan: walk in and up to the top). Pure numbers, shared
 * by the village builder (geometry and colliders) and the walk surface, so the steps you see are the
 * steps you stand on.
 *
 * Inside the tower, 76 stone steps wind up round an iron newel to the watch room under the lantern,
 * whose door opens onto the gallery. The turns of a spiral stair sit over each other, so the walk
 * surface needs the walker's feet (`y`) to pick the right one.
 */
export const LIGHTHOUSE = {
  /** The tapered tower: its height above the plinth, its radii and the plinth's height. */
  height: 15,
  rBottom: 2.45,
  rTop: 1.7,
  plinth: 0.84,
  /** The shaft's inside radius (constant, so the stair fits the narrow top). */
  inner: 1.42,
  /** The iron newel the steps wind round. */
  newel: 0.24,
  /** The plinth's edge: the walls' colliders run out to here. */
  plinthR: 3.1,
  /** The gallery deck's outer edge and its railing. */
  galleryR: 3.2,
  railR: 3.06,
  /** The watch room's wall (on the gallery deck, under the lantern) and its height. */
  watchR: 1.64,
  watchH: 2.4,
  /** The stair: steps, steps per turn and the rise of each. 76 × 0.2 m = 15.2 m, plinth to deck. */
  treads: 76,
  perTurn: 14,
  rise: 0.2,
  /** Half the width of the ground door and the watch-room door. */
  doorHalf: 0.6,
} as const;

/** Height of the gallery deck's underside above the knoll top. */
export const LIGHTHOUSE_GALLERY = LIGHTHOUSE.plinth + LIGHTHOUSE.height;
/** The gallery deck's top (and the watch-room floor) above the knoll top. */
export const LIGHTHOUSE_DECK = LIGHTHOUSE_GALLERY + 0.2;
/** The lantern room's floor above the knoll top (on the watch room). */
export const LIGHTHOUSE_LANTERN = LIGHTHOUSE_DECK + LIGHTHOUSE.watchH;

const TAU = Math.PI * 2;
/** One step's angle. */
export const TREAD_ANGLE = TAU / LIGHTHOUSE.perTurn;
/**
 * First-turn steps from this one up stand at least 2.2 m over the ground floor: the floor there is
 * the landing you come in on, and the door opens onto it. Below that the stair is solid to the floor.
 */
export const FLOOR_LANDING_FROM = 10;
/** The watch-room floor covers these steps of the turn below (enough headroom); the rest is the stairwell. */
export const WATCH_FLOOR = [6, 10] as const;

/** Where the door faces (heading convention: (sin a, cos a)): down the ridge path to the quay. */
export const LIGHTHOUSE_DOOR_HEADING = Math.atan2(
  COVE.lighthouse.neck.x - COVE.lighthouse.x,
  COVE.lighthouse.neck.z - COVE.lighthouse.z,
);
/** The stair's start (step 0), so the door sits in the middle of the floor landing. */
export const STAIR_START =
  LIGHTHOUSE_DOOR_HEADING - (FLOOR_LANDING_FROM + LIGHTHOUSE.perTurn) * 0.5 * TREAD_ANGLE;
/** The watch-room door: in the middle of the watch-room floor. */
export const WATCH_DOOR_HEADING = STAIR_START + (WATCH_FLOOR[0] + WATCH_FLOOR[1]) * 0.5 * TREAD_ANGLE;

/** The ground floor (the plinth's top) and the deck, in world height. */
export function lighthouseLevels(): { floor: number; deck: number } {
  return { floor: COVE.lighthouse.top + LIGHTHOUSE.plinth, deck: COVE.lighthouse.top + LIGHTHOUSE_DECK };
}

/** The top of step `n` (0 is the first above the floor). */
export function treadTop(n: number): number {
  return COVE.lighthouse.top + LIGHTHOUSE.plinth + (n + 1) * LIGHTHOUSE.rise;
}

/** Angle from `start` to heading `a`, in [0, 2π). */
export function angleFrom(a: number, start: number): number {
  const d = (a - start) % TAU;
  return d < 0 ? d + TAU : d;
}

/** How far (x, z) is across the line through the door at heading `heading` (and whether it's on its side). */
function doorLateral(dx: number, dz: number, heading: number): { lateral: number; axial: number } {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  return { lateral: Math.abs(dx * c - dz * s), axial: dx * s + dz * c };
}

/** Feet within this of a level count as standing on it (a step up is at most 0.55 m). */
const REACH = 0.6;

/**
 * The lighthouse's walkable height at (x, z) for feet at `y`: the ground floor, the steps, the
 * watch-room floor, the gallery, and the door step. Of the levels stacked there it returns the
 * highest within a step of the feet; without `y`, the lowest (and none of the high decks).
 */
export function lighthouseWalkable(x: number, z: number, y?: number): number | null {
  const L = COVE.lighthouse;
  const T = LIGHTHOUSE;
  const dx = x - L.x;
  const dz = z - L.z;
  const r = Math.hypot(dx, dz);
  if (r > T.galleryR) {
    // The outer door step, off the knoll onto the plinth.
    const d = doorLateral(dx, dz, LIGHTHOUSE_DOOR_HEADING);
    if (d.axial > 0 && d.axial <= T.plinthR + 0.8 && d.lateral <= T.doorHalf + 0.25) return L.top + 0.42;
    return null;
  }
  const floor = L.top + T.plinth;
  const deck = L.top + LIGHTHOUSE_DECK;
  const high = y !== undefined && y > deck - 1.5;
  const a = Math.atan2(dx, dz);
  if (r > T.inner) {
    if (high) {
      if (r >= T.watchR - 0.04) return deck;
      const d = doorLateral(dx, dz, WATCH_DOOR_HEADING);
      return d.axial > 0 && d.lateral <= T.doorHalf ? deck : null;
    }
    const d = doorLateral(dx, dz, LIGHTHOUSE_DOOR_HEADING);
    if (d.axial > 0 && d.lateral <= T.doorHalf) return d.axial <= T.plinthR ? floor : L.top + 0.42;
    return null;
  }
  const n0 = Math.floor(angleFrom(a, STAIR_START) / TREAD_ANGLE);
  let best = -Infinity;
  let low = Infinity;
  const consider = (h: number): void => {
    if (h < low) low = h;
    if (y !== undefined && h <= y + REACH && h > best) best = h;
  };
  if (n0 >= FLOOR_LANDING_FROM) consider(floor);
  for (let n = n0; n < T.treads; n += T.perTurn) consider(treadTop(n));
  if (high && n0 >= WATCH_FLOOR[0] && n0 < WATCH_FLOOR[1]) consider(deck);
  if (y === undefined || best === -Infinity) return low;
  return best;
}

/** Whether (x, y, z) is inside the shaft or the watch room (for the stair camera). */
export function insideLighthouse(x: number, y: number, z: number): boolean {
  const L = COVE.lighthouse;
  const { floor, deck } = lighthouseLevels();
  return Math.hypot(x - L.x, z - L.z) < LIGHTHOUSE.inner + 0.1 && y > floor - 0.5 && y < deck + 1;
}
