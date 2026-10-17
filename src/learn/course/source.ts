import {
  COURSE_CHAPTERS,
  COURSE_RAW,
  COURSE_REPO,
  chapterUrl,
  repoPath,
  snapshotPath,
  type ChapterId,
} from './chapters';
import { courseAssetBase } from '../../course/catalog';
import { parseCatalog } from './lock';
import { linkRefs } from './markdown';
import { imageRefs, parseSections, type CourseSection } from './sections';

/**
 * CourseSource (PLAN §8.2): the course's text and pictures, fetched live from raw.githubusercontent.com
 * (never the GitHub REST API) with the course pack's bundled snapshot (`courses/<id>/public/course/**`) as a quiet fallback when
 * the fetch fails, the player is offline, or the parse breaks. `?course=<sha>` pins a commit and
 * `?course=snapshot` skips the network. Each document is fetched once per session and kept, so text
 * never changes mid-conversation; the Service Worker (public/sw.js) caches the responses
 * stale-while-revalidate, so a new course version shows up the next time the game starts.
 */

export type Origin = 'live' | 'snapshot';

export interface CourseImageInfo {
  /** Path in the course repo, e.g. `00-setup/assets/app-sign-in.webp`. */
  path: string;
  alt: string;
  /** The section the image appears in. */
  anchor: string;
}

export interface ChapterDoc {
  chapter: ChapterId;
  origin: Origin;
  sections: readonly CourseSection[];
  byAnchor: ReadonlyMap<string, CourseSection>;
  /** Every image the README shows, keyed by its path in the course repo. */
  images: ReadonlyMap<string, CourseImageInfo>;
  /** Reference-link definitions (`[fork-repo-link]: …`), which sit at the end of the README. */
  refs: ReadonlyMap<string, string>;
}

export interface GlossaryDoc {
  origin: Origin;
  byAnchor: ReadonlyMap<string, CourseSection>;
}

const TIMEOUT_MS = 6000;
const SHA = /^[0-9a-f]{7,40}$/i;

/** The course commit to read: `main`, a `?course=<sha>` pin, or null for `?course=snapshot`. */
export function courseRef(search = typeof location === 'undefined' ? '' : location.search): string | null {
  const q = new URLSearchParams(search).get('course');
  if (q === 'snapshot' || q === 'offline') return null;
  return q && SHA.test(q) ? q.toLowerCase() : 'main';
}

const base = () => courseAssetBase();

/** Live URL for a course repo path at the current ref. */
export function liveUrl(path: string, ref = courseRef()): string {
  return `${COURSE_RAW}/${ref ?? 'main'}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Bundled snapshot URL for a course repo path (null when we don't bundle that file). */
export function snapshotUrl(path: string): string | null {
  if (path === 'GLOSSARY.md' || path === 'README.md') return `${base()}course/${path}`;
  const readme = /^([0-9]{2}-[a-z0-9-]+)\/README\.md$/.exec(path);
  if (readme) {
    const ch = COURSE_CHAPTERS.find((c) => c.id === readme[1]);
    return ch ? `${base()}course/${ch.short}/README.md` : null;
  }
  const snap = snapshotPath(path);
  return snap ? `${base()}${snap}` : null;
}

async function fetchText(url: string): Promise<string> {
  const ctrl = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : 0;
  try {
    const res = await fetch(url, { signal: ctrl?.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildChapter(chapter: ChapterId, origin: Origin, markdown: string): ChapterDoc {
  const sections = parseSections(markdown);
  // A README with no chapter headings means the folder moved or the file isn't markdown any more.
  if (!sections.some((s) => s.level === 2)) throw new Error('unexpected README');
  const byAnchor = new Map(sections.map((s) => [s.anchor, s]));
  const images = new Map<string, CourseImageInfo>();
  // Deepest section first, so an image belongs to the innermost heading that shows it.
  for (const s of [...sections].sort((a, b) => b.level - a.level))
    for (const ref of imageRefs(s.markdown)) {
      const path = repoPath(chapter, ref.path);
      if (path && !images.has(path)) images.set(path, { path, alt: ref.alt.trim(), anchor: s.anchor });
    }
  return { chapter, origin, sections, byAnchor, images, refs: linkRefs(markdown) };
}

const docs = new Map<string, Promise<unknown>>();

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = docs.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    docs.set(key, p);
    p.catch(() => docs.delete(key));
  }
  return p;
}

/** The bundled snapshot of a chapter (rejects when the chapter isn't in the snapshot). */
export function snapshotChapter(chapter: ChapterId): Promise<ChapterDoc> {
  return once(`snap:${chapter}`, async () => {
    const url = snapshotUrl(`${chapter}/README.md`);
    if (!url) throw new Error(`no snapshot for ${chapter}`);
    return buildChapter(chapter, 'snapshot', await fetchText(url));
  });
}

/** A chapter, live when possible and the snapshot otherwise. */
export function loadChapter(chapter: ChapterId): Promise<ChapterDoc> {
  const ref = courseRef();
  return once(`ch:${ref}:${chapter}`, async () => {
    const doc = await readChapter(chapter, ref);
    ready.set(chapter, doc);
    return doc;
  });
}

async function readChapter(chapter: ChapterId, ref: string | null): Promise<ChapterDoc> {
  if (ref) {
    try {
      return buildChapter(chapter, 'live', await fetchText(liveUrl(`${chapter}/README.md`, ref)));
    } catch {
      // Offline, blocked, renamed, or unparseable: the snapshot covers it.
    }
  }
  return snapshotChapter(chapter);
}

const ready = new Map<string, ChapterDoc>();

/** Synchronous view of an already-loaded chapter (for first render without a loading flash). */
export function peekChapter(chapter: ChapterId): ChapterDoc | undefined {
  return ready.get(chapter);
}

export function prefetchChapter(chapter: ChapterId): Promise<ChapterDoc | null> {
  return loadChapter(chapter).catch(() => null);
}

export function loadGlossary(): Promise<GlossaryDoc> {
  const ref = courseRef();
  return once(`glossary:${ref}`, async () => {
    const build = (origin: Origin, md: string): GlossaryDoc => {
      const sections = parseSections(md).filter((s) => s.level === 2);
      if (!sections.length) throw new Error('unexpected glossary');
      return { origin, byAnchor: new Map(sections.map((s) => [s.anchor, s])) };
    };
    if (ref)
      try {
        return build('live', await fetchText(liveUrl('GLOSSARY.md', ref)));
      } catch {
        // Fall through to the snapshot.
      }
    return build('snapshot', await fetchText(snapshotUrl('GLOSSARY.md')!));
  });
}

/** The chapters the course lists in its README (live only: the snapshot can't know about new ones). */
export function loadCatalog(): Promise<{ id: string; num: string; title: string; url: string }[]> {
  const ref = courseRef();
  if (!ref) return Promise.resolve([]);
  return once(`catalog:${ref}`, async () => {
    try {
      return parseCatalog(await fetchText(liveUrl('README.md', ref))).map((c) => ({
        ...c,
        url: chapterUrl(c.id),
      }));
    } catch {
      return [];
    }
  });
}

export interface ResolvedSection {
  section: CourseSection | null;
  origin: Origin;
  /** "Open in the course ↗": the section's anchor, or the chapter README's top when it's gone. */
  href: string;
  /** The anchor no longer exists in the course we read. */
  moved: boolean;
  /** The README's reference-link definitions, for rendering the section. */
  refs: ReadonlyMap<string, string>;
}

/**
 * A section by chapter and anchor (PLAN §8.3). Live text when the anchor still exists; when it was
 * renamed or removed, the snapshot's copy and a link to the top of the chapter README.
 */
export async function resolveSection(chapter: ChapterId, anchor: string): Promise<ResolvedSection> {
  const doc = await loadChapter(chapter).catch(() => null);
  const hit = doc?.byAnchor.get(anchor);
  if (doc && hit)
    return {
      section: hit,
      origin: doc.origin,
      href: chapterUrl(chapter, anchor),
      moved: false,
      refs: doc.refs,
    };
  const snap = doc?.origin === 'snapshot' ? doc : await snapshotChapter(chapter).catch(() => null);
  return {
    section: snap?.byAnchor.get(anchor) ?? null,
    origin: 'snapshot',
    href: chapterUrl(chapter),
    moved: true,
    refs: snap?.refs ?? new Map(),
  };
}

export interface ResolvedImage {
  src: string;
  /** The course's own alt text when it has one. */
  alt: string | null;
  origin: Origin;
  /** Where the course shows it: chapter and anchor. */
  chapter: ChapterId | null;
  anchor: string | null;
}

/**
 * The picture to show for a course image (PLAN §8.3): the live file while a chapter we read still
 * shows it, otherwise the bundled snapshot. `bundled` is the snapshot path under public/.
 */
export async function resolveImage(bundled: string, chapters: readonly ChapterId[]): Promise<ResolvedImage> {
  const order = imageChapters(bundled, chapters);
  const docs = await Promise.all(order.map((ch) => loadChapter(ch).catch(() => null)));
  return pickImage(bundled, docs);
}

/** `resolveImage` without waiting, when every chapter it needs is loaded already. */
export function peekImage(bundled: string, chapters: readonly ChapterId[]): ResolvedImage | undefined {
  const docs = imageChapters(bundled, chapters).map((ch) => ready.get(ch));
  return docs.every(Boolean) ? pickImage(bundled, docs) : undefined;
}

/** The chapters to look in for an image: the one whose folder holds it first, then the others. */
function imageChapters(bundled: string, chapters: readonly ChapterId[]): ChapterId[] {
  const owner = /^([0-9]{2}-[a-z0-9-]+)\//.exec(repoPathForSnapshot(bundled) ?? '')?.[1];
  const known = COURSE_CHAPTERS.find((c) => c.id === owner)?.id;
  return [...new Set([...(known ? [known] : []), ...chapters])];
}

export function pickImage(bundled: string, docs: readonly (ChapterDoc | null | undefined)[]): ResolvedImage {
  const path = repoPathForSnapshot(bundled);
  const fallback: ResolvedImage = {
    src: `${base()}${bundled}`,
    alt: null,
    origin: 'snapshot',
    chapter: null,
    anchor: null,
  };
  if (!path) return fallback;
  for (const doc of docs) {
    const info = doc?.images.get(path);
    if (!doc || !info) continue;
    const at = { alt: info.alt || null, chapter: doc.chapter, anchor: info.anchor };
    return doc.origin === 'live' ? { ...at, src: liveUrl(path), origin: 'live' } : { ...fallback, ...at };
  }
  return fallback;
}

/** `course/ch00/x.webp` → `00-setup/assets/x.webp`, `course/shared/x.webp` → `assets/x.webp`. */
export function repoPathForSnapshot(bundled: string): string | null {
  const m = /^course\/(shared|ch\d{2})\/([\w\-./]+)$/.exec(bundled);
  if (!m || m[2].includes('..')) return null;
  if (m[1] === 'shared') return `assets/${m[2]}`;
  const ch = COURSE_CHAPTERS.find((c) => c.short === m[1]);
  return ch ? `${ch.id}/assets/${m[2]}` : null;
}

/**
 * Link and image resolvers for rendering course markdown (relative paths → course URLs). `dir` is the
 * folder the file sits in ('' for the repo root, e.g. GLOSSARY.md) and `file` its name.
 */
export function chapterResolvers(dir: ChapterId | '', origin: Origin, file = 'README.md') {
  const blob = `https://github.com/${COURSE_REPO}/blob/main`;
  return {
    link: (href: string): string | null => {
      if (href.startsWith('#')) return `${blob}/${dir ? `${dir}/` : ''}${file}${href}`;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
      const [path, hash] = href.split('#');
      const full = repoPath(dir, path);
      if (full === null) return null;
      const kind = /\.[a-z0-9]+$/i.test(full) ? 'blob' : 'tree';
      return `https://github.com/${COURSE_REPO}/${kind}/main/${full}${hash ? `#${hash}` : ''}`;
    },
    image: (src: string): string | null => {
      if (/^https:\/\//i.test(src)) return src;
      const path = repoPath(dir, src);
      if (!path) return null;
      return origin === 'live' ? liveUrl(path) : snapshotUrl(path);
    },
  };
}

/** For tests: forget everything fetched. */
export function resetCourseSource(): void {
  docs.clear();
  ready.clear();
}
