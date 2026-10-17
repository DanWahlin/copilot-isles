import data from '../../../content/models.json';
import { CATEGORIES, boardFor, type ModelCategory, type ModelEntry, type ModelsFile } from './catalog';

/**
 * The models on Gilda's boards: content/models.json (written by the weekly sync, tools/models/sync.mjs),
 * read at build time, so a merged sync PR ships new names with the next deploy.
 */
export const MODELS_FILE = data as unknown as ModelsFile;
export const MODELS: readonly ModelEntry[] = MODELS_FILE.models;

export interface MarketBoard {
  category: ModelCategory;
  /** The names on the signboard (the board rule). */
  shown: readonly ModelEntry[];
  /** The rest of the category, behind "+N more" in the overlay. */
  more: readonly ModelEntry[];
}

export const BOARDS: readonly MarketBoard[] = CATEGORIES.map((category) => ({
  category,
  ...boardFor(MODELS, category),
}));

export const boardOf = (c: ModelCategory): MarketBoard => BOARDS.find((b) => b.category === c)!;

/** Every model in a category, the board's names first. */
export const modelsIn = (c: ModelCategory): readonly ModelEntry[] => {
  const b = boardOf(c);
  return [...b.shown, ...b.more];
};

/** The first name on a category's board (where a pick starts). */
export const firstModel = (c: ModelCategory): string => boardOf(c).shown[0]?.name ?? c;

export const findModel = (name: string | null): ModelEntry | null =>
  (name && MODELS.find((m) => m.name === name)) || null;

const isCategory = (v: string): v is ModelCategory => (CATEGORIES as readonly string[]).includes(v);

/**
 * How a saved hire reads now: its model's name if it's still sold, or the category it was hired from
 * (a model that's left the docs' table since; old saves keep loading).
 */
export function savedHireName(h: { category: string; model: string | null }): string {
  if (h.category === 'Auto' || !h.model) return 'Auto';
  if (findModel(h.model)) return h.model;
  return isCategory(h.category) ? `a ${h.category} model` : 'a model';
}
