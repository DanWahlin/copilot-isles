/**
 * Paint Your Sails (POC §4.4, Q0.2): the six palettes mirror the GitHub Copilot app's theme picker
 * (00-setup/assets/pick-a-theme.webp). `cloth` and `stripe` colour the brigantine's canvas; `card`
 * describes the app-style preview card in the picker (page, sidebar, accents, and the colour strip).
 */
export interface SailPalette {
  id: string;
  /** The theme's name as it appears in the app. */
  name: string;
  /** Sail cloth and the band across each sail (0xRRGGBB). */
  cloth: number;
  stripe: number;
  card: {
    page: string;
    sidebar: string;
    ink: string;
    accents: readonly [string, string, string, string];
    strip: readonly string[];
  };
}

export const SAIL_PALETTES: readonly SailPalette[] = [
  {
    id: 'github',
    name: 'GitHub',
    // The classic cream canvas the brigantine has always flown.
    cloth: 0xdfca9b,
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
    name: 'Fox',
    cloth: 0xe9d3cd,
    stripe: 0x6f45c8,
    card: {
      page: '#f8f1ef',
      sidebar: '#e9dfdd',
      ink: '#cdbfbc',
      accents: ['#7a4fd6', '#4f8a64', '#d48b8b', '#95b89c'],
      strip: ['#c93c37', '#c7771c', '#3f7f4e', '#3f6fb5', '#7a4fd6'],
    },
  },
  {
    id: 'ic-orange-ppl',
    name: 'IC Orange PPL',
    cloth: 0xecc49a,
    stripe: 0xb8321d,
    card: {
      page: '#f7efe6',
      sidebar: '#ebe0d3',
      ink: '#d3c4b3',
      accents: ['#c4351f', '#7a6a2c', '#c98a70', '#a8a070'],
      strip: ['#c4351f', '#b0561d', '#8a6d1f', '#6b5a1c', '#c4351f'],
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    cloth: 0x3b3e44,
    stripe: 0xd7dade,
    card: {
      page: '#f1f3f6',
      sidebar: '#dfe3e8',
      ink: '#bcc3cc',
      accents: ['#1f2328', '#8c959f', '#8c959f', '#b1b8c0'],
      strip: ['#1f2328', '#57606a', '#8c959f', '#57606a', '#1f2328'],
    },
  },
  {
    id: 'noctis-azureus',
    name: 'Noctis Azureus',
    cloth: 0x2d5878,
    stripe: 0xe8508a,
    card: {
      page: '#fbf8ea',
      sidebar: '#eef0e2',
      ink: '#d6d8c6',
      accents: ['#e8508a', '#3fbf7f', '#ef9a74', '#8fd6b0'],
      strip: ['#e5484d', '#f08c2e', '#2fb67c', '#1fa3c8', '#e8508a'],
    },
  },
  {
    id: 'notionish',
    name: 'Notionish',
    cloth: 0xf6f3ec,
    stripe: 0x37352f,
    card: {
      page: '#ffffff',
      sidebar: '#f1f1ef',
      ink: '#cfcfcb',
      accents: ['#6e40c9', '#2a8a45', '#e39aa2', '#8fc4a0'],
      strip: ['#d1242f', '#e08a00', '#1a7f37', '#0969da', '#6e40c9'],
    },
  },
];

/** The app's default theme, and the sails you start with. */
export const DEFAULT_SAIL_PALETTE = 'github';

/** A palette by id, falling back to the default for unknown or missing ids (old saves). */
export function sailPalette(id: string | null | undefined): SailPalette {
  return SAIL_PALETTES.find((p) => p.id === id) ?? SAIL_PALETTES.find((p) => p.id === DEFAULT_SAIL_PALETTE)!;
}
