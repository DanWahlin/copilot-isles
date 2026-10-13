import type { StarfishIsland } from '../world/starfish/spots';

/**
 * What Wingman points out on each island's first welcome, and which part of the screen lights up
 * while he says it: the task list (top left), the compass (top centre), and the starfish count
 * (top right). A new island adds its starfish line here (the test checks every island with
 * starfish has one, voiced, with the right number in it).
 */
export type HudSpot = 'tracker' | 'compass' | 'starfish';

/** The welcome's tip lines per island: the task list and compass, then the island's starfish. */
export const ISLAND_TIPS: Readonly<Record<StarfishIsland, { nav: string; starfish: string }>> = {
  anchorage: { nav: 'wingman.welcome.04', starfish: 'wingman.starfish.anchorage' },
  meridian: { nav: 'wingman.meridian.03', starfish: 'wingman.starfish.meridian' },
  'thousand-bough': { nav: 'wingman.tb.03', starfish: 'wingman.starfish.thousand-bough' },
};

/** The screen parts each tip line shows (lit while the line plays). */
export const TIP_SPOTS: Readonly<Record<string, readonly HudSpot[]>> = {
  'wingman.welcome.04': ['tracker', 'compass'],
  'wingman.meridian.03': ['tracker', 'compass'],
  'wingman.starfish.anchorage': ['starfish'],
  'wingman.starfish.meridian': ['starfish'],
  'wingman.tb.03': ['tracker', 'compass'],
  'wingman.starfish.thousand-bough': ['starfish'],
};
