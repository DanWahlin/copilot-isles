/**
 * A course pack's files on disk (docs/specs/COURSE-PACKS.md), read without the game's modules: the
 * Vite plugin that splits each pack (vite-plugin.mjs) and the tools (read.ts) use it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CourseMeta } from '../../src/course/catalog';
import { withoutMeta } from '../../src/course/pack';
import { splitPack, type PackSplit } from '../../src/course/split';

/** The packs under `courses/` (each folder with a `course.json`). */
export function packIds(coursesDir: string): string[] {
  return readdirSync(coursesDir)
    .filter((id) => existsSync(join(coursesDir, id, 'course.json')))
    .sort();
}

/** The pack's runtime files (everything the browser loads but `course.json`), by path in the pack. */
export function packFiles(dir: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const rel = relative(dir, p).split('\\').join('/');
      if (statSync(p).isDirectory()) {
        if (rel !== 'public' && rel !== 'voice') walk(p);
      } else if (name.endsWith('.json') && rel !== 'course.json') {
        out[rel] = JSON.parse(readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return out;
}

/** The pack's `course.json`, less its `$schema` and `$comment`. */
export function packMeta(dir: string): CourseMeta {
  return withoutMeta(JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8')) as CourseMeta);
}

/** A pack on disk split for the browser (src/course/split.ts): its core and its chapters' parts. */
export function splitFromDisk(coursesDir: string, id: string): PackSplit {
  const dir = join(coursesDir, id);
  return splitPack(packMeta(dir), packFiles(dir), { trim: true });
}
