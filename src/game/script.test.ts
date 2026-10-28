import { describe, expect, it } from 'vitest';
import { Progress } from '../learn/progress';
import { LearnStore } from '../learn/store';
import type { Dialogue } from './dialogue';
import { opensCard, runScript, voicedLines } from './script';

describe('runScript', () => {
  it('waits for the Logbook to close before the next step', async () => {
    const learn = new LearnStore(new Progress(null));
    const said: string[] = [];
    // The player presses J during the first line.
    const dialogue = {
      play: async (ids: readonly string[]) => {
        said.push(...ids);
        if (ids[0] === 'a') learn.openLogbook();
      },
      say: async () => undefined,
      preload: () => undefined,
    } as unknown as Dialogue;
    let finished = false;
    const run = runScript([{ say: 'a' }, { say: 'b' }], { dialogue, learn, speaker: 'Nell' }).then((ok) => {
      finished = ok;
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(said).toEqual(['a']);
    expect(finished).toBe(false);
    learn.closeLogbook();
    await run;
    expect(said).toEqual(['a', 'b']);
    expect(finished).toBe(true);
  });

  it('asks for the fork only when there isn’t one, with its line first', async () => {
    const learn = new LearnStore(new Progress(null));
    const said: string[] = [];
    const dialogue = {
      play: async (ids: readonly string[]) => void said.push(...ids),
      say: async () => undefined,
      preload: () => undefined,
    } as unknown as Dialogue;
    const steps = [{ askFork: 'crane', line: 'pim.brief.fork' }, { say: 'after' }] as const;
    const run = runScript(steps, { dialogue, learn, speaker: 'Pim' });
    for (let i = 0; i < 5 && !learn.getState().forkForm; i++) await Promise.resolve();
    expect(said).toEqual(['pim.brief.fork']);
    expect(learn.getState().forkForm).toEqual({ from: 'crane' });
    learn.saveFork({ host: 'github.com', owner: 'dan-sample', repo: 'copilot-app-for-beginners' });
    expect(await run).toBe(true);
    expect(said).toEqual(['pim.brief.fork', 'after']);
    // Given once, it's not asked again (and its line isn't played).
    said.length = 0;
    expect(await runScript(steps, { dialogue, learn, speaker: 'Pim' })).toBe(true);
    expect(said).toEqual(['after']);
  });

  it('carries on after Skip for now', async () => {
    const learn = new LearnStore(new Progress(null));
    const dialogue = {
      play: async () => undefined,
      say: async () => undefined,
      preload: () => undefined,
    } as unknown as Dialogue;
    const run = runScript([{ askFork: 'ezra' }], { dialogue, learn, speaker: 'Ezra' });
    for (let i = 0; i < 5 && !learn.getState().forkForm; i++) await Promise.resolve();
    learn.skipFork();
    expect(await run).toBe(true);
    expect(learn.getState().fork).toBeNull();
  });

  it('files a page in the Logbook without stopping for a reveal card', async () => {
    const learn = new LearnStore(new Progress(null));
    const dialogue = {
      play: async () => undefined,
      say: async () => undefined,
      preload: () => undefined,
    } as unknown as Dialogue;
    const ok = await runScript([{ file: 'pg1.editor' }, { file: 'pg1.voice' }], {
      dialogue,
      learn,
      speaker: 'Tobias',
    });
    expect(ok).toBe(true);
    expect(learn.getState().reveal).toBeNull();
    expect(learn.getState().pages).toEqual(['pg1.editor', 'pg1.voice']);
  });

  it('carries on after a passed Trial and stops when it is left unfinished', async () => {
    for (const passed of [true, false]) {
      const said: string[] = [];
      const learn = {
        getState: () => ({ logbook: { open: false } }),
        runTrial: async () => ({ passed, stars: passed ? 3 : 0 }),
        hideImage: () => undefined,
      } as unknown as LearnStore;
      const dialogue = {
        play: async (ids: readonly string[]) => void said.push(...ids),
        say: async () => undefined,
        preload: () => undefined,
      } as unknown as Dialogue;
      const ok = await runScript([{ trial: 'T0' }, { say: 'after' }], { dialogue, learn, speaker: 'Nell' });
      expect(ok).toBe(passed);
      expect(said).toEqual(passed ? ['after'] : []);
    }
  });

  it('loads every voiced line of the script as it starts', async () => {
    const preloaded: string[][] = [];
    const dialogue = {
      play: async () => undefined,
      say: async () => undefined,
      preload: (ids: readonly string[]) => void preloaded.push([...ids]),
    } as unknown as Dialogue;
    const steps = [
      { say: 'a' },
      { text: 'unvoiced' },
      { askFork: 'crane', line: 'fork.line' },
      { askSetup: 'model', line: 'setup.line' },
      { say: 'b' },
    ] as const;
    expect(voicedLines(steps)).toEqual(['a', 'fork.line', 'setup.line', 'b']);
    await runScript([{ say: 'a' }, { say: 'b' }], { dialogue, learn: null, speaker: 'Nell' });
    expect(preloaded).toEqual([['a', 'b']]);
  });

  it('holds a line to its last word when a card opens after it (issue 360)', async () => {
    const holds: [string, boolean][] = [];
    const dialogue = {
      play: async (ids: readonly string[], _on?: unknown, hold = false) => void holds.push([ids[0]!, hold]),
      say: async () => undefined,
      preload: () => undefined,
    } as unknown as Dialogue;
    expect(opensCard({ appTask: 'A1', quiet: true })).toBe(false);
    expect(opensCard({ appTask: 'A1', orStop: true })).toBe(true);
    expect(opensCard({ quiz: 'K1' })).toBe(true);
    expect(opensCard({ say: 'x' })).toBe(false);
    expect(opensCard(undefined)).toBe(false);
    await runScript([{ say: 'ask' }, { quest: 'Q', step: 'try' }, { say: 'back' }], {
      dialogue,
      learn: null,
      speaker: 'Barty',
    });
    expect(holds).toEqual([
      ['ask', false],
      ['back', false],
    ]);
    holds.length = 0;
    await runScript([{ say: 'ask' }, { quiz: 'K1' }], { dialogue, learn: null, speaker: 'Barty' });
    expect(holds).toEqual([['ask', true]]);
  });
});
