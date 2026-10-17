// Enforces PLAN §13.5 size budgets on dist/ (run after `npm run build`).
// "Title" = index.html + everything reachable from the entry through static and dynamic imports.
// Phase 0 note: once game chunks exist (T3), the title set narrows to the title-critical chunks.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const manifestPath = join(dist, '.vite/manifest.json');
if (!existsSync(manifestPath)) {
  console.error('dist/.vite/manifest.json not found. Run `npm run build` first.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const budgets = JSON.parse(readFileSync(join(root, 'tools/budgets.json'), 'utf8'));
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
const kb = (b) => (b / 1024).toFixed(1);

const entries = Object.entries(manifest);
const entryKey = entries.find(([, v]) => v.isEntry)?.[0];
if (!entryKey) {
  console.error('No entry chunk in the manifest.');
  process.exit(1);
}

let failed = false;
const rows = [];
for (const [label, rule] of Object.entries(budgets.chunks)) {
  const hit = rule.entry ? manifest[entryKey] : entries.map(([, v]) => v).find((v) => v.name === rule.name);
  if (!hit) {
    rows.push([label, '-', `${rule.maxGzipKB}`, 'not built']);
    continue;
  }
  const size = gz(hit.file);
  const ok = size <= rule.maxGzipKB * 1024;
  if (!ok) failed = true;
  rows.push([label, kb(size), `${rule.maxGzipKB}`, ok ? 'ok' : 'OVER']);
}

const seen = new Set();
const files = new Set(['index.html']);
const walk = (key) => {
  if (seen.has(key) || !manifest[key]) return;
  seen.add(key);
  const m = manifest[key];
  files.add(m.file);
  (m.css || []).forEach((c) => files.add(c));
  (m.assets || []).forEach((a) => files.add(a));
  [...(m.imports || []), ...(m.dynamicImports || [])].forEach(walk);
};
walk(entryKey);
const title = [...files].reduce((sum, f) => sum + gz(f), 0);
const titleOk = title <= budgets.titleWireMaxKB * 1024;
if (!titleOk) failed = true;
rows.push(['title (wire, gz)', kb(title), `${budgets.titleWireMaxKB}`, titleOk ? 'ok' : 'OVER']);

// Course packs load with the voyage (docs/specs/COURSE-PACKS.md §2): the title only has the course
// list (each pack's course.json). No course-<id> chunk may be in the entry's static imports.
const packIds = existsSync(join(root, 'courses'))
  ? readdirSync(join(root, 'courses')).filter((d) => existsSync(join(root, 'courses', d, 'course.json')))
  : [];
const isPackChunk = (name) => packIds.some((id) => name === `course-${id}`);
const staticKeys = new Set();
const walkStatic = (key) => {
  if (staticKeys.has(key) || !manifest[key]) return;
  staticKeys.add(key);
  (manifest[key].imports || []).forEach(walkStatic);
};
walkStatic(entryKey);
for (const key of staticKeys) {
  const name = manifest[key].name ?? '';
  if (!isPackChunk(name)) continue;
  failed = true;
  rows.push([name, kb(gz(manifest[key].file)), '-', 'IN THE TITLE (load it with the voyage)']);
}
const coursePacks = entries.filter(([, v]) => isPackChunk(v.name ?? '')).length;
const packsOk = coursePacks === packIds.length;
if (!packsOk) failed = true;
rows.push(['course packs (lazy chunks)', `${coursePacks}`, `${packIds.length}`, packsOk ? 'ok' : 'MISSING']);

// The baked cloud keys (BakedPanorama.ts) load at run time, one or two at a time: each stays small.
const skyDir = join(dist, 'sky');
const skyKeys = existsSync(skyDir) ? readdirSync(skyDir).filter((f) => f.endsWith('.webp')) : [];
for (const f of skyKeys) {
  const size = statSync(join(skyDir, f)).size;
  const ok = size <= budgets.skyKeyMaxKB * 1024;
  if (!ok) failed = true;
  rows.push([`sky/${f}`, kb(size), `${budgets.skyKeyMaxKB}`, ok ? 'ok' : 'OVER']);
}

console.log('budget                       KB gz    max KB   status');
for (const [a, b, c, d] of rows) console.log(`${a.padEnd(28)} ${b.padStart(7)}  ${c.padStart(7)}   ${d}`);
if (failed) {
  console.error('\nA size budget was exceeded (PLAN §13.5).');
  process.exit(1);
}
