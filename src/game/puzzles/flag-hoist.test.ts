import { describe, expect, it } from 'vitest';
import { FLAG_ORDERS, FLAGS, FlagHoist } from './flag-hoist';
import { CH02 } from '../../learn/content/ch02';

describe('Flag Hoist (P2.3)', () => {
  it('has one flag per context symbol, matching the M2.2 check', () => {
    const m22 = CH02.quizzes.find((q) => q.id === 'M2.2');
    expect(m22?.type).toBe('matching');
    expect(FLAGS.map((f) => f.symbol)).toEqual(['@', '#', '/', '&']);
    if (m22?.type === 'matching')
      FLAGS.forEach((f, i) => expect(m22.pairs[i]!.left.text).toBe(`\`${f.symbol}\``));
  });

  it('wants a different flag for each order, with a reason for every wrong one', () => {
    expect(new Set(FLAG_ORDERS.map((o) => o.answer)).size).toBe(4);
    for (const o of FLAG_ORDERS)
      for (const f of FLAGS)
        if (f.symbol !== o.answer) expect(o.wrong[f.symbol], `${o.line} ${f.symbol}`).toMatch(/`.`/);
  });

  it('drops a wrong flag with Ines’s reason, and finishes after four right ones', () => {
    const h = new FlagHoist();
    const wrong = h.hoist('#');
    expect(wrong).toEqual({ ok: false, reason: FLAG_ORDERS[0]!.wrong['#'] });
    expect(h.index).toBe(0);
    expect(h.misses).toBe(1);
    for (const o of FLAG_ORDERS) expect(h.hoist(o.answer).ok).toBe(true);
    expect(h.done).toBe(true);
    expect(h.order).toBeNull();
  });
});
