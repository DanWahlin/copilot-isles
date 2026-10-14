import { describe, expect, it } from 'vitest';
import {
  cleanFork,
  COURSE_REPO,
  FORK_INPUT_MAX,
  FORK_PLACEHOLDER,
  forkName,
  forkUrl,
  parseFork,
  type ForkRef,
} from './fork';
import { Progress, parseProgress, type ProgressStorage } from './progress';
import { LearnStore } from './store';

const DAN: ForkRef = { host: 'github.com', owner: 'dan-sample', repo: COURSE_REPO };

const read = (input: unknown) => {
  const p = parseFork(input);
  return p.ok ? forkName(p.fork) : null;
};

describe('parseFork', () => {
  it.each([
    'https://github.com/dan-sample/copilot-app-for-beginners',
    'http://github.com/dan-sample/copilot-app-for-beginners',
    'https://www.github.com/dan-sample/copilot-app-for-beginners',
    'HTTPS://GitHub.com/dan-sample/copilot-app-for-beginners',
    'github.com/dan-sample/copilot-app-for-beginners',
    'dan-sample/copilot-app-for-beginners',
    '  dan-sample/copilot-app-for-beginners  ',
    'https://github.com/dan-sample/copilot-app-for-beginners/',
    'https://github.com/dan-sample/copilot-app-for-beginners.git',
    'https://github.com/dan-sample/copilot-app-for-beginners.git/',
    'dan-sample/copilot-app-for-beginners.git',
    'git@github.com:dan-sample/copilot-app-for-beginners.git',
    'https://github.com/dan-sample/copilot-app-for-beginners/actions',
    'https://github.com/dan-sample/copilot-app-for-beginners/tree/main/samples',
    'https://github.com/dan-sample/copilot-app-for-beginners?tab=readme-ov-file#readme',
  ])('reads %j as dan-sample/copilot-app-for-beginners', (input) => {
    const p = parseFork(input);
    expect(p).toMatchObject({ ok: true, warning: null, fork: DAN });
  });

  it('keeps the owner and name as typed, and a GitHub Enterprise Cloud host', () => {
    expect(read('Dan-Sample/Copilot-App-For-Beginners')).toBe('Dan-Sample/Copilot-App-For-Beginners');
    expect(parseFork('https://octo.ghe.com/dan/copilot-app-for-beginners')).toMatchObject({
      ok: true,
      fork: { host: 'octo.ghe.com', owner: 'dan', repo: COURSE_REPO },
    });
    expect(read('a/b')).toBe('a/b');
    expect(read('a1-b2/my.repo_name-2')).toBe('a1-b2/my.repo_name-2');
    expect(read(`${'a'.repeat(39)}/${'r'.repeat(100)}`)).toBe(`${'a'.repeat(39)}/${'r'.repeat(100)}`);
  });

  it('warns, but doesn’t block, when the fork has another name', () => {
    const p = parseFork('dan-sample/my-course');
    expect(p.ok).toBe(true);
    expect(p.ok && p.warning).toMatch(/copilot-app-for-beginners/);
    const same = parseFork('dan-sample/COPILOT-APP-FOR-BEGINNERS');
    expect(same.ok && same.warning).toBeNull();
  });

  it('refuses the original course repository', () => {
    for (const input of [
      'github/copilot-app-for-beginners',
      'https://github.com/github/copilot-app-for-beginners',
      'https://github.com/github/copilot-app-for-beginners/fork',
      'GitHub/Copilot-App-For-Beginners',
    ]) {
      const p = parseFork(input);
      expect(p.ok, input).toBe(false);
      expect(!p.ok && p.error, input).toMatch(/original course/);
    }
  });

  it.each([
    ['', /Type your fork/],
    ['   ', /Type your fork/],
    ['dan-sample', /repository name/],
    ['https://github.com/dan-sample', /repository name/],
    ['https://github.com/', /repository name/],
    ['javascript:alert(1)', /GitHub address/],
    ['JavaScript://github.com/a/b', /GitHub address/],
    ['javascript:alert(1)//github.com/a/b', /GitHub address/],
    ['data:text/html,<script>alert(1)</script>', /GitHub address|spaces/],
    ['file:///etc/passwd', /GitHub address/],
    ['ftp://github.com/a/b', /GitHub address/],
    ['https://gitlab.com/dan/copilot-app-for-beginners', /GitHub address/],
    ['https://github.com.evil.example/dan/repo', /GitHub address/],
    ['https://evil@github.com/dan/repo', /GitHub address/],
    ['https://github.com:8443/dan/repo', /GitHub address/],
    ['git@evil.example:dan/repo.git', /GitHub address/],
    ['dan sample/copilot-app-for-beginners', /spaces/],
    ['dan-sample/copilot app', /spaces/],
    ['dan\tsample/x', /spaces/],
    ['dan\u0000/x', /spaces/],
    ['dän/copilot-app-for-beginners', /letters, digits/],
    ['dan/cöpilot', /letters, digits/],
    ['dan/repo\u202e', /letters, digits/],
    ['ｄａｎ/repo', /letters, digits/],
    ['-dan/repo', /owner/],
    ['dan-/repo', /owner/],
    ['dan_sample/repo', /owner/],
    ['dan.sample/repo', /GitHub address/],
    [`${'a'.repeat(40)}/repo`, /owner/],
    [`dan/${'r'.repeat(101)}`, /repository name/],
    ['dan/..', /repository name/],
    ['dan/.', /repository name/],
    ['dan/<script>', /repository name/],
    ['dan/"onmouseover=x', /repository name/],
    ['dan/repo%2F..', /repository name/],
    [`dan/${'r'.repeat(FORK_INPUT_MAX)}`, /too long/],
  ])('rejects %j', (input, error) => {
    const p = parseFork(input);
    expect(p.ok).toBe(false);
    expect(!p.ok && p.error).toMatch(error);
  });

  it('rejects anything that isn’t a string', () => {
    for (const v of [null, undefined, 42, {}, ['a/b']]) expect(parseFork(v).ok).toBe(false);
  });
});

describe('fork links', () => {
  it('builds https links into the fork, and the placeholder name without one', () => {
    expect(forkUrl(DAN)).toBe('https://github.com/dan-sample/copilot-app-for-beginners');
    expect(forkUrl(DAN, 'actions')).toBe('https://github.com/dan-sample/copilot-app-for-beginners/actions');
    expect(forkUrl(DAN, 'issues')).toMatch(/\/issues$/);
    expect(forkUrl(DAN, 'pulls')).toMatch(/\/pulls$/);
    expect(forkUrl(DAN, 'settings')).toMatch(/\/settings$/);
    expect(forkUrl({ host: 'octo.ghe.com', owner: 'd', repo: 'r' }, 'actions')).toBe(
      'https://octo.ghe.com/d/r/actions',
    );
    expect(forkName(DAN)).toBe('dan-sample/copilot-app-for-beginners');
    expect(forkName(null)).toBe(FORK_PLACEHOLDER);
  });

  it('re-checks a saved fork and drops a tampered one', () => {
    expect(cleanFork(DAN)).toEqual(DAN);
    expect(cleanFork({ ...DAN, owner: 'javascript:alert(1)' })).toBeNull();
    expect(cleanFork({ ...DAN, host: 'evil.example' })).toBeNull();
    expect(cleanFork({ ...DAN, repo: 'a/b' })).toEqual({ ...DAN, repo: 'a' });
    expect(cleanFork({ host: 'github.com', owner: 'github', repo: COURSE_REPO })).toBeNull();
    expect(cleanFork('dan-sample/copilot-app-for-beginners')).toBeNull();
    expect(cleanFork(null)).toBeNull();
  });
});

describe('the fork in the save', () => {
  const memory = (): ProgressStorage & { raw: Map<string, string> } => {
    const raw = new Map<string, string>();
    return {
      raw,
      getItem: (k) => raw.get(k) ?? null,
      setItem: (k, v) => void raw.set(k, v),
      removeItem: (k) => void raw.delete(k),
    };
  };

  it('round-trips, and old saves without one still load', () => {
    const store = memory();
    const p = new Progress(store);
    p.setFork(DAN);
    expect(new Progress(store).data.fork).toEqual(DAN);
    p.setFork(null);
    expect(new Progress(store).data.fork).toBeNull();
    const old = parseProgress('{"v":1,"pages":["pg.fork"],"captainName":"Anne"}');
    expect(old).toMatchObject({ fork: null, pages: ['pg.fork'], captainName: 'Anne' });
    expect(parseProgress('{"v":1,"fork":{"host":"github.com","owner":"<x>","repo":"y"}}').fork).toBeNull();
    expect(parseProgress('{"v":1,"fork":"dan/x"}').fork).toBeNull();
  });

  it('asks through the store: saving keeps it, skipping changes nothing', async () => {
    const learn = new LearnStore(new Progress(memory()));
    const asked = learn.askFork('crane');
    expect(learn.getState().forkForm).toEqual({ from: 'crane' });
    expect(learn.busy).toBe(true);
    learn.saveFork(DAN);
    expect(await asked).toEqual(DAN);
    expect(learn.getState()).toMatchObject({ fork: DAN, forkForm: null });
    const again = learn.askFork('logbook');
    learn.skipFork();
    expect(await again).toBeNull();
    expect(learn.getState().fork).toEqual(DAN);
    expect(learn.progress.data.fork).toEqual(DAN);
    learn.newGame();
    expect(learn.getState().fork).toBeNull();
  });
});
