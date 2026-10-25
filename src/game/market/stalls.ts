import { hasIslandQuests, islandQuestList } from '../../course/active';
import { puzzleOn, puzzleQuest } from '../../course/puzzles';
import { ISLAND_LIST } from '../../islands/registry';
import type { IslandId } from '../islands';

/**
 * The Model Market's stalls (docs/specs/MODEL-MARKET.md §2): one on each island, all selling the same
 * jobs from the same purse, saved once (`progress.market`), so a job done at one stall is done at
 * every one. Where each stands and how it looks is the island's (its package); who keeps it is here.
 * Which stall runs the market's optional task is the course's story: the one on the island whose
 * quests hold the market puzzle's `quest` (`questStall`); the others are shops.
 */
export interface MarketStallSpec {
  readonly island: IslandId;
  /** The stall's puzzle id: Gilda's is `market` (the pack's puzzle name), the others `market@<island>`. */
  readonly puzzle: string;
  /**
   * The keeper: their id in the island's cast and the name the work order calls them (and their voice
   * lines' speaker).
   */
  readonly keeper: { readonly npc: string; readonly name: string };
  /** Whose lines the keeper says: Gilda's (`gilda` in the pack's market.json) or their own (`keepers.<island>`). */
  readonly lines: 'gilda' | 'keepers';
}

export const MARKET_PUZZLE = 'market';

/** Each island's stall (its registry entry's `market`), in voyage order. */
export const MARKET_STALLS: readonly MarketStallSpec[] = ISLAND_LIST.flatMap((e) =>
  e.market
    ? [
        {
          island: e.id,
          puzzle: e.market.puzzle ?? `market@${e.id}`,
          keeper: e.market.keeper,
          lines: e.market.lines,
        },
      ]
    : [],
);

/** An island's stall. */
export const marketStall = (island: IslandId): MarketStallSpec =>
  MARKET_STALLS.find((s) => s.island === island)!;

/**
 * Whether an island's stall runs the market's optional task: the course's quests on that island hold
 * the market puzzle's `quest` (Port Meridian's in the Copilot app course). Jobs done at any stall count,
 * but the task is done, and the Logbook page given, only at this stall.
 */
export function questStall(island: IslandId): boolean {
  if (!puzzleOn(MARKET_PUZZLE) || !hasIslandQuests(island)) return false;
  const quest = puzzleQuest(MARKET_PUZZLE);
  return islandQuestList(island).some((q) => q.id === quest);
}
