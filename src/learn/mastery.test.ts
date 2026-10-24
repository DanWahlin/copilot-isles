import { describe, expect, it } from 'vitest';
import type { Objective } from './learning';
import { chapterMastery, nextQuestFor, objectiveProgress } from './mastery';

const src = { chapter: '00-x', anchor: 'learning-objectives', hash: '000000000000' };
const obj = (id: string, covers: Objective['covers']): Objective => ({
  id,
  chapter: '00-x',
  text: id,
  source: src,
  covers,
});
const puzzleQuest = (n: string) => ({ crane: 'Q7', yard: 'Q9' })[n];

describe('the mastery map', () => {
  it('marks practised, quizzed and done in the app separately', () => {
    const o = obj('o1', { quests: ['Q1'], puzzles: ['crane'], quizzes: ['z1', 'z2'], appTasks: ['a1'] });
    const none = objectiveProgress(o, { quests: {}, quizzes: {}, appTasks: {} }, puzzleQuest);
    expect(none).toMatchObject({
      practised: 'none',
      quizzed: 'none',
      app: 'none',
      met: false,
      started: false,
    });
    const some = objectiveProgress(
      o,
      {
        quests: { Q1: 'done', Q7: 'crane' },
        quizzes: { z1: { passed: true } },
        appTasks: { a1: { status: 'later' } },
      },
      puzzleQuest,
    );
    expect(some).toMatchObject({
      practised: 'some',
      quizzed: 'some',
      app: 'none',
      met: false,
      started: true,
    });
    expect(some.counts).toEqual({ practised: [1, 2], quizzed: [1, 2], app: [0, 1] });
    const all = objectiveProgress(
      o,
      {
        quests: { Q1: 'done', Q7: 'done' },
        quizzes: { z1: { passed: true }, z2: { passed: true } },
        appTasks: {},
      },
      puzzleQuest,
    );
    // Met without the app: the app is never needed.
    expect(all).toMatchObject({ practised: 'all', quizzed: 'all', app: 'none', met: true });
  });

  it('marks what an objective has no cover for as not applicable', () => {
    const quizOnly = obj('o2', { quizzes: ['z1'] });
    const p = objectiveProgress(
      quizOnly,
      { quests: {}, quizzes: { z1: { passed: true } }, appTasks: {} },
      puzzleQuest,
    );
    expect(p).toMatchObject({ practised: 'na', quizzed: 'all', app: 'na', met: true });
    const appOnly = obj('o3', { appTasks: ['a1'] });
    expect(
      objectiveProgress(
        appOnly,
        { quests: {}, quizzes: {}, appTasks: { a1: { status: 'done' } } },
        puzzleQuest,
      ).met,
    ).toBe(true);
    expect(objectiveProgress(appOnly, { quests: {}, quizzes: {}, appTasks: {} }, puzzleQuest).met).toBe(
      false,
    );
  });

  it("counts a chapter's met objectives and says what's next", () => {
    const os = [
      obj('a', { quests: ['Q1'] }),
      obj('b', { quests: ['Q2', 'Q3'] }),
      obj('c', { puzzles: ['yard'] }),
    ];
    const p = { quests: { Q1: 'done', Q3: 'start' }, quizzes: {}, appTasks: {} };
    const m = chapterMastery(os, p, puzzleQuest);
    expect(m.met).toBe(1);
    expect(m.next?.id).toBe('b');
    // The quest under way comes before one not started.
    expect(nextQuestFor(os[1]!, p, puzzleQuest)).toBe('Q3');
    expect(nextQuestFor(os[2]!, p, puzzleQuest)).toBe('Q9');
    expect(chapterMastery(os.slice(0, 1), p, puzzleQuest).next).toBeNull();
  });
});
