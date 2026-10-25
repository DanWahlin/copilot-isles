import type { Tier } from '../../contracts';
import { COVE } from '../../layout';
import {
  createWreckSteps as buildWreckSteps,
  wreckWaterline as waterlineOf,
  type Hole,
  type WreckDesign,
  type WreckSystem,
} from '../../wreck/wreck';
import { wreckShipObstacles } from './wreck-pose';

export type { WreckSystem };

/**
 * Anchorage Cay's wreck (COVE.wreck): a fog raider's brigantine run up on a sand bar between the
 * lighthouse point and the pier, bow up and heeled to starboard, her two remaining masts bare with
 * their fighting tops, slack and broken rigging, a few rags of sail, holes stove in her planking, and
 * a weed line where the tide works on her. Built by the shared wreck builder (world/wreck) from this
 * design.
 */

/**
 * Ship-local damage, after years on the bar: holes stove in her planking with the frames showing
 * through (the big one at her waterline on the high port side, where it shows from the pier and
 * the quay), strakes sprung out in narrow gaps (`slit`: too fine for Lite's hull, so not there),
 * most of her bulwarks gone to stumps, an open hatch, and the gunports that lost their lids or guns.
 */
const HOLES: readonly Hole[] = [
  { side: 1, z: 2.0, y: -0.35, rz: 1.95, ry: 1.0 },
  { side: 1, z: 8.7, y: 0.85, rz: 0.8, ry: 0.55 },
  { side: 1, z: -6.6, y: 0.35, rz: 1.35, ry: 0.75 },
  { side: 1, z: -10.0, y: 1.05, rz: 0.6, ry: 0.5 },
  { side: -1, z: -4.2, y: 1.15, rz: 1.1, ry: 0.6 },
  { side: -1, z: 3.6, y: 1.35, rz: 0.8, ry: 0.5 },
  { side: 1, z: -2.6, y: 0.95, rz: 1.5, ry: 0.15, slit: true },
  { side: 1, z: 5.2, y: 0.55, rz: 1.2, ry: 0.14, slit: true },
  { side: 1, z: -0.5, y: 2.15, rz: 1.1, ry: 0.13, slit: true },
  { side: 1, z: 11.0, y: 1.6, rz: 0.8, ry: 0.13, slit: true },
  { side: -1, z: 0.4, y: 1.9, rz: 1.3, ry: 0.14, slit: true },
];
/** The few stretches of bulwark still standing (side, from z, to z); the rest is gone to stumps. */
const RAIL_KEPT: WreckDesign['railKept'] = [
  { side: 1, z0: -11.6, z1: -10.4 },
  { side: 1, z0: 3.1, z1: 4.4 },
  { side: -1, z0: -8.0, z1: -6.6 },
  { side: -1, z0: 9.2, z1: 10.6 },
];
const HATCH = { z0: 2.3, z1: 4.0, x: 0.85 } as const;
/** The only gunport lids still hanging (side, station z); every other lid is gone. */
const KEPT_LIDS = [
  [1, 0.4],
  [-1, -6.0],
  [-1, 6.9],
] as const;
/** Gunports whose gun went over the side. */
const LOST_GUNS = [
  [1, -1.8],
  [1, 6.9],
  [1, -6.0],
  [1, 2.6],
  [-1, 4.8],
  [-1, -3.9],
] as const;

const ANCHORAGE_WRECK: WreckDesign = {
  name: 'anchorage-wreck',
  pose: COVE.wreck,
  holes: HOLES,
  railKept: RAIL_KEPT,
  hatch: HATCH,
  keptLids: KEPT_LIDS,
  lostGuns: LOST_GUNS,
  rig: 'standing',
};

/** Where the sea meets her hull (the coast foam's wash ribbon round her). */
export function wreckWaterline(): { x: number; z: number }[] {
  return waterlineOf(COVE.wreck);
}

/** Builds the wreck for a tier (one mesh, the ship's material) with its obstacles and blockers. */
export function createWreck(tier: Tier): WreckSystem {
  const steps = createWreckSteps(tier);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** `createWreck`, yielding between its parts. */
export function createWreckSteps(tier: Tier): Generator<void, WreckSystem, void> {
  return buildWreckSteps(tier, ANCHORAGE_WRECK, wreckShipObstacles);
}
