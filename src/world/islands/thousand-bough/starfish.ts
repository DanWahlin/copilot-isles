import type { StarfishSpot } from '../../starfish/spots';
import { THOUSAND_BOUGH } from './layout';

/**
 * Thousand-Bough's five starfish (spec §3.8): on the Root Wharf, by the Booth Pools, among the roots
 * of the Root Hall, up on the Signal Deck, and at the top of the tree. `y` picks the deck where walk
 * surfaces stack.
 */
export const THOUSAND_BOUGH_STARFISH: readonly StarfishSpot[] = THOUSAND_BOUGH.starfish.map((s) => ({
  id: s.id,
  island: 'thousand-bough',
  name: s.name,
  x: s.x,
  z: s.z,
  y: s.y,
}));
