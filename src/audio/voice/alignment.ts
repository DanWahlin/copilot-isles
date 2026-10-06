export interface CharacterAlignment {
  readonly characters: readonly string[];
  readonly character_start_times_seconds: readonly number[];
  readonly character_end_times_seconds: readonly number[];
}

export interface WordTiming {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

const SPOKEN = /[\p{L}\p{N}]/u;

/**
 * Turns ElevenLabs character timings into word timings shaped like Azure's word boundaries: words split
 * on whitespace, with leading and trailing punctuation dropped ("Captain," → "Captain", "I’m" stays).
 * Times are divided by `tempo` when the audio is later sped up by that factor.
 */
export function wordsFromAlignment(alignment: CharacterAlignment, tempo = 1): WordTiming[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const words: WordTiming[] = [];
  let from = 0;
  for (let i = 0; i <= characters.length; i++) {
    if (i < characters.length && !/\s/u.test(characters[i]!)) continue;
    let first = from;
    let last = i - 1;
    while (first <= last && !SPOKEN.test(characters[first]!)) first++;
    while (last >= first && !SPOKEN.test(characters[last]!)) last--;
    if (first <= last) {
      words.push({
        word: characters.slice(first, last + 1).join(''),
        start: round(starts[first]! / tempo),
        end: round(ends[last]! / tempo),
      });
    }
    from = i + 1;
  }
  return words;
}

/** An SSML-style rate ("+10%", "-8%") as a speed factor. */
export function rateFactor(rate: string | undefined): number {
  if (!rate) return 1;
  const match = /^([+-]?\d+(?:\.\d+)?)%$/.exec(rate.trim());
  if (!match) throw new Error(`Unsupported rate "${rate}"; use a percentage like "+10%".`);
  return 1 + Number(match[1]) / 100;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
