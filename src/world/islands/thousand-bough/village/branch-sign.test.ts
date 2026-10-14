import { describe, expect, it } from 'vitest';
import { COURSE_BRANCH } from '../../../../learn/setup';
import { SIGN_LINE_MAX, branchSignLines } from './branch-sign';

describe('the Practice Bough branch sign', () => {
  it("shows the course's branch until the player gives one", () => {
    expect(COURSE_BRANCH).toBe('practice-empty-state-copy');
    expect(branchSignLines(null)).toEqual(['practice-empty-', 'state-copy']);
    expect(branchSignLines('   ')).toEqual(['practice-empty-', 'state-copy']);
  });

  it('keeps a short name on one line', () => {
    expect(branchSignLines('main')).toEqual(['main']);
    expect(branchSignLines(' copilot/fix-3 ')).toEqual(['copilot/fix-3']);
  });

  it('breaks a long name after the hyphen or slash that evens the lines', () => {
    expect(branchSignLines('dan/fix-empty-state-message-for-search')).toEqual([
      'dan/fix-empty-state-',
      'message-for-search',
    ]);
    expect(branchSignLines('copilot/improve-empty-state')).toEqual(['copilot/improve-', 'empty-state']);
    // No separator: a plain break in the middle.
    expect(branchSignLines('improveemptystatecopy')).toEqual(['improveempt', 'ystatecopy']);
  });

  it('fits every name on at most two lines, ending a cut line in an ellipsis', () => {
    const names = [
      'a'.repeat(100),
      `feature/${'x'.repeat(60)}-end`,
      'dan/a-very-long-branch-name-for-the-empty-state-copy-fix-in-the-search-page',
      'x/y',
    ];
    for (const n of names) {
      const lines = branchSignLines(n);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(SIGN_LINE_MAX);
      const cut = lines.join('').length < n.length;
      expect(lines.some((l) => l.endsWith('…'))).toBe(cut);
    }
    expect(branchSignLines('a'.repeat(100))).toEqual([`${'a'.repeat(25)}…`, `${'a'.repeat(25)}…`]);
  });
});
