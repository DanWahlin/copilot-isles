import { describe, expect, it } from 'vitest';
import {
  FLAGS,
  FlagHoist,
  HOIST_ORDERS,
  orderPicks,
  pickFlag,
  rightPick,
  type HoistReason,
} from './flag-hoist';
import { CHAPTERS } from '../../learn/content/index';

const CH02 = CHAPTERS.find((c) => c.chapter === '02-sessions-worktrees-context')!;

describe('Flag Hoist (P2.3)', () => {
  it('has one flag per context symbol', () => {
    expect(FLAGS.map((f) => f.symbol)).toEqual(['@', '#', '/', '&']);
  });

  it('never prints the answer’s symbol in a flag order', () => {
    const flags = HOIST_ORDERS.filter((o) => o.kind === 'flag');
    expect(flags).toHaveLength(4);
    expect(new Set(flags.map((o) => o.answer)).size).toBe(4);
    for (const o of flags) {
      expect(o.text, o.line).not.toMatch(/[@#&`]|\/\w/);
      // A wrong flag always says why, in the symbol's own words.
      for (const f of FLAGS)
        if (f.symbol !== o.answer) expect(o.wrong[f.symbol]?.text, `${o.line} ${f.symbol}`).toMatch(/`.`/);
    }
    // The right flags don't come up in mast order.
    expect(flags.map((o) => orderPicks(o).indexOf(rightPick(o)))).not.toEqual([0, 1, 2, 3]);
  });

  it('ends with "Pack light" and a file from outside the repository, each with one right choice', () => {
    const [pack, letter] = HOIST_ORDERS.slice(4);
    for (const o of [pack!, letter!]) {
      if (o.kind !== 'choice') throw new Error('not a choice order');
      expect(o.choices.filter((c) => c.right)).toHaveLength(1);
      expect(
        o.choices.findIndex((c) => c.right),
        o.line,
      ).toBeGreaterThan(0);
      for (const c of o.choices) if (!c.right) expect(c.why?.text, c.id).toBeTruthy();
    }
    expect(rightPick(pack!)).toBe('one-issue');
    expect(pickFlag(pack!, 'one-issue')).toBe('#');
    expect(rightPick(letter!)).toBe('drop');
    expect(pickFlag(letter!, 'drop')).toBeNull();
  });

  it('drops a wrong pick with Ines’s reason, and finishes after six right ones', () => {
    const h = new FlagHoist();
    const first = HOIST_ORDERS[0]!;
    if (first.kind !== 'flag') throw new Error('the first order is a flag order');
    const wrong = h.hoist('#');
    expect(wrong).toEqual({ ok: false, reason: first.wrong['#']?.text });
    expect(h.index).toBe(0);
    expect(h.misses).toBe(1);
    for (const o of HOIST_ORDERS) expect(h.hoist(rightPick(o)).ok).toBe(true);
    expect(h.done).toBe(true);
    expect(h.order).toBeNull();
  });

  it('cites every wrong-choice reason to the course section it paraphrases', () => {
    const reasons = HOIST_ORDERS.flatMap((order) =>
      order.kind === 'flag'
        ? Object.values(order.wrong).filter((value): value is HoistReason => value !== undefined)
        : order.choices.flatMap((choice) => (choice.why ? [choice.why] : [])),
    );
    const cited = CH02.cited ?? {};
    const keys = Object.keys(cited)
      .filter((key) => key.startsWith('P2.3.'))
      .sort();

    expect(new Set(reasons.map((reason) => reason.id)).size).toBe(reasons.length);
    expect(keys).toEqual(reasons.map((reason) => `P2.3.${reason.id}`).sort());
    for (const reason of reasons) {
      const entry = cited[`P2.3.${reason.id}`]!;
      expect(entry.text, reason.id).toBe(reason.text);
      expect(entry.source.chapter, reason.id).toBe(CH02.chapter);
      expect(entry.source.anchor, reason.id).toBe(reason.section);
    }
  });

  it('checks the tip on a new job afterwards (K2.3), not the same four pairs again', () => {
    expect(CH02.quizzes.some((q) => q.id === 'M2.2')).toBe(false);
    const k23 = CH02.quizzes.find((q) => q.id === 'K2.3');
    expect(k23?.type).toBe('mc');
  });
});
