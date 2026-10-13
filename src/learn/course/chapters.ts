/**
 * The course's chapters and where their files live (PLAN §8.2). `dir` is the chapter folder in
 * github/copilot-app-for-beginners, and `short` is its folder in the bundled snapshot
 * (`public/course/<short>/`). Shared course images (the repo's root `assets/`) go in
 * `public/course/shared/`. `tools/course/sync.mjs` keeps a copy of this list.
 */
export const COURSE_CHAPTERS = [
  { id: '00-setup', short: 'ch00', title: 'Setup' },
  { id: '01-tour-the-app', short: 'ch01', title: 'Tour the App' },
  { id: '02-sessions-worktrees-context', short: 'ch02', title: 'Sessions, Worktrees, and Context' },
  { id: '03-development-workflows', short: 'ch03', title: 'Development and GitHub Workflows' },
  { id: '04-skills-custom-agents', short: 'ch04', title: 'Skills and Custom Agents' },
  { id: '05-mcp-plugins', short: 'ch05', title: 'MCP Servers and Plugins' },
  { id: '06-canvases', short: 'ch06', title: 'Canvases' },
  { id: '07-automations', short: 'ch07', title: 'Automations' },
] as const;

export type ChapterId = (typeof COURSE_CHAPTERS)[number]['id'];

export const COURSE_REPO = 'github/copilot-app-for-beginners';
export const COURSE_RAW = `https://raw.githubusercontent.com/${COURSE_REPO}`;
export const COURSE_BLOB = `https://github.com/${COURSE_REPO}/blob/main`;

export function chapterShort(id: ChapterId): string {
  return COURSE_CHAPTERS.find((c) => c.id === id)?.short ?? id.slice(0, 2);
}

/** "Open in the course ↗" for a chapter: its README, at `anchor` when given. */
export function chapterUrl(id: string, anchor?: string): string {
  return `${COURSE_BLOB}/${id}/README.md${anchor ? `#${anchor}` : ''}`;
}

/**
 * A course file path relative to the repo root (e.g. `00-setup/assets/app-sign-in.webp`) → its
 * snapshot path under `public/` (`course/ch00/app-sign-in.webp`), or null for files we don't bundle.
 */
export function snapshotPath(repoPath: string): string | null {
  const m = /^(?:([0-9]{2}-[a-z0-9-]+)\/)?assets\/([\w\-./]+)$/.exec(repoPath);
  if (!m || m[2].includes('..')) return null;
  if (!m[1]) return `course/shared/${m[2]}`;
  const ch = COURSE_CHAPTERS.find((c) => c.id === m[1]);
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
