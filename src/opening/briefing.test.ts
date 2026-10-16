import { describe, expect, it } from 'vitest';
import { BRIEFING, Briefing, CHEST_LINE, LINE_GAP, type BriefingLine } from './briefing';

const line = (id: string, words: number): BriefingLine => ({
  id,
  speaker: 'Juno',
  text: Array.from({ length: words }, (_, i) => `w${i}`).join(' '),
  duration: words * 0.5,
  words: Array.from({ length: words }, (_, i) => ({ word: `w${i}`, start: i * 0.5, end: i * 0.5 + 0.4 })),
});

function setup() {
  const lines = new Map([...BRIEFING, CHEST_LINE].map((id) => [id, line(id, 4)]));
  const heard: (string | null)[] = [];
  const words: number[] = [];
  const b = new Briefing(lines, { onLine: (l) => heard.push(l?.id ?? null), onWord: (w) => words.push(w) });
  return { b, heard, words };
}

describe('Juno’s cabin briefing', () => {
  it('plays the welcome in order on the frame clock, lighting each word', () => {
    const { b, heard, words } = setup();
    expect(b.done).toBe(false);
    b.start();
    expect(heard).toEqual([BRIEFING[0]]);
    for (let i = 0; i < 120; i += 1) b.update(0.1);
    expect(words.slice(0, 4)).toEqual([0, 1, 2, 3]);
    // Four lines of 2 s, each with a breath after it.
    expect(heard).toEqual([...BRIEFING, null]);
    expect(b.done).toBe(true);
    expect(4 * (2 + LINE_GAP)).toBeLessThan(12);
  });

  it('moves on a line at a press, and says the chest line only after the welcome', () => {
    const { b, heard } = setup();
    b.start();
    b.chest();
    expect(heard).toEqual([BRIEFING[0]]);
    for (let i = 0; i < BRIEFING.length; i += 1) b.next();
    expect(b.done).toBe(true);
    b.chest();
    b.chest();
    expect(heard).toEqual([...BRIEFING, null, CHEST_LINE]);
    expect(b.speaking).toBe(true);
    expect(b.done).toBe(true);
  });

  it('falls silent when skipped, and never says the chest line', () => {
    const { b, heard } = setup();
    b.start();
    b.update(0.3);
    b.stop();
    b.chest();
    b.update(5);
    expect(heard).toEqual([BRIEFING[0], null]);
    expect(b.done).toBe(true);
    expect(b.speaking).toBe(false);
  });

  it('is done at once when no lines loaded', () => {
    const b = new Briefing(new Map(), { onLine: () => undefined, onWord: () => undefined });
    b.start();
    expect(b.done).toBe(true);
  });

  it('holds a line until its voice is ready, and gives up after VOICE_WAIT', () => {
    const ready = new Set<string>();
    const heard: (string | null)[] = [];
    const lines = new Map([...BRIEFING, CHEST_LINE].map((id) => [id, line(id, 4)]));
    const b = new Briefing(lines, {
      onLine: (l) => heard.push(l?.id ?? null),
      onWord: () => undefined,
      ready: (id) => ready.has(id),
    });
    b.start();
    expect(heard).toEqual([]);
    expect(b.done).toBe(false);
    b.update(0.5);
    expect(heard).toEqual([]);
    ready.add(BRIEFING[0]);
    b.update(0.1);
    expect(heard).toEqual([BRIEFING[0]]);
    // The line's full length plays from when it showed.
    b.update(1.9);
    expect(heard).toEqual([BRIEFING[0]]);
    // The next line isn't ready: it waits, then shows on its own after VOICE_WAIT.
    b.update(0.5);
    expect(heard).toEqual([BRIEFING[0]]);
    for (let i = 0; i < 45; i += 1) b.update(0.1);
    expect(heard).toEqual([BRIEFING[0], BRIEFING[1]]);
  });
});
