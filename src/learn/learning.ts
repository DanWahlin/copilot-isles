import { onCourse } from '../course/active';
import type { SourceRef } from './types';

/**
 * The course's learning systems, as data (`courses/<id>/learning.json`, docs/specs/COURSE-PACKS.md
 * "Learning systems"): what the player does in the real app ("Do this in the app" cards and the
 * Logbook's checklist), the chapter's learning objectives and what covers each one (the mastery
 * map), the reflection before each Seal, and the Logbook's honest wording for quests whose real-app
 * part the player hasn't confirmed. Every word is the course's; the game only knows the shapes.
 */

/** A read-only check against GitHub's public API that a task left public evidence. */
export type AppCheckKind = 'repoExists' | 'branchExists' | 'prOpened';
export const APP_CHECK_KINDS: readonly AppCheckKind[] = ['repoExists', 'branchExists', 'prOpened'];

export interface AppTaskCheck {
  /**
   * `repoExists`: the player's fork is on GitHub and is a fork of the course's repository.
   * `branchExists`: `branch` is in the fork. `prOpened`: the fork has a pull request (from `branch`,
   * when given), and not only from `excludeHeads`.
   */
  kind: AppCheckKind;
  /** A branch name; `{practiceBranch}` is the course's practice branch (`course.json` → `practice`). */
  branch?: string;
  /**
   * `prOpened`: pull requests from these branches don't count (the ones the course's setup script
   * opens), so the check passes only on a pull request the player opened.
   */
  excludeHeads?: readonly string[];
}

/** "What did you see?": one question about what the app shows once the task's done. */
export interface AppTaskSeen {
  prompt: string;
  options: readonly { id: string; text: string; pinned?: boolean }[];
  answer: string;
  /** Shows the options in the data's order (else they're shuffled per card and voyage). */
  fixedOrder?: boolean;
  /** Shown after any answer: what the course says you'll see. */
  explain: string;
}

/** A step the player takes in the real app, handed off on a card with I did it and Later. */
export interface AppTask {
  id: string;
  /** The course chapter it's in. */
  chapter: string;
  /** The quest it belongs to: that quest's Logbook line only claims the app work once it's confirmed. */
  quest?: string;
  title: string;
  /** One to four short steps (`**bold**` marks UI names, `` `code` `` commands). */
  steps: readonly string[];
  /** Why it matters, in a sentence. */
  why: string;
  source: SourceRef;
  /** A link the card offers beside the course's (where to download, where to fork). */
  link?: { label: string; url: string };
  seen?: AppTaskSeen;
  check?: AppTaskCheck;
}

/** One of a chapter's learning objectives and what in the game covers it. */
export interface Objective {
  id: string;
  chapter: string;
  /** The objective, as the course states it. */
  text: string;
  source: SourceRef;
  covers: {
    /** Quests whose `done` means it's practised. */
    quests?: readonly string[];
    /** Puzzles (by file name) whose quest's `done` means it's practised. */
    puzzles?: readonly string[];
    /** Quizzes that check it. */
    quizzes?: readonly string[];
    /** App tasks that do it for real. */
    appTasks?: readonly string[];
  };
}

/** The short, skippable reflection before a chapter's Seal. */
export interface Reflection {
  chapter: string;
  prompt: string;
  /** The chapter's key takeaways (or habits) to pick from. */
  choices: readonly { id: string; text: string }[];
  source: SourceRef;
}

export interface LearningFile {
  /** The card's and checklist's names for the real tool ("Do this in the Copilot app"…). */
  labels: { kicker: string; checklist: string; tool: string };
  appTasks: readonly AppTask[];
  objectives: readonly Objective[];
  reflections: readonly Reflection[];
  /**
   * Quest id → what its Logbook line says once it's done but its app tasks aren't all confirmed
   * (its `done` step says what you did in the app).
   */
  learned: Readonly<Record<string, string>>;
}

export const NO_LEARNING: LearningFile = {
  labels: { kicker: '', checklist: '', tool: '' },
  appTasks: [],
  objectives: [],
  reflections: [],
  learned: {},
};

/** The active course's learning data, indexed (filled in place when a pack activates). */
export const LEARNING: { file: LearningFile } = { file: NO_LEARNING };
export const APP_TASKS = new Map<string, AppTask>();
export const REFLECTIONS = new Map<string, Reflection>();

onCourse((p) => {
  LEARNING.file = p.learning;
  APP_TASKS.clear();
  for (const t of p.learning.appTasks) APP_TASKS.set(t.id, t);
  REFLECTIONS.clear();
  for (const r of p.learning.reflections) REFLECTIONS.set(r.chapter, r);
});

/** A quest's app tasks, in the file's order. */
export function appTasksOfQuest(quest: string): AppTask[] {
  return LEARNING.file.appTasks.filter((t) => t.quest === quest);
}

/** A chapter's objectives, in the file's order. */
export function objectivesOf(chapter: string): Objective[] {
  return LEARNING.file.objectives.filter((o) => o.chapter === chapter);
}

/**
 * A finished quest's Logbook line, honestly: its `done` line (what you did in the app) only once every
 * one of its app tasks is confirmed; until then the course's `learned` line for it. `app` says which.
 */
export function questLogLine(
  quest: string,
  doneLine: string,
  records: Readonly<Record<string, { status: 'done' | 'later' }>>,
): { line: string; app: 'none' | 'open' | 'done' } {
  const tasks = appTasksOfQuest(quest);
  if (!tasks.length) return { line: doneLine, app: 'none' };
  if (tasks.every((t) => records[t.id]?.status === 'done')) return { line: doneLine, app: 'done' };
  return { line: LEARNING.file.learned[quest] ?? doneLine, app: 'open' };
}
