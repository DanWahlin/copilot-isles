/**
 * The Model Market's catalog helpers for tools/models/sync.mjs, with a course pack active: the
 * categories and the board rule's numbers are the pack's `market.json` (src/game/market/catalog.ts).
 * One `tsImport` of this file loads both, so they share one module graph. Reading GitHub Docs' tables
 * (the Copilot app course's models: Claude, GPT and MAI) is the sync's, so it's here, not the game's.
 */
import { activateCourseFromDisk, coursePaths } from '../course-pack/read';
import {
  CATEGORIES,
  sortCatalog,
  type ModelCategory,
  type ModelEntry,
  type ModelFamily,
} from '../../src/game/market/catalog';

export * from '../../src/game/market/catalog';

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

/**
 * The game's model list from the two docs tables: Claude, GPT and MAI models with one of the market's
 * categories; one row per model (the pricing table has a row per price tier); the comparison table's
 * task area and strength; sorted by category, then name. Nothing about price.
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

/** Activates the course pack and returns where its models file is. */
export function useCourse(id: string): { modelsFile: string } {
  activateCourseFromDisk(id);
  return { modelsFile: coursePaths(id).models };
}
