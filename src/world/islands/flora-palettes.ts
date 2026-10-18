import type { FloraPalette } from '../flora/types';
import { ANCHORAGE_FLORA_PALETTE } from './anchorage/flora-palette';
import { MERIDIAN_FLORA_PALETTE } from './meridian-flora-palette';
import { THOUSAND_BOUGH_FLORA_PALETTE } from './thousand-bough/flora-palette';

/**
 * Every island's flora palette (data only: the colours, drifts and species, no placement code), for
 * the shared graphs that draw them: the terrain's sward and drift speckle, and the grass material's
 * species table. A new island adds its palette here; its placement rules stay in its own package.
 */
export const ISLAND_FLORA_PALETTES: readonly FloraPalette[] = [
  ANCHORAGE_FLORA_PALETTE,
  MERIDIAN_FLORA_PALETTE,
  THOUSAND_BOUGH_FLORA_PALETTE,
];
