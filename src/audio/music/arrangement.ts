import { COPILOT_LEITMOTIF } from './theory';

export type MusicPalette = 'harbour' | 'tropical';
export type AnchorageSection = 'intro' | 'a' | 'aPrime' | 'b' | 'aDouble' | 'drone';

export interface AnchorageBar {
  readonly index: number;
  readonly palette: MusicPalette;
  readonly section: AnchorageSection;
  readonly movement: number;
  readonly sectionBar: number;
  readonly chordRoot: number;
  readonly mode: readonly number[];
  readonly arpeggioVariant: number;
  readonly melodyVariant: number;
  readonly responseVariant: number;
  readonly pulseVariant: number;
  readonly cadence: boolean;
  readonly rest: boolean;
  readonly density: number;
  readonly signature: string;
}

export interface AnchoragePlan {
  readonly seed: number;
  readonly palette: MusicPalette;
  readonly bars: readonly AnchorageBar[];
  readonly formBars: number;
  readonly beatsPerBar: number;
}

interface SectionDef {
  readonly section: AnchorageSection;
  readonly bars: number;
  readonly progression: readonly number[];
  readonly density: number;
}

const HARBOUR_FORM: readonly SectionDef[] = [
  { section: 'intro', bars: 4, progression: [0, 0], density: 0.42 },
  { section: 'a', bars: 8, progression: [0, 5, 3, 4], density: 0.62 },
  { section: 'aPrime', bars: 8, progression: [0, 3, 5, 4], density: 0.68 },
  { section: 'b', bars: 8, progression: [3, 4, 0, 5], density: 0.58 },
  { section: 'aDouble', bars: 8, progression: [0, 5, 3, 0], density: 0.64 },
  { section: 'drone', bars: 4, progression: [0, 4], density: 0.32 },
];

const TROPICAL_FORM: readonly SectionDef[] = [
  { section: 'intro', bars: 4, progression: [0, 0], density: 0.46 },
  { section: 'a', bars: 8, progression: [0, 4, 3, 4], density: 0.66 },
  { section: 'aPrime', bars: 8, progression: [0, 3, 4, 1], density: 0.72 },
  { section: 'b', bars: 8, progression: [4, 1, 3, 0], density: 0.62 },
  { section: 'aDouble', bars: 4, progression: [0, 4], density: 0.68 },
  { section: 'drone', bars: 3, progression: [0, 4], density: 0.35 },
];

const HARBOUR_MODE = [0, 2, 3, 5, 7, 8, 10] as const; // Aeolian/Dorian colour, rooted at A.
const TROPICAL_MODE = [0, 2, 4, 5, 7, 9, 10] as const; // Mixolydian, rooted at D/G by transposition in composer.

export const ANCHORAGE_FORM_BARS = TROPICAL_FORM.reduce((sum, section) => sum + section.bars, 0);
export const HARBOUR_FORM_BARS = HARBOUR_FORM.reduce((sum, section) => sum + section.bars, 0);

export function createAnchoragePlan(
  seed: number,
  bars: number,
  palette: MusicPalette = 'tropical',
): AnchoragePlan {
  const out: AnchorageBar[] = [];
  for (let index = 0; index < bars; index++) out.push(createBar(seed, index, palette));
  return {
    seed,
    palette,
    bars: out,
    formBars: formFor(palette).reduce((sum, section) => sum + section.bars, 0),
    beatsPerBar: palette === 'harbour' ? 3 : 4,
  };
}

export function createBar(seed: number, index: number, palette: MusicPalette): AnchorageBar {
  const form = formFor(palette);
  const formBars = form.reduce((sum, section) => sum + section.bars, 0);
  const movement = Math.floor(index / formBars);
  let cursor = index % formBars;
  let def = form[0]!;
  for (const section of form) {
    if (cursor < section.bars) {
      def = section;
      break;
    }
    cursor -= section.bars;
  }
  const phrase = Math.floor(cursor / 4);
  const chordRoot = def.progression[(phrase + movement) % def.progression.length] ?? 0;
  const arpeggioVariant = (randomInt(seed, index, 11, 8) + phrase + movement) % 8;
  const melodyVariant = (randomInt(seed, index, 23, 9) + movement) % 9;
  const responseVariant = (randomInt(seed, index, 37, 7) + cursor) % 7;
  const pulseVariant = (randomInt(seed, index, 51, 5) + phrase) % 5;
  const cadence = cursor % 8 === 7 || def.section === 'drone';
  const rest = def.section === 'drone' || randomInt(seed, index, 71, 9) === 0;
  const density = Math.min(0.86, def.density + (randomInt(seed, index, 83, 5) - 2) * 0.025);
  const motif = COPILOT_LEITMOTIF[(index + melodyVariant) % COPILOT_LEITMOTIF.length] ?? 0;
  const signature = [
    palette,
    def.section,
    movement,
    cursor,
    chordRoot,
    motif,
    arpeggioVariant,
    melodyVariant,
    responseVariant,
    pulseVariant,
    cadence ? 1 : 0,
    rest ? 1 : 0,
    Math.round(density * 100),
  ].join(':');
  return {
    index,
    palette,
    section: def.section,
    movement,
    sectionBar: cursor,
    chordRoot,
    mode: palette === 'harbour' ? HARBOUR_MODE : TROPICAL_MODE,
    arpeggioVariant,
    melodyVariant,
    responseVariant,
    pulseVariant,
    cadence,
    rest,
    density,
    signature,
  };
}

export function eightBarSignature(plan: AnchoragePlan, startBar: number): string {
  return plan.bars
    .slice(startBar, startBar + 8)
    .map((bar) => bar.signature)
    .join('|');
}

function formFor(palette: MusicPalette): readonly SectionDef[] {
  return palette === 'harbour' ? HARBOUR_FORM : TROPICAL_FORM;
}

function randomInt(seed: number, bar: number, salt: number, modulo: number): number {
  let value = (seed ^ (bar * 0x45d9f3b) ^ (salt * 0x119de1f3)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value % modulo;
}
