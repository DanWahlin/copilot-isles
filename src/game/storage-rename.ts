/**
 * The game was "Copilot Isles" until 2026-10-26. Now it's "Kraken Isles", and its browser storage keys
 * moved from `copilot-isles.*` to `kraken-isles.*` (docs/specs/COURSE-PACKS.md §6). GitHub Pages keeps
 * the same origin (danwahlin.github.io) at the new path, so a player's old keys are still there.
 *
 * On start, `renameStorageKeys` moves each old key: it copies the value to the new key only when the
 * new key has none (it never overwrites newer data), then removes the old key. One exception: when a
 * course has a save under both names, the save with the later `savedAt` wins, and its progress goes
 * with it. A tab of the old build that stayed open after the move can still write the old keys, and
 * its voyage can be the newer one (issue 321). A second run finds nothing to move. It imports nothing,
 * so boot can run it before it reads a setting.
 */
export interface KeyedStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_PREFIX = 'kraken-isles.';
export const OLD_STORAGE_PREFIX = 'copilot-isles.';

/**
 * The keys before course packs (one course, no course in the key). They don't get a new name:
 * `migrateSaves` (save-keys.ts) moves them to the legacy course's keys.
 */
export const LEGACY_KEYS = { save: 'copilot-isles.save.v1', progress: 'copilot-isles.progress.v1' } as const;

/** Old keys without the game's name in them. */
const OLD_KEYS: Readonly<Record<string, string>> = {
  'isles.battleBriefing.hidden': 'kraken-isles.battleBriefing.hidden',
};

const LEGACY = new Set<string>(Object.values(LEGACY_KEYS));

/** The new name of an old key, or null when the key isn't one to rename. */
export function renamedKey(old: string): string | null {
  if (Object.hasOwn(OLD_KEYS, old)) return OLD_KEYS[old];
  if (!old.startsWith(OLD_STORAGE_PREFIX) || LEGACY.has(old)) return null;
  return STORAGE_PREFIX + old.slice(OLD_STORAGE_PREFIX.length);
}

/** The Pages path the game had as Copilot Isles. Its service worker registration is the old build's. */
export const OLD_PAGES_PATH = '/copilot-isles/';

/** True for a service worker registration of the old path (`https://danwahlin.github.io/copilot-isles/`). */
export function isOldScope(scope: string): boolean {
  try {
    return new URL(scope).pathname === OLD_PAGES_PATH;
  } catch {
    return false;
  }
}

const SAVE_SUFFIX = '.save.v1';
const PROGRESS_SUFFIX = '.progress.v1';

function savedAt(value: string | null): number {
  if (value === null) return -Infinity;
  try {
    const at = (JSON.parse(value) as { savedAt?: unknown } | null)?.savedAt;
    return typeof at === 'number' && Number.isFinite(at) ? at : -Infinity;
  } catch {
    return -Infinity;
  }
}

/**
 * When a course has a save under both names and the old one is newer, it replaces the new one, and
 * the old progress (when there is one) replaces the new progress: a save and its progress stay a pair.
 */
function keepNewerSaves(
  storage: KeyedStorage,
  old: readonly string[],
  moved: string[],
  keep: Set<string>,
): void {
  for (const key of old) {
    if (!key.endsWith(SAVE_SUFFIX)) continue;
    const to = renamedKey(key)!;
    try {
      const value = storage.getItem(key);
      const current = storage.getItem(to);
      if (value === null || current === null || savedAt(value) <= savedAt(current)) continue;
      const oldProgress = key.slice(0, -SAVE_SUFFIX.length) + PROGRESS_SUFFIX;
      keep.add(key).add(oldProgress);
      const progress = storage.getItem(oldProgress);
      if (progress !== null) {
        const toProgress = renamedKey(oldProgress)!;
        storage.setItem(toProgress, progress);
        moved.push(toProgress);
      }
      storage.setItem(to, value);
      moved.push(to);
      keep.delete(key);
      keep.delete(oldProgress);
    } catch {
      // Full storage: the old save and progress stay, and the next start tries again.
    }
  }
}

/** Moves every old key to its new name. Returns the new keys that got a value. */
export function renameStorageKeys(storage: KeyedStorage | null): string[] {
  if (!storage) return [];
  const moved: string[] = [];
  let old: string[];
  try {
    old = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && renamedKey(key) !== null) old.push(key);
    }
  } catch {
    return moved;
  }
  const keep = new Set<string>();
  keepNewerSaves(storage, old, moved, keep);
  for (const key of old) {
    if (keep.has(key)) continue;
    const to = renamedKey(key)!;
    try {
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(to) === null) {
        storage.setItem(to, value);
        moved.push(to);
      }
      storage.removeItem(key);
    } catch {
      // Full storage: the old key stays (nothing is lost), and the next start tries again.
    }
  }
  return moved;
}

/** The browser's local or session storage, or null when the page can't use it (private mode). */
export function browserStorage(kind: 'local' | 'session'): KeyedStorage | null {
  try {
    if (kind === 'local') return typeof localStorage === 'undefined' ? null : localStorage;
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
