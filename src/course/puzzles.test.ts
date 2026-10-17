import { afterEach, describe, expect, it } from 'vitest';
import { coursePack, setActiveCourse } from './active';
import { GAME_PUZZLES, fill, lineOf, puzzleContent, puzzleOn, textOf } from './puzzles';

const original = coursePack();
afterEach(() => setActiveCourse(original));

describe('puzzle content (COURSE-PACKS.md §4)', () => {
  it('has a file for every puzzle the game plays, with the mechanic it runs', () => {
    for (const [name, mechanic] of Object.entries(GAME_PUZZLES)) {
      expect(puzzleContent(name).mechanic, name).toBe(mechanic);
      expect(puzzleOn(name), name).toBe(true);
    }
  });

  it('turns a puzzle off with "disabled": true, and keeps its words for the site', () => {
    const helms = original.puzzles['three-helms']!;
    setActiveCourse({
      ...original,
      puzzles: { ...original.puzzles, 'three-helms': { ...helms, disabled: true } },
    });
    expect(puzzleOn('three-helms')).toBe(false);
    expect(puzzleOn('crane')).toBe(true);
    expect(textOf(puzzleContent('three-helms'), 'hear')).toBe(textOf(helms, 'hear'));
  });

  it('fills values in, and throws on a key the file hasn’t got', () => {
    expect(fill('Mark {from} → mark {to} {left}', { from: 1, to: 2 })).toBe('Mark 1 → mark 2 {left}');
    const crane = puzzleContent('crane');
    expect(() => textOf(crane, 'nope')).toThrow(/no text "nope"/);
    expect(() => lineOf(crane, 'nope')).toThrow(/no line "nope"/);
    expect(() => puzzleContent('nope')).toThrow(/has no puzzle "nope"/);
  });
});
