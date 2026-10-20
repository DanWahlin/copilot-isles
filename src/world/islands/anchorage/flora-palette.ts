import type { FloraPalette } from '../../flora/types';

/**
 * Anchorage Cay's flowers (Ch00, a sunny tropical cove): hibiscus, frangipani and beach morning glory
 * drift across the hill meadows and village lawns, and sea oats and low morning-glory runners hold
 * the dunes. Its grass runs from lush green to a sun-bleached gold.
 */
export const ANCHORAGE_FLORA_PALETTE: FloraPalette = {
  id: 'anchorage',
  bounds: { minX: -260, maxX: 260, minZ: -200, maxZ: 200 },
  grass: { ramp: [0x3d5a1d, 0x60701f, 0x93a83a, 0xc0ab5c], straw: 0.035 },
  sward: { lush: 0x4f6a22, dry: 0x86833c, moss: 0x35502a },
  drifts: { coverage: 0.42, leadShare: 0.6, seed: 3.1 },
  species: [
    {
      id: 'hibiscus',
      form: 'bloom',
      colours: [0xd5203a, 0xf2683a],
      eye: 0xf7cf45,
      cup: 0.35,
      throat: 0.3,
      size: [0.1, 0.14],
      stem: [0.62, 0.9],
      habitats: ['meadow', 'village'],
      weight: 1,
    },
    {
      id: 'frangipani',
      form: 'bloom',
      colours: [0xfff3da, 0xffdf8a],
      eye: 0xf2ae2a,
      cup: 0.18,
      throat: 0.12,
      size: [0.07, 0.095],
      stem: [0.52, 0.75],
      habitats: ['meadow', 'village'],
      weight: 0.5,
    },
    {
      id: 'morning-glory',
      form: 'bloom',
      colours: [0xb02e98, 0x7c4bd2],
      eye: 0xfbe6f4,
      cup: 0.55,
      throat: 0.65,
      size: [0.07, 0.09],
      stem: [0.1, 0.18],
      habitats: ['meadow', 'dune'],
      weight: 0.9,
    },
    {
      id: 'sea-oats',
      form: 'spike',
      colours: [0xdcc68a, 0xb59a5a],
      eye: 0xc9b06c,
      cup: 0,
      throat: 0,
      size: [0.035, 0.05],
      stem: [0.72, 1.0],
      habitats: ['dune'],
      weight: 0.7,
    },
  ],
};
