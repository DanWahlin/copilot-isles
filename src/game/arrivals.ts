import { COVE } from '../world/layout';
import type { CameraShot } from './follow-camera';
import type { FlyKey } from './flyover';

export type IslandId = 'anchorage';

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

/** Anchorage Cay: in from the north over open water, past the brigantine, over the village and the palm hills, and round to the quay. */
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
    { x: -100, y: 44, z: -85, tx: -80, ty: 8, tz: -10, pace: 0.8 },
    { x: -72, y: 56, z: -15, tx: 10, ty: 12, tz: 40, pace: 1 },
    { x: -118, y: 60, z: 20, tx: -240, ty: 0, tz: -50, pace: 1 },
    { x: -132, y: 46, z: -18, tx: COVE.mooring.x, ty: 4, tz: COVE.mooring.z + 10, pace: 0.85 },
  ],
  seconds: 19,
  cardAt: 2.2,
  cardFor: 5,
};

export const ARRIVALS: Readonly<Record<IslandId, IslandArrival>> = { anchorage: ANCHORAGE_ARRIVAL };

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
