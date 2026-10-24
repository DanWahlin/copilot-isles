/**
 * Course packs in Node (docs/specs/COURSE-PACKS.md): where a pack's files are, and the pack read from
 * disk the way the browser assembles it (src/course/load.ts), for tools and scripts run with tsx.
 */
import { join } from 'node:path';
import { setActiveCourse } from '../../src/course/active';
import { DEFAULT_COURSE_ID } from '../../src/course/catalog';
import { assemblePack, type CoursePack } from '../../src/course/pack';
import { packFiles, packMeta } from './files';

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

/** A pack read whole from disk (every chapter's part in), as the game assembles it. */
export function readCoursePack(id: string = DEFAULT_COURSE, root: string = ROOT): CoursePack {
  const { dir } = coursePaths(id, root);
  return assemblePack(packMeta(dir), packFiles(dir));
}

/** Reads a pack and makes it the active one (for tools that use the game's modules). */
export function activateCourseFromDisk(id: string = DEFAULT_COURSE, root: string = ROOT): CoursePack {
  const pack = readCoursePack(id, root);
  setActiveCourse(pack);
  return pack;
}
