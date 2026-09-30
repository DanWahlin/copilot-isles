/**
 * Lines up a voiced line's written tokens (with their punctuation) against the TTS word timings,
 * which drop punctuation, skip symbols such as "+", and can split one token into several words
 * ("Node.js" → "Node", "js"), or join two into one ("Chapter 01"). A file name read aloud through an
 * alias says its dots ("App dot T S X" for "App.tsx"). Returns, for each token, the index of the word
 * that lights it, or null when the two can't be matched (the subtitle then falls back to the bare
 * words).
 */
export function alignSubtitle(
  text: string,
  words: readonly string[],
): { tokens: string[]; at: number[] } | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  // A timing word covering several written words ("Chapter 01") is split, each part keeping its index.
  const said: string[] = [];
  const owner: number[] = [];
  words.forEach((word, i) => {
    for (const part of word.split(/\s+/).filter(Boolean)) {
      said.push(norm(part));
      owner.push(i);
    }
  });
  const at: number[] = [];
  let w = 0;
  const skipSilent = () => {
    while (w < said.length && !said[w]) w++;
  };
  for (let t = 0; t < tokens.length; t++) {
    const target = norm(tokens[t]!);
    skipSilent();
    if (!target) {
      // A symbol lights with the word before it, unless the voice read it aloud ("plus").
      const next =
        tokens
          .slice(t + 1)
          .map(norm)
          .find(Boolean) ?? '';
      const word = said[w];
      if (word && !next.startsWith(word)) at.push(owner[w++]!);
      else at.push(owner[Math.max(0, w - 1)] ?? 0);
      continue;
    }
    const first = w;
    let heard = '';
    while (w < said.length && heard.length < target.length) {
      if (!said[w]) {
        w++;
        continue;
      }
      if (!target.startsWith(heard + said[w])) {
        // "dot" inside a file name read aloud.
        if (heard && said[w] === 'dot') {
          w++;
          continue;
        }
        break;
      }
      heard += said[w++];
    }
    if (heard !== target) return null;
    at.push(owner[first] ?? first);
  }
  skipSilent();
  return w === said.length ? { tokens, at } : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
