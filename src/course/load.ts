import { COURSE, courseMeta } from './catalog';
import { setActiveCourse } from './active';
import { assemblePack, type CoursePack } from './pack';

/**
 * Loads a course pack in the browser (docs/specs/COURSE-PACKS.md §2): every JSON file of
 * `courses/<id>/` but `course.json` (already in the catalog), the served files (`public/`) and the
 * voice lines' source (`voice/`). Vite puts one course's files in one lazy chunk, `course-<id>`
 * (vite.config.ts), so a voyage fetches its course in one request, and the title never does.
 */
const FILES = import.meta.glob<unknown>(
  [
    '../../courses/*/**/*.json',
    '!../../courses/*/course.json',
    '!../../courses/*/public/**',
    '!../../courses/*/voice/**',
    '!../../courses/schemas/**',
  ],
  { import: 'default' },
);

const loads = new Map<string, Promise<CoursePack>>();

/** Fetches and assembles a course pack (once; later calls share the first). */
export function loadCourse(id: string = COURSE.id): Promise<CoursePack> {
  let p = loads.get(id);
  if (!p) {
    const meta = courseMeta(id);
    const prefix = `../../courses/${id}/`;
    const entries = Object.entries(FILES).filter(([path]) => path.startsWith(prefix));
    p = meta
      ? Promise.all(
          entries.map(async ([path, load]) => [path.slice(prefix.length), await load()] as const),
        ).then((files) => assemblePack(meta, Object.fromEntries(files)))
      : Promise.reject(new Error(`No course "${id}" in the catalog`));
    // A failed fetch (offline) isn't cached: the next voyage tries again.
    p.catch(() => loads.delete(id));
    loads.set(id, p);
  }
  return p;
}

/** Loads a course pack and makes it the active one. */
export async function activateCourse(id: string = COURSE.id): Promise<CoursePack> {
  const pack = await loadCourse(id);
  setActiveCourse(pack);
  return pack;
}
