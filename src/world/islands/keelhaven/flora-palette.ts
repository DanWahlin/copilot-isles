import type { FloraPalette } from '../../flora/types';

/**
 * Keelhaven's flora (Ch03, a Na Pali cove in the wet tropics): a deep Kauai-green sward on the valley
 * floor and the town shelf with drifts of white plumeria, red ginger and ti under the trees and
 * crowding the Keel River's banks, ferns over the forest floor and in the falls' spray, and white
 * naupaka on the back of the beach.
 */
export const KEELHAVEN_FLORA_PALETTE: FloraPalette = {
  id: 'keelhaven',
  bounds: { minX: 3300, maxX: 4640, minZ: -2540, maxZ: -760 },
  grass: { ramp: [0x2c4d1c, 0x497829, 0x76993a, 0xa49c52], straw: 0.02 },
  sward: { lush: 0x47752a, dry: 0x6a7c34, moss: 0x2d5023 },
  drifts: { coverage: 0.36, leadShare: 0.62, seed: 7.7 },
  species: [
    {
      id: 'kauai-fern',
      form: 'frond',
      colours: [0x285a21, 0x3e7a2c],
      eye: 0x76a640,
      cup: 0,
      throat: 0,
      size: [0.18, 0.26],
      stem: [0.38, 0.6],
      habitats: ['forest', 'bank', 'spray'],
      weight: 2,
      // The ferns lead the drifts: patches of a deeper green carried on in the ground.
      drifts: true,
    },
    {
      id: 'red-ginger',
      form: 'spike',
      colours: [0xc81e2c, 0xe2453a],
      eye: 0xff9a86,
      cup: 0,
      throat: 0,
      size: [0.06, 0.085],
      stem: [0.6, 0.95],
      habitats: ['forest', 'bank'],
      weight: 0.7,
      // Red patches carried on in the ground read as bare earth from the air: only the plants.
      drifts: false,
    },
    {
      id: 'plumeria',
      form: 'bloom',
      colours: [0xfffaf0, 0xfff0cf],
      eye: 0xf5c030,
      cup: 0.16,
      throat: 0.12,
      size: [0.07, 0.092],
      stem: [0.5, 0.78],
      habitats: ['meadow', 'village', 'forest'],
      weight: 0.9,
      // White patches carried on in the ground read as bare sand from the air: only the plants.
      drifts: false,
    },
    {
      id: 'ti',
      form: 'frond',
      colours: [0x4d7a2b, 0x7b2b3a],
      eye: 0x9a4252,
      cup: 0,
      throat: 0,
      size: [0.2, 0.28],
      stem: [0.5, 0.8],
      habitats: ['forest', 'bank'],
      weight: 0.6,
    },
    {
      id: 'naupaka',
      form: 'bloom',
      colours: [0xfaf6f8, 0xeadbec],
      eye: 0x8a4a9a,
      cup: 0.1,
      throat: 0.2,
      size: [0.05, 0.07],
      stem: [0.24, 0.4],
      habitats: ['dune'],
      weight: 1,
    },
  ],
};
