/**
 * P1.3 The Lost Letters in the Hall of Records (POC §6.5; Pell, Q1.7): captains write to Pell when
 * they can't find a setting. Each letter is a problem, not a keyword, and you file it in the alcove
 * for the Settings area that fixes it. One letter isn't a Settings job at all (the model and effort
 * for one task), so it goes back in Pell's tray. A wrong filing hands the letter back with Pell's
 * reason and the course section it comes from. Pure data and a small state machine; the puzzle
 * (lost-letters.ts) plays it with the alcoves in the hall and the overlay (src/ui/puzzles/LostLetters.tsx).
 *
 * The alcoves, letters, reasons and words are the course pack's `puzzles/lost-letters.json`: for the
 * Copilot app course, its Settings areas in the app's order, with **Projects** below them (Course
 * Chapter 01 · Settings, "Settings reference: What each area controls").
 */

import { onCourse } from '../../course/active';
import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, textOf } from '../../course/puzzles';

/** A course section a letter or a reason paraphrases (README anchor and its hash in the course pack's lock.json). */
export interface LetterCite {
  anchor: string;
  hash: string;
  /** Shown under a reason: 'Course Chapter 01 · <section>'. */
  section: string;
}

/** A puzzle file's letter: its `cite` (and each `wrong` reason's) is a key in `cites`. */
type LetterEntry = Omit<Letter, 'cite' | 'wrong'> & {
  cite: string;
  wrong?: Readonly<Partial<Record<Destination, { text: string; cite: string }>>>;
};

/** `puzzles/lost-letters.json` (classify: the letters into the bins, or back in the tray). */
interface LostLettersFile extends PuzzleFile {
  cites: Readonly<Record<string, LetterCite>>;
  bins: readonly Alcove[];
  tray: { id: 'tray'; name: string };
  items: readonly LetterEntry[];
}

export const lettersContent = () => puzzleContent<LostLettersFile>('lost-letters');
const T = (key: string, v?: Readonly<Record<string, string | number>>) => textOf(lettersContent(), key, v);

/** The course sections the letters and reasons cite, by key. */
export let CITE: Readonly<Record<string, LetterCite>> = {};

export type AlcoveId =
  | 'general'
  | 'accounts'
  | 'sessions'
  | 'themes'
  | 'accessibility'
  | 'voice'
  | 'customize'
  | 'providers'
  | 'experimental'
  | 'projects';

/** Where a letter can go: an alcove, or back in Pell's tray (not a Settings job). */
export type Destination = AlcoveId | 'tray';

export interface Alcove {
  id: AlcoveId;
  /** The area's name in the app, word for word. */
  name: string;
  /** What the area holds, from the course's table (01 · Settings). */
  holds: string;
}

/** The bins in the app's order (keys 1-9, then 0 for the last). */
export let ALCOVES: readonly Alcove[] = [];

export let TRAY: { readonly id: 'tray'; readonly name: string } = { id: 'tray', name: '' };

/** Every destination in the overlay's order: the ten alcoves, then the tray. */
export let DESTINATIONS: readonly Destination[] = [];

export interface Letter {
  id: string;
  from: string;
  /** The captain's problem, in their words (no area named). */
  text: string;
  answer: Destination;
  /** The section the answer comes from. */
  cite: LetterCite;
  /** Pell's voiced line when it's filed right (a lesson of its own), else his short "filed". */
  ok?: string;
  /** A nudge after a wrong alcove's own description: what the captain's really after. */
  need: string;
  /** Reasons for particular wrong filings, in place of the alcove's description and the nudge. */
  wrong?: Partial<Record<Destination, { text: string; cite: LetterCite }>>;
}

/** In the order Pell hands them over. The decoy comes straight after Model providers, on purpose. */
export let LETTERS: readonly Letter[] = [];

onCourse(() => {
  const c = lettersContent();
  CITE = c.cites;
  ALCOVES = c.bins;
  TRAY = c.tray;
  DESTINATIONS = [...ALCOVES.map((a) => a.id), TRAY.id];
  const cite = (k: string) => CITE[k]!;
  LETTERS = c.items.map(({ wrong, ...l }) => {
    const letter: Letter = { ...l, cite: cite(l.cite) };
    if (wrong)
      letter.wrong = Object.fromEntries(
        Object.entries(wrong).map(([d, w]) => [d, { text: w!.text, cite: cite(w!.cite) }]),
      );
    return letter;
  });
});

function alcove(id: AlcoveId): Alcove {
  return ALCOVES.find((a) => a.id === id)!;
}

export function destinationName(d: Destination): string {
  return d === 'tray' ? TRAY.name : alcove(d).name;
}

/** Pell's reason a letter doesn't go there, and the section it comes from. */
export function whyNot(letter: Letter, d: Destination): { text: string; cite: LetterCite } {
  const own = letter.wrong?.[d];
  if (own) return own;
  // A real Settings job in the tray: the course's advice for a setting you can't find.
  if (d === 'tray') return { text: T('trayWhy'), cite: CITE.troubleshooting! };
  return { text: `${alcove(d).holds} ${letter.need}`, cite: CITE.settings! };
}

export type FileResult =
  { ok: true; done: boolean; letter: Letter } | { ok: false; reason: string; cite: LetterCite };

/** The sorting's progress: the letter Pell's handed you, and what you've got wrong so far. */
export class HallLetters {
  index = 0;
  misses = 0;

  constructor(index = 0) {
    this.index = Math.max(0, Math.min(LETTERS.length, Math.floor(index) || 0));
  }

  get letter(): Letter | null {
    return LETTERS[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= LETTERS.length;
  }

  file(d: Destination): FileResult {
    const letter = this.letter;
    if (!letter) return { ok: true, done: true, letter: LETTERS[LETTERS.length - 1]! };
    if (d !== letter.answer) {
      this.misses += 1;
      const why = whyNot(letter, d);
      return { ok: false, reason: why.text, cite: why.cite };
    }
    this.index += 1;
    return { ok: true, done: this.done, letter };
  }
}
