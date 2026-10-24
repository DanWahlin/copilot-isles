import { courseIsland } from '../course/catalog';
import type { ChartLabelId } from '../learn/content/labels';
import type { CameraShot } from '../game/follow-camera';
import type { FlyKey } from '../game/flyover';
import type { IslandId } from './registry';

/**
 * An island's first-landfall flyover: the camera comes in low over the sea, passes the ship, sweeps
 * across the island for a bird's-eye look, and settles behind the captain, where Wingman takes over.
 */
export interface IslandArrival {
  id: IslandId;
  /** The title card over the flight: the chapter, the island, and what you'll do there. */
  card: { eyebrow: string; title: string; line: string };
  /**
   * The chart label shown in the card's place (docs/specs/LOWER-THIRDS.md): the parchment with what
   * the island teaches and its course chapter. Islands without one keep the plain title card.
   */
  label?: ChartLabelId;
  /** From the open sea across the island; the descent to the captain is added at landing. */
  keys: readonly FlyKey[];
  /** Seconds for the whole flight, landing included. */
  seconds: number;
  /** When the card comes up and how long it stays, in seconds into the flight. */
  cardAt: number;
  cardFor: number;
  /**
   * The shorter flight after the opening's dive into the chart (the chart already showed the whole
   * island): in low over the sea, over the ship, and round to behind the captain.
   */
  fromChart?: { keys: readonly FlyKey[]; seconds: number; cardAt: number; cardFor: number };
  /**
   * Where the flight lingers just before handing over (over the captain's shoulder on the island's
   * landmark), instead of looking straight ahead; the flight then eases down to the follow camera.
   */
  landingShot?: CameraShot;
}

/** An island's title card: the course's chapter line and teaching line over the island's name. */
export function arrivalCard(island: IslandId, title: string): IslandArrival['card'] {
  const a = courseIsland(island)?.arrival;
  return { eyebrow: a?.eyebrow ?? '', title, line: a?.line ?? '' };
}
