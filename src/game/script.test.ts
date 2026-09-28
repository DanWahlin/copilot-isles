import { describe, expect, it } from 'vitest';
import { Progress } from '../learn/progress';
import { LearnStore } from '../learn/store';
import type { Dialogue } from './dialogue';
import { runScript } from './script';

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
      } as unknown as Dialogue;
      const ok = await runScript([{ trial: 'T0' }, { say: 'after' }], { dialogue, learn, speaker: 'Nell' });
      expect(ok).toBe(passed);
      expect(said).toEqual(passed ? ['after'] : []);
    }
  });
});
