/**
 * The Node.js LTS check (issue 279), run by the weekly refresh. A checklist puzzle's check can say it
 * `tracks` the Node.js LTS (the gear rack's `node -v`): the course's rule is "compare the first number
 * with the LTS on the download page", so the sample output has to be the LTS that nodejs.org marks
 * today. It reads https://nodejs.org/dist/index.json and fails when, in any course pack:
 *
 * - the check's `output` isn't on the LTS major, or doesn't meet the course sample's `engines.node`
 *   (`tracks.engines`, read from the course's repository at `source.ref`);
 * - its `stale` output (the one the player has to catch) isn't lower than the LTS;
 * - a line that names the LTS (a quiz, a cited line, a voice line) names another major, or a full
 *   version that isn't one of the check's outputs.
 *
 *   npx tsx tools/course/node-lts.ts [--course=<id>] [--out=<file.md>] [--index=<file.json>]
 *
 * `--index` reads a saved index instead of nodejs.org; `--out` writes the report as Markdown (the
 * workflow puts it in an issue).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const INDEX_URL = 'https://nodejs.org/dist/index.json';

export interface NodeRelease {
  version: string;
  date: string;
  lts: string | false;
}

export interface Lts {
  version: string;
  major: number;
  name: string;
  date: string;
}

interface TrackedCheck {
  file: string;
  id: string;
  output: string;
  stale?: string;
  engines?: string;
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)/;

/** The newest release nodejs.org marks LTS (the index lists the newest first). */
export function newestLts(index: readonly NodeRelease[]): Lts {
  const r = index.find((x) => x.lts !== false);
  if (!r) throw new Error('nodejs.org lists no LTS release');
  return { version: r.version, major: major(r.version), name: String(r.lts), date: r.date };
}

function major(version: string): number {
  const m = VERSION.exec(version.trim());
  if (!m) throw new Error(`"${version}" isn't a version`);
  return Number(m[1]);
}

function parts(version: string): [number, number, number] {
  const m = VERSION.exec(version.trim())!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True when `version` meets a `>=x.y.z` range (the form the course's samples use); other forms pass. */
export function meetsEngines(version: string, range: string): boolean {
  const m = /^>=\s*v?(\d+(?:\.\d+){0,2})$/.exec(range.trim());
  if (!m) return true;
  const want = [...m[1].split('.').map(Number), 0, 0].slice(0, 3);
  const have = parts(version);
  for (let i = 0; i < 3; i++) if (have[i] !== want[i]) return have[i] > want[i];
  return true;
}

/** Every string in a JSON value, with its path. */
function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value))
    for (let i = 0; i < value.length; i++) {
      const id = (value[i] as { id?: unknown } | null)?.id;
      yield* strings(value[i], `${path}[${typeof id === 'string' ? id : i}]`);
    }
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) if (!k.startsWith('$')) yield* strings(v, `${path}.${k}`);
}

/** What a line that names the LTS says: the LTS majors it names, and its full versions. */
export function ltsClaims(text: string): { lts: number[]; lower: number[]; versions: string[] } | null {
  if (!/\bLTS\b/.test(text)) return null;
  const lts: number[] = [];
  const lower: number[] = [];
  for (const m of text.matchAll(/marks v(\d+) as \*{0,2}LTS/g)) lts.push(Number(m[1]));
  for (const m of text.matchAll(/the LTS \(v(\d+)\)/g)) lts.push(Number(m[1]));
  for (const m of text.matchAll(/\b(\d+), matches the LTS/g)) lts.push(Number(m[1]));
  for (const m of text.matchAll(/\b(\d+) is lower than (\d+)\b/g)) {
    lower.push(Number(m[1]));
    lts.push(Number(m[2]));
  }
  const versions = [...text.matchAll(/\bv\d+\.\d+\.\d+\b/g)].map((m) => m[0]);
  return { lts, lower, versions };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'public' ? [] : jsonFiles(p);
    return name.endsWith('.json') ? [p] : [];
  });
}

/** The checks in a pack's puzzles that track the Node.js LTS. */
export function trackedChecks(pack: string): TrackedCheck[] {
  const out: TrackedCheck[] = [];
  for (const file of jsonFiles(join(pack, 'puzzles'))) {
    const doc = readJson(file) as {
      mechanic?: string;
      checks?: {
        id: string;
        output: string;
        stale?: { output: string };
        tracks?: { release: string; engines?: string };
      }[];
    };
    if (doc.mechanic !== 'checklist') continue;
    for (const c of doc.checks ?? [])
      if (c.tracks?.release === 'node-lts')
        out.push({ file, id: c.id, output: c.output, stale: c.stale?.output, engines: c.tracks.engines });
  }
  return out;
}

/** The problems in one pack. `engines` maps a `tracks.engines` path to its `engines.node` range. */
export function checkPack(pack: string, lts: Lts, engines: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  const rel = (f: string) => f.slice(ROOT.length).replace(/^\//, '');
  const checks = trackedChecks(pack);
  if (!checks.length) return problems;
  const outputs = new Set<string>();
  const staleMajors = new Set<number>();
  for (const c of checks) {
    const where = `${rel(c.file)} → ${c.id}`;
    outputs.add(c.output);
    if (major(c.output) !== lts.major)
      problems.push(
        `${where}: \`output\` is ${c.output}, but nodejs.org marks v${lts.major} as LTS (${lts.version}, ${lts.date}).`,
      );
    if (c.engines) {
      const range = engines.get(c.engines);
      if (range === undefined) problems.push(`${where}: couldn't read \`engines.node\` from ${c.engines}.`);
      else if (!meetsEngines(c.output, range))
        problems.push(
          `${where}: \`output\` ${c.output} doesn't meet ${c.engines}'s \`engines.node\` (${range}).`,
        );
    }
    if (c.stale !== undefined) {
      outputs.add(c.stale);
      staleMajors.add(major(c.stale));
      if (major(c.stale) >= lts.major)
        problems.push(`${where}: the \`stale\` output ${c.stale} isn't lower than the LTS (v${lts.major}).`);
    }
  }
  for (const file of jsonFiles(pack)) {
    for (const [path, text] of strings(readJson(file), '')) {
      const claims = ltsClaims(text);
      if (!claims) continue;
      const where = `${rel(file)} ${path}`;
      for (const n of claims.lts)
        if (n !== lts.major)
          problems.push(`${where}: names v${n} as the LTS; nodejs.org marks v${lts.major}.`);
      for (const n of claims.lower)
        if (!staleMajors.has(n))
          problems.push(`${where}: names ${n} as the lower version; the stale output isn't v${n}.`);
      for (const v of claims.versions)
        if (!outputs.has(v))
          problems.push(`${where}: names ${v}, which isn't the check's output or stale output.`);
    }
  }
  return problems;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const only = flag('course');
  const out = flag('out');
  const indexFile = flag('index');
  const index = JSON.parse(
    indexFile ? readFileSync(indexFile, 'utf8') : await fetchText(INDEX_URL),
  ) as NodeRelease[];
  const lts = newestLts(index);
  const courses = readdirSync(join(ROOT, 'courses')).filter(
    (id) =>
      id !== 'schemas' && existsSync(join(ROOT, 'courses', id, 'course.json')) && (!only || id === only),
  );
  const report: string[] = [];
  let tracked = 0;
  for (const id of courses) {
    const pack = join(ROOT, 'courses', id);
    const checks = trackedChecks(pack);
    if (!checks.length) continue;
    tracked += checks.length;
    const source = (
      readJson(join(pack, 'course.json')) as { source?: { repo?: string; ref?: string } | null }
    ).source;
    const engines = new Map<string, string>();
    for (const path of new Set(checks.flatMap((c) => (c.engines ? [c.engines] : [])))) {
      if (!source?.repo) continue;
      try {
        const pkg = JSON.parse(
          await fetchText(`https://raw.githubusercontent.com/${source.repo}/${source.ref ?? 'main'}/${path}`),
        ) as { engines?: { node?: string } };
        if (pkg.engines?.node) engines.set(path, pkg.engines.node);
      } catch (err) {
        console.warn(`${id}: ${path}: ${(err as Error).message}`);
      }
    }
    const problems = checkPack(pack, lts, engines);
    for (const c of checks) {
      const range = c.engines ? engines.get(c.engines) : undefined;
      console.log(
        `${id}: ${c.id} prints ${c.output}${c.stale ? ` (first ${c.stale})` : ''}; LTS ${lts.version} (${lts.name}, ${lts.date})${range ? `; ${c.engines} needs ${range}` : ''}`,
      );
    }
    if (problems.length) {
      report.push(`### ${id}`, '', ...problems.map((p) => `- ${p}`), '');
      for (const p of problems) console.error(`  ✗ ${p}`);
    }
  }
  if (!tracked) console.log('No checklist check tracks the Node.js LTS.');
  if (out) {
    const body = report.length
      ? [
          `nodejs.org now marks **${lts.version}** (${lts.name}, ${lts.date}) as the newest LTS. The course's rule is "compare the first number with the LTS", so the sample outputs and the lines that name the LTS have to follow it (\`.plans/issues.md\` row 279).`,
          '',
          ...report,
          "To fix: update the check's `output` (and `stale` if it isn't lower any more), the quizzes and cited lines listed, voice the changed lines again (`npx tsx tools/voice/generate.ts --course <id> --only <ids>`, then `npm run voice:lipsync -- --course <id>`), and run `npx tsx tools/course/node-lts.ts` until it passes.",
        ].join('\n')
      : '';
    writeFileSync(out, body);
  }
  if (report.length) process.exit(1);
  console.log('The Node.js LTS samples match nodejs.org.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
