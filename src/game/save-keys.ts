import { DEFAULT_COURSE_ID, LEGACY_COURSE } from '../course/catalog';
import {
  LEGACY_KEYS,
  STORAGE_PREFIX,
  browserStorage,
  renameStorageKeys,
  type KeyedStorage,
} from './storage-rename';

/**
 * Where a voyage is kept, per course (docs/specs/COURSE-PACKS.md §6). Settings, the benchmark and the
 * battle briefing stay global; a course's save (where you are, your captain) and its progress (quests,
 * pages, puzzles…) are its own, so two courses never share a quest id's step. It reads only the
 * catalog, so the title can ask without loading the game.
 *
 * On start, `migrateSaves` moves old keys in two steps. First, the keys from when the game was
 * "Copilot Isles" (`copilot-isles.*`) get their new name (`kraken-isles.*`, storage-rename.ts). Then the
 * keys from before course packs (one course, no course in the key) go to the legacy course's keys
 * (`"legacySaves": true` in its course.json). Each step copies a value only to an empty key, then
 * removes the old key.
 */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export { LEGACY_KEYS };
/** The last course played (for Continue). */
export const LAST_COURSE_KEY = `${STORAGE_PREFIX}course`;

export type SaveKind = keyof typeof LEGACY_KEYS;

/** A course's save or progress key: `kraken-isles.<course>.save.v1`. */
export function courseKey(course: string, kind: SaveKind): string {
  return `${STORAGE_PREFIX}${course}.${kind}.v1`;
}

/**
 * Moves old keys to their new names (storage-rename.ts), then the pre-course-pack save and progress
 * to the legacy course's keys: a value is copied only when the course's key is empty (so it never
 * overwrites a newer voyage), then the old key is removed. A second run finds nothing to move.
 * Returns the kinds it copied to the legacy course.
 */
export function migrateSaves(
  storage: KeyedStorage | null,
  legacy: string | null = LEGACY_COURSE,
): SaveKind[] {
  if (!storage) return [];
  renameStorageKeys(storage);
  if (!legacy) return [];
  const moved: SaveKind[] = [];
  for (const kind of Object.keys(LEGACY_KEYS) as SaveKind[]) {
    try {
      const old = storage.getItem(LEGACY_KEYS[kind]);
      if (old === null) continue;
      const key = courseKey(legacy, kind);
      if (old !== 'null' && storage.getItem(key) === null) {
        storage.setItem(key, old);
        moved.push(kind);
      }
      storage.removeItem(LEGACY_KEYS[kind]);
    } catch {
      // Private mode or full storage: the old key stays for the next start.
    }
  }
  try {
    if (moved.length && storage.getItem(LAST_COURSE_KEY) === null) storage.setItem(LAST_COURSE_KEY, legacy);
  } catch {
    // Continue falls back to the default course, which is the legacy course too.
  }
  return moved;
}

/** Writes a course's value (null removes it). */
export function writeCourseKey(
  storage: SaveStorage | null,
  course: string,
  kind: SaveKind,
  value: string | null,
): void {
  if (!storage) return;
  const key = courseKey(course, kind);
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
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

export function safeStorage(): KeyedStorage | null {
  return browserStorage('local');
}
