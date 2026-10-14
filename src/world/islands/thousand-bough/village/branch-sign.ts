import { COURSE_BRANCH } from '../../../../learn/setup';

/**
 * The Practice Bough house's sign: the branch of the player's practice session (Your setup), or the
 * course's `practice-empty-state-copy` until they've given one (Chapter 02 · Exercise: Start a Session
 * from a Branch). The board is 2.3 m wide; the painter shrinks the lettering until the widest line
 * fits, so these limits keep it legible from the deck.
 */

/** A name this short stays on one line. */
export const SIGN_ONE_LINE = 16;
/** The most characters a line holds (at about half the sign's full letter size); longer ones end in "…". */
export const SIGN_LINE_MAX = 26;

/**
 * The sign's lines for a branch name: one line when it's short, otherwise two, broken after the `-`
 * or `/` that evens them out best (or in the middle of a name with neither), each line cut to
 * `SIGN_LINE_MAX` with an ellipsis. Null or blank shows the course's branch.
 */
export function branchSignLines(name: string | null | undefined): string[] {
  const branch = name?.trim() || COURSE_BRANCH;
  if (branch.length <= SIGN_ONE_LINE) return [branch];
  let at = Math.ceil(branch.length / 2);
  let best = Infinity;
  for (let i = 1; i < branch.length; i++) {
    const c = branch[i - 1];
    if (c !== '-' && c !== '/') continue;
    const worst = Math.max(i, branch.length - i);
    if (worst < best) {
      best = worst;
      at = i;
    }
  }
  return [branch.slice(0, at), branch.slice(at)].map(fitLine);
}

function fitLine(line: string): string {
  return line.length <= SIGN_LINE_MAX ? line : `${line.slice(0, SIGN_LINE_MAX - 1)}…`;
}
