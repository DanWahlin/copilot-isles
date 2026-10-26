import type { SeaChoiceOption, SeaChoiceView } from '../ui/puzzles/SeaChoice';

/** What a choice card asks: its heading, the question, and the options (each an id and its words). */
export interface ChoiceAsk {
  eyebrow: string;
  title: string;
  prompt: string;
  detail?: readonly string[];
  options: readonly SeaChoiceOption[];
}

/**
 * A choice card (src/ui/puzzles/SeaChoice.tsx, the Three Helms' card) for an island's set pieces: it
 * asks, waits for a pick (keys 1-9, a click or tap, the gamepad's A), shows a message, and closes.
 * Mounted the first time it's needed.
 */
export interface ChoiceCard {
  ask(a: ChoiceAsk): Promise<string>;
  /** A line under the card's options (good, bad or plain), while it stays open. */
  message(text: string, tone: 'good' | 'bad' | 'info'): void;
  /** Holds the buttons (a voice line plays). */
  busy(on: boolean): void;
  readonly open: boolean;
  close(): void;
  /** Picks for a test, as a click would. */
  choose(id: string): void;
  readonly view: SeaChoiceView;
  dispose(): void;
}

export function createChoiceCard(o: { blocked(): boolean; reduced(): boolean }): ChoiceCard {
  let view: SeaChoiceView = {
    open: false,
    eyebrow: '',
    title: '',
    prompt: '',
    detail: [],
    options: [],
    message: null,
    focus: 0,
    busy: false,
    reduced: false,
  };
  const subs = new Set<() => void>();
  const set = (patch: Partial<SeaChoiceView>) => {
    view = { ...view, ...patch };
    for (const fn of subs) fn();
  };
  let picked: ((id: string) => void) | null = null;
  let unmount: (() => void) | null = null;
  let mounting = false;
  let disposed = false;
  const choose = (id: string) => {
    if (!view.open || view.busy || !picked) return;
    const p = picked;
    picked = null;
    p(id);
  };
  const mount = () => {
    if (unmount || mounting || typeof document === 'undefined') return;
    mounting = true;
    void import('../ui/puzzles/SeaChoice').then(({ mountSeaChoice }) => {
      mounting = false;
      if (disposed) return;
      unmount = mountSeaChoice({
        get: () => view,
        subscribe: (fn) => {
          subs.add(fn);
          return () => subs.delete(fn);
        },
        choose,
        setFocus: (i) => set({ focus: i }),
        blocked: o.blocked,
      });
    });
  };
  return {
    ask(a) {
      mount();
      set({
        open: true,
        eyebrow: a.eyebrow,
        title: a.title,
        prompt: a.prompt,
        detail: a.detail ?? [],
        options: a.options,
        focus: 0,
        busy: false,
        reduced: o.reduced(),
      });
      return new Promise<string>((resolve) => (picked = resolve));
    },
    message: (text, tone) => set({ message: { text, tone } }),
    busy: (on) => set({ busy: on }),
    get open() {
      return view.open;
    },
    close() {
      // A card closed under a waiting ask (the island went) answers it with nothing.
      const p = picked;
      picked = null;
      set({ open: false, message: null });
      p?.('');
    },
    choose,
    get view() {
      return view;
    },
    dispose() {
      disposed = true;
      picked = null;
      unmount?.();
      unmount = null;
    },
  };
}
