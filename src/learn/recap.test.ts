import { describe, expect, it } from 'vitest';
import type { RecapItem } from './progress';
import {
  BOX_MINUTES,
  overdue,
  pickRecap,
  recapCandidates,
  recapGapOk,
  seededUnit,
  type RecapCandidate,
} from './recap';

const MIN = 60000;
const item = (box: number, seen: number, wrong = 0): RecapItem => ({ box, seen, right: 0, wrong });
const cand = (id: string, chapter: string, it: RecapItem, missed = 0): RecapCandidate => ({
  id,
  chapter,
  item: it,
  missed,
});

describe('the recap schedule', () => {
  it('spaces a quiz by its box: box 0 is due at once, higher boxes wait longer', () => {
    const now = 1_000_000_000;
    expect(overdue(item(0, now), now)).toBeGreaterThanOrEqual(1);
    expect(overdue(item(1, now - 10 * MIN), now)).toBeLessThan(1);
    expect(overdue(item(1, now - BOX_MINUTES[1]! * MIN), now)).toBeCloseTo(1);
    expect(overdue(item(3, now - BOX_MINUTES[2]! * MIN), now)).toBeLessThan(1);
    // Past the last box, the interval stays the last one's.
    expect(overdue(item(99, now - BOX_MINUTES.at(-1)! * MIN), now)).toBeCloseTo(1);
  });

  it('asks nothing when nothing is due', () => {
    const now = 5e9;
    const c = [cand('a', 'ch0', item(2, now - MIN)), cand('b', 'ch1', item(3, now - 2 * MIN))];
    expect(pickRecap(c, { now, count: 3, seed: 1 })).toEqual([]);
  });

  it('puts missed and long-unseen quizzes first', () => {
    const now = 5e9;
    const c = [
      cand('fresh', 'ch0', item(1, now - 20 * MIN)),
      cand('missed', 'ch0', item(0, now - 5 * MIN), 2),
      cand('old', 'ch0', item(2, now - 600 * MIN)),
    ];
    expect(pickRecap(c, { now, count: 2, seed: 7 })).toEqual(['old', 'missed']);
    expect(pickRecap(c, { now, count: 3, seed: 7 })).toEqual(['old', 'missed', 'fresh']);
  });

  it('interleaves chapters, the most overdue chapter first', () => {
    const now = 5e9;
    const c = [
      cand('a1', 'ch0', item(0, now - 900 * MIN)),
      cand('a2', 'ch0', item(0, now - 800 * MIN)),
      cand('a3', 'ch0', item(0, now - 700 * MIN)),
      cand('b1', 'ch1', item(0, now - 100 * MIN)),
      cand('c1', 'ch2', item(0, now - 50 * MIN)),
    ];
    expect(pickRecap(c, { now, count: 3, seed: 3 })).toEqual(['a1', 'b1', 'c1']);
    expect(pickRecap(c, { now, count: 5, seed: 3 })).toEqual(['a1', 'b1', 'c1', 'a2', 'a3']);
  });

  it('is deterministic for a seed, and ties fall to the seed', () => {
    const now = 5e9;
    const c = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => cand(id, 'ch0', item(0, now - 60 * MIN)));
    const a = pickRecap(c, { now, count: 2, seed: 11 });
    expect(pickRecap(c, { now, count: 2, seed: 11 })).toEqual(a);
    const seeds = new Set(Array.from({ length: 20 }, (_, s) => pickRecap(c, { now, count: 1, seed: s })[0]));
    expect(seeds.size).toBeGreaterThan(1);
    expect(seededUnit('q1', 1)).toBeGreaterThanOrEqual(0);
    expect(seededUnit('q1', 1)).toBeLessThan(1);
  });

  it('keeps a gap between recaps', () => {
    expect(recapGapOk(0, 1e9, 20)).toBe(true);
    expect(recapGapOk(1e9, 1e9 + 19 * MIN, 20)).toBe(false);
    expect(recapGapOk(1e9, 1e9 + 20 * MIN, 20)).toBe(true);
  });

  it('draws only quizzes the player met, of the kinds asked, in the chapters asked', () => {
    const chapters = [
      {
        chapter: 'ch0',
        quizzes: [
          { id: 'mc1', type: 'mc' },
          { id: 'hot', type: 'hotspot' },
          { id: 'unmet', type: 'mc' },
          { id: 'skip', type: 'mc' },
        ],
      },
      { chapter: 'ch1', quizzes: [{ id: 'sc1', type: 'scenario' }] },
    ];
    const data = {
      created: 100,
      quizzes: {
        mc1: { attempts: 3, firstTry: false, passed: true },
        hot: { attempts: 1, firstTry: true, passed: true },
        skip: { attempts: 1, firstTry: true, passed: true },
        sc1: { attempts: 1, firstTry: true, passed: true },
      },
      recap: { items: { sc1: item(4, 900, 1) } },
    };
    const all = recapCandidates(chapters, data, {
      types: ['mc', 'scenario'],
      exclude: ['skip'],
      chapters: null,
    });
    expect(all).toEqual([
      // Met before the recap existed: box 0 (it was missed), seen when the voyage began.
      { id: 'mc1', chapter: 'ch0', item: { box: 0, seen: 100, right: 0, wrong: 0 }, missed: 2 },
      { id: 'sc1', chapter: 'ch1', item: item(4, 900, 1), missed: 0 },
    ]);
    const other = recapCandidates(chapters, data, {
      types: ['mc', 'scenario'],
      exclude: [],
      chapters: new Set(['ch1']),
    });
    expect(other.map((c) => c.id)).toEqual(['sc1']);
  });
});
