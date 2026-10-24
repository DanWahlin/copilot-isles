import type { PuzzleFile } from '../../course/pack';
import { fill, puzzleContent } from '../../course/puzzles';
import { COURSE_BRANCH, COURSE_ISSUE, COURSE_ISSUE_TITLE, type SetupData } from '../../learn/setup';
import type { Puzzle, PuzzleTerminal } from './types';

/** `puzzles/practice-session.json`: the readout, a checklist. */
interface PracticeSessionFile extends PuzzleFile {
  title: string;
  /**
   * `you`: the line shows the player's own value (once given) for that setup field. `show`: the line
   * is there only once they've given it (`given`), or only until they have (`missing`).
   */
  readout: readonly { text: string; tone?: 'cmd'; you?: 'branch' | 'issue'; show?: 'given' | 'missing' }[];
}

/**
 * The Practice Bough's session terminal (Chapter 02 · Exercise: Start a Session from a Branch): near
 * Rook, the HUD terminal shows the exercise's session with the player's own values from Your setup:
 * the working branch the app gave it and the number of the practice issue they attached. Until they
 * give them, it shows the course's practice values (the practice branch is only the session's base
 * branch, so a line can wait for theirs with `show`). The readout is the course pack's
 * (`puzzles/practice-session.json`).
 */
export function practiceSessionReadout(s: SetupData): PuzzleTerminal {
  const c = puzzleContent<PracticeSessionFile>('practice-session');
  const values = {
    branch: s.branch ?? COURSE_BRANCH,
    courseBranch: COURSE_BRANCH,
    issue: s.issue ?? COURSE_ISSUE,
    issueTitle: COURSE_ISSUE_TITLE,
  };
  const given = { branch: !!s.branch, issue: s.issue !== null };
  return {
    title: fill(c.title, values),
    lines: c.readout
      .filter((l) => !l.you || !l.show || (l.show === 'given') === given[l.you])
      .map((l) => ({
        text: fill(l.text, values),
        tone: l.tone ?? (l.you && given[l.you] ? 'you' : undefined),
      })),
  };
}

/** Shown within this distance (m) of Rook, once his part of the story has begun. */
const NEAR = 6;

export function createPracticeSession(o: {
  rook: { x: number; z: number };
  player: { readonly x: number; readonly z: number };
  setup(): SetupData | null;
  started(): boolean;
}): Puzzle {
  let last: SetupData | null = null;
  let readout: PuzzleTerminal | null = null;
  return {
    id: 'tb.practice-session',
    engaged: () => false,
    hint: () => null,
    hintKey: () => '-',
    update: () => undefined,
    terminal() {
      const s = o.setup();
      if (!s || !o.started() || Math.hypot(o.player.x - o.rook.x, o.player.z - o.rook.z) > NEAR) return null;
      if (s !== last) {
        last = s;
        readout = practiceSessionReadout(s);
      }
      return readout;
    },
    debug: { readout: () => (last ? practiceSessionReadout(last) : null) },
    dispose: () => undefined,
  };
}
