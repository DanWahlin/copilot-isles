import { describe, expect, it } from 'vitest';
import {
  LAST_COURSE_KEY,
  LEGACY_KEYS,
  courseKey,
  lastCourse,
  migrateSaves,
  setLastCourse,
  writeCourseKey,
  type SaveStorage,
} from './save-keys';
import { Progress, exportCode, importCode } from '../learn/progress';

class Mem implements SaveStorage {
  readonly m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const SAVE = JSON.stringify({ captain: 'woman', x: 1, z: 2, heading: 0, savedAt: 1, place: 'The pier' });
const PROGRESS = JSON.stringify({ v: 1, quests: { 'Q0.2': 'done', 'Q0.3': 'start' }, doubloons: 30 });

describe('saves per course (COURSE-PACKS.md §6)', () => {
  it('keys each course’s save and progress by its id', () => {
    expect(courseKey('copilot-app', 'save')).toBe('copilot-isles.copilot-app.save.v1');
    expect(courseKey('copilot-cli', 'progress')).toBe('copilot-isles.copilot-cli.progress.v1');
  });

  it('copies a save from before course packs to the Copilot app course, once, and keeps the old keys', () => {
    const s = new Mem();
    s.setItem(LEGACY_KEYS.save, SAVE);
    s.setItem(LEGACY_KEYS.progress, PROGRESS);
    expect(migrateSaves(s)).toEqual(['save', 'progress']);
    expect(s.getItem(courseKey('copilot-app', 'save'))).toBe(SAVE);
    expect(s.getItem(courseKey('copilot-app', 'progress'))).toBe(PROGRESS);
    expect(s.getItem(LEGACY_KEYS.save)).toBe(SAVE);
    expect(s.getItem(LAST_COURSE_KEY)).toBe('copilot-app');
    // Run again: nothing to do.
    expect(migrateSaves(s)).toEqual([]);
    // The migrated progress loads as the Copilot app course's.
    expect(new Progress(s, 'copilot-app').data.quests).toEqual({ 'Q0.2': 'done', 'Q0.3': 'start' });
    expect(new Progress(s, 'copilot-cli').data.quests).toEqual({});
  });

  it('never overwrites a newer voyage, and leaves a fresh browser alone', () => {
    const s = new Mem();
    s.setItem(LEGACY_KEYS.progress, PROGRESS);
    s.setItem(courseKey('copilot-app', 'progress'), '{"v":1,"doubloons":99}');
    expect(migrateSaves(s)).toEqual([]);
    expect(new Progress(s, 'copilot-app').data.doubloons).toBe(99);
    const fresh = new Mem();
    expect(migrateSaves(fresh)).toEqual([]);
    expect([...fresh.m.keys()]).toEqual([]);
    expect(migrateSaves(null)).toEqual([]);
    // A catalog with no course marked `"legacySaves": true` copies nothing.
    const none = new Mem();
    none.setItem(LEGACY_KEYS.save, SAVE);
    expect(migrateSaves(none, null)).toEqual([]);
    expect([...none.m.keys()]).toEqual([LEGACY_KEYS.save]);
  });

  it('rollback: the old keys follow the Copilot app course’s writes, so the build before finds the same voyage', () => {
    const s = new Mem();
    s.setItem(LEGACY_KEYS.progress, PROGRESS);
    migrateSaves(s);
    const p = new Progress(s, 'copilot-app');
    p.setQuest('Q0.3', 'done');
    p.addDoubloons(5);
    // What the build before course packs reads:
    expect(JSON.parse(s.getItem(LEGACY_KEYS.progress)!).quests['Q0.3']).toBe('done');
    expect(s.getItem(LEGACY_KEYS.progress)).toBe(s.getItem(courseKey('copilot-app', 'progress')));
    writeCourseKey(s, 'copilot-app', 'save', SAVE);
    expect(s.getItem(LEGACY_KEYS.save)).toBe(SAVE);
    // Another course never writes the old keys.
    const cli = new Progress(s, 'copilot-cli');
    cli.setQuest('Q0.2', 'done');
    writeCourseKey(s, 'copilot-cli', 'save', '{"captain":"man"}');
    expect(s.getItem(LEGACY_KEYS.save)).toBe(SAVE);
    expect(JSON.parse(s.getItem(LEGACY_KEYS.progress)!).quests['Q0.2']).toBe('done');
    expect(JSON.parse(s.getItem(courseKey('copilot-cli', 'progress'))!).quests).toEqual({ 'Q0.2': 'done' });
    // A New Voyage of the Copilot app course clears both.
    writeCourseKey(s, 'copilot-app', 'save', null);
    expect(s.getItem(LEGACY_KEYS.save)).toBeNull();
    expect(s.getItem(courseKey('copilot-app', 'save'))).toBeNull();
  });

  it('Continue resumes the last course played (a course that’s gone falls back)', () => {
    const s = new Mem();
    const known = ['copilot-app', 'copilot-cli'];
    expect(lastCourse(s, known)).toBe('copilot-app');
    setLastCourse(s, 'copilot-cli');
    expect(lastCourse(s, known)).toBe('copilot-cli');
    setLastCourse(s, 'retired-course');
    expect(lastCourse(s, known)).toBe('copilot-app');
  });

  it('switches a Progress between courses, each keeping its own', () => {
    const s = new Mem();
    const p = new Progress(s, 'copilot-app');
    p.addDoubloons(7);
    p.useCourse('copilot-cli');
    expect(p.data.doubloons).toBe(0);
    p.addDoubloons(3);
    p.useCourse('copilot-app');
    expect(p.data.doubloons).toBe(7);
  });

  it('export codes name their course; a code without one is the Copilot app course’s', () => {
    const p = new Progress(new Mem(), 'copilot-cli');
    p.addDoubloons(4);
    expect(importCode(exportCode(p.data, 'copilot-cli'))).toMatchObject({
      course: 'copilot-cli',
      progress: { doubloons: 4 },
    });
    const old = btoa(JSON.stringify({ v: 1, doubloons: 2 }));
    expect(importCode(old)).toMatchObject({ course: 'copilot-app', progress: { doubloons: 2 } });
  });
});
