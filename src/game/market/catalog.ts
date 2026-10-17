/**
 * The Model Market's model list (docs/specs/MODEL-MARKET.md §4): the weekly sync
 * (tools/models/sync.mjs) reads two tables from github/docs, keeps the Claude, GPT and MAI models, and
 * writes the course pack's models.json. The game reads that file with the course pack and fills each
 * signboard with the board rule below. The categories' order and the rule's numbers are in the
 * pack's market.json. Pure functions, no DOM: the sync loads this file through tsx.
 */
import { MARKET, type ModelCategoryId } from '../../content/market';
import { onCourse } from '../../course/active';

export type ModelCategory = ModelCategoryId;
export type ModelFamily = 'Claude' | 'GPT' | 'MAI';

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

export const DOCS_REPO = 'github/docs';
export const DOCS_DIR = 'data/tables/copilot';
export const PRICING_FILE = `${DOCS_DIR}/models-and-pricing.yml`;
export const COMPARISON_FILE = `${DOCS_DIR}/model-comparison.yml`;

/** One scalar: quotes removed, and a trailing comment dropped from an unquoted value. */
function scalar(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && (v[0] === "'" || v[0] === '"') && v.at(-1) === v[0]) {
    const inner = v.slice(1, -1);
    return v[0] === "'" ? inner.replaceAll("''", "'") : inner.replaceAll('\\"', '"');
  }
  return v.replace(/\s+#.*$/, '');
}

/**
 * Reads the docs' table files: a top-level list of flat maps of scalars (`- key: value`, then
 * `  key: value`), with comments and blank lines. That's all these two files use, so no YAML library.
 */
export function parseYamlList(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let row: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = /^-\s+([\w-]+):\s*(.*)$/.exec(line);
    if (item) {
      row = { [item[1]!]: scalar(item[2]!) };
      rows.push(row);
      continue;
    }
    const field = /^\s+([\w-]+):\s*(.*)$/.exec(line);
    if (field && row) row[field[1]!] = scalar(field[2]!);
  }
  return rows;
}

/** A model's name without footnote markers (`Gemini 3.7 Flash[^promo]`) or stray spaces. */
export function cleanModelName(name: string): string {
  return name
    .replace(/\[\^[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Claude, GPT or MAI by provider and name, or null for every other model. */
export function familyOf(name: string, provider: string): ModelFamily | null {
  if (provider === 'anthropic' && /^Claude\b/.test(name)) return 'Claude';
  if (provider === 'openai' && /^GPT\b/.test(name)) return 'GPT';
  if (provider === 'microsoft' && /^MAI-/.test(name)) return 'MAI';
  return null;
}

const isCategory = (v: string): v is ModelCategory => (CATEGORIES as readonly string[]).includes(v);
const byName = (a: ModelEntry, b: ModelEntry) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * The game's model list from the two docs tables: Claude, GPT and MAI models with a Lightweight,
 * Versatile or Powerful category; one row per model (the pricing table has a row per price tier);
 * the comparison table's task area and strength; sorted by category, then name. Nothing about price.
 */
export function catalogFromTables(pricingYaml: string, comparisonYaml: string): ModelEntry[] {
  const compare = new Map<string, Record<string, string>>();
  for (const r of parseYamlList(comparisonYaml)) if (r.name) compare.set(cleanModelName(r.name), r);
  const seen = new Set<string>();
  const out: ModelEntry[] = [];
  for (const r of parseYamlList(pricingYaml)) {
    const name = cleanModelName(r.model ?? '');
    const provider = (r.provider ?? '').trim().toLowerCase();
    const family = familyOf(name, provider);
    const category = (r.category ?? '').trim();
    if (!name || !family || !isCategory(category) || seen.has(name)) continue;
    seen.add(name);
    const c = compare.get(name);
    out.push({
      name,
      provider,
      family,
      category,
      taskArea: c?.task_area?.trim() ?? '',
      excelsAt: c?.excels_at?.trim() ?? '',
      ga: (r.release_status ?? '').trim() === 'GA' && !/\(preview\)/i.test(name),
    });
  }
  return sortCatalog(out);
}

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
 * first, then alphabetical): GA models first, at most `PER_FAMILY` (2) of each family (Claude, GPT, MAI) so the
 * board mixes them; then, if there's room, the other GA models; then previews. `shown` is in the board
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
