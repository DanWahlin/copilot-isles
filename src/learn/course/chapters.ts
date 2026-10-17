import { COURSE } from '../../course/catalog';

/**
 * The course's chapters and where their files live (PLAN §8.2), from the course pack's `course.json`
 * (`source.chapters`, docs/specs/COURSE-PACKS.md). `id` is the chapter folder in the course's
 * repository, and `short` is its folder in the pack's snapshot (`courses/<id>/public/course/<short>/`).
 * Shared course images (the repo's root `assets/`) go in the snapshot's `shared/`.
 */
export const COURSE_CHAPTERS = COURSE.source.chapters;

/** A chapter folder in the course's repository, e.g. "00-setup". */
export type ChapterId = string;

export const COURSE_REPO = COURSE.source.repo;
export const COURSE_RAW = `https://raw.githubusercontent.com/${COURSE_REPO}`;
export const COURSE_BLOB = `https://github.com/${COURSE_REPO}/blob/${COURSE.source.ref}`;

export function chapterShort(id: ChapterId): string {
  return COURSE_CHAPTERS.find((c) => c.id === id)?.short ?? id.slice(0, 2);
}

/** "Open in the course ↗" for a chapter: its README, at `anchor` when given. */
export function chapterUrl(id: string, anchor?: string): string {
  return `${COURSE_BLOB}/${id}/README.md${anchor ? `#${anchor}` : ''}`;
}

/**
 * A course file path relative to the repo root (e.g. `00-setup/assets/app-sign-in.webp`) → its
 * snapshot path under the pack's `public/` (`course/ch00/app-sign-in.webp`), or null for files we don't bundle.
 */
export function snapshotPath(repoPath: string): string | null {
  return snapshotPathIn(COURSE_CHAPTERS, repoPath);
}

/** `snapshotPath` with another course's chapters (tools/course/sync.mjs `--course`). */
export function snapshotPathIn(
  chapters: readonly { id: string; short: string }[],
  repoPath: string,
): string | null {
  const m = /^(?:([0-9]{2}-[a-z0-9-]+)\/)?assets\/([\w\-./]+)$/.exec(repoPath);
  if (!m || m[2].includes('..')) return null;
  if (!m[1]) return `course/shared/${m[2]}`;
  const ch = chapters.find((c) => c.id === m[1]);
  return `course/${ch ? ch.short : `ch${m[1].slice(0, 2)}`}/${m[2]}`;
}

/** Joins a path written in a chapter's README onto the chapter folder (`../assets/x` → `assets/x`). */
export function repoPath(chapterDir: string, path: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('/')) return null;
  const out: string[] = chapterDir ? chapterDir.split('/') : [];
  for (const part of path.split(/[?#]/)[0].split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}
