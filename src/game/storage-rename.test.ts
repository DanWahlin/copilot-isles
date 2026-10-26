import { describe, expect, it } from 'vitest';
import { LEGACY_KEYS, renameStorageKeys, renamedKey, type KeyedStorage } from './storage-rename';

class Mem implements KeyedStorage {
  readonly m = new Map<string, string>();
  failWrites = false;
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
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** Every key the game has kept under its old name (Copilot Isles), with a sample value. */
const OLD = {
  'copilot-isles.settings.v1': '{"quality":"high","seaState":"calm"}',
  'copilot-isles.course': 'copilot-cli',
  'copilot-isles.copilot-app.save.v1': '{"captain":"woman","x":1,"z":2}',
  'copilot-isles.copilot-app.progress.v1': '{"v":1,"doubloons":30}',
  'copilot-isles.copilot-cli.save.v1': '{"captain":"man"}',
  'copilot-isles.copilot-cli.progress.v1': '{"v":1,"doubloons":4}',
  'copilot-isles.benchmark.v1:webgpu:apple m3 max': '{"gpuMs":4}',
  'copilot-isles.tracker.full': '1',
  'copilot-isles.apply-quality.v1': '{"to":"game"}',
  'isles.battleBriefing.hidden': '1',
};

describe('the move from Copilot Isles to Kraken Isles (storage keys)', () => {
  it('names each old key’s new key', () => {
    expect(renamedKey('copilot-isles.settings.v1')).toBe('kraken-isles.settings.v1');
    expect(renamedKey('copilot-isles.copilot-app.save.v1')).toBe('kraken-isles.copilot-app.save.v1');
    expect(renamedKey('isles.battleBriefing.hidden')).toBe('kraken-isles.battleBriefing.hidden');
    // The saves from before course packs go to a course's keys instead (save-keys.ts).
    expect(renamedKey(LEGACY_KEYS.save)).toBeNull();
    expect(renamedKey(LEGACY_KEYS.progress)).toBeNull();
    expect(renamedKey('kraken-isles.settings.v1')).toBeNull();
    expect(renamedKey('another-game.save')).toBeNull();
  });

  it('moves every key, removes the old ones, and leaves other keys alone', () => {
    const s = new Mem();
    for (const [k, v] of Object.entries(OLD)) s.setItem(k, v);
    s.setItem('another-game.save', 'x');
    s.setItem(LEGACY_KEYS.save, '{"captain":"man"}');
    const moved = renameStorageKeys(s);
    expect(moved).toHaveLength(Object.keys(OLD).length);
    for (const [k, v] of Object.entries(OLD)) {
      expect(s.getItem(k)).toBeNull();
      expect(s.getItem(renamedKey(k)!)).toBe(v);
    }
    expect(s.getItem('another-game.save')).toBe('x');
    expect(s.getItem(LEGACY_KEYS.save)).toBe('{"captain":"man"}');
  });

  it('never overwrites newer data, and still removes the old key', () => {
    const s = new Mem();
    s.setItem('copilot-isles.copilot-app.save.v1', '{"old":true}');
    s.setItem('kraken-isles.copilot-app.save.v1', '{"new":true}');
    s.setItem('copilot-isles.settings.v1', '{"quality":"low"}');
    expect(renameStorageKeys(s)).toEqual(['kraken-isles.settings.v1']);
    expect(s.getItem('kraken-isles.copilot-app.save.v1')).toBe('{"new":true}');
    expect(s.getItem('copilot-isles.copilot-app.save.v1')).toBeNull();
  });

  it('runs once: a second start finds nothing to move', () => {
    const s = new Mem();
    for (const [k, v] of Object.entries(OLD)) s.setItem(k, v);
    renameStorageKeys(s);
    const after = Object.fromEntries(s.m);
    expect(renameStorageKeys(s)).toEqual([]);
    expect(Object.fromEntries(s.m)).toEqual(after);
    expect(renameStorageKeys(null)).toEqual([]);
  });

  it('keeps an old key when storage is full, so the next start can try again', () => {
    const s = new Mem();
    s.setItem('copilot-isles.copilot-app.save.v1', '{"captain":"woman"}');
    s.failWrites = true;
    expect(renameStorageKeys(s)).toEqual([]);
    expect(s.getItem('copilot-isles.copilot-app.save.v1')).toBe('{"captain":"woman"}');
    s.failWrites = false;
    expect(renameStorageKeys(s)).toEqual(['kraken-isles.copilot-app.save.v1']);
  });
});
