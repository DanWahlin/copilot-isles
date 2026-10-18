import type { FloraPalette } from '../../flora/types';

/**
 * Thousand-Bough's flora (Ch02, a misty jungle valley under the great banyan): ferns and moss across
 * the forest floor with a scatter of orchids, ginger lilies and heliconia crowding the banks of its
 * streams and pools, and soft, faintly glowing mushrooms in the falls' spray. Its "grass" is low
 * moss cushions.
 */
export const THOUSAND_BOUGH_FLORA_PALETTE: FloraPalette = {
  id: 'thousand-bough',
  bounds: { minX: 1640, maxX: 2460, minZ: -1900, maxZ: -1100 },
  grass: { ramp: [0x2c4a1e, 0x40662a, 0x6a8a36, 0x8e8a4a], straw: 0.02 },
  sward: { lush: 0x3f6428, dry: 0x5e7232, moss: 0x2f5124 },
  drifts: { coverage: 0.3, leadShare: 0.6, seed: 12.3 },
  species: [
    {
      id: 'fern',
      form: 'frond',
      colours: [0x24521f, 0x3a7029],
      eye: 0x6f9e3c,
      cup: 0,
      throat: 0,
      size: [0.18, 0.26],
      stem: [0.36, 0.56],
      habitats: ['forest', 'bank', 'spray'],
      weight: 2.2,
    },
    {
      id: 'orchid',
      form: 'bloom',
      colours: [0xbe3399, 0xe57ac6],
      eye: 0xfff0f6,
      cup: 0.12,
      throat: 0.18,
      size: [0.06, 0.085],
      stem: [0.3, 0.46],
      habitats: ['forest', 'bank'],
      weight: 0.8,
    },
    {
      id: 'heliconia',
      form: 'spike',
      colours: [0xe6422a, 0xf0a22e],
      eye: 0xf6d040,
      cup: 0,
      throat: 0,
      size: [0.06, 0.085],
      stem: [0.6, 0.9],
      habitats: ['bank'],
      weight: 0.7,
    },
    {
      id: 'ginger-lily',
      form: 'bloom',
      colours: [0xfdf7ea, 0xf6e2c8],
      eye: 0xf1c23a,
      cup: 0.45,
      throat: 0.5,
      size: [0.07, 0.09],
      stem: [0.45, 0.7],
      habitats: ['bank', 'spray'],
      weight: 0.8,
    },
    {
      id: 'glow-mushroom',
      form: 'cap',
      colours: [0x5ad8d0, 0x9cecdf],
      eye: 0xe6fff6,
      cup: -0.7,
      throat: 0,
      size: [0.06, 0.1],
      stem: [0.08, 0.16],
      glow: 0.55,
      habitats: ['spray'],
      weight: 1.4,
    },
  ],
};
