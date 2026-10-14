import { COURSE_BRANCH, COURSE_ISSUE, COURSE_ISSUE_TITLE, type SetupData } from '../../learn/setup';
import type { Puzzle, PuzzleTerminal } from './types';

/**
 * The Practice Bough's session terminal (Chapter 02 · Exercise: Start a Session from a Branch): near
 * Rook, the HUD terminal shows the exercise's session with the player's own values from Your setup:
 * the working branch the app gave it and the number of the practice issue they attached. Until they
 * give them, it shows the course's (`practice-empty-state-copy`, `#3`).
 */
export function practiceSessionReadout(s: SetupData): PuzzleTerminal {
  const branch = s.branch ?? COURSE_BRANCH;
  return {
    title: `Session · ${branch}`,
    lines: [
      { text: `Create from › Branches › ${COURSE_BRANCH}`, tone: 'cmd' },
      { text: 'New worktree' },
      { text: `Working branch: ${branch}`, tone: s.branch ? 'you' : undefined },
      {
        text: `Attached: #${s.issue ?? COURSE_ISSUE} ${COURSE_ISSUE_TITLE}`,
        tone: s.issue !== null ? 'you' : undefined,
      },
    ],
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
