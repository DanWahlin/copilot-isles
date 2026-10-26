import { describe, expect, it } from 'vitest';
import {
  LAST_COURSE_KEY,
  LEGACY_KEYS,
  courseKey,
  lastCourse,
  migrateSaves,
  setLastCourse,
  writeCourseKey,
} from './save-keys';
import type { KeyedStorage } from './storage-rename';
import { Progress, exportCode, importCode } from '../learn/progress';

class Mem implements KeyedStorage {
  readonly m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
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
    expect(courseKey('copilot-app', 'save')).toBe('kraken-isles.copilot-app.save.v1');
    expect(courseKey('copilot-cli', 'progress')).toBe('kraken-isles.copilot-cli.progress.v1');
    expect(LAST_COURSE_KEY).toBe('kraken-isles.course');
  });

  it('moves a save from before course packs to the Copilot app course, once, and removes the old keys', () => {
    const s = new Mem();
    s.setItem(LEGACY_KEYS.save, SAVE);
    s.setItem(LEGACY_KEYS.progress, PROGRESS);
    expect(LEGACY_KEYS).toEqual({ save: 'copilot-isles.save.v1', progress: 'copilot-isles.progress.v1' });
    expect(migrateSaves(s)).toEqual(['save', 'progress']);
    expect(s.getItem('kraken-isles.copilot-app.save.v1')).toBe(SAVE);
    expect(s.getItem('kraken-isles.copilot-app.progress.v1')).toBe(PROGRESS);
    expect(s.getItem(LAST_COURSE_KEY)).toBe('copilot-app');
    expect([...s.m.keys()].sort()).toEqual([
      'kraken-isles.copilot-app.progress.v1',
      'kraken-isles.copilot-app.save.v1',
      'kraken-isles.course',
    ]);
    // Run again: nothing to do, nothing changes.
    expect(migrateSaves(s)).toEqual([]);
    expect(s.m.size).toBe(3);
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
    expect(s.getItem(LEGACY_KEYS.progress)).toBeNull();
    const fresh = new Mem();
    expect(migrateSaves(fresh)).toEqual([]);
    expect([...fresh.m.keys()]).toEqual([]);
    expect(migrateSaves(null)).toEqual([]);
    // A catalog with no course marked `"legacySaves": true` copies nothing and keeps the old keys.
    const none = new Mem();
    none.setItem(LEGACY_KEYS.save, SAVE);
    expect(migrateSaves(none, null)).toEqual([]);
    expect([...none.m.keys()]).toEqual([LEGACY_KEYS.save]);
  });

  it('composes the two moves: Copilot Isles names first, then the saves from before course packs', () => {
    // A player who played before course packs and after: the mirrored old keys and the course's keys.
    const both = new Mem();
    both.setItem('copilot-isles.save.v1', '{"captain":"woman","old":true}');
    both.setItem('copilot-isles.progress.v1', PROGRESS);
    both.setItem('copilot-isles.copilot-app.save.v1', SAVE);
    both.setItem('copilot-isles.copilot-app.progress.v1', '{"v":1,"doubloons":42}');
    both.setItem('copilot-isles.course', 'copilot-cli');
    both.setItem('copilot-isles.copilot-cli.save.v1', '{"captain":"man"}');
    expect(migrateSaves(both)).toEqual([]);
    expect(Object.fromEntries(both.m)).toEqual({
      'kraken-isles.copilot-app.save.v1': SAVE,
      'kraken-isles.copilot-app.progress.v1': '{"v":1,"doubloons":42}',
      'kraken-isles.course': 'copilot-cli',
      'kraken-isles.copilot-cli.save.v1': '{"captain":"man"}',
    });
    // A player who only played before course packs: very old keys straight to the course's new keys.
    const old = new Mem();
    old.setItem('copilot-isles.save.v1', SAVE);
    old.setItem('copilot-isles.settings.v1', '{"quality":"low"}');
    expect(migrateSaves(old)).toEqual(['save']);
    expect(Object.fromEntries(old.m)).toEqual({
      'kraken-isles.settings.v1': '{"quality":"low"}',
      'kraken-isles.copilot-app.save.v1': SAVE,
      'kraken-isles.course': 'copilot-app',
    });
  });

  it('writes and clears only the course’s own key', () => {
    const s = new Mem();
    writeCourseKey(s, 'copilot-app', 'save', SAVE);
    expect(Object.fromEntries(s.m)).toEqual({ 'kraken-isles.copilot-app.save.v1': SAVE });
    const p = new Progress(s, 'copilot-app');
    p.addDoubloons(5);
    expect(s.getItem(LEGACY_KEYS.progress)).toBeNull();
    expect(JSON.parse(s.getItem(courseKey('copilot-app', 'progress'))!).doubloons).toBe(5);
    writeCourseKey(s, 'copilot-app', 'save', null);
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
