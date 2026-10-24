import { ISLAND_LIST } from '../../islands/registry';
import type { FloraPalette } from '../flora/types';

/**
 * Every island's flora palette, in voyage order (each registry entry's `floraPalette`: the colours,
 * drifts and species, no placement code), for the shared graphs that draw them: the terrain's sward
 * and drift speckle, and the grass material's species table. Its placement rules stay in its own
 * package.
 */
export const ISLAND_FLORA_PALETTES: readonly FloraPalette[] = ISLAND_LIST.map((e) => e.floraPalette);
