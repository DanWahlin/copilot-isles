import type { StarfishIsland } from '../world/starfish/spots';
import { islandHooks } from '../course/catalog';

/**
 * What Wingman points out on each island's first welcome, and which part of the screen lights up
 * while he says it: the task list (top left), the compass (top centre), and the starfish count
 * (top right). The lines are the course's (`course.json` → `hooks.islands.<island>.tips`; the test
 * checks every island with starfish has one, voiced, with the right number in it).
 */
export type HudSpot = 'tracker' | 'compass' | 'starfish';

/** The welcome's tip lines per island: the task list and compass, then the island's starfish. */
const ISLANDS: readonly StarfishIsland[] = ['anchorage', 'meridian', 'thousand-bough'];

export const ISLAND_TIPS: Readonly<Record<StarfishIsland, { nav: string; starfish: string }>> =
  Object.fromEntries(ISLANDS.map((i) => [i, islandHooks(i).tips])) as Record<
    StarfishIsland,
    { nav: string; starfish: string }
  >;

/** The screen parts each tip line shows (lit while the line plays). */
export const TIP_SPOTS: Readonly<Record<string, readonly HudSpot[]>> = Object.fromEntries(
  ISLANDS.flatMap((i) => [
    [ISLAND_TIPS[i].nav, ['tracker', 'compass'] as const],
    [ISLAND_TIPS[i].starfish, ['starfish'] as const],
  ]),
);
