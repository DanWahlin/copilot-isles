/**
 * Course packs in Node (docs/specs/COURSE-PACKS.md): where a pack's files are, and the pack read from
 * disk the way the browser assembles it (src/course/load.ts), for tools and scripts run with tsx.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { setActiveCourse } from '../../src/course/active';
import { DEFAULT_COURSE_ID, type CourseMeta } from '../../src/course/catalog';
import { assemblePack, withoutMeta, type CoursePack } from '../../src/course/pack';

export const ROOT = join(import.meta.dirname, '..', '..');
export const DEFAULT_COURSE = DEFAULT_COURSE_ID;

/** Every file and folder of a pack that tools read or write (absolute paths). */
export function coursePaths(id: string = DEFAULT_COURSE, root: string = ROOT) {
  const dir = join(root, 'courses', id);
  return {
    dir,
    course: join(dir, 'course.json'),
    lock: join(dir, 'lock.json'),
    labels: join(dir, 'labels.json'),
    boards: join(dir, 'boards.json'),
    market: join(dir, 'market.json'),
    models: join(dir, 'models.json'),
    chapters: join(dir, 'chapters'),
    quests: join(dir, 'quests'),
    lines: join(dir, 'voice', 'lines.json'),
    /** Served as `<base>courses/<id>/`. */
    public: join(dir, 'public'),
    /** The course snapshot (READMEs, GLOSSARY, LICENSE, images). */
    snapshot: join(dir, 'public', 'course'),
    /** The voice lines' audio, timings, manifest.json and lipsync.json. */
    voice: join(dir, 'public', 'voice'),
  };
}

/** `--course <id>` or `--course=<id>` from argv, or the default course. */
export function courseArg(argv: readonly string[] = process.argv.slice(2)): string {
  const i = argv.findIndex((a) => a === '--course' || a.startsWith('--course='));
  if (i < 0) return DEFAULT_COURSE;
  const v = argv[i]!.includes('=') ? argv[i]!.slice('--course='.length) : argv[i + 1];
  if (!v || !/^[a-z0-9-]+$/.test(v)) throw new Error('--course needs a course id, e.g. --course copilot-app');
  return v;
}

/** The pack's runtime files (everything the browser loads), by path in the pack. */
function packFiles(id: string = DEFAULT_COURSE, root: string = ROOT): Record<string, unknown> {
  const { dir } = coursePaths(id, root);
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

function readCourseMeta(id: string = DEFAULT_COURSE, root: string = ROOT): CourseMeta {
  return withoutMeta(JSON.parse(readFileSync(coursePaths(id, root).course, 'utf8')) as CourseMeta);
}

export function readCoursePack(id: string = DEFAULT_COURSE, root: string = ROOT): CoursePack {
  return assemblePack(readCourseMeta(id, root), packFiles(id, root));
}

/** Reads a pack and makes it the active one (for tools that use the game's modules). */
export function activateCourseFromDisk(id: string = DEFAULT_COURSE, root: string = ROOT): CoursePack {
  const pack = readCoursePack(id, root);
  setActiveCourse(pack);
  return pack;
}
