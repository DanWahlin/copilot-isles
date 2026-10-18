import { DEFAULT_COURSE_ID, LEGACY_COURSE } from '../course/catalog';

/**
 * Where a voyage is kept, per course (docs/specs/COURSE-PACKS.md §6). Settings, the benchmark and the
 * battle briefing stay global; a course's save (where you are, your captain) and its progress (quests,
 * pages, puzzles…) are its own, so two courses never share a quest id's step. It reads only the
 * catalog, so the title can ask without loading the game.
 *
 * Before course packs there was one course, and its keys had no course in them. On the first start
 * after the move, `migrateSaves` copies them to the legacy course's (`"legacySaves": true` in its
 * course.json). For one release the old keys stay and follow its writes (`mirrorKey`), so a rollback
 * to the build before still finds the same voyage; the release after drops the mirror and removes them.
 */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The keys before course packs (one course, no course in the key). */
export const LEGACY_KEYS = { save: 'copilot-isles.save.v1', progress: 'copilot-isles.progress.v1' } as const;
/** The last course played (for Continue). */
export const LAST_COURSE_KEY = 'copilot-isles.course';

export type SaveKind = keyof typeof LEGACY_KEYS;

/** A course's save or progress key: `copilot-isles.<course>.save.v1`. */
export function courseKey(course: string, kind: SaveKind): string {
  return `copilot-isles.${course}.${kind}.v1`;
}

/** The old key a course's writes also go to for one release (only the legacy course has one). */
export function mirrorKey(course: string, kind: SaveKind): string | null {
  return course === LEGACY_COURSE ? LEGACY_KEYS[kind] : null;
}

/**
 * Copies the pre-course-pack save and progress to the legacy course's keys, once: only when an old
 * key has something and the new one doesn't (so it never overwrites a newer voyage), and the old keys
 * stay. Returns the kinds it copied.
 */
export function migrateSaves(storage: SaveStorage | null, legacy: string | null = LEGACY_COURSE): SaveKind[] {
  if (!storage || !legacy) return [];
  const moved: SaveKind[] = [];
  try {
    for (const kind of Object.keys(LEGACY_KEYS) as SaveKind[]) {
      const old = storage.getItem(LEGACY_KEYS[kind]);
      const key = courseKey(legacy, kind);
      if (old === null || old === 'null' || storage.getItem(key) !== null) continue;
      storage.setItem(key, old);
      moved.push(kind);
    }
    if (moved.length && storage.getItem(LAST_COURSE_KEY) === null) storage.setItem(LAST_COURSE_KEY, legacy);
  } catch {
    // Private mode or full storage: the old keys are still there for the next start.
  }
  return moved;
}

/** Writes a course's value (null removes it), and its mirror while there is one. */
export function writeCourseKey(
  storage: SaveStorage | null,
  course: string,
  kind: SaveKind,
  value: string | null,
): void {
  if (!storage) return;
  for (const key of [courseKey(course, kind), mirrorKey(course, kind)]) {
    if (!key) continue;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}

/** The course Continue resumes: the last one played, if it's still a course (else `fallback`). */
export function lastCourse(
  storage: SaveStorage | null,
  known: readonly string[],
  fallback = DEFAULT_COURSE_ID,
): string {
  try {
    const id = storage?.getItem(LAST_COURSE_KEY) ?? null;
    return id && known.includes(id) ? id : fallback;
  } catch {
    return fallback;
  }
}

export function setLastCourse(storage: SaveStorage | null, course: string): void {
  try {
    storage?.setItem(LAST_COURSE_KEY, course);
  } catch {
    // Private mode: Continue falls back to the default course.
  }
}

export function safeStorage(): SaveStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
