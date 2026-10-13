/**
 * P2.3 Flag Hoist on the Signal Deck (docs/specs/ISLAND-02-thousand-bough.md §7): Ines calls four
 * orders and you hoist the flag that brings that context (`context-syntax`). A wrong flag drops back
 * with her reason. Pure data and a small state machine; the session plays it with the mast view and
 * the overlay (src/ui/puzzles/FlagHoist.tsx).
 */
export type FlagSymbol = '@' | '#' | '/' | '&';

export interface Flag {
  symbol: FlagSymbol;
  /** What's painted on it (PLAN §3): the island's picture for the symbol. */
  picture: string;
  icon: string;
  brings: string;
}

/** In the order they hang on the mast (keys 1-4). */
export const FLAGS: readonly Flag[] = [
  { symbol: '@', picture: 'Cargo crate', icon: '📦', brings: 'Files or folders' },
  { symbol: '#', picture: 'Bounty notice', icon: '📜', brings: 'Issues or pull requests' },
  { symbol: '/', picture: 'Bosun’s whistle', icon: '📯', brings: 'Slash commands' },
  { symbol: '&', picture: 'Crew log', icon: '📒', brings: 'Other sessions' },
];

export interface FlagOrder {
  /** Ines's voiced order. */
  line: string;
  /** The order on screen. */
  text: string;
  answer: FlagSymbol;
  /** Why each wrong flag isn't it (Ines, unvoiced). */
  wrong: Readonly<Partial<Record<FlagSymbol, string>>>;
}

export const FLAG_ORDERS: readonly FlagOrder[] = [
  {
    line: 'tb.ines.order.1',
    text: 'Bring the folder `samples/book-app-web/src`.',
    answer: '@',
    wrong: {
      '#': '`#` brings issues and pull requests. A folder needs `@`.',
      '/': '`/` runs a command. To bring a folder, use `@`.',
      '&': '`&` points at another session, not a folder.',
    },
  },
  {
    line: 'tb.ines.order.2',
    text: 'Bring in issue `#12`.',
    answer: '#',
    wrong: {
      '@': '`@` brings files or folders. Issues come with `#`.',
      '/': '`/` runs a command. An issue needs `#`.',
      '&': '`&` points at another session. Issues come with `#`.',
    },
  },
  {
    line: 'tb.ines.order.3',
    text: 'Run `/chronicle standup`.',
    answer: '/',
    wrong: {
      '@': '`@` brings files. To run a command, start with `/`.',
      '#': '`#` brings an issue. Commands start with `/`.',
      '&': '`&` points at a session. Commands start with `/`.',
    },
  },
  {
    line: 'tb.ines.order.4',
    text: 'Point at another crew’s session.',
    answer: '&',
    wrong: {
      '@': '`@` is for files and folders. Other sessions use `&`, when the prompt box offers it.',
      '#': '`#` is for issues and pull requests. Other sessions use `&`.',
      '/': '`/` runs commands. Other sessions use `&`.',
    },
  },
];

export type HoistResult = { ok: true; done: boolean } | { ok: false; reason: string };

/** The hoist's progress: which order Ines is on, and what you've got wrong so far. */
export class FlagHoist {
  index = 0;
  misses = 0;

  get order(): FlagOrder | null {
    return FLAG_ORDERS[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= FLAG_ORDERS.length;
  }

  hoist(symbol: FlagSymbol): HoistResult {
    const o = this.order;
    if (!o) return { ok: true, done: true };
    if (symbol !== o.answer) {
      this.misses += 1;
      return { ok: false, reason: o.wrong[symbol] ?? 'Not that one.' };
    }
    this.index += 1;
    return { ok: true, done: this.done };
  }
}
