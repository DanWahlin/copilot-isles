/**
 * P2.3 Flag Hoist on the Signal Deck (docs/specs/ISLAND-02-thousand-bough.md §7): Ines calls six
 * orders. In the first four she says what Copilot needs, never the symbol, and you hoist the flag that
 * brings it (02 §Context Syntax). Then "Pack light": pick the smallest useful context for one job (the
 * section's tip, "Less is often more"). Last, a letter from ashore that isn't in the repository: drop
 * it on the session (02 §Attaching Files). A wrong pick drops back with her reason. Pure data and a
 * small state machine; the session plays it with the mast view and the overlay
 * (src/ui/puzzles/FlagHoist.tsx). The flags, orders, choices and reasons are the course pack's
 * `puzzles/flag-hoist.json`.
 */
import { onCourse } from '../../course/active';
import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, textOf } from '../../course/puzzles';

export type FlagSymbol = '@' | '#' | '/' | '&';
export type HoistSection = 'context-syntax' | 'slash-commands' | 'attaching-files';

export interface HoistReason {
  id: string;
  text: string;
  section: HoistSection;
}

export interface Flag {
  symbol: FlagSymbol;
  /** What's painted on it (PLAN §3): the island's picture for the symbol. */
  picture: string;
  icon: string;
  brings: string;
}

/** In the order they hang on the mast (keys 1-4). */
export let FLAGS: readonly Flag[] = [];

/** An order you answer with a flag: Ines says the need, not the symbol. */
export interface FlagOrder {
  kind: 'flag';
  /** Ines's voiced order. */
  line: string;
  /** The order on screen. */
  text: string;
  answer: FlagSymbol;
  /** Why each wrong flag isn't it (Ines, unvoiced), and the course section it paraphrases. */
  wrong: Readonly<Partial<Record<FlagSymbol, HoistReason>>>;
}

export interface HoistChoice {
  id: string;
  icon: string;
  text: string;
  /** The flag that goes up the mast for it (none: nothing's hoisted). */
  flag: FlagSymbol | null;
  right?: true;
  /** Why it isn't it (Ines, unvoiced), and the course section it paraphrases. */
  why?: HoistReason;
}

/** An order you answer by picking one of a few choices (keys 1-4). */
export interface ChoiceOrder {
  kind: 'choice';
  line: string;
  /** A short name over the order (the overlay's eyebrow). */
  title: string;
  text: string;
  choices: readonly HoistChoice[];
}

export type HoistOrder = FlagOrder | ChoiceOrder;

/** `puzzles/flag-hoist.json` (classify: each order into a flag, or one of its own choices). */
interface FlagHoistFile extends PuzzleFile {
  bins: readonly Flag[];
  items: readonly HoistOrder[];
}

export const hoistContent = () => puzzleContent<FlagHoistFile>('flag-hoist');
const T = (key: string) => textOf(hoistContent(), key);

export let HOIST_ORDERS: readonly HoistOrder[] = [];
onCourse(() => {
  FLAGS = hoistContent().bins;
  HOIST_ORDERS = hoistContent().items;
});

/** The right pick for an order: its flag's symbol, or the right choice's id. */
export function rightPick(o: HoistOrder): string {
  return o.kind === 'flag' ? o.answer : o.choices.find((c) => c.right)!.id;
}

/** The picks an order offers, in key order (1-4). */
export function orderPicks(o: HoistOrder): readonly string[] {
  return o.kind === 'flag' ? FLAGS.map((f) => f.symbol) : o.choices.map((c) => c.id);
}

/** The flag that goes up the mast for a pick (none for a choice without one). */
export function pickFlag(o: HoistOrder, pick: string): FlagSymbol | null {
  if (o.kind === 'flag') return FLAGS.some((f) => f.symbol === pick) ? (pick as FlagSymbol) : null;
  return o.choices.find((c) => c.id === pick)?.flag ?? null;
}

export type HoistResult = { ok: true; done: boolean } | { ok: false; reason: string };

/** The hoist's progress: which order Ines is on, and what you've got wrong so far. */
export class FlagHoist {
  index = 0;
  misses = 0;

  get order(): HoistOrder | null {
    return HOIST_ORDERS[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= HOIST_ORDERS.length;
  }

  /** Answers the order with a flag's symbol or a choice's id. */
  hoist(pick: string): HoistResult {
    const o = this.order;
    if (!o) return { ok: true, done: true };
    if (pick !== rightPick(o)) {
      this.misses += 1;
      const reason =
        o.kind === 'flag'
          ? o.wrong[pick as FlagSymbol]?.text
          : o.choices.find((c) => c.id === pick && !c.right)?.why?.text;
      return { ok: false, reason: reason ?? T('notThat') };
    }
    this.index += 1;
    return { ok: true, done: this.done };
  }
}
