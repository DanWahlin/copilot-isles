/**
 * Paint Your Sails (POC §4.4, Q0.2): six sail palettes. The app's theme lives in Settings → Themes
 * (Chapter 01 · Settings), and the course shows one theme there, **GitHub**, so that's the only
 * palette named after an app theme (with the app-style preview card in the picker). The rest are
 * plain sail colours that make no claim about the app. Ids are what saves store, so they stay as
 * they were when the palettes carried older theme names. `cloth` and `stripe` colour the
 * brigantine's canvas.
 */
export interface SailPalette {
  /** Saved in progress (`sails`); never renamed. */
  id: string;
  /** What the picker and Settings call it: the app theme's name for GitHub, else a sail colour. */
  name: string;
  /** Sail cloth and the band across each sail (0xRRGGBB). */
  cloth: number;
  stripe: number;
  /** The app-style preview card (page, sidebar, accents, and the colour strip): app themes only. */
  card?: {
    page: string;
    sidebar: string;
    ink: string;
    accents: readonly [string, string, string, string];
    strip: readonly string[];
  };
}

/** The default GitHub theme's warm canvas colour; change this single constant to retint the starting sails. */
export const GITHUB_SAIL_CLOTH = 0xdfca9b;

export const SAIL_PALETTES: readonly SailPalette[] = [
  {
    id: 'github',
    name: 'GitHub',
    // The classic cream canvas the brigantine has always flown.
    cloth: GITHUB_SAIL_CLOTH,
    stripe: 0x2a8a45,
    card: {
      page: '#ffffff',
      sidebar: '#f3f3f4',
      ink: '#c9ccd1',
      accents: ['#8250df', '#2a8a45', '#e39aa2', '#8fc4a0'],
      strip: ['#d1242f', '#bf8700', '#1a7f37', '#0969da', '#8250df'],
    },
  },
  {
    id: 'fox',
    name: 'Rose',
    cloth: 0xe9d3cd,
    stripe: 0x6f45c8,
  },
  {
    id: 'ic-orange-ppl',
    name: 'Sunset Orange',
    cloth: 0xecc49a,
    stripe: 0xb8321d,
  },
  {
    id: 'monochrome',
    name: 'Charcoal',
    cloth: 0x3b3e44,
    stripe: 0xd7dade,
  },
  {
    id: 'noctis-azureus',
    name: 'Midnight Blue',
    cloth: 0x2d5878,
    stripe: 0xe8508a,
  },
  {
    id: 'notionish',
    name: 'Chalk White',
    cloth: 0xf6f3ec,
    stripe: 0x37352f,
  },
];

/** The GitHub theme (the one the course shows), and the sails you start with. */
export const DEFAULT_SAIL_PALETTE = 'github';

/** A palette by id, falling back to the default for unknown or missing ids (old saves). */
export function sailPalette(id: string | null | undefined): SailPalette {
  return SAIL_PALETTES.find((p) => p.id === id) ?? SAIL_PALETTES.find((p) => p.id === DEFAULT_SAIL_PALETTE)!;
}
