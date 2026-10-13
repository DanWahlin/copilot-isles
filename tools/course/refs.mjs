#!/usr/bin/env node
/**
 * Lists a snapshotted chapter's sections with the hashes to put in `SourceRef`s, and its images with
 * the hashes for `CourseImage.hash` / hotspot refs (docs/course-content-authoring.md).
 *
 *   npm run course:refs -- 02
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const lock = JSON.parse(readFileSync(join(root, 'content/course.lock.json'), 'utf8'));
const want = (process.argv[2] ?? '').padStart(2, '0');
const id = Object.keys(lock.chapters).find((c) => c.startsWith(`${want}-`));
if (!id) {
  console.error(
    `Chapter ${want} isn't in the snapshot. Snapshotted: ${Object.keys(lock.chapters).join(', ')}`,
  );
  console.error(
    `Add it with: node tools/course/sync.mjs --chapters=${[...Object.keys(lock.chapters).map((c) => c.slice(0, 2)), want].join(',')}`,
  );
  process.exit(1);
}
const ch = lock.chapters[id];
console.log(`${id} (${ch.title}) @ ${lock.sha.slice(0, 7)}\n`);
console.log(`const src = courseRefs('${id}');\n`);
for (const [anchor, s] of Object.entries(ch.sections))
  console.log(`${'  '.repeat(s.level - 2)}src('${anchor}', '${s.hash}')  // ${s.title}`);
console.log('\nImages the chapter shows (src · hash):');
const shown = new Set(Object.values(ch.sections).flatMap((s) => s.images ?? []));
for (const [src, img] of Object.entries(lock.images)) {
  if (!shown.has(img.upstream) && !src.startsWith(`course/${ch.short}/`)) continue;
  const file = join(root, 'public', src);
  const hash = existsSync(file)
    ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)
    : '?';
  console.log(`  ${src} · ${hash}`);
}
