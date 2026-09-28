import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alignSubtitle } from './subtitle-align';

describe('subtitle alignment', () => {
  it('keeps punctuation, lights a silent symbol with the word before it, and joins split words', () => {
    const a = alignSubtitle('No tab? Select + and then Node.js.', [
      'No',
      'tab',
      'Select',
      'and',
      'then',
      'Node',
      'js',
    ]);
    expect(a?.tokens).toEqual(['No', 'tab?', 'Select', '+', 'and', 'then', 'Node.js.']);
    expect(a?.at).toEqual([0, 1, 2, 2, 3, 4, 5]);
  });

  it('gives a symbol its own word when the voice reads it aloud', () => {
    expect(alignSubtitle('Select + next', ['Select', 'plus', 'next'])?.at).toEqual([0, 1, 2]);
  });

  it('matches curly quotes and hyphenated names', () => {
    const a = alignSubtitle('“Give me samples/book-app-web.”', ['Give', 'me', 'samples', 'book-app-web']);
    expect(a?.at).toEqual([0, 1, 2]);
  });

  it('gives up when the words and the text disagree', () => {
    expect(alignSubtitle('Hello there', ['Hello', 'world'])).toBeNull();
    expect(alignSubtitle('Hello', ['Hello', 'again'])).toBeNull();
  });

  it('aligns every voiced line, so no subtitle loses its punctuation', () => {
    const url = new URL('../../public/voice/testcove/manifest.json', import.meta.url);
    const manifest = JSON.parse(readFileSync(url, 'utf8')) as {
      lines: { id: string; text: string; words: { word: string }[] }[];
    };
    const failed = manifest.lines
      .filter(
        (l) =>
          l.words.length &&
          !alignSubtitle(
            l.text,
            l.words.map((w) => w.word),
          ),
      )
      .map((l) => l.id);
    expect(failed).toEqual([]);
  });
});
