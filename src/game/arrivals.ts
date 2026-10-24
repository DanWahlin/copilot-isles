import { ISLAND_LIST, type IslandId } from '../islands/registry';
import type { IslandArrival } from '../islands/arrival';
import type { CameraShot } from './follow-camera';
import type { FlyKey } from './flyover';

export type { IslandId };
export type { IslandArrival };

/** The flight to fly: the island's own, or its shorter one after the opening's chart dive. */
export function arrivalFlight(arrival: IslandArrival, fromChart: boolean): IslandArrival {
  return fromChart && arrival.fromChart ? { ...arrival, ...arrival.fromChart } : arrival;
}

/** Every island's first-landfall flyover (each island's entry in src/islands/), by id. */
export const ARRIVALS: Readonly<Record<IslandId, IslandArrival>> = Object.fromEntries(
  ISLAND_LIST.map((e) => [e.id, e.arrival]),
) as Record<IslandId, IslandArrival>;

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
  const l = arrival.landingShot;
  if (l)
    return [
      ...arrival.keys,
      { ...l, x: l.x - fx * 6, y: l.y + 5, z: l.z - fz * 6, pace: 0.6 },
      // A slow drift in toward the captain with the landmark held in frame (about three seconds).
      { ...l, pace: 0.12 },
      { ...l, x: l.x + fx * 1.2, y: l.y - 0.4, z: l.z + fz * 1.2, pace: 0.12 },
      { ...rest, pace: 0.35 },
    ];
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
