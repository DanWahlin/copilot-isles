/**
 * The Model Market's model list (docs/specs/MODEL-MARKET.md §4): the course pack's models.json (for the
 * Copilot app course, written by the weekly sync from GitHub Docs, tools/models/catalog.ts). The game
 * fills each signboard with the board rule below. The categories' order and the rule's numbers are in
 * the pack's market.json. Pure functions, no DOM: the sync loads this file through tsx.
 */
import { MARKET, type ModelCategoryId } from '../../content/market';
import { onCourse } from '../../course/active';

export type ModelCategory = ModelCategoryId;
/** A model's maker's family (the board mixes families); the models file names them. */
export type ModelFamily = string;

/** The board's order: smallest (cheapest) to largest. */
export let CATEGORIES: readonly ModelCategory[] = [];

export interface ModelEntry {
  /** The model's name, as GitHub Docs writes it (footnote markers removed). */
  name: string;
  /** `anthropic`, `openai` or `microsoft`. */
  provider: string;
  family: ModelFamily;
  category: ModelCategory;
  /** From the docs' model comparison table, or '' when the model isn't in it yet. */
  taskArea: string;
  excelsAt: string;
  /** False for a public preview (a release status other than GA, or "(preview)" in the name). */
  ga: boolean;
}

export interface ModelsFile {
  source: { repo: string; path: string; commit: string; fetchedAt: string };
  models: ModelEntry[];
}

const byName = (a: ModelEntry, b: ModelEntry) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Category order (small to large), then name: the file's order, so a re-run writes the same bytes. */
export function sortCatalog(models: readonly ModelEntry[]): ModelEntry[] {
  return [...models].sort(
    (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || byName(a, b),
  );
}

/** The numbers in a model's name, in order (`GPT-5.6 Sol` → [5, 6], `MAI-Code-1.1-Flash` → [1, 1]). */
export function versionOf(name: string): number[] {
  const m = /(\d+(?:\.\d+)*)/.exec(name);
  return m ? m[1]!.split('.').map(Number) : [];
}

/** Newer first: compares version numbers part by part (a missing part counts as 0). */
function newerFirst(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The order the board rule reads a category in: GA first, newest version first, then by name. */
export function boardOrder(models: readonly ModelEntry[]): ModelEntry[] {
  return [...models].sort(
    (a, b) => Number(b.ga) - Number(a.ga) || newerFirst(versionOf(a.name), versionOf(b.name)) || byName(a, b),
  );
}

/** How many names each signboard shows, and how many of one family it takes before it fills up. */
export let BOARD_SIZE = 0;
export let PER_FAMILY = 0;

onCourse(() => {
  CATEGORIES = MARKET.categories.map((c) => c.id);
  BOARD_SIZE = MARKET.board.size;
  PER_FAMILY = MARKET.board.perFamily;
});

/**
 * The board rule (docs/specs/MODEL-MARKET.md §4.2), in the board order (GA first, newest version
 * first, then alphabetical): GA models first, at most `PER_FAMILY` (2) of each family so the board
 * mixes them; then, if there's room, the other GA models; then previews. `shown` is in the board
 * order; `more` is every other model in the category, in the same order (the UI's "+N more").
 */
export function boardFor(
  models: readonly ModelEntry[],
  category: ModelCategory,
  size = BOARD_SIZE,
): { shown: ModelEntry[]; more: ModelEntry[] } {
  const ordered = boardOrder(models.filter((m) => m.category === category));
  const picked = new Set<ModelEntry>();
  const perFamily = new Map<ModelFamily, number>();
  const take = (ok: (m: ModelEntry) => boolean) => {
    for (const m of ordered) {
      if (picked.size >= size) return;
      if (picked.has(m) || !ok(m)) continue;
      picked.add(m);
      perFamily.set(m.family, (perFamily.get(m.family) ?? 0) + 1);
    }
  };
  take((m) => m.ga && (perFamily.get(m.family) ?? 0) < PER_FAMILY);
  take((m) => m.ga);
  take(() => true);
  return {
    shown: ordered.filter((m) => picked.has(m)),
    more: ordered.filter((m) => !picked.has(m)),
  };
}

/** True when two model lists say the same thing (the sync's change test; `fetchedAt` doesn't count). */
export function sameModels(a: readonly ModelEntry[], b: readonly ModelEntry[]): boolean {
  return JSON.stringify(sortCatalog(a)) === JSON.stringify(sortCatalog(b));
}

/** The file the sync writes: two-space JSON with a trailing newline. */
export function formatModelsFile(file: ModelsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
