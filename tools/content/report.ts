/**
 * Checks a course pack and reports (docs/content-data.md):
 *
 *   npm run content:check -- [--course=<id>] [--previous=<old lock.json>] [--out=<report.md>] [--report-only]
 *
 * Prints every issue (file, JSON path, what to change) and each course notice board's topics, with
 * what changed since `--previous` (the weekly course refresh passes the lock from before its sync),
 * and the size of the pack's load parts (its core and each chapter's part, src/course/split.ts)
 * against their budgets in tools/budgets.json: a part over its budget, or without one, is an issue.
 * Writes `broken=true|false` to $GITHUB_OUTPUT. Exits 1 on an issue unless `--report-only`.
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { CourseMeta } from '../../src/course/catalog';
import type { CourseBoardsData } from '../../src/content/course-boards';
import type { CourseLock } from '../../src/learn/course/lock';
import { splitFromDisk } from '../course-pack/files';
import { coursePaths, DEFAULT_COURSE, ROOT as root } from '../course-pack/read';
import { boardChanges, checkBoardSpots, checkContent, courseBoardIslands } from './check';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || 'true'];
  }),
) as Record<string, string | undefined>;

const course = args.course && args.course !== 'true' ? args.course : DEFAULT_COURSE;
const paths = coursePaths(course);
const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
const issues = [
  ...checkContent(root, {}, course),
  ...checkBoardSpots().map((s) => ({
    file: 'src/world/islands/course-boards.ts',
    path: s.island,
    message: s.message,
  })),
];

// The pack's load parts (gzip -9, as tools/check-budgets.mjs measures the build) and their budgets.
type Budget = { name?: string; asset?: string; maxGzipKB: number };
const sizes: { label: string; kb: number; max: number | null }[] = [];
try {
  const budgets = Object.values(
    (await readJson<{ chunks: Record<string, Budget> }>(join(root, 'tools/budgets.json'))).chunks,
  );
  const kb = (o: unknown) => gzipSync(JSON.stringify(o), { level: 9 }).length / 1024;
  const { core, parts } = splitFromDisk(join(root, 'courses'), course);
  const max = (b?: Budget) => b?.maxGzipKB ?? null;
  sizes.push({ label: 'core', kb: kb(core), max: max(budgets.find((b) => b.name === `course-${course}`)) });
  for (const [chapter, part] of Object.entries(parts))
    sizes.push({
      label: chapter,
      kb: kb(part),
      max: max(budgets.find((b) => b.asset === `course-${course}-${chapter}`)),
    });
  for (const z of sizes)
    if (z.max === null || z.kb > z.max)
      issues.push({
        file: 'tools/budgets.json',
        path: z.label === 'core' ? `course-${course}` : `course-${course}-${z.label}`,
        message:
          z.max === null
            ? `The pack's ${z.label} part (${z.kb.toFixed(1)} KB gz) has no budget: add a row for it (docs/specs/COURSE-PACKS.md §2).`
            : `The pack's ${z.label} part is ${z.kb.toFixed(1)} KB gz, over its ${z.max} KB budget: move content to another chapter, or raise the budget and say why.`,
      });
} catch {
  // checkContent already reported the broken file.
}

const lines: string[] = [];
const say = (s = '') => lines.push(s);
say(`## Content data check: \`courses/${course}/\``);
say();
if (!issues.length) say(`Every file in \`courses/${course}/\` passed its schema and the content checks.`);
else {
  say(
    `**${issues.length} ${issues.length === 1 ? 'entry needs' : 'entries need'} an edit** (how: \`docs/content-data.md\`):`,
  );
  say();
  say('| File | Entry | What to change |');
  say('| --- | --- | --- |');
  const cell = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
  for (const i of issues) say(`| \`${i.file}\` | \`${cell(i.path || '(file)')}\` | ${cell(i.message)} |`);
}
say();

// The boards follow the course lock by themselves; this lists what they'll show after this sync.
let boards: CourseBoardsData | null = null;
let lock: CourseLock | null = null;
let meta: CourseMeta | null = null;
try {
  boards = await readJson<CourseBoardsData>(paths.boards);
  lock = await readJson<CourseLock>(paths.lock);
  meta = await readJson<CourseMeta>(paths.course);
} catch {
  // checkContent already reported the broken file.
}
if (boards && lock && meta) {
  const previous =
    args.previous && existsSync(args.previous) ? await readJson<CourseLock>(args.previous) : null;
  say('### Course notice boards');
  say();
  say(
    previous
      ? 'Topics come from the course lock, so each board follows the course on the next build. Changes since the last sync:'
      : 'Topics come from the course lock, so each board follows the course on the next build:',
  );
  say();
  for (const b of boardChanges(courseBoardIslands(meta), boards.skip, lock, previous)) {
    const changes = [...b.added.map((t) => `+ ${t}`), ...b.removed.map((t) => `− ${t}`)];
    say(
      `- **${b.island}** (${b.chapter}, ${b.topics.length} topics): ${b.topics.map((t) => t.title).join(' · ') || '(none)'}${previous ? (changes.length ? `. **Changed:** ${changes.join(', ')}` : '. No change.') : ''}`,
    );
  }
  say();
}

if (sizes.length) {
  say('### Load parts');
  say();
  say(
    'The voyage loads the core; each chapter part loads when its island streams in (docs/specs/COURSE-PACKS.md §2):',
  );
  say();
  say('| Part | KB gz | Budget |');
  say('| --- | --- | --- |');
  for (const z of sizes) say(`| ${z.label} | ${z.kb.toFixed(1)} | ${z.max ?? '(none)'} |`);
  say();
}

const report = lines.join('\n');
if (args.out) await writeFile(args.out, `${report}\n`);
console.log(report);
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `broken=${issues.length ? 'true' : 'false'}\n`);
if (issues.length && args['report-only'] !== 'true') process.exitCode = 1;
