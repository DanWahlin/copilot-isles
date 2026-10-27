import { mulberry32 } from '../util/math';

/**
 * The order answer options show in (P02 of the Keelhaven play review: the right answer was option 1
 * in most quizzes, so a player could learn "press 1"). Every choice the game shows (quizzes, Trials,
 * recaps, battle questions, app-card questions, set pieces' and circuits' choice cards) is shuffled
 * when it shows, seeded by its own key and the voyage, so the order is stable within a play (a retry
 * shows the same order) and the same seed gives the same order in a test. Data can opt out: a quiz's
 * `fixedOrder` keeps its order (ordered options), and an option's `pinned` keeps its place (an "All of
 * the above" last). Number keys and the gamepad follow the order shown.
 */

/** Where the voyage's seed comes from (the save's creation time), set by the learning store. */
let voyage: () => number = () => 0;

/** Points the shuffle at the voyage's seed (the learning store does, from its save). */
export function setVoyageSeed(source: () => number): void {
  voyage = source;
}

/** A 32-bit hash of `key` mixed with `seed` (FNV-1a, then a final avalanche). */
export function orderSeed(key: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * `items` in the order they show for `key` this voyage: a seeded shuffle of the ones `pinned` doesn't
 * hold in place. `seed` overrides the voyage's (tests).
 */
export function orderOptions<T>(
  items: readonly T[],
  key: string,
  pinned: (item: T) => boolean = () => false,
  seed = voyage(),
): T[] {
  const out = items.slice();
  const free: number[] = [];
  for (let i = 0; i < out.length; i++) if (!pinned(out[i]!)) free.push(i);
  if (free.length < 2) return out;
  const rnd = mulberry32(orderSeed(key, seed));
  const moved = free.map((i) => out[i]!);
  for (let i = moved.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [moved[i], moved[j]] = [moved[j]!, moved[i]!];
  }
  free.forEach((slot, k) => (out[slot] = moved[k]!));
  return out;
}

/** A quiz's options as shown: shuffled unless the quiz keeps its order, pinned ones in place. */
export function quizOptions<O extends { pinned?: boolean }>(quiz: {
  id: string;
  options: readonly O[];
  fixedOrder?: boolean;
}): readonly O[] {
  if (quiz.fixedOrder) return quiz.options;
  return orderOptions(quiz.options, `quiz:${quiz.id}`, (o) => !!o.pinned);
}
