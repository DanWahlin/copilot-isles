import type { AppTaskCheck } from './learning';
import type { ForkRef } from './fork';

/**
 * Opt-in, read-only checks that a real-app task left public evidence on GitHub (src/learn/learning.ts
 * `check`): the player's fork exists and is a fork of the course, a branch is in it, it has a pull
 * request. Only when the player turned the checks on (Settings → GitHub checks) and gave their fork.
 *
 * The browser asks GitHub's public REST API with no token (nothing secret ships, and nothing's sent
 * but the fork's public name). That API allows 60 requests an hour per address without a token, so a
 * limit reached waits for its reset (no request until then), and any failure falls back to the
 * player's own word: a check can tick a task, never untick one.
 */

export type CheckStatus = 'found' | 'missing' | 'limited' | 'error' | 'unsupported';

export interface CheckResult {
  status: CheckStatus;
  /** When the API allows requests again (ms since 1970), for `limited`. */
  resetAt?: number;
  /** A short reason for `missing` or `error` (for the card's line). */
  reason?: 'notFork' | 'otherParent' | 'http' | 'network' | 'host';
}

export const GITHUB_API = 'https://api.github.com';

/** What a check fills in: the fork, the course's repository and its practice branch. */
export interface CheckContext {
  fork: ForkRef;
  /** The course's repository, `owner/name` (`course.json` → `source.repo`). */
  upstream: string;
  /** The course's practice branch (`course.json` → `practice.branch`), for `{practiceBranch}`. */
  practiceBranch: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** No request before this time (ms since 1970): the API said its limit was reached. */
let limitedUntil = 0;

/** Tests: forget a limit. */
export function resetCheckLimit(): void {
  limitedUntil = 0;
}

const enc = encodeURIComponent;

/** The branch a check names, with `{practiceBranch}` filled in. */
export function checkBranch(check: AppTaskCheck, ctx: CheckContext): string {
  return (check.branch ?? '').split('{practiceBranch}').join(ctx.practiceBranch);
}

/** The API request a check makes (one per check). */
export function checkUrl(check: AppTaskCheck, ctx: CheckContext): string {
  const repo = `${GITHUB_API}/repos/${enc(ctx.fork.owner)}/${enc(ctx.fork.repo)}`;
  if (check.kind === 'repoExists') return repo;
  if (check.kind === 'branchExists') return `${repo}/branches/${enc(checkBranch(check, ctx))}`;
  const head = check.branch ? `&head=${enc(`${ctx.fork.owner}:${checkBranch(check, ctx)}`)}` : '';
  // With heads to leave out, one page of the latest pull requests (a fork has a handful).
  const page = check.excludeHeads?.length ? 30 : 1;
  return `${repo}/pulls?state=all&per_page=${page}${head}`;
}

/** The API's rate-limit reply: 403 or 429 with no requests left (or a `retry-after`). */
function limitOf(res: Response, now: number): number | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const left = res.headers.get('x-ratelimit-remaining');
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  const retry = Number(res.headers.get('retry-after'));
  if (left !== '0' && !(retry > 0) && res.status !== 429) return null;
  if (retry > 0) return now + retry * 1000;
  return reset > 0 ? reset * 1000 : now + 60 * 60 * 1000;
}

/** Runs a check. Never throws: a failure is `error` (the player's own word stands). */
export async function runCheck(
  check: AppTaskCheck,
  ctx: CheckContext,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  now: number = Date.now(),
): Promise<CheckResult> {
  // The public API is github.com's; an Enterprise host's API needs its own sign-in.
  if (ctx.fork.host !== 'github.com') return { status: 'unsupported', reason: 'host' };
  if (now < limitedUntil) return { status: 'limited', resetAt: limitedUntil };
  let res: Response;
  try {
    res = await fetchFn(checkUrl(check, ctx), {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    return { status: 'error', reason: 'network' };
  }
  const limit = limitOf(res, now);
  if (limit !== null) {
    limitedUntil = limit;
    return { status: 'limited', resetAt: limit };
  }
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) return { status: 'error', reason: 'http' };
  if (check.kind === 'branchExists') return { status: 'found' };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'error', reason: 'http' };
  }
  if (check.kind === 'prOpened')
    return prFound(body, check.excludeHeads) ? { status: 'found' } : { status: 'missing' };
  const repo = body as { fork?: unknown; parent?: { full_name?: unknown }; source?: { full_name?: unknown } };
  if (repo.fork !== true) return { status: 'missing', reason: 'notFork' };
  const up = ctx.upstream.toLowerCase();
  const parent = String(repo.parent?.full_name ?? '').toLowerCase();
  const source = String(repo.source?.full_name ?? '').toLowerCase();
  return parent === up || source === up ? { status: 'found' } : { status: 'missing', reason: 'otherParent' };
}

/** A pull request in the reply whose branch isn't one of `exclude` (any one, with no list). */
function prFound(body: unknown, exclude: readonly string[] | undefined): boolean {
  if (!Array.isArray(body)) return false;
  if (!exclude?.length) return body.length > 0;
  return body.some((pr: { head?: { ref?: unknown } }) => !exclude.includes(String(pr?.head?.ref ?? '')));
}
