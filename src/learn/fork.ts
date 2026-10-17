import { COURSE } from '../course/catalog';

/**
 * The player's fork of the course repository, typed into Ezra's register or at the crane. It's parsed
 * and checked here, on the device only: the game never calls GitHub to look it up (privacy), and it's
 * kept in the local save. Chapter 00 · Connect to Your Repository has the player fork the course;
 * the fork's URL is what the browser shows right after.
 */
export interface ForkRef {
  /** `github.com`, or a GitHub Enterprise Cloud host such as `octo.ghe.com` (Chapter 00 · Installation). */
  host: string;
  owner: string;
  repo: string;
}

export type ForkParse = { ok: true; fork: ForkRef; warning: string | null } | { ok: false; error: string };

/** The course repository's name (the pack's `practice.repoName`). A fork keeps it unless the player renamed it. */
export const COURSE_REPO = COURSE.practice.repoName;
/** What the game shows when the player hasn't told it their fork. */
export const FORK_PLACEHOLDER = `your-handle/${COURSE_REPO}`;
/** Longer than any real GitHub URL a player would paste (owner 39 + name 100 + host and path). */
export const FORK_INPUT_MAX = 200;

// GitHub owners: 1-39 letters, digits, or hyphens, not starting or ending with a hyphen.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
// Repository names: up to 100 letters, digits, `.`, `_`, or `-` (and never `.` or `..`).
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const HOST = /^(?:www\.)?(github\.com|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ghe\.com)$/i;

/**
 * Reads what the player typed: `https://github.com/owner/repo`, `github.com/owner/repo`,
 * `owner/repo`, an SSH remote (`git@github.com:owner/repo.git`), with or without a trailing `.git`
 * or `/`. Extra path after the repository (`/actions`, `/tree/main`), a query, or a hash is
 * ignored, so a URL copied from any page of the fork works.
 */
export function parseFork(input: unknown): ForkParse {
  if (typeof input !== 'string') return { ok: false, error: 'Type your fork’s address.' };
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Type your fork’s address.' };
  if (raw.length > FORK_INPUT_MAX) return { ok: false, error: 'That’s too long for a fork’s address.' };
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(raw))
    return { ok: false, error: 'A fork’s address has no spaces in it.' };
  if (/[^\x21-\x7e]/.test(raw))
    return { ok: false, error: 'GitHub names only use letters, digits, hyphens, dots, and underscores.' };

  let host = 'github.com';
  let path: string;
  const ssh = /^git@([^:/]+):(.+)$/.exec(raw);
  const url = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(.*)$/i.exec(raw);
  if (ssh) {
    if (!HOST.test(ssh[1]!)) return notGitHub();
    host = ssh[1]!.toLowerCase().replace(/^www\./, '');
    path = ssh[2]!;
  } else if (url) {
    if (!/^https?$/i.test(url[1]!)) return notGitHub();
    if (!HOST.test(url[2]!)) return notGitHub();
    host = url[2]!.toLowerCase().replace(/^www\./, '');
    path = url[3]!;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // `javascript:`, `data:`, `file:`, and other schemes without `//`.
    return notGitHub();
  } else {
    const first = raw.split('/')[0]!;
    if (first.includes('.')) {
      if (!HOST.test(first)) return notGitHub();
      host = first.toLowerCase().replace(/^www\./, '');
      path = raw.slice(first.length);
    } else path = raw;
  }

  const parts = path.split(/[?#]/)[0]!.split('/').filter(Boolean);
  if (parts.length < 2)
    return {
      ok: false,
      error: `Add the repository name after the owner, like ${FORK_PLACEHOLDER}.`,
    };
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, '');
  if (!OWNER.test(owner))
    return {
      ok: false,
      error: `“${owner}” isn’t a GitHub owner name. Owners use letters, digits, and hyphens.`,
    };
  if (!REPO.test(repo) || repo === '.' || repo === '..')
    return {
      ok: false,
      error: `“${repo}” isn’t a repository name. Names use letters, digits, hyphens, dots, and underscores.`,
    };
  if (host === 'github.com' && owner.toLowerCase() === 'github' && repo.toLowerCase() === COURSE_REPO)
    return {
      ok: false,
      error: 'That’s the original course repository. Enter your fork, the copy under your own account.',
    };
  const warning =
    repo.toLowerCase() === COURSE_REPO
      ? null
      : `Forks are usually named ${COURSE_REPO}. If you renamed yours, that’s fine.`;
  return { ok: true, fork: { host, owner, repo }, warning };
}

function notGitHub(): ForkParse {
  return {
    ok: false,
    error: `Use your fork’s GitHub address, like https://github.com/${FORK_PLACEHOLDER}.`,
  };
}

/** `owner/repo`, as the setup script's `Repository:` line prints it. */
export function forkName(fork: ForkRef | null): string {
  return fork ? `${fork.owner}/${fork.repo}` : FORK_PLACEHOLDER;
}

/** The places in a fork the course sends the player (Chapter 00 · Add the Course Practice Items). */
export type ForkPlace = 'repo' | 'actions' | 'issues' | 'pulls' | 'branches' | 'settings';

const PLACE_PATH: Record<ForkPlace, string> = {
  repo: '',
  actions: '/actions',
  issues: '/issues',
  pulls: '/pulls',
  branches: '/branches',
  settings: '/settings',
};

export const PLACE_LABEL: Record<ForkPlace, string> = {
  repo: 'Your fork',
  actions: 'Actions',
  issues: 'Issues',
  pulls: 'Pull requests',
  branches: 'Branches',
  settings: 'Settings',
};

/** A link into the player's fork. Only built from a parsed `ForkRef`, so it's always https on GitHub. */
export function forkUrl(fork: ForkRef, place: ForkPlace = 'repo'): string {
  return `https://${fork.host}/${fork.owner}/${fork.repo}${PLACE_PATH[place]}`;
}

/** Re-checks a saved fork (old, hand-edited, or imported saves), or null if it's missing or bad. */
export function cleanFork(v: unknown): ForkRef | null {
  if (!v || typeof v !== 'object') return null;
  const f = v as Partial<ForkRef>;
  if (typeof f.host !== 'string' || typeof f.owner !== 'string' || typeof f.repo !== 'string') return null;
  const p = parseFork(`https://${f.host}/${f.owner}/${f.repo}`);
  return p.ok ? p.fork : null;
}
