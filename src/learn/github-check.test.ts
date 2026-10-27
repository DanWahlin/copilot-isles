import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkUrl, resetCheckLimit, runCheck, type CheckContext } from './github-check';

const ctx: CheckContext = {
  fork: { host: 'github.com', owner: 'robin-sample', repo: 'course-repo' },
  upstream: 'example-org/course-repo',
  practiceBranch: 'practice-one',
};

function reply(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('the opt-in GitHub checks', () => {
  beforeEach(() => resetCheckLimit());

  it('asks the public API once, with no token or cookies', async () => {
    const fetchFn = vi.fn(async () =>
      reply(200, { fork: true, parent: { full_name: 'example-org/course-repo' } }),
    );
    expect(await runCheck({ kind: 'repoExists' }, ctx, fetchFn, 0)).toEqual({ status: 'found' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/robin-sample/course-repo');
    expect(init.credentials).toBe('omit');
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });

  it("tells a fork of the course from a repository that isn't one", async () => {
    const own = vi.fn(async () => reply(200, { fork: false }));
    expect(await runCheck({ kind: 'repoExists' }, ctx, own, 0)).toEqual({
      status: 'missing',
      reason: 'notFork',
    });
    const other = vi.fn(async () =>
      reply(200, {
        fork: true,
        parent: { full_name: 'someone/else' },
        source: { full_name: 'someone/else' },
      }),
    );
    expect(await runCheck({ kind: 'repoExists' }, ctx, other, 0)).toEqual({
      status: 'missing',
      reason: 'otherParent',
    });
    // A fork of a fork: its source is the course.
    const deep = vi.fn(async () =>
      reply(200, {
        fork: true,
        parent: { full_name: 'a/b' },
        source: { full_name: 'Example-Org/Course-Repo' },
      }),
    );
    expect((await runCheck({ kind: 'repoExists' }, ctx, deep, 0)).status).toBe('found');
    expect(
      (
        await runCheck(
          { kind: 'repoExists' },
          ctx,
          vi.fn(async () => reply(404)),
          0,
        )
      ).status,
    ).toBe('missing');
  });

  it('checks a branch (the practice branch filled in) and pull requests', async () => {
    expect(checkUrl({ kind: 'branchExists', branch: '{practiceBranch}' }, ctx)).toBe(
      'https://api.github.com/repos/robin-sample/course-repo/branches/practice-one',
    );
    expect(checkUrl({ kind: 'prOpened' }, ctx)).toBe(
      'https://api.github.com/repos/robin-sample/course-repo/pulls?state=all&per_page=1',
    );
    expect(checkUrl({ kind: 'prOpened', branch: 'feat/x' }, ctx)).toContain('&head=robin-sample%3Afeat%2Fx');
    expect(
      (
        await runCheck(
          { kind: 'branchExists', branch: 'x' },
          ctx,
          vi.fn(async () => reply(200)),
          0,
        )
      ).status,
    ).toBe('found');
    expect(
      (
        await runCheck(
          { kind: 'prOpened' },
          ctx,
          vi.fn(async () => reply(200, [])),
          0,
        )
      ).status,
    ).toBe('missing');
    expect(
      (
        await runCheck(
          { kind: 'prOpened' },
          ctx,
          vi.fn(async () => reply(200, [{ id: 1 }])),
          0,
        )
      ).status,
    ).toBe('found');
  });

  it("counts only a pull request the player opened when the setup's branches are left out", async () => {
    const seeded = ['fix-empty-state-copy', 'practice-failing-stats-check', 'feature-reading-dashboard'];
    const check = { kind: 'prOpened' as const, excludeHeads: seeded };
    expect(checkUrl(check, ctx)).toBe(
      'https://api.github.com/repos/robin-sample/course-repo/pulls?state=all&per_page=30',
    );
    const run = async (body: unknown) =>
      (
        await runCheck(
          check,
          ctx,
          vi.fn(async () => reply(200, body)),
          0,
        )
      ).status;
    expect(await run(seeded.map((ref) => ({ head: { ref } })))).toBe('missing');
    expect(await run([])).toBe('missing');
    expect(
      await run([...seeded.map((ref) => ({ head: { ref } })), { head: { ref: 'robin-bright-otter' } }]),
    ).toBe('found');
  });

  it('waits out a rate limit without asking again', async () => {
    const limited = vi.fn(async () =>
      reply(
        403,
        { message: 'API rate limit exceeded' },
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000' },
      ),
    );
    expect(await runCheck({ kind: 'repoExists' }, ctx, limited, 1_000_000)).toEqual({
      status: 'limited',
      resetAt: 2_000_000,
    });
    const later = vi.fn(async () =>
      reply(200, { fork: true, parent: { full_name: 'example-org/course-repo' } }),
    );
    expect((await runCheck({ kind: 'repoExists' }, ctx, later, 1_500_000)).status).toBe('limited');
    expect(later).not.toHaveBeenCalled();
    expect((await runCheck({ kind: 'repoExists' }, ctx, later, 2_000_001)).status).toBe('found');
    // A 403 with requests left is an error, not a limit.
    resetCheckLimit();
    expect(
      (
        await runCheck(
          { kind: 'repoExists' },
          ctx,
          vi.fn(async () => reply(403, {}, { 'x-ratelimit-remaining': '12' })),
          0,
        )
      ).status,
    ).toBe('error');
  });

  it('falls back quietly when GitHub can’t be reached, and leaves other hosts alone', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await runCheck({ kind: 'repoExists' }, ctx, offline, 0)).toEqual({
      status: 'error',
      reason: 'network',
    });
    const ghe = vi.fn(async () => reply(200));
    expect(
      await runCheck({ kind: 'repoExists' }, { ...ctx, fork: { ...ctx.fork, host: 'octo.ghe.com' } }, ghe, 0),
    ).toEqual({ status: 'unsupported', reason: 'host' });
    expect(ghe).not.toHaveBeenCalled();
    expect(
      (
        await runCheck(
          { kind: 'repoExists' },
          ctx,
          vi.fn(async () => reply(500)),
          0,
        )
      ).status,
    ).toBe('error');
  });
});
