import { MERIDIAN } from '../islands/meridian';
import { COPING, SANDSTONE, SANDSTONE_DARK, addBox, type Buckets, type PlazaColliders } from './plaza-kit';
import { addPottedPlant } from './plaza-plants';

/**
 * The stair street from the quay up to the harbour-front lane and the plaza (the walk from your
 * ship into town). It starts out on the quay, a short way in front of the harbour wall, climbs
 * through a cut in the wall between stone cheeks, and arrives level with the lane's paving, so the
 * walker is on the steps you see all the way up (it used to climb under the lane's paving).
 */
export const HARBOUR_STAIR = {
  x: 668,
  /** The bottom step's front edge, on the quay (clear of the quay's townsfolk at z −762.5). */
  z0: -763.6,
  /** The top step's back edge, at the lane. */
  z1: -777.2,
  width: 8.8,
  steps: 12,
  y0: MERIDIAN.harbor.quay.height,
  y1: MERIDIAN.pads.plaza.height,
  /** The harbour wall's water-side face (its cut runs from here to z1). */
  wallZ: -770.5,
} as const;

const TREAD = (HARBOUR_STAIR.z0 - HARBOUR_STAIR.z1) / HARBOUR_STAIR.steps;
const RISE = (HARBOUR_STAIR.y1 - HARBOUR_STAIR.y0) / HARBOUR_STAIR.steps;
const HALF = HARBOUR_STAIR.width * 0.5;
/** The cheeks' centre lines (out on the quay) and the cut's walls (in the harbour wall). */
const CHEEK = HALF + 0.35;
const CUT = HALF + 0.75;

/** The walk height on the stair (each step's top), or null off it. */
export function harbourStairHeight(x: number, z: number): number | null {
  if (Math.abs(x - HARBOUR_STAIR.x) > HALF) return null;
  if (z > HARBOUR_STAIR.z0 + 0.35 || z < HARBOUR_STAIR.z1 - 0.35) return null;
  const step = Math.min(HARBOUR_STAIR.steps, Math.max(0, Math.ceil((HARBOUR_STAIR.z0 - z) / TREAD - 1e-6)));
  return HARBOUR_STAIR.y0 + RISE * step;
}

/** The stair, its cheeks and the cut through the harbour wall, with their walls and camera boxes. */
export function addHarbourStair(b: Buckets, colliders: PlazaColliders, detail: 'lite' | 'full'): void {
  const { x, z0, y0 } = HARBOUR_STAIR;
  const base = y0 - 0.1;
  let quaySteps = 0;
  for (let i = 0; i < HARBOUR_STAIR.steps; i += 1) {
    const front = z0 - TREAD * i;
    const zc = front - TREAD * 0.5;
    const h = y0 + RISE * (i + 1);
    // A solid block under each tread (no gaps seen from the sides), its tread with a small nosing.
    addBox(b, 'stone', x, base, zc, HARBOUR_STAIR.width, h - 0.08 - base, TREAD, 0, SANDSTONE_DARK);
    addBox(b, 'paving', x, h - 0.08, zc + 0.04, HARBOUR_STAIR.width + 0.04, 0.16, TREAD + 0.08, 0, COPING);
    if (front - TREAD > HARBOUR_STAIR.wallZ - 1.2) {
      quaySteps = i + 1;
      // Out on the quay: a stepped parapet cheek on each side, its cap following the steps.
      for (const side of [-1, 1]) {
        addBox(b, 'stone', x + side * CHEEK, base, zc, 0.7, h + 0.72 - base, TREAD + 0.02, 0, SANDSTONE);
        addBox(b, 'stone', x + side * CHEEK, h + 0.72, zc, 0.86, 0.14, TREAD + 0.06, 0, COPING);
      }
    }
  }
  const cheekBack = z0 - TREAD * quaySteps;
  // The newels at the foot, each with a terracotta urn of leaves.
  for (const side of [-1, 1]) {
    const nx = x + side * CHEEK;
    addBox(b, 'stone', nx, base, z0 - 0.35, 1.0, 1.35, 1.0, 0, SANDSTONE);
    addBox(b, 'stone', nx, base, z0 - 0.35, 1.12, 0.3, 1.12, 0, SANDSTONE_DARK);
    addBox(b, 'stone', nx, y0 + 1.25, z0 - 0.35, 1.16, 0.16, 1.16, 0, COPING);
    addPottedPlant(b, nx, y0 + 1.41, z0 - 0.35, 0.9, side < 0 ? 'leafy' : 'flowers', detail, 7 + side);
  }
  // The cut through the harbour wall: its two walls from the quay up to the lane, a parapet above.
  const cutZ0 = HARBOUR_STAIR.wallZ + 0.1;
  const cutLen = cutZ0 - HARBOUR_STAIR.z1;
  const cutZ = (cutZ0 + HARBOUR_STAIR.z1) * 0.5;
  for (const side of [-1, 1]) {
    const cx = x + side * CUT;
    addBox(b, 'stone', cx, base, cutZ, 1.5, HARBOUR_STAIR.y1 + 0.02 - base, cutLen, 0, SANDSTONE);
    addBox(b, 'stone', cx, HARBOUR_STAIR.y1, cutZ, 0.62, 0.8, cutLen, 0, SANDSTONE);
    addBox(b, 'stone', cx, HARBOUR_STAIR.y1 + 0.8, cutZ, 0.78, 0.14, cutLen + 0.1, 0, COPING);
    // Pilasters at the cut's mouth, framing the stair from the quay.
    addBox(b, 'stone', cx, base, cutZ0 + 0.18, 1.7, HARBOUR_STAIR.y1 + 0.95 - base, 0.5, 0, SANDSTONE);
    addBox(b, 'stone', cx, HARBOUR_STAIR.y1 + 0.95, cutZ0 + 0.18, 1.9, 0.2, 0.7, 0, COPING);
    if (detail === 'full') {
      addPottedPlant(b, cx, HARBOUR_STAIR.y1 + 1.15, cutZ0 + 0.18, 0.75, 'flowers', detail, 11 + side);
    }
    const cheekZ = (z0 + cheekBack) * 0.5;
    colliders.boxes.push(
      {
        x: x + side * CHEEK,
        z: (z0 + 0.15 + cheekBack) * 0.5,
        hx: 0.5,
        hz: (z0 + 0.15 - cheekBack) * 0.5,
        rot: 0,
        height: 1.9,
      },
      { x: cx, z: cutZ, hx: 0.75, hz: cutLen * 0.5 + 0.25, rot: 0, height: 2.2 },
    );
    colliders.camera?.push(
      {
        x: x + side * CHEEK,
        z: cheekZ,
        hx: 0.43,
        hz: (z0 - cheekBack) * 0.5,
        rot: 0,
        y0: base,
        y1: y0 + RISE * quaySteps + 0.9,
      },
      { x: cx, z: cutZ, hx: 0.75, hz: cutLen * 0.5, rot: 0, y0: base, y1: HARBOUR_STAIR.y1 + 0.94 },
    );
  }
}
