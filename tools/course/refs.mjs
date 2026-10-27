#!/usr/bin/env node
/**
 * Lists a snapshotted chapter's (or appendix's) sections with the `source` to put in a course pack's
 * JSON (a `SourceRef`), and its images with the hashes for an image's `hash` / a hotspot quiz's
 * `source.image` (docs/course-content-authoring.md).
 *
 *   npm run course:refs -- 02 [--course=<id>]
 *   npm run course:refs -- appendix:git-worktrees   (an appendix in course.json source.appendices)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const argv = process.argv.slice(2);
const courseFlag = argv.find((a) => a.startsWith('--course='));
const course = courseFlag ? courseFlag.slice('--course='.length) : 'copilot-app';
if (!/^[a-z0-9-]+$/.test(course)) throw new Error(`--course: "${course}" isn't a course id`);
const pack = join(root, 'courses', course);
const lock = JSON.parse(readFileSync(join(pack, 'lock.json'), 'utf8'));
const arg = argv.find((a) => !a.startsWith('--')) ?? '';
const appendix = arg.startsWith('appendix:') ? arg.slice('appendix:'.length) : null;
let id, ch;
if (appendix !== null) {
  id = arg;
  ch = lock.appendices?.[appendix];
  if (!ch) {
    console.error(
      `Appendix ${appendix} isn't in the snapshot. Snapshotted: ${Object.keys(lock.appendices ?? {}).join(', ') || 'none'}`,
    );
    console.error(
      `Add "${appendix}" to courses/${course}/course.json → source.appendices, then run: node tools/course/sync.mjs --course=${course}`,
    );
    process.exit(1);
  }
} else {
  const want = arg.padStart(2, '0');
  id = Object.keys(lock.chapters).find((c) => c.startsWith(`${want}-`));
  if (!id) {
    console.error(
      `Chapter ${want} isn't in the snapshot. Snapshotted: ${Object.keys(lock.chapters).join(', ')}`,
    );
    console.error(
      `Add it with: node tools/course/sync.mjs --course=${course} --chapters=${[...Object.keys(lock.chapters).map((c) => c.slice(0, 2)), want].join(',')}`,
    );
    process.exit(1);
  }
  ch = lock.chapters[id];
}
console.log(`${id} (${ch.title}) @ ${lock.sha.slice(0, 7)}: a "source" for each section\n`);
for (const [anchor, s] of Object.entries(ch.sections))
  console.log(
    `${'  '.repeat(Math.max(0, s.level - 2))}${JSON.stringify({ chapter: id, anchor, hash: s.hash })}  // ${s.title}`,
  );
console.log('\nImages the chapter shows (src · hash):');
const shown = new Set(Object.values(ch.sections).flatMap((s) => s.images ?? []));
for (const [src, img] of Object.entries(lock.images)) {
  if (!shown.has(img.upstream) && !(ch.short && src.startsWith(`course/${ch.short}/`))) continue;
  const file = join(pack, 'public', src);
  const hash = existsSync(file)
    ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)
    : '?';
  console.log(`  ${src} · ${hash}`);
}
