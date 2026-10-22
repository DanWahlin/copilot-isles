import type { IslandId } from '../islands';

/**
 * The Model Market's stalls (docs/specs/MODEL-MARKET.md §2): one on each island, all selling the same
 * jobs from the same purse, saved once (`progress.market`), so a job done at one stall is done at
 * every one. Where each stands and how it looks is the island's (its package); who keeps it is here.
 * The story's stall (Gilda's on Port Meridian) runs the island's optional task; the others are shops.
 */
export interface MarketStallSpec {
  readonly island: IslandId;
  /** The stall's puzzle id: the story's is `market` (the pack's puzzle name), the others `market@<island>`. */
  readonly puzzle: string;
  /**
   * The keeper: their id in the island's cast and the name the work order calls them (and their voice
   * lines' speaker).
   */
  readonly keeper: { readonly npc: string; readonly name: string };
  /** The island's story's stall: its keeper's hello starts the optional task, and it's done here. */
  readonly story: boolean;
}

export const MARKET_PUZZLE = 'market';

export const MARKET_STALLS: readonly MarketStallSpec[] = [
  {
    island: 'anchorage',
    puzzle: 'market@anchorage',
    keeper: { npc: 'desmond', name: 'Desmond' },
    story: false,
  },
  { island: 'meridian', puzzle: MARKET_PUZZLE, keeper: { npc: 'gilda', name: 'Gilda' }, story: true },
  {
    island: 'thousand-bough',
    puzzle: 'market@thousand-bough',
    keeper: { npc: 'lani', name: 'Lani' },
    story: false,
  },
];

/** An island's stall. */
export const marketStall = (island: IslandId): MarketStallSpec =>
  MARKET_STALLS.find((s) => s.island === island)!;
