/**
 * Lines up a voiced line's written tokens (with their punctuation) against the TTS word timings,
 * which drop punctuation, skip symbols such as "+", and can split one token into several words
 * ("Node.js" → "Node", "js"). Returns, for each token, the index of the word that lights it, or null
 * when the two can't be matched (the subtitle then falls back to the bare words).
 */
export function alignSubtitle(
  text: string,
  words: readonly string[],
): { tokens: string[]; at: number[] } | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  const said = words.map(norm);
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
      if (word && !next.startsWith(word)) at.push(w++);
      else at.push(Math.max(0, w - 1));
      continue;
    }
    const first = w;
    let heard = '';
    while (w < said.length && heard.length < target.length) {
      if (!said[w]) {
        w++;
        continue;
      }
      if (!target.startsWith(heard + said[w])) break;
      heard += said[w++];
    }
    if (heard !== target) return null;
    at.push(first);
  }
  skipSilent();
  return w === said.length ? { tokens, at } : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
