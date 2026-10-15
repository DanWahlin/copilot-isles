/**
 * P2.3 Flag Hoist on the Signal Deck (docs/specs/ISLAND-02-thousand-bough.md §7): Ines calls six
 * orders. In the first four she says what Copilot needs, never the symbol, and you hoist the flag that
 * brings it (02 §Context Syntax). Then "Pack light": pick the smallest useful context for one job (the
 * section's tip, "Less is often more"). Last, a letter from ashore that isn't in the repository: drop
 * it on the session (02 §Attaching Files). A wrong pick drops back with her reason. Pure data and a
 * small state machine; the session plays it with the mast view and the overlay
 * (src/ui/puzzles/FlagHoist.tsx).
 */
export type FlagSymbol = '@' | '#' | '/' | '&';
export type HoistSection = 'context-syntax' | 'slash-commands' | 'attaching-files';

export interface HoistReason {
  id: string;
  text: string;
  section: HoistSection;
}

const reason = (id: string, text: string, section: HoistSection = 'context-syntax'): HoistReason => ({
  id,
  text,
  section,
});

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

export const HOIST_ORDERS: readonly HoistOrder[] = [
  {
    kind: 'flag',
    line: 'tb.ines.order.1',
    text: 'Copilot needs the Book App’s source folder.',
    answer: '@',
    wrong: {
      '#': reason(
        'order.1.#',
        '`#` brings issues and pull requests. A folder comes with `@`, like `@samples/book-app-web/src`.',
      ),
      '/': reason('order.1./', '`/` runs a command. To bring a folder, type `@`.'),
      '&': reason('order.1.&', '`&` points at another session, not a folder. Folders come with `@`.'),
    },
  },
  {
    kind: 'flag',
    line: 'tb.ines.order.2',
    text: 'Get a recap of your last day’s work.',
    answer: '/',
    wrong: {
      '@': reason(
        'order.2.@',
        '`@` brings files. A recap is a slash command: `/chronicle standup`.',
        'slash-commands',
      ),
      '#': reason(
        'order.2.#',
        '`#` brings an issue. For a recap, run `/chronicle standup`.',
        'slash-commands',
      ),
      '&': reason(
        'order.2.&',
        '`&` points at a session. For your recap, run `/chronicle standup`.',
        'slash-commands',
      ),
    },
  },
  {
    kind: 'flag',
    line: 'tb.ines.order.3',
    text: 'Attach the bug report about the empty state.',
    answer: '#',
    wrong: {
      '@': reason(
        'order.3.@',
        '`@` brings files or folders. A bug report is an issue, and issues come with `#`.',
      ),
      '/': reason('order.3./', '`/` runs a command. Attach an issue with `#`, like `#12`.'),
      '&': reason('order.3.&', '`&` points at another session. Issues come with `#`.'),
    },
  },
  {
    kind: 'flag',
    line: 'tb.ines.order.4',
    text: 'Use what Rook’s crew’s session found.',
    answer: '&',
    wrong: {
      '@': reason(
        'order.4.@',
        '`@` is for files and folders. Another session comes with `&`, when the prompt box offers it.',
      ),
      '#': reason('order.4.#', '`#` is for issues and pull requests. Other sessions use `&`.'),
      '/': reason('order.4./', '`/` runs commands. Other sessions use `&`, when the prompt box offers it.'),
    },
  },
  {
    kind: 'choice',
    line: 'tb.ines.order.5',
    title: 'Pack light',
    text: 'Copilot’s fixing one empty-state message. What do you bring?',
    choices: [
      {
        id: 'every-folder',
        icon: '📦📦📦',
        text: '`@` every folder in the repository',
        flag: '@',
        why: reason(
          'order.5.every-folder',
          'That’s the whole hold. Copilot only needs what this one fix needs. Bring the smallest amount of useful context.',
        ),
      },
      {
        id: 'nothing',
        icon: '🪣',
        text: 'Nothing. Copilot can go looking',
        flag: null,
        why: reason(
          'order.5.nothing',
          'An empty hold isn’t useful context. Give Copilot the one thing the fix is about.',
        ),
      },
      { id: 'one-issue', icon: '📜', text: '`#` just the empty-state issue', flag: '#', right: true },
      {
        id: 'every-issue',
        icon: '📜📜📜',
        text: '`#` every open issue',
        flag: '#',
        why: reason(
          'order.5.every-issue',
          'Only one issue is about this message. The rest is cargo it doesn’t need. Less is often more.',
        ),
      },
    ],
  },
  {
    kind: 'choice',
    line: 'tb.ines.order.6',
    title: 'A letter from ashore',
    text: 'A letter’s on your computer, not in the repository. Get it into the session.',
    choices: [
      {
        id: 'at',
        icon: '📦',
        text: 'Type `@` and pick it',
        flag: '@',
        why: reason(
          'order.6.at',
          '`@` picks files and folders from your project. This letter isn’t in the repository, so drag it from your computer onto the session.',
          'attaching-files',
        ),
      },
      {
        id: 'drop',
        icon: '✉️',
        text: 'Drag it from your computer onto the session in the sidebar',
        flag: null,
        right: true,
      },
      {
        id: 'hash',
        icon: '📜',
        text: 'Type `#` and pick it',
        flag: '#',
        why: reason('order.6.hash', '`#` brings issues and pull requests, not files.'),
      },
      {
        id: 'context',
        icon: '📯',
        text: 'Run `/context`',
        flag: '/',
        why: reason(
          'order.6.context',
          '`/context` shows what the session holds. It doesn’t add a file.',
          'slash-commands',
        ),
      },
    ],
  },
];

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
      return { ok: false, reason: reason ?? 'Not that one.' };
    }
    this.index += 1;
    return { ok: true, done: this.done };
  }
}
