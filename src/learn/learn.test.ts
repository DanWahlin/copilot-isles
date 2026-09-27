import { describe, expect, it } from 'vitest';
import { QUIZZES } from './content/index';
import { grade, shuffled } from './grade';
import {
  Progress,
  cleanName,
  defaultShipName,
  exportCode,
  importCode,
  parseProgress,
  type ProgressStorage,
} from './progress';
import { LearnStore } from './store';
import { SAIL_PALETTES, sailPalette } from '../world/ship/sail-palettes';

const q = (id: string) => {
  const quiz = QUIZZES.get(id);
  if (!quiz) throw new Error(id);
  return quiz;
};

describe('grade', () => {
  it('grades multiple choice with per-option feedback', () => {
    expect(grade(q('MC0.1'), { type: 'mc', option: 'open' }).correct).toBe(true);
    const wrong = grade(q('MC0.1'), { type: 'mc', option: 'clone' });
    expect(wrong.correct).toBe(false);
    expect(wrong.feedback).toContain('URL');
  });

  it('grades hotspots by point, picking the target under the click', () => {
    expect(grade(q('H0.1'), { type: 'hotspot', x: 0.2, y: 0.76 })).toMatchObject({
      correct: true,
      hit: 'github',
    });
    const ghe = grade(q('H0.1'), { type: 'hotspot', x: 0.5, y: 0.76 });
    expect(ghe).toMatchObject({ correct: false, hit: 'ghe' });
    expect(ghe.feedback).toContain('ghe.com');
    expect(grade(q('H0.1'), { type: 'hotspot', x: 0.05, y: 0.05 })).toMatchObject({
      correct: false,
      hit: undefined,
    });
    expect(grade(q('H0.4'), { type: 'hotspot-target', target: 'local' }).correct).toBe(true);
  });

  it('needs every multi-select option right', () => {
    const quiz = q('T0.3');
    expect(grade(quiz, { type: 'multi', options: ['labels', 'issues', 'branches', 'prs'] }).correct).toBe(
      true,
    );
    expect(grade(quiz, { type: 'multi', options: ['labels', 'issues', 'branches'] }).correct).toBe(false);
    const g = grade(quiz, { type: 'multi', options: ['labels', 'issues', 'branches', 'prs', 'main-bugs'] });
    expect(g.correct).toBe(false);
    expect(g.marks?.['main-bugs']).toBe(false);
  });

  it('grades ordering and matching per item', () => {
    const ord = q('T0.1');
    if (ord.type !== 'ordering') throw new Error();
    const right = ord.items.map((i) => i.id);
    expect(grade(ord, { type: 'ordering', order: right }).correct).toBe(true);
    const swapped = [right[1]!, right[0]!, ...right.slice(2)];
    const g = grade(ord, { type: 'ordering', order: swapped });
    expect(g.correct).toBe(false);
    expect(g.marks).toMatchObject({ [right[0]!]: false, [right[2]!]: true });

    const m = q('M0.1');
    if (m.type !== 'matching') throw new Error();
    const pairs = Object.fromEntries(m.pairs.map((p) => [p.left.id, p.right.id]));
    expect(grade(m, { type: 'matching', pairs }).correct).toBe(true);
    expect(grade(m, { type: 'matching', pairs: { ...pairs, compass: 'npm' } }).correct).toBe(false);
  });

  it('shuffles deterministically and never returns the original order', () => {
    const items = ['a', 'b', 'c', 'd'];
    for (let seed = 0; seed < 50; seed++) {
      const s = shuffled(items, seed);
      expect(s).not.toEqual(items);
      expect([...s].sort()).toEqual(items);
      expect(shuffled(items, seed)).toEqual(s);
    }
  });
});

class MemStorage implements ProgressStorage {
  m = new Map<string, string>();
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

describe('progress', () => {
  it('persists pages, chests, quizzes, and doubloons', () => {
    const store = new MemStorage();
    const p = new Progress(store);
    expect(p.add('pages', 'C0.1')).toBe(true);
    expect(p.add('pages', 'C0.1')).toBe(false);
    expect(p.recordQuiz('H0.1', true)).toBe(5);
    expect(p.recordQuiz('H0.1', true)).toBe(0);
    expect(p.recordQuiz('H0.2', false)).toBe(0);
    expect(p.recordQuiz('H0.2', true)).toBe(2);
    const again = new Progress(store);
    expect(again.data.pages).toEqual(['C0.1']);
    expect(again.data.quizzes['H0.1']).toEqual({ attempts: 2, firstTry: true, passed: true });
    expect(again.data.quizzes['H0.2']).toMatchObject({ firstTry: false, passed: true });
    expect(again.data.doubloons).toBe(7);
  });

  it('survives corrupt or foreign saves', () => {
    expect(parseProgress('{nope').pages).toEqual([]);
    expect(parseProgress('{"v":2,"pages":["x"]}').pages).toEqual([]);
    expect(parseProgress('{"v":1,"pages":["x",3],"doubloons":-4}')).toMatchObject({
      pages: ['x'],
      doubloons: 0,
    });
  });

  it('round-trips an export code, including non-ASCII', () => {
    const p = new Progress(new MemStorage());
    p.add('seals', 'Seal of Anchorage ⚓');
    p.addDoubloons(12);
    const back = importCode(exportCode(p.data));
    expect(back?.seals).toEqual(['Seal of Anchorage ⚓']);
    expect(back?.doubloons).toBe(12);
    expect(importCode('not base64 !!')).toBeNull();
  });
});

describe('paint your sails', () => {
  it('previews in the picker, saves on Finish, and reverts on Back', async () => {
    const storage = new MemStorage();
    const learn = new LearnStore(new Progress(storage));
    expect(learn.getState().sails).toBeNull();

    const back = learn.openPalette('github');
    expect(learn.busy).toBe(true);
    learn.previewPalette('fox');
    expect(learn.getState().palette?.selected).toBe('fox');
    learn.closePalette();
    expect(await back).toBeNull();
    expect(learn.getState().sails).toBeNull();

    const pick = learn.openPalette('github');
    learn.previewPalette('monochrome');
    learn.finishPalette();
    expect(await pick).toBe('monochrome');
    expect(learn.busy).toBe(false);
    expect(new Progress(storage).data.sails).toBe('monochrome');

    learn.setSails('notionish');
    expect(learn.getState().sails).toBe('notionish');
    learn.newGame();
    expect(learn.getState().sails).toBeNull();
  });

  it('mirrors the app’s six themes and falls back to GitHub', () => {
    expect(SAIL_PALETTES.map((p) => p.name)).toEqual([
      'GitHub',
      'Fox',
      'IC Orange PPL',
      'Monochrome',
      'Noctis Azureus',
      'Notionish',
    ]);
    expect(new Set(SAIL_PALETTES.map((p) => p.id)).size).toBe(SAIL_PALETTES.length);
    expect(sailPalette('nope').id).toBe('github');
    expect(sailPalette(null).id).toBe('github');
  });
});

describe('captain and ship names', () => {
  it('cleans typed names and defaults the ship', () => {
    expect(cleanName('  Anne \n  Bonny ')).toBe('Anne Bonny');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName('x'.repeat(40))?.length).toBe(24);
    expect(defaultShipName('Anne')).toBe('Anne’s Brigantine');
    expect(defaultShipName(null)).toBe('The Wayfinder');
  });

  it('saves names with progress and survives old saves', () => {
    const storage = new MemStorage();
    const p = new Progress(storage);
    expect(p.shipName).toBe('The Wayfinder');
    p.setNames('Mira', null);
    expect(new Progress(storage).shipName).toBe('Mira’s Brigantine');
    p.setNames('Mira', 'Sea Sprite');
    expect(new Progress(storage).data).toMatchObject({ captainName: 'Mira', shipName: 'Sea Sprite' });
    expect(parseProgress('{"v":1}')).toMatchObject({ captainName: null, shipName: null });
  });
});

describe('logbook first use', () => {
  it('remembers once the Logbook has been opened, and a new voyage forgets', () => {
    const storage = new MemStorage();
    const learn = new LearnStore(new Progress(storage));
    expect(learn.getState().logbookOpened).toBe(false);
    void learn.grantPage('pg.install');
    learn.closeReveal();
    expect(learn.getState().logbookOpened).toBe(false);
    learn.openLogbook();
    expect(learn.getState().logbookOpened).toBe(true);
    expect(new LearnStore(new Progress(storage)).getState().logbookOpened).toBe(true);
    learn.newGame();
    expect(learn.getState().logbookOpened).toBe(false);
    expect(new Progress(storage).data.logbookOpened).toBe(false);
    expect(parseProgress('{"v":1}').logbookOpened).toBe(false);
  });
});
