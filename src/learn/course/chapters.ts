import { onCourseSelected, type CourseMeta } from '../../course/catalog';

/**
 * The course's chapters and where their files live (PLAN §8.2), from the course pack's `course.json`
 * (`source.chapters`, docs/specs/COURSE-PACKS.md). `id` is the chapter folder in the course's
 * repository, and `short` is its folder in the pack's snapshot (`courses/<id>/public/course/<short>/`).
 * Shared course images (the repo's root `assets/`) go in the snapshot's `shared/`.
 */
export let COURSE_CHAPTERS: CourseMeta['source']['chapters'] = [];

/** A chapter folder in the course's repository, e.g. "00-setup". */
export type ChapterId = string;

export let COURSE_REPO = '';
export let COURSE_RAW = '';
export let COURSE_BLOB = '';
// The current course's (live bindings: they follow the course picker).
onCourseSelected((c) => {
  COURSE_CHAPTERS = c.source.chapters;
  COURSE_REPO = c.source.repo;
  COURSE_RAW = `https://raw.githubusercontent.com/${COURSE_REPO}`;
  COURSE_BLOB = `https://github.com/${COURSE_REPO}/blob/${c.source.ref}`;
});

export function chapterShort(id: ChapterId): string {
  return COURSE_CHAPTERS.find((c) => c.id === id)?.short ?? id.slice(0, 2);
}

/**
 * The file a `SourceRef.chapter` names in the course's repository: a chapter's README
 * (`00-setup/README.md`) or an appendix (`appendix:git-worktrees` → `appendices/git-worktrees.md`).
 * `dir` is its folder, for its relative links and images.
 */
export function courseDoc(id: string): { dir: string; file: string; path: string } {
  if (id.startsWith('appendix:')) {
    const file = `${id.slice('appendix:'.length)}.md`;
    return { dir: 'appendices', file, path: `appendices/${file}` };
  }
  return { dir: id, file: 'README.md', path: `${id}/README.md` };
}

/** "Open in the course ↗" for a chapter (or an appendix): its file, at `anchor` when given. */
export function chapterUrl(id: string, anchor?: string): string {
  return `${COURSE_BLOB}/${courseDoc(id).path}${anchor ? `#${anchor}` : ''}`;
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
