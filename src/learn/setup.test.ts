import { describe, expect, it } from 'vitest';
import type { Dialogue } from '../game/dialogue';
import { practiceSessionReadout } from '../game/puzzles/practice-session';
import { runScript } from '../game/script';
import { PAGES, QUIZZES } from './content/index';
import { exportCode, importCode, parseProgress, Progress, type ProgressStorage } from './progress';
import {
  cleanModelName,
  cleanSetup,
  detectOs,
  EMPTY_SETUP,
  fillSetup,
  formatKeys,
  modelLabel,
  plainSetupText,
  parseBranch,
  parseIssue,
  setupMatches,
  type SetupData,
} from './setup';
import { LearnStore } from './store';
import type { ChoiceQuiz } from './types';

const memory = (): ProgressStorage => {
  const raw = new Map<string, string>();
  return {
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => void raw.set(k, v),
    removeItem: (k) => void raw.delete(k),
  };
};

const YOURS: SetupData = {
  os: 'linux',
  issue: 7,
  branch: 'copilot/empty-state-copy',
  model: { pick: 'other', name: 'Example Model 2' },
};

describe('your computer', () => {
  it('reads the browser’s platform, then navigator.platform, then the user agent', () => {
    expect(detectOs({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe('mac');
    expect(detectOs({ userAgentData: { platform: 'Windows' } })).toBe('windows');
    expect(detectOs({ userAgentData: { platform: 'Linux' } })).toBe('linux');
    expect(detectOs({ userAgentData: { platform: 'Chrome OS' } })).toBe('linux');
    expect(detectOs({ userAgentData: { platform: '' }, platform: 'MacIntel' })).toBe('mac');
    expect(detectOs({ platform: 'Win32' })).toBe('windows');
    expect(detectOs({ platform: 'Linux x86_64' })).toBe('linux');
    expect(detectOs({ platform: 'iPad' })).toBe('mac');
    expect(
      detectOs({
        platform: '',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
      }),
    ).toBe('windows');
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe('mac');
    expect(detectOs({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe('linux');
    // "Darwin" isn't Windows, and an unknown system counts as Windows (the player can change it).
    expect(detectOs({ platform: 'Darwin' })).toBe('mac');
    expect(detectOs({ platform: 'Plan9' })).toBe('windows');
    expect(detectOs({})).toBe('windows');
  });

  it('writes the course’s shortcuts with each computer’s keys', () => {
    // Chapter 01 · Prompts and Shortcuts: "Ctrl+R (or Cmd+R on macOS)".
    expect(formatKeys('mod+R', 'mac')).toBe('Cmd+R');
    expect(formatKeys('mod+R', 'windows')).toBe('Ctrl+R');
    expect(formatKeys('mod+R', 'linux')).toBe('Ctrl+R');
    expect(formatKeys('mod+shift+p', 'mac')).toBe('Cmd+Shift+P');
    expect(formatKeys('alt+enter', 'mac')).toBe('Option+Return');
    expect(formatKeys('alt+enter', 'windows')).toBe('Alt+Enter');
    expect(formatKeys('ctrl+meta+F5', 'linux')).toBe('Ctrl+Super+F5');
    expect(formatKeys('meta+E', 'windows')).toBe('Win+E');
  });
});

describe('typed values', () => {
  it('reads an issue number, and refuses anything else', () => {
    for (const ok of [
      '3',
      '#3',
      '# 3',
      ' 12 ',
      '007',
      'https://github.com/dan-sample/copilot-app-for-beginners/issues/5',
    ])
      expect(parseIssue(ok).ok, ok).toBe(true);
    expect(parseIssue('#003')).toEqual({ ok: true, value: 3 });
    expect(parseIssue('https://github.com/a/b/issues/42#issuecomment-1')).toEqual({ ok: true, value: 42 });
    for (const bad of [
      '',
      '   ',
      '0',
      '-1',
      '3.5',
      '1e3',
      'three',
      '#3; rm -rf ~',
      '<script>alert(1)</script>',
      '３',
      '99999999999999999999',
      '#'.repeat(300),
      'javascript:alert(1)',
      'https://github.com/a/b/pull/3',
      '3\n4',
    ])
      expect(parseIssue(bad).ok, JSON.stringify(bad)).toBe(false);
    expect(parseIssue(3 as unknown)).toMatchObject({ ok: false });
  });

  it('reads a branch name the way Git allows it, and refuses hostile ones', () => {
    for (const ok of ['practice-empty-state-copy', 'copilot/empty-state', 'feat/v1.2_fix', 'a+b'])
      expect(parseBranch(ok), ok).toEqual({ ok: true, value: ok });
    expect(parseBranch('  refs/heads/main ')).toEqual({ ok: true, value: 'main' });
    expect(parseBranch('origin/topic')).toEqual({ ok: true, value: 'topic' });
    for (const bad of [
      '',
      'has space',
      'a..b',
      '-x',
      'x/',
      '/x',
      'x.',
      'x//y',
      '.hidden',
      'a/.b',
      'x.lock',
      'a~b',
      'a^b',
      'a:b',
      'a?b',
      'a*b',
      'a[b',
      'a\\b',
      '@{-1}',
      '`rm`',
      '**bold**',
      '[x](https://evil.example)',
      '<img src=x onerror=alert(1)>',
      'naïve',
      'a\u0000b',
      'x'.repeat(101),
      'x'.repeat(500),
    ])
      expect(parseBranch(bad).ok, JSON.stringify(bad)).toBe(false);
  });

  it('cleans a typed model name so it can’t become markup', () => {
    expect(cleanModelName('  Example   Model 2 ')).toBe('Example Model 2');
    expect(cleanModelName('**x** `y` [z](https://e)')).toBe('x y z (https://e)');
    expect(cleanModelName('<b>hi</b>')).toBe('b hi /b');
    expect(cleanModelName('a'.repeat(80))).toHaveLength(40);
    expect(cleanModelName('\u0000\u0007')).toBeNull();
    expect(cleanModelName(5)).toBeNull();
  });
});

describe('your setup in the save', () => {
  it('round-trips, and old, odd, and imported saves still load', () => {
    const storage = memory();
    const p = new Progress(storage);
    expect(p.data.setup).toEqual(EMPTY_SETUP);
    p.setSetup(YOURS);
    expect(new Progress(storage).data.setup).toEqual(YOURS);
    p.setSetup({ branch: null });
    expect(new Progress(storage).data.setup).toEqual({ ...YOURS, branch: null });
    // A save from before Your setup.
    expect(parseProgress('{"v":1,"pages":["pg1.model"],"captainName":"Anne"}')).toMatchObject({
      setup: EMPTY_SETUP,
      pages: ['pg1.model'],
      captainName: 'Anne',
    });
    // Hand-edited saves: anything bad is dropped, the rest kept.
    expect(
      parseProgress(
        JSON.stringify({
          v: 1,
          setup: { os: 'beos', issue: -4, branch: 'a b', model: { pick: 'other', name: '**x**' } },
        }),
      ).setup,
    ).toEqual({ os: null, issue: null, branch: null, model: { pick: 'other', name: 'x' } });
    expect(parseProgress('{"v":1,"setup":"linux"}').setup).toEqual(EMPTY_SETUP);
    expect(cleanSetup({ issue: 3.5, model: { pick: 'gpt' } })).toEqual(EMPTY_SETUP);
    // The export code carries it.
    expect(importCode(exportCode(new Progress(storage).data))?.setup).toEqual({ ...YOURS, branch: null });
  });

  it('asks through the store: saving keeps it, skipping changes nothing, a new voyage forgets', async () => {
    const learn = new LearnStore(new Progress(memory()));
    const asked = learn.askSetup('issue', 'script');
    expect(learn.getState().setupForm).toEqual({ kind: 'issue', from: 'script' });
    expect(learn.busy).toBe(true);
    learn.saveSetup({ issue: 9 });
    expect(await asked).toBe(true);
    expect(learn.getState()).toMatchObject({ setupForm: null, setup: { issue: 9 } });
    const again = learn.askSetup('issue', 'logbook');
    learn.skipSetup();
    expect(await again).toBe(false);
    expect(learn.progress.data.setup.issue).toBe(9);
    learn.saveSetup({ os: 'mac' });
    expect(learn.os).toBe('mac');
    learn.newGame();
    expect(learn.getState().setup).toEqual(EMPTY_SETUP);
  });
});

describe('content with your setup', () => {
  it('fills shortcuts, the issue, the branch, and the model into authored text', () => {
    const text = 'Press {key:mod+R} on {os}. Type `{issue}` on `{branch}` with {model}.';
    expect(fillSetup(text, EMPTY_SETUP, 'mac')).toBe(
      'Press Cmd+R on macOS. Type `#3` on `practice-empty-state-copy` with the model you chose.',
    );
    expect(fillSetup(text, YOURS, 'mac')).toBe(
      'Press Ctrl+R on Linux. Type `#7` on `copilot/empty-state-copy` with Example Model 2.',
    );
    expect(fillSetup(text, { ...EMPTY_SETUP, os: 'windows' }, 'mac')).toMatch(/^Press Ctrl\+R on Windows/);
    expect(fillSetup('No tokens here.', YOURS, 'linux')).toBe('No tokens here.');
    expect(modelLabel({ pick: 'auto' })).toBe('Auto');
    expect(modelLabel({ pick: 'current' })).toBe('your current model');
    expect(modelLabel({ pick: 'other', name: null })).toBe('the model you picked');
  });

  it('makes setup-filled markdown plain for accessible names', () => {
    expect(plainSetupText(fillSetup('Type `{issue}` and use **{branch}**.', YOURS, 'mac'))).toBe(
      'Type #7 and use copilot/empty-state-copy.',
    );
  });

  it('routes the course’s shortcut and the exercise’s issue through the tokens', () => {
    const prompts = PAGES.get('pg1.prompts')!;
    expect(prompts.caption).toContain('{key:mod+R}');
    expect(fillSetup(prompts.caption, EMPTY_SETUP, 'windows')).toContain('**Ctrl+R**');
    expect(fillSetup(prompts.caption, EMPTY_SETUP, 'mac')).toContain('**Cmd+R**');
    const history = QUIZZES.get('N1.5') as ChoiceQuiz;
    expect(fillSetup(history.options[0]!.text, EMPTY_SETUP, 'linux')).toBe(
      'Press **Ctrl+R** for your prompt history',
    );
    expect(fillSetup(PAGES.get('pg2.plan')!.caption, YOURS, 'mac')).toContain('type `#7` and pick');
    expect(fillSetup(PAGES.get('pg2.chronicle')!.caption, YOURS, 'mac')).toContain(
      '`copilot/empty-state-copy`',
    );
    expect(PAGES.get('B2.2')!.setup).toContain('branch');
    expect(PAGES.get('pg1.try-controls')!.setup).toContain('model');
    // No authored text still writes a shortcut for one computer only, or the course's #3 by hand.
    const authored = [...PAGES.values()].map((p) => p.caption).join('\n');
    expect(authored).not.toMatch(/\b(Cmd|Ctrl)\+[A-Z]\b/);
    expect(authored).not.toMatch(/`#3`/);
    // The Flag Hoist's `#12` is the course's own example, not the practice issue: it stays.
    expect(PAGES.get('pg2.context-syntax')!.caption).toContain('`#12`');
  });

  it('fills the model quiz for the player’s choice', () => {
    const picked = QUIZZES.get('N1.4')!;
    expect(fillSetup(picked.prompt, YOURS, 'mac')).toMatch(/^Your model control shows Example Model 2\./);
    expect(setupMatches({ ...EMPTY_SETUP, model: { pick: 'auto' } }, 'model:auto')).toBe(true);
    expect(setupMatches({ ...EMPTY_SETUP, model: { pick: 'auto' } }, 'model:picked')).toBe(false);
    expect(setupMatches({ ...EMPTY_SETUP, model: { pick: 'current' } }, 'model:picked')).toBe(true);
    expect(setupMatches(EMPTY_SETUP, 'model:auto')).toBe(false);
    expect(setupMatches(EMPTY_SETUP, 'model:picked')).toBe(false);
  });

  it('shows the session terminal with the player’s branch and issue', () => {
    expect(practiceSessionReadout(EMPTY_SETUP)).toMatchObject({
      title: 'Session · practice-empty-state-copy',
      lines: expect.arrayContaining([{ text: 'Attached: #3 Improve the empty state copy', tone: undefined }]),
    });
    const yours = practiceSessionReadout(YOURS);
    expect(yours.title).toBe('Session · copilot/empty-state-copy');
    expect(yours.lines).toContainEqual({ text: 'Working branch: copilot/empty-state-copy', tone: 'you' });
    expect(yours.lines).toContainEqual({ text: 'Attached: #7 Improve the empty state copy', tone: 'you' });
  });
});

describe('setup steps in a script', () => {
  const dialogue = (said: string[]) =>
    ({
      play: async (ids: readonly string[]) => void said.push(...ids),
      say: async (_who: string, text: string) => void said.push(text),
      preload: () => undefined,
    }) as unknown as Dialogue;

  it('asks once, carries on after Skip, and only asks the quiz that fits the answer', async () => {
    const learn = new LearnStore(new Progress(null));
    const said: string[] = [];
    const steps = [
      { askSetup: 'model' },
      { quiz: 'N1.3', when: 'model:auto' },
      { quiz: 'N1.4', when: 'model:picked' },
      { say: 'after' },
    ] as const;
    const run = runScript(steps, { dialogue: dialogue(said), learn, speaker: 'Oren' });
    for (let i = 0; i < 5 && !learn.getState().setupForm; i++) await Promise.resolve();
    expect(learn.getState().setupForm).toEqual({ kind: 'model', from: 'script' });
    learn.saveSetup({ model: { pick: 'auto' } });
    for (let i = 0; i < 5 && !learn.getState().quiz; i++) await Promise.resolve();
    expect(learn.getState().quiz?.quiz.id).toBe('N1.3');
    learn.submit({ type: 'mc', option: 'conversation' });
    learn.closeQuiz();
    expect(await run).toBe(true);
    expect(said).toEqual(['after']);

    // Given once, it isn't asked again; skipped, neither quiz is asked.
    const fresh = new LearnStore(new Progress(null));
    const run2 = runScript(steps, { dialogue: dialogue([]), learn: fresh, speaker: 'Oren' });
    for (let i = 0; i < 5 && !fresh.getState().setupForm; i++) await Promise.resolve();
    fresh.skipSetup();
    expect(await run2).toBe(true);
    expect(fresh.progress.data.quizzes).toEqual({});
  });
});
