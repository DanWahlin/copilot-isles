/**
 * P2.1 Channel Routing (docs/specs/ISLAND-02-thousand-bough.md §5.7): the puzzle's state, shared by
 * the logic (here) and the Flume Terrace view. The shapes live in the island's contract, so the
 * world's views don't import game code.
 */
export type {
  ChannelRoutingState,
  Crew,
  Flow,
  FlowEnd,
  Rot,
  Tile,
  TileKind,
} from '../../../world/islands/thousand-bough/contract';
