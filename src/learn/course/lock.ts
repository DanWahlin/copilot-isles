import type { ChapterId } from './chapters';
import { boldTerms, normalizeForCompare, parseSections } from './sections';

/**
 * A course pack's `lock.json` (PLAN §8.2-8.4, `courses/<id>/lock.json`): the bundled snapshot's course commit and a hash for
 * every section and image. `tools/course/sync.mjs` writes it, the drift report compares authored
 * `SourceRef`s against it, and the tests check the snapshot still matches it.
 */
export interface CourseLock {
  $comment: string;
  repo: string;
  /** The branch the snapshot follows. */
  ref: string;
  /** The course commit the snapshot was taken from. */
  sha: string;
  syncedAt: string;
  /** Every chapter the course lists in its README, snapshotted or not (new ones show as uncharted). */
  catalog: { id: string; num: string; title: string }[];
  chapters: Partial<Record<ChapterId, ChapterLock>>;
  /**
   * The course's appendices the pack names (`course.json` → `source.appendices`), by name: a line
   * cites one as `{"chapter": "appendix:<name>", …}` (`APPENDIX`). Older locks have none.
   */
  appendices?: Partial<Record<string, AppendixLock>>;
  glossary: { hash: string; terms: Record<string, SectionLock> };
  license: { hash: string };
  /** Keyed by snapshot path under `public/`, e.g. `course/ch00/app-sign-in.webp`. */
  images: Record<string, ImageLock>;
}

export interface ChapterLock {
  short: string;
  title: string;
  /** Hash of the whole README. */
  hash: string;
  sections: Record<string, SectionLock>;
}

/** One appendix (`appendices/<name>.md`): like a chapter, without a snapshot folder of its own. */
export interface AppendixLock {
  /** Its file in the course's repository, e.g. `appendices/git-worktrees.md`. */
  path: string;
  title: string;
  /** Hash of the whole file. */
  hash: string;
  sections: Record<string, SectionLock>;
  /** The snapshotted chapters whose README links to it (src/course/split.ts puts it with one). */
  linkedFrom: ChapterId[];
}

/** What a `SourceRef` cites: a chapter's README or an appendix. */
export type DocLock = Pick<ChapterLock, 'title' | 'hash' | 'sections'>;

/** A `SourceRef.chapter` that names an appendix: `appendix:git-worktrees`. */
export const APPENDIX = 'appendix:';

/** The appendix a `SourceRef.chapter` names, or null for a chapter. */
export function appendixName(id: string): string | null {
  return id.startsWith(APPENDIX) ? id.slice(APPENDIX.length) : null;
}

/** A course appendix's file in the course's repository. */
export function appendixPath(name: string): string {
  return `appendices/${name}.md`;
}

/** The chapter or appendix a `SourceRef.chapter` names, from the lock (undefined when it isn't in it). */
export function lockDoc(lock: Pick<CourseLock, 'chapters' | 'appendices'>, id: string): DocLock | undefined {
  const name = appendixName(id);
  return name === null ? lock.chapters[id] : lock.appendices?.[name];
}

export interface SectionLock {
  title: string;
  level: number;
  hash: string;
  /** Course image paths (relative to the repo root) the section shows. */
  images?: string[];
  /** Bolded UI names in the section (for the drift report's UI-term check). */
  terms?: string[];
}

export interface ImageLock {
  /** Path in the course repo, or null for an image we derived from one (`derivedFrom`). */
  upstream: string | null;
  derivedFrom?: string;
  /** SHA-256 of the upstream file at `sha`. */
  sha256?: string;
  /**
   * SHA-256 of the bundled file when it differs from upstream. Images that authored content
   * (hotspot rects, alt text, captions) was written against are pinned: sync never overwrites them,
   * and the drift report lists them until someone re-checks the content and re-syncs with `--unpin`.
   */
  bundled?: string;
  pinned?: boolean;
  bytes: number;
}

/** First 12 hex digits of a SHA-256: the hash format in the lock and in `SourceRef`s. */
export const HASH_LENGTH = 12;

export type HashFn = (text: string) => string;

/** One chapter README → its lock entry. `hash` returns a hex SHA-256 of a string. */
export function chapterLock(
  markdown: string,
  chapterDir: string,
  title: string,
  short: string,
  hash: HashFn,
  resolve: (dir: string, path: string) => string | null,
): ChapterLock {
  const sections: Record<string, SectionLock> = {};
  for (const s of parseSections(markdown)) {
    const images = s.images.map((p) => resolve(chapterDir, p)).filter((p): p is string => !!p);
    sections[s.anchor] = {
      title: s.title,
      level: s.level,
      hash: sectionHash(s.markdown, hash),
      ...(images.length ? { images } : {}),
      ...(s.terms.length ? { terms: s.terms } : {}),
    };
  }
  return { short, title, hash: hash(markdown).slice(0, HASH_LENGTH), sections };
}

export function sectionHash(markdown: string, hash: HashFn): string {
  return hash(normalizeForCompare(markdown)).slice(0, HASH_LENGTH);
}

/** One appendix → its lock entry: its sections as a chapter's, and the chapters that link to it. */
export function appendixLock(
  markdown: string,
  name: string,
  linkedFrom: readonly ChapterId[],
  hash: HashFn,
  resolve: (dir: string, path: string) => string | null,
): AppendixLock {
  const path = appendixPath(name);
  const title = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown)?.[1] ?? name;
  const { sections, hash: whole } = chapterLock(markdown, 'appendices', title, '', hash, resolve);
  return { path, title, hash: whole, sections, linkedFrom: [...linkedFrom] };
}

/** True when a chapter README links to the appendix (`](../appendices/<name>.md#…)`, or a reference link). */
export function linksAppendix(readme: string, name: string): boolean {
  const file = `appendices/${name}.md`.replace(/[.\\-]/g, (c) => `\\${c}`);
  return new RegExp(`(?:\\]\\(|^\\[[^\\]]+\\]:\\s*)(?:\\.\\.?/)*${file}(?:#[\\w-]*)?(?=[)\\s]|$)`, 'm').test(
    readme,
  );
}

/** The glossary's `## Term` sections, keyed by anchor. */
export function glossaryLock(markdown: string, hash: HashFn): CourseLock['glossary'] {
  const terms: Record<string, SectionLock> = {};
  for (const s of parseSections(markdown)) {
    if (s.level !== 2) continue;
    const t = boldTerms(s.markdown);
    terms[s.anchor] = {
      title: s.title,
      level: s.level,
      hash: sectionHash(s.markdown, hash),
      ...(t.length ? { terms: t } : {}),
    };
  }
  return { hash: hash(markdown).slice(0, HASH_LENGTH), terms };
}

// A row may put an emoji before the link ("| 00 | 🚀 [Quick Start](./00-quick-start/README.md) |").
const CATALOG_ROW = /^\|\s*(\d{2})\s*\|[^[|\n]*\[([^\]]+)\]\(\.?\/?([0-9]{2}-[a-z0-9-]+)\/README\.md\)/gm;

/** The chapter table in the course's root README: `| 00 | [Setup](./00-setup/README.md) | … |`. */
export function parseCatalog(rootReadme: string): CourseLock['catalog'] {
  const out: CourseLock['catalog'] = [];
  for (const m of rootReadme.matchAll(CATALOG_ROW))
    if (!out.some((c) => c.id === m[3])) out.push({ id: m[3], num: m[1], title: m[2].trim() });
  return out;
}
