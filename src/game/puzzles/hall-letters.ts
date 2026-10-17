/**
 * P1.3 The Lost Letters in the Hall of Records (POC §6.5; Pell, Q1.7): captains write to Pell when
 * they can't find a setting. Each letter is a problem, not a keyword, and you file it in the alcove
 * for the Settings area that fixes it. One letter isn't a Settings job at all (the model and effort
 * for one task), so it goes back in Pell's tray. A wrong filing hands the letter back with Pell's
 * reason and the course section it comes from. Pure data and a small state machine; the puzzle
 * (lost-letters.ts) plays it with the alcoves in the hall and the overlay (src/ui/puzzles/LostLetters.tsx).
 *
 * The alcoves are the course's Settings areas in the app's order, with **Projects** below them
 * (Course Chapter 01 · Settings, "Settings reference: What each area controls").
 */

/** A course section a letter or a reason paraphrases (README anchor and its hash in the course pack's lock.json). */
export interface LetterCite {
  anchor: string;
  hash: string;
  /** Shown under a reason: 'Course Chapter 01 · <section>'. */
  section: string;
}

export const CITE = {
  settings: { anchor: 'settings', hash: '5b95eb5b50e3', section: 'Settings' },
  models: {
    anchor: 'models-and-reasoning-effort',
    hash: '84d625491118',
    section: 'Models and Reasoning Effort',
  },
  troubleshooting: {
    anchor: 'i-cannot-find-a-setting-shown-in-the-chapter',
    hash: 'a78cb1a046e1',
    section: 'Troubleshooting',
  },
} as const satisfies Record<string, LetterCite>;

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

/** In the app's order (keys 1-9, then 0 for Projects). */
export const ALCOVES: readonly Alcove[] = [
  {
    id: 'general',
    name: 'General',
    holds: '**General** checks for app updates, sets where repositories are stored, and changes the theme.',
  },
  {
    id: 'accounts',
    name: 'Accounts',
    holds: '**Accounts** shows your account information and adds another GitHub account.',
  },
  {
    id: 'sessions',
    name: 'Sessions',
    holds:
      '**Sessions** manages sessions and chats, the response style, app-wide instructions and branch naming.',
  },
  { id: 'themes', name: 'Themes', holds: '**Themes** selects and customizes the app theme.' },
  {
    id: 'accessibility',
    name: 'Accessibility',
    holds: '**Accessibility** has display zoom, keyboard shortcuts, and notifications and announcements.',
  },
  {
    id: 'voice',
    name: 'Voice dictation',
    holds: '**Voice dictation** sets up the microphone, its shortcut and the transcription models.',
  },
  {
    id: 'customize',
    name: 'Customize',
    holds:
      '**Customize** points you to the **Customize** view in the sidebar, for MCP servers, plugins, skills and canvases.',
  },
  {
    id: 'providers',
    name: 'Model providers',
    holds: '**Model providers** connects models from other providers with your own API keys.',
  },
  {
    id: 'experimental',
    name: 'Experimental',
    holds: '**Experimental** lets you try preview features that can change or be removed.',
  },
  {
    id: 'projects',
    name: 'Projects',
    holds:
      '**Projects** holds each project’s own settings, such as **Show in sidebar**, sandbox rules and the default branch.',
  },
];

export const TRAY = { id: 'tray', name: 'Not in Settings' } as const;

/** Every destination in the overlay's order: the ten alcoves, then the tray. */
export const DESTINATIONS: readonly Destination[] = [...ALCOVES.map((a) => a.id), TRAY.id];

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
  wrong?: Readonly<Partial<Record<Destination, { text: string; cite: LetterCite }>>>;
}

/** In the order Pell hands them over. The decoy comes straight after Model providers, on purpose. */
export const LETTERS: readonly Letter[] = [
  {
    id: 'second-login',
    from: 'Captain Ivo Brask',
    text: 'I sail for two fleets now, and the second one gave me its own GitHub login. How do I get both into the app?',
    answer: 'accounts',
    cite: CITE.settings,
    need: 'This captain needs a second GitHub sign-in in the app.',
  },
  {
    id: 'small-text',
    from: 'Captain Aldous Hask',
    text: 'My eyes aren’t what they were. The words in the app are too small, and I’d like the whole thing bigger.',
    answer: 'accessibility',
    cite: CITE.settings,
    need: 'This captain needs the app bigger on the screen, so it’s easier to read.',
    wrong: {
      themes: {
        text: '**Themes** changes how the app looks, not how big it is. Making everything bigger helps the captain read it.',
        cite: CITE.settings,
      },
    },
  },
  {
    id: 'long-replies',
    from: 'Captain Morwen Tull',
    text: 'Your agent’s answers run on for pages! I want short, plain replies from now on, whatever I’m working on.',
    answer: 'sessions',
    cite: CITE.settings,
    need: 'This is about how the agent replies, every time you work with it.',
  },
  {
    id: 'own-key',
    from: 'Captain Teodor Salk',
    text: 'My company pays for models from another provider. I want to use them in the app with our own API key.',
    answer: 'providers',
    cite: CITE.settings,
    need: 'Think about where you’d bring your own key for another provider’s models.',
  },
  {
    id: 'decoy-model',
    from: 'Captain Gil Brannoch',
    text: 'This bug’s a nasty one, across several files. I want a stronger model, and more thinking, for this one task.',
    answer: 'tray',
    cite: CITE.models,
    ok: 'mer.pell.letter.decoy',
    need: 'No area in Settings picks the model for one task. Is this a Settings job at all?',
    wrong: {
      providers: {
        text: '**Model providers** connects extra providers with your own keys. It doesn’t replace the model picker below the prompt box.',
        cite: CITE.settings,
      },
    },
  },
  {
    id: 'hide-project',
    from: 'Captain Juna Pike',
    text: 'I connected a project I hardly use. I’d like it out of my sidebar, but I don’t want to lose it.',
    answer: 'projects',
    cite: CITE.settings,
    need: 'This is a setting for one project, not for the whole app.',
  },
  {
    id: 'mcp-server',
    from: 'Captain Della Oakes',
    text: 'I want to add an MCP server, so the agent can reach our ticket tracker. Where’s that kept?',
    answer: 'customize',
    cite: CITE.settings,
    ok: 'mer.pell.letter.customize',
    need: 'An MCP server extends what the app can do.',
  },
];

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
  if (d === 'tray')
    return {
      text: 'There’s an area in Settings for this one. Look for the closest match.',
      cite: CITE.troubleshooting,
    };
  return { text: `${alcove(d).holds} ${letter.need}`, cite: CITE.settings };
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
