import { toWorld } from './layout';
import { BERTH, QUAY } from './works';

/**
 * Keelhaven's harbour for the game (spec §3.4, in the as-built cove frame): the berth along the Old
 * Town quay, where you step ashore, the lane in from the open sea through the cove's mouth, and the
 * turning room. Plain data (no three.js): the registry, the tests and the tools import it.
 */

/** The cove frame's +u (inland, east-south-east) as a heading (a heading h faces (sin h, cos h)). */
const INLAND = Math.atan2(toWorld(1, 0).x - toWorld(0, 0).x, toWorld(1, 0).z - toWorld(0, 0).z);

/** A heading toward cove frame point `to` from `from`. */
function headingUv(from: { u: number; v: number }, to: { u: number; v: number }): number {
  const a = toWorld(from.u, from.v);
  const b = toWorld(to.u, to.v);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

const berth = toWorld(BERTH.u, BERTH.v);
/** Where you step ashore: on the quay's deck by the gangway's foot (4 m aft of the ship's middle). */
const LANDING_UV = { u: BERTH.u + 4, v: QUAY.v - QUAY.half + 3.2 };
const landing = toWorld(LANDING_UV.u, LANDING_UV.v);
/** The tavern's porch at the quay's root: you face it as you step ashore. */
const TAVERN_UV = { u: 22, v: 73 };

/** The lane in from the open sea (the passage from Thousand-Bough), through the mouth, to the berth. */
const LANE_UV = [
  { u: -760, v: 10 },
  { u: -300, v: 0 },
  { u: -140, v: 34 },
  { u: BERTH.u, v: BERTH.v },
] as const;

const camAt = (u: number, y: number, v: number, tu: number, ty: number, tv: number) => {
  const p = toWorld(u, v);
  const t = toWorld(tu, tv);
  return { x: p.x, y, z: p.z, tx: t.x, ty, tz: t.z };
};

export const KEELHAVEN_HARBOR = {
  /** Your ship alongside the quay: port side to its face, bow to the cove's mouth. */
  berth: { x: berth.x, z: berth.z, heading: INLAND + Math.PI },
  /** Where you step ashore, facing the tavern and the town's street. */
  landing: { x: landing.x, z: landing.z, heading: headingUv(LANDING_UV, TAVERN_UV) },
  /** The quay's deck height. */
  deck: QUAY.top,
  /**
   * The first look ashore: over the captain's shoulder along the quay to the tavern, the town and the
   * valley, with the head wall's falls far behind (the arrival holds here before the follow camera).
   * It stands off the quay's south side, clear of the ship's rigging.
   */
  landingShot: camAt(LANDING_UV.u - 5, 6.8, QUAY.v + 5.5, 150, 18, 40),
  lane: LANE_UV.map((p) => toWorld(p.u, p.v)),
  /**
   * Half the lane's width (m), and no rock or ground above `laneFloor` in it (to the turning room):
   * the inner cove's floor is 5.6 m down, twice the brigantine's 2.7 m draft.
   */
  laneHalfWidth: 30,
  laneFloor: -5,
  /** Room to swing round inside the cove, off the quay's head. */
  turning: { ...toWorld(-150, 18), r: 40, depth: 3.5 },
} as const;
