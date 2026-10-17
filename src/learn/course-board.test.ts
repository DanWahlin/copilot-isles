import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, PAGES, QUIZZES, courseUrl } from './content/index';
import type { CourseLock } from './course/lock';
import { Progress, type ProgressStorage } from './progress';
import { LearnStore } from './store';
import {
  COURSE_BOARD_SKIP_ANCHORS,
  COURSE_BOARD_SKIP_TITLES,
  COURSE_HOME_URL,
  courseBoard,
  coveredTopics,
  islandChapter,
  topicOf,
} from './course-board';

const ROOT = join(__dirname, '../..');
const lock = JSON.parse(readFileSync(join(ROOT, 'content/course.lock.json'), 'utf8')) as CourseLock;

describe('course notice boards', () => {
  it('lists every snapshotted chapter’s ## sections that are topics, with at least 5 a board', () => {
    for (const c of CHAPTERS) {
      const board = courseBoard(c.chapter)!;
      expect(board, c.chapter).not.toBeNull();
      expect(board.topics.length, c.chapter).toBeGreaterThanOrEqual(5);
      const sections = lock.chapters[c.chapter]!.sections;
      for (const t of board.topics) {
        const s = sections[t.anchor];
        expect(s, `${c.chapter}#${t.anchor}`).toBeDefined();
        expect(s!.level).toBe(2);
        // The course's exact heading, linked like any other course reference.
        expect(t.title).toBe(s!.title);
        expect(t.url).toBe(courseUrl({ chapter: c.chapter, anchor: t.anchor, hash: s!.hash }));
        expect(t.url).toMatch(
          /^https:\/\/github\.com\/github\/copilot-app-for-beginners\/blob\/main\/\d{2}-[a-z-]+\/README\.md#[a-z0-9-]+$/,
        );
      }
      // Every other ## section is one the skip lists name.
      const listed = new Set(board.topics.map((t) => t.anchor));
      for (const [anchor, s] of Object.entries(sections)) {
        if (s.level !== 2 || listed.has(anchor)) continue;
        expect(
          COURSE_BOARD_SKIP_ANCHORS.includes(anchor) ||
            COURSE_BOARD_SKIP_TITLES.some((p) => s.title.startsWith(p)),
          `${c.chapter}#${anchor}`,
        ).toBe(true);
      }
    }
  });

  it('leaves out the prerequisites, the hand-off, the sources and the studio story', () => {
    const titles = (id: Parameters<typeof courseBoard>[0]) => courseBoard(id)!.topics.map((t) => t.title);
    expect(titles('00-setup')).not.toContain('The Course Theme: Working in a Recording Studio');
    expect(titles('02-sessions-worktrees-context')).not.toContain(
      'From the Studio: One Studio, Many Recording Booths',
    );
    for (const c of CHAPTERS) {
      const anchors = courseBoard(c.chapter)!.topics.map((t) => t.anchor);
      for (const skip of COURSE_BOARD_SKIP_ANCHORS) expect(anchors).not.toContain(skip);
    }
    expect(titles('01-tour-the-app')).toContain('Models and Reasoning Effort');
  });

  it('pins the chapter’s README and the course’s home', () => {
    const b = courseBoard('01-tour-the-app')!;
    expect(b.chapterUrl).toBe(
      'https://github.com/github/copilot-app-for-beginners/blob/main/01-tour-the-app/README.md',
    );
    expect(b.homeUrl).toBe(COURSE_HOME_URL);
    expect(COURSE_HOME_URL).toBe('https://github.com/github/copilot-app-for-beginners');
    expect(b.num).toBe('01');
    expect(b.title).toBe('Tour the App');
  });

  it('maps each island to its chapter', () => {
    expect(islandChapter('anchorage')).toBe('00-setup');
    expect(islandChapter('meridian')).toBe('01-tour-the-app');
    expect(islandChapter('thousand-bough')).toBe('02-sessions-worktrees-context');
    expect(islandChapter('nowhere')).toBeNull();
  });

  it('files deeper headings under their ## topic', () => {
    expect(topicOf('02-sessions-worktrees-context', 'context-syntax')).toBe('core-concepts');
    expect(topicOf('01-tour-the-app', 'pull-requests')).toBe('tour-the-app');
    expect(topicOf('00-setup', 'installation')).toBe('installation');
    expect(topicOf('00-setup', 'no-such-heading')).toBeNull();
  });

  it('ticks topics a held page or a passed quiz cites, and only on their own chapter', () => {
    const page = [...PAGES.values()].find((p) => p.source.chapter === '02-sessions-worktrees-context')!;
    const quiz = [...QUIZZES.values()].find((q) => q.source.chapter === '00-setup')!;
    const ticked = coveredTopics('02-sessions-worktrees-context', [page.source, quiz.source]);
    expect([...ticked]).toEqual([topicOf('02-sessions-worktrees-context', page.source.anchor)]);
    // Every authored source lands on a topic that's on the board (or on a skipped section).
    for (const c of CHAPTERS) {
      const on = new Set(courseBoard(c.chapter)!.topics.map((t) => t.anchor));
      const cited = coveredTopics(c.chapter, [
        ...c.pages.map((p) => p.source),
        ...c.quizzes.map((q) => q.source),
      ]);
      expect([...cited].filter((a) => on.has(a)).length, c.chapter).toBeGreaterThan(0);
    }
  });
});

describe('the board overlay’s state', () => {
  const storage = (): ProgressStorage => {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    };
  };

  it('opens with ✓ on topics a held page or a passed quiz cites, holds input, and closes', () => {
    const learn = new LearnStore(new Progress(storage()));
    const page = [...PAGES.values()].find((p) => p.source.chapter === '00-setup')!;
    const quiz = [...QUIZZES.values()].find(
      (q) =>
        q.source.chapter === '00-setup' &&
        topicOf('00-setup', q.source.anchor) !== topicOf('00-setup', page.source.anchor),
    )!;
    const failed = [...QUIZZES.values()].find(
      (q) =>
        q.source.chapter === '00-setup' &&
        ![page, quiz].some(
          (x) => topicOf('00-setup', x.source.anchor) === topicOf('00-setup', q.source.anchor),
        ),
    );
    learn.filePage(page.id);
    learn.progress.recordQuiz(quiz.id, true);
    if (failed) learn.progress.recordQuiz(failed.id, false);
    learn.openCourseBoard('00-setup');
    expect(learn.busy).toBe(true);
    const covered = learn.getState().courseBoard!.covered;
    expect(new Set(covered)).toEqual(
      new Set([topicOf('00-setup', page.source.anchor), topicOf('00-setup', quiz.source.anchor)]),
    );
    learn.closeCourseBoard();
    expect(learn.getState().courseBoard).toBeNull();
    expect(learn.busy).toBe(false);
  });
});
