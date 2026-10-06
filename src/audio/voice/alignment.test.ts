import { describe, expect, it } from 'vitest';
import { rateFactor, wordsFromAlignment } from './alignment';

function alignment(text: string, step = 0.1) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * step),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * step),
  };
}

describe('wordsFromAlignment', () => {
  it('splits on whitespace and drops edge punctuation', () => {
    expect(wordsFromAlignment(alignment('Ahoy, Captain!')).map((w) => w.word)).toEqual(['Ahoy', 'Captain']);
  });

  it('keeps inner apostrophes and times each word from its first to last spoken character', () => {
    const words = wordsFromAlignment(alignment('“I’m Juno.”'));
    expect(words).toEqual([
      { word: 'I’m', start: 0.1, end: 0.4 },
      { word: 'Juno', start: 0.5, end: 0.9 },
    ]);
  });

  it('skips punctuation-only tokens and repeated spaces', () => {
    expect(wordsFromAlignment(alignment('Wait  —  now')).map((w) => w.word)).toEqual(['Wait', 'now']);
  });

  it('scales times for audio sped up afterwards', () => {
    expect(wordsFromAlignment(alignment('Go', 0.2), 2)).toEqual([{ word: 'Go', start: 0, end: 0.2 }]);
  });
});

describe('rateFactor', () => {
  it('reads SSML-style percentages', () => {
    expect(rateFactor(undefined)).toBe(1);
    expect(rateFactor('+10%')).toBeCloseTo(1.1);
    expect(rateFactor('-8%')).toBeCloseTo(0.92);
  });

  it('rejects other rate forms', () => {
    expect(() => rateFactor('fast')).toThrow();
  });
});
