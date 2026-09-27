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
});
