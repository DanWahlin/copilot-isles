import { islandOpen } from '../islands/open';
import {
  COVE_ISLAND,
  currentQuest,
  questLog,
  questOptionalTargets,
  questTarget,
  questTracker,
} from './cove-quests';
import type { IslandCode } from './island-code';

/**
 * Anchorage Cay's code (Chapter 00; its registry entry is src/islands/anchorage.ts). Its content (the cast, chests, bottles and puzzles) is built
 * with the session itself (the home island is built with the world), so only its quest line is here.
 */
export const ANCHORAGE_CODE: IslandCode = {
  quests: {
    log: questLog,
    // The task list points on to Port Meridian once it's open.
    tracker: (q) => {
      const t = questTracker(q);
      return COVE_ISLAND.nextSail && islandOpen('meridian') ? { ...t, next: COVE_ISLAND.nextSail } : t;
    },
    target: questTarget,
    current: currentQuest,
    optionalTargets: questOptionalTargets,
    hintTask: (q) => questLog(q).find((t) => !t.done),
  },
};
