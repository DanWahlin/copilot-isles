import { MERIDIAN } from '../world/islands/meridian';
import { COVE } from '../world/layout';
import type { CameraShot } from './follow-camera';
import type { FlyKey } from './flyover';

export type IslandId = 'anchorage' | 'meridian';

/**
 * An island's first-landfall flyover: the camera comes in low over the sea, passes the ship, sweeps
 * across the island for a bird's-eye look, and settles behind the captain, where Wingman takes over.
 */
export interface IslandArrival {
  id: IslandId;
  /** The title card over the flight: the chapter, the island, and what you'll do there. */
  card: { eyebrow: string; title: string; line: string };
  /** From the open sea across the island; the descent to the captain is added at landing. */
  keys: readonly FlyKey[];
  /** Seconds for the whole flight, landing included. */
  seconds: number;
  /** When the card comes up and how long it stays, in seconds into the flight. */
  cardAt: number;
  cardFor: number;
}

/**
 * Anchorage Cay: in from the north over open water and past the brigantine, then a slow circle round
 * the harbour (the lighthouse, the quay and the village with the palm hills behind), and down to the
 * captain on the quay.
 */
export const ANCHORAGE_ARRIVAL: IslandArrival = {
  id: 'anchorage',
  card: {
    eyebrow: 'Chapter 00 · Setup',
    title: 'Anchorage Cay',
    line: 'Set up the GitHub Copilot app and earn your first Seal',
  },
  keys: [
    { x: -15, y: 8, z: -400, tx: -95, ty: 10, tz: -105, pace: 1.3 },
    { x: -70, y: 17, z: -250, tx: -103, ty: 8, tz: -100, pace: 1.1 },
    { x: -90, y: 36, z: -155, tx: -106, ty: 5, tz: -85, pace: 0.7 },
    { x: -46, y: 30, z: -118, tx: -104, ty: 7, tz: -58, pace: 0.85 },
    { x: -34, y: 34, z: -52, tx: -118, ty: 6, tz: -62, pace: 0.9 },
    { x: -150, y: 34, z: -128, tx: -100, ty: 6, tz: -62, pace: 1 },
    { x: -138, y: 40, z: -24, tx: COVE.mooring.x, ty: 4, tz: COVE.mooring.z + 10, pace: 0.85 },
  ],
  seconds: 19,
  cardAt: 2.2,
  cardFor: 5,
};

const M = MERIDIAN;

/**
 * Port Meridian: in from the south-west over open water, past the lighthouse and into the walled
 * basin, over your ship on the east arm, up across the town to the citadel for the view over the
 * bay, and round and down to the captain on the arm.
 */
export const MERIDIAN_ARRIVAL: IslandArrival = {
  id: 'meridian',
  card: {
    eyebrow: 'Chapter 01 · Tour the App',
    title: 'Port Meridian',
    line: 'Find your way around the GitHub Copilot app',
  },
  keys: [
    { x: 550, y: 8, z: -500, tx: M.mole.lighthouse.x, ty: 9, tz: M.mole.lighthouse.z, pace: 1.25 },
    { x: 674, y: 14, z: -590, tx: M.harbor.berth.x, ty: 5, tz: M.harbor.berth.z, pace: 1.05 },
    { x: 746, y: 24, z: -668, tx: M.harbor.berth.x, ty: 4, tz: M.harbor.berth.z, pace: 0.7 },
    { x: 704, y: 34, z: -724, tx: 668, ty: 9, tz: -796, pace: 0.8 },
    { x: 615, y: 58, z: -680, tx: 720, ty: 22, tz: -842, pace: 0.85 },
    {
      x: 848,
      y: 70,
      z: -720,
      tx: M.pads.citadel.x,
      ty: M.pads.citadel.height + 2,
      tz: M.pads.citadel.z,
      pace: 1,
    },
    { x: 835, y: 52, z: -742, tx: 690, ty: 8, tz: -700, pace: 0.9 },
    { x: 790, y: 34, z: -718, tx: M.harbor.landing.x, ty: 4, tz: M.harbor.landing.z, pace: 0.75 },
  ],
  seconds: 19,
  // The card holds over the wide opening (the whole harbour, the town and the citadel behind),
  // clear before the camera drops past the lighthouse.
  cardAt: 0.6,
  cardFor: 3.4,
};

export const ARRIVALS: Readonly<Record<IslandId, IslandArrival>> = {
  anchorage: ANCHORAGE_ARRIVAL,
  meridian: MERIDIAN_ARRIVAL,
};

/**
 * The whole flight for a captain standing at `captain`: the island's keys, then a descent from
 * above and behind the captain onto `rest` (where the follow camera sits), so control hands over
 * without a bump.
 */
export function arrivalKeys(
  arrival: IslandArrival,
  captain: { x: number; y: number; z: number; heading: number },
  rest: CameraShot,
): FlyKey[] {
  const fx = Math.sin(captain.heading);
  const fz = Math.cos(captain.heading);
  const lookY = captain.y + 1.3;
  return [
    ...arrival.keys,
    {
      x: captain.x - fx * 18,
      y: captain.y + 14,
      z: captain.z - fz * 18,
      tx: captain.x + fx * 6,
      ty: lookY,
      tz: captain.z + fz * 6,
      pace: 0.6,
    },
    { ...rest, pace: 0.35 },
  ];
}
