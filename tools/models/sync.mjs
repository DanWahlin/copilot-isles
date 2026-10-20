#!/usr/bin/env node
/**
 * Weekly model sync for the Model Market (docs/specs/MODEL-MARKET.md §4). Reads GitHub Docs' Copilot
 * model tables at the head of `main` from raw.githubusercontent.com (no token, no REST API: the
 * commit comes from `git ls-remote`), keeps the Claude, GPT and MAI models (tools/models/catalog.ts),
 * and writes the course pack's models.json (courses/<id>/models.json). The file only changes when the models do: a new docs commit with
 * the same models leaves it alone, so a re-run writes the same bytes.
 *
 *   npm run models:sync                       write courses/copilot-app/models.json if the models changed
 *   npm run models:sync -- --course=<id>      another course pack's
 *   npm run models:sync -- --check            exit 1 if it would change (no writes)
 *   npm run models:sync -- --ref=<sha>        read one docs commit
 *   npm run models:sync -- --from=<dir>       read models-and-pricing.yml and model-comparison.yml from a folder (offline)
 *
 * Writes `changed=true|false` to $GITHUB_OUTPUT when it's set.
 */
import { execFile } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tsImport } from 'tsx/esm/api';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));
const catalog = await tsImport('./catalog.ts', import.meta.url);
const {
  DOCS_REPO,
  DOCS_DIR,
  PRICING_FILE,
  COMPARISON_FILE,
  catalogFromTables,
  formatModelsFile,
  sameModels,
  useCourse,
} = catalog;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
/** The course pack whose Model Market this is (`--course=<id>`, default copilot-app). */
const COURSE = typeof args.course === 'string' ? args.course : 'copilot-app';
const { modelsFile: OUT } = useCourse(COURSE);
const OUT_REL = relative(root, OUT);

async function headCommit() {
  const { stdout } = await exec('git', ['ls-remote', `https://github.com/${DOCS_REPO}`, 'refs/heads/main']);
  const sha = stdout.split(/\s/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error(`git ls-remote gave no commit: ${stdout}`);
  return sha;
}

async function fetchText(ref, path) {
  const url = `https://raw.githubusercontent.com/${DOCS_REPO}/${ref}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function readTables() {
  if (typeof args.from === 'string') {
    const read = (p) => readFile(join(args.from, p.split('/').at(-1)), 'utf8');
    return { commit: 'local', pricing: await read(PRICING_FILE), comparison: await read(COMPARISON_FILE) };
  }
  const commit = typeof args.ref === 'string' ? args.ref : await headCommit();
  const [pricing, comparison] = await Promise.all([
    fetchText(commit, PRICING_FILE),
    fetchText(commit, COMPARISON_FILE),
  ]);
  return { commit, pricing, comparison };
}

async function output(changed) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

const { commit, pricing, comparison } = await readTables();
const models = catalogFromTables(pricing, comparison);
// The pack's categories (market.json), read once the course is active.
const counts = catalog.CATEGORIES.map((c) => `${c} ${models.filter((m) => m.category === c).length}`);
if (models.length === 0)
  throw new Error('No Claude, GPT or MAI models found: did the docs tables change shape?');
for (const c of catalog.CATEGORIES)
  if (!models.some((m) => m.category === c && m.ga)) throw new Error(`No GA ${c} models found`);

const previous = await readFile(OUT, 'utf8')
  .then((t) => JSON.parse(t))
  .catch(() => null);
const changed = !previous || !sameModels(previous.models ?? [], models);
console.log(`${models.length} models (${counts.join(', ')}) at ${DOCS_REPO}@${commit.slice(0, 7)}`);

if (args.check) {
  await output(changed);
  if (changed) {
    const before = new Set((previous?.models ?? []).map((m) => `${m.name} (${m.category})`));
    const after = new Set(models.map((m) => `${m.name} (${m.category})`));
    for (const m of after) if (!before.has(m)) console.log(`  + ${m}`);
    for (const m of before) if (!after.has(m)) console.log(`  - ${m}`);
    console.log(`${OUT_REL} would change. Run \`npm run models:sync\`.`);
    process.exit(1);
  }
  console.log(`${OUT_REL} is up to date.`);
  process.exit(0);
}

if (!changed) {
  console.log(`No model changes; ${OUT_REL} is unchanged.`);
  await output(false);
} else {
  const file = {
    source: { repo: DOCS_REPO, path: DOCS_DIR, commit, fetchedAt: new Date().toISOString() },
    models,
  };
  await writeFile(OUT, formatModelsFile(file));
  console.log(`Wrote ${OUT}`);
  await output(true);
}
