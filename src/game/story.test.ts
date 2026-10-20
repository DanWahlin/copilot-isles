import { afterAll, describe, expect, it } from 'vitest';
import { readCoursePack } from '../../tools/course-pack/read';
import { setActiveCourse } from '../course/active';
import { COURSES, DEFAULT_COURSE_ID, LEGACY_COURSE } from '../course/catalog';
import { activateCourse } from '../course/load';
import type { CoursePack } from '../course/pack';
import { puzzleQuest } from '../course/puzzles';
import { pendingBattle } from './battles';
import {
  STORY_CONDITIONS,
  STORY_EVENTS,
  applyRules,
  migrateQuests,
  storyEvent,
  storyHolds,
  whenHolds,
  type QuestState,
  type StoryIsland,
  type StoryRule,
} from './story';

const STEPS = ['start', 'palette', 'sail', 'exam', 'done'];
const IDS = ['Q0.2', 'Q0.10', 'Q0.11', 'Q1.1', 'Q1.8', 'Q2.1', 'Q2.4', 'Q2.5', 'Q2.7', 'Q2.9'];

/** Seeded quest states over the ids the copilot-app story names (each step or not started). */
function states(n = 3000): QuestState[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) as number;
  const out: QuestState[] = [{}];
  for (let i = 0; i < n; i++) {
    const q: Record<string, string> = {};
    for (const id of IDS) {
      const k = Math.floor(rnd() * (STEPS.length + 1));
      if (k < STEPS.length) q[id] = STEPS[k]!;
    }
    out.push(q);
  }
  return out;
}

describe('the story engine (COURSE-PACKS.md, step 4)', () => {
  it('reads steps, not started, lists, "not" and flags', () => {
    const q = { a: 'start', b: 'done' };
    expect(whenHolds(undefined, q)).toBe(true);
    expect(whenHolds({ a: 'start', b: 'done' }, q)).toBe(true);
    expect(whenHolds({ a: 'done' }, q)).toBe(false);
    expect(whenHolds({ c: null }, q)).toBe(true);
    expect(whenHolds({ a: null }, q)).toBe(false);
    expect(whenHolds({ a: ['sail', 'start'] }, q)).toBe(true);
    expect(whenHolds({ c: [null, 'start'] }, q)).toBe(true);
    expect(whenHolds({ a: { not: [null, 'start'] } }, q)).toBe(false);
    expect(whenHolds({ b: { not: [null, 'start'] } }, q)).toBe(true);
    expect(whenHolds({ $on: true }, q, { on: true })).toBe(true);
    expect(whenHolds({ $on: false }, q, {})).toBe(false);
    expect(whenHolds({ $on: false }, q, { on: false })).toBe(true);
  });

  it('applies rules in order, each against the steps the ones before it set', () => {
    const rules: StoryRule[] = [
      { when: { a: null }, set: { a: 'start' } },
      { when: { a: 'start' }, set: { b: 'start', c: 'done' } },
      { when: { a: null }, set: { d: 'never' } },
      { set: { e: 'always' } },
    ];
    const set: [string, string][] = [];
    applyRules(rules, {}, (id, step) => set.push([id, step]));
    expect(set).toEqual([
      ['a', 'start'],
      ['b', 'start'],
      ['c', 'done'],
      ['e', 'always'],
    ]);
  });
});

describe('the Copilot app course’s story', () => {
  it('names every condition and event the game asks each of its islands for', () => {
    for (const c of COURSES) {
      const pack = readCoursePack(c.id);
      for (const { island } of c.islands) {
        if (!Object.hasOwn(STORY_CONDITIONS, island)) continue;
        const story = pack.quests[island]?.story;
        expect(story, `${c.id} ${island}`).toBeDefined();
        for (const n of STORY_CONDITIONS[island as StoryIsland])
          expect(story!.conditions, n).toHaveProperty([n]);
        for (const n of STORY_EVENTS[island as StoryIsland]) expect(story!.events, n).toHaveProperty([n]);
      }
    }
  });

  it('holds exactly where the game’s own quest ids used to', () => {
    // What the game asked before the story was the pack’s (src/game/session.ts and friends).
    const old: Record<string, Record<string, (q: QuestState) => boolean>> = {
      anchorage: {
        firstVisit: (q) => q['Q0.2'] === 'start',
        trialStarted: (q) => q['Q0.10'] === 'start',
        sealed: (q) => q['Q0.10'] === 'done',
        gangwayDown: (q) => q['Q0.11'] === 'sail' || q['Q0.11'] === 'done',
      },
      meridian: {
        firstVisit: (q) => q['Q1.1'] !== 'done',
        sealed: (q) => q['Q1.8'] === 'done',
      },
      'thousand-bough': {
        firstVisit: (q) => q['Q2.1'] !== 'done',
        gondolaOpen: (q) => q['Q2.4'] === 'done',
        secondBridge: (q) => q['Q2.5'] === 'done',
        practiceStarted: (q) => !!q['Q2.7'],
        basketOpen: (q) => !!q['Q2.9'] && q['Q2.9'] !== 'start',
        skipCrownView: (q) => q['Q2.9'] === 'done' || q['Q2.9'] === 'exam',
        sealed: (q) => q['Q2.9'] === 'done',
      },
    };
    for (const q of states())
      for (const [island, names] of Object.entries(old))
        for (const [name, was] of Object.entries(names))
          expect(storyHolds(island as 'anchorage', name as 'sealed', q), `${island}.${name}`).toBe(was(q));
  });

  it('lands and sets sail as the game did', () => {
    const run = (name: 'landed' | 'setSail', q: QuestState) => {
      const out = { ...q };
      storyEvent('anchorage', name, q, (id, step) => (out[id] = step));
      return out;
    };
    expect(run('landed', {})).toEqual({ 'Q0.2': 'start' });
    expect(run('landed', { 'Q0.2': 'done' })).toEqual({ 'Q0.2': 'done' });
    expect(run('setSail', { 'Q0.11': 'sail' })).toEqual({ 'Q0.11': 'done' });
    expect(run('setSail', { 'Q0.11': 'start' })).toEqual({ 'Q0.11': 'start' });
  });

  it('brings old saves in line exactly as the old migrateQuests did', () => {
    // The rules as code, before they were course.json's `migrations.quests`.
    const before = (saved: QuestState, o: { workflowsOn?: boolean }) => {
      const q: Record<string, string> = { ...saved };
      const put = (id: string, step: string) => (q[id] = step);
      const has = (id: string) => q[id] !== undefined;
      const done = (id: string) => q[id] === 'done';
      if (q['Q0.2'] === 'chest') put('Q0.2', 'palette');
      if (has('Q0.5')) {
        if (done('Q0.5') && !done('Q0.4')) put('Q0.4', 'done');
        else if (!done('Q0.5') && done('Q0.4')) put('Q0.4', 'start');
      }
      if (done('Q0.3') && !has('Q0.4')) put('Q0.4', 'start');
      if (done('Q0.4') && !has('Q0.7')) put('Q0.7', 'start');
      if (q['Q0.7'] === 'crane' && o.workflowsOn === false) put('Q0.7', 'actions');
      if (done('Q0.7') && !has('Q0.8')) put('Q0.8', 'start');
      if (done('Q0.7') && !has('Q0.6')) put('Q0.6', 'start');
      if (done('Q0.8') && !has('Q0.9')) put('Q0.9', 'start');
      if (done('Q0.8') && !has('Q0.10')) put('Q0.10', 'start');
      if (done('Q0.10') && !has('Q0.11')) put('Q0.11', 'start');
      return q;
    };
    const steps: Record<string, string[]> = {
      'Q0.2': ['start', 'chest', 'palette', 'done'],
      'Q0.3': ['start', 'done'],
      'Q0.4': ['start', 'done'],
      'Q0.5': ['start', 'ledger', 'done'],
      'Q0.6': ['start', 'sluice', 'done'],
      'Q0.7': ['start', 'actions', 'crane', 'solved', 'done'],
      'Q0.8': ['start', 'pipes', 'done'],
      'Q0.9': ['start', 'done'],
      'Q0.10': ['start', 'done'],
      'Q0.11': ['start', 'sail', 'done'],
    };
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++) {
      const saved: Record<string, string> = {};
      for (const [id, list] of Object.entries(steps)) {
        const k = Math.floor(rnd() * (list.length + 1));
        if (k < list.length) saved[id] = list[k]!;
      }
      for (const workflowsOn of [undefined, false, true]) {
        const after = { ...saved };
        migrateQuests(saved, (id, step) => (after[id] = step), { workflowsOn });
        expect(after, JSON.stringify({ saved, workflowsOn })).toEqual(before(saved, { workflowsOn }));
      }
    }
  });

  it('keeps old saves as the Copilot app course’s, the first course the default', () => {
    expect(DEFAULT_COURSE_ID).toBe('copilot-app');
    expect(LEGACY_COURSE).toBe('copilot-app');
    expect(COURSES.filter((c) => c.legacySaves)).toHaveLength(1);
  });
});

describe('a course with other quest ids', () => {
  afterAll(async () => {
    await activateCourse('copilot-app');
  });

  it('drives the same game through its story and its puzzles’ quests', () => {
    // The CLI course with every quest renamed (Q0.10 → Z0.10…): no code knows these ids.
    const cli = readCoursePack('copilot-cli');
    const renamed = JSON.parse(JSON.stringify(cli).replace(/"Q0\./g, '"Z0.')) as CoursePack;
    setActiveCourse({ ...renamed, meta: cli.meta });
    expect(storyHolds('anchorage', 'sealed', { 'Z0.10': 'done' })).toBe(true);
    expect(storyHolds('anchorage', 'sealed', { 'Q0.10': 'done' })).toBe(false);
    expect(storyHolds('anchorage', 'gangwayDown', { 'Z0.11': 'sail' })).toBe(true);
    const set: Record<string, string> = {};
    storyEvent('anchorage', 'landed', {}, (id, step) => (set[id] = step));
    expect(set).toEqual({ 'Z0.2': 'start' });
    expect(puzzleQuest('first-words')).toBe('Z0.8');
    // The CLI course has no Port Meridian: no story there, and no battle waits on the passage.
    expect(storyHolds('meridian', 'sealed', { 'Q1.8': 'done' })).toBe(false);
    const berths = Object.fromEntries(
      (['anchorage', 'meridian'] as const).map((id) => [
        id,
        { id, name: id, mooring: { x: 0, z: 0, heading: 0 }, contains: () => false },
      ]),
    );
    expect(pendingBattle('anchorage', { 'Z0.10': 'done' }, new Set(), berths)?.id).toBe(
      'passage-anchorage-meridian',
    );
    expect(pendingBattle('anchorage', { 'Q0.10': 'done' }, new Set(), berths)).toBeNull();
  });
});
