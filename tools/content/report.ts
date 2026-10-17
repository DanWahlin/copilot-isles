/**
 * Checks the content files and reports (docs/content-data.md):
 *
 *   npm run content:check -- [--previous=<old course.lock.json>] [--out=<report.md>] [--report-only]
 *
 * Prints every issue (file, JSON path, what to change) and each course notice board's topics, with
 * what changed since `--previous` (the weekly course refresh passes the lock from before its sync).
 * Writes `broken=true|false` to $GITHUB_OUTPUT. Exits 1 on an issue unless `--report-only`.
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CourseBoardsData } from '../../src/content/course-boards';
import type { CourseLock } from '../../src/learn/course/lock';
import { boardChanges, checkContent } from './check';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || 'true'];
  }),
) as Record<string, string | undefined>;

const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
const issues = checkContent(root);

const lines: string[] = [];
const say = (s = '') => lines.push(s);
say('## Content data check');
say();
if (!issues.length) say('Every file in `content/` passed its schema and the content checks.');
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
try {
  boards = await readJson<CourseBoardsData>(join(root, 'content/course-boards.json'));
  lock = await readJson<CourseLock>(join(root, 'content/course.lock.json'));
} catch {
  // checkContent already reported the broken file.
}
if (boards && lock) {
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
  for (const b of boardChanges(boards, lock, previous)) {
    const changes = [...b.added.map((t) => `+ ${t}`), ...b.removed.map((t) => `− ${t}`)];
    say(
      `- **${b.island}** (${b.chapter}, ${b.topics.length} topics): ${b.topics.map((t) => t.title).join(' · ') || '(none)'}${previous ? (changes.length ? `. **Changed:** ${changes.join(', ')}` : '. No change.') : ''}`,
    );
  }
  say();
}

const report = lines.join('\n');
if (args.out) await writeFile(args.out, `${report}\n`);
console.log(report);
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `broken=${issues.length ? 'true' : 'false'}\n`);
if (issues.length && args['report-only'] !== 'true') process.exitCode = 1;
