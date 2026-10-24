import packs from 'virtual:course-packs';
import { COURSE, courseMeta, type CourseMeta } from './catalog';
import { addCoursePart, hasActiveCourse, coursePack, setActiveCourse } from './active';
import { assemblePack, type CoursePack, type PackFiles } from './pack';
import { islandChapter, mergePackPart } from './split';

/**
 * Loads a course pack in the browser (docs/specs/COURSE-PACKS.md §2): every JSON file of
 * `courses/<id>/` but `course.json` (already in the catalog), the served files (`public/`) and the
 * voice lines' source (`voice/`). The pack comes in parts (src/course/split.ts): the core is one lazy
 * chunk per course, `course-<id>` (tools/course-pack/vite-plugin.ts), that a voyage loads, and the
 * title never does; each chapter's part is a JSON file that loads when its island streams in, or when
 * something asks for it (a recap's quiz, a Logbook page, a battle's question).
 */

interface CourseState {
  meta: CourseMeta;
  /** The core files with every part loaded so far merged in. */
  files: PackFiles;
  parts: Readonly<Record<string, string | PackFiles>>;
  loaded: Set<string>;
  inflight: Map<string, Promise<void>>;
  /** The pack assembled from `files`. */
  pack: CoursePack;
}

const cores = new Map<string, Promise<CourseState>>();
const states = new Map<string, CourseState>();

/** How long to wait before each new try of a chapter part that failed (offline, a 5xx). */
const RETRY_MS = [1000, 3000] as const;

/** Fetches a chapter part (tried again after `RETRY_MS`; the last failure rejects). */
async function fetchPart(url: string, priority: RequestPriority): Promise<PackFiles> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { priority });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
      return (await r.json()) as PackFiles;
    } catch (error) {
      if (i >= RETRY_MS.length) throw error;
      await new Promise((r) => setTimeout(r, RETRY_MS[i]));
    }
  }
}

/** Fetches a course's core (once; a failed fetch isn't kept, so the next voyage tries again). */
function loadCore(id: string): Promise<CourseState> {
  let p = cores.get(id);
  if (!p) {
    const meta = courseMeta(id);
    const load = packs[id];
    p =
      meta && load
        ? load().then(({ core, parts }) => {
            const s: CourseState = {
              meta,
              files: core,
              parts,
              loaded: new Set(),
              inflight: new Map(),
              pack: assemblePack(meta, core),
            };
            states.set(id, s);
            return s;
          })
        : Promise.reject(new Error(`No course "${id}" in the catalog`));
    p.catch(() => cores.delete(id));
    cores.set(id, p);
  }
  return p;
}

/**
 * Loads a chapter's part and merges it in (once; a failed load isn't kept, so the next ask tries
 * again). If the course is active, the hooks that read the part before it was in run again.
 */
function loadPart(s: CourseState, chapter: string, priority: RequestPriority): Promise<void> {
  const src = s.parts[chapter];
  if (!src || s.loaded.has(chapter)) return Promise.resolve();
  let p = s.inflight.get(chapter);
  if (!p) {
    p = (typeof src === 'string' ? fetchPart(src, priority) : Promise.resolve(src)).then((part) => {
      s.files = mergePackPart(s.files, part);
      s.loaded.add(chapter);
      s.pack = assemblePack(s.meta, s.files);
      addCoursePart(s.pack, chapter);
    });
    const forget = () => s.inflight.delete(chapter);
    p.then(forget, forget);
    s.inflight.set(chapter, p);
  }
  return p;
}

/**
 * Loads a course pack and makes it the active one. `islands` names the islands whose chapter parts
 * it waits for (a voyage: Anchorage, which is built with the world); the others load later. Without
 * it, every part loads first (dev pages, tests).
 */
export async function activateCourse(
  id: string = COURSE.id,
  o: { islands?: readonly string[] } = {},
): Promise<CoursePack> {
  const s = await loadCore(id);
  const chapters = o.islands
    ? o.islands.flatMap((i) => islandChapter(s.meta, i) ?? [])
    : Object.keys(s.parts);
  await Promise.all(chapters.map((c) => loadPart(s, c, 'auto')));
  setActiveCourse(
    s.pack,
    Object.keys(s.parts).filter((c) => !s.loaded.has(c)),
  );
  return s.pack;
}

/** The active course's state (null before a voyage has loaded one). */
function activeState(): CourseState | null {
  return hasActiveCourse() ? (states.get(coursePack().id) ?? null) : null;
}

/**
 * Loads a chapter's part for the active course (at once if it's in, or the chapter has none).
 * `priority` is the request's: 'low' for a prefetch nothing waits on yet (skill §3, streaming audio).
 */
export function loadChapterPart(chapter: string, priority: RequestPriority = 'auto'): Promise<void> {
  const s = activeState();
  return s ? loadPart(s, chapter, priority) : Promise.resolve();
}

/** Loads the chapter part of an island (its quests' scripts and its puzzles) for the active course. */
export function loadIslandPart(island: string, priority: RequestPriority = 'auto'): Promise<void> {
  const s = activeState();
  const chapter = s && islandChapter(s.meta, island);
  return s && chapter ? loadPart(s, chapter, priority) : Promise.resolve();
}

/** The chapters some quizzes or pages are in (from the index, which the core has whole). */
function chaptersOf(s: CourseState, ids: readonly string[], kind: 'quizzes' | 'pages'): string[] {
  const want = new Set(ids);
  return s.pack.index.filter((c) => c[kind].some((x) => want.has(x.id))).map((c) => c.chapter);
}

/** Loads the chapter parts that hold these quizzes (a recap's, a battle's). */
export function loadQuizParts(ids: readonly string[], priority: RequestPriority = 'auto'): Promise<void> {
  const s = activeState();
  if (!s) return Promise.resolve();
  return Promise.all(chaptersOf(s, ids, 'quizzes').map((c) => loadPart(s, c, priority))).then(
    () => undefined,
  );
}

/** Loads the chapter parts that hold these Logbook pages. */
export function loadPageParts(ids: readonly string[], priority: RequestPriority = 'auto'): Promise<void> {
  const s = activeState();
  if (!s) return Promise.resolve();
  return Promise.all(chaptersOf(s, ids, 'pages').map((c) => loadPart(s, c, priority))).then(() => undefined);
}
