import { describe, expect, it } from 'vitest';
import { orderOptions, orderSeed, quizOptions, setVoyageSeed } from './option-order';

const ids = ['a', 'b', 'c', 'd'];

describe('answer option order', () => {
  it('is stable for a key and a voyage, and moves with either', () => {
    expect(orderOptions(ids, 'quiz:K3.1', undefined, 7)).toEqual(
      orderOptions(ids, 'quiz:K3.1', undefined, 7),
    );
    const byVoyage = new Set(
      Array.from({ length: 12 }, (_, v) => orderOptions(ids, 'quiz:K3.1', undefined, v).join('')),
    );
    const byKey = new Set(
      Array.from({ length: 12 }, (_, k) => orderOptions(ids, `quiz:K3.${k}`, undefined, 7).join('')),
    );
    expect(byVoyage.size).toBeGreaterThan(4);
    expect(byKey.size).toBeGreaterThan(4);
  });

  it('keeps every option, and pinned ones in their place', () => {
    for (let seed = 0; seed < 50; seed++) {
      const out = orderOptions(ids, 'card:x', (id) => id === 'd', seed);
      expect([...out].sort()).toEqual(ids);
      expect(out[3]).toBe('d');
    }
  });

  it('spreads the right answer over every place', () => {
    // The data's first option (where the right answer usually was) lands in each place about as often.
    const at = [0, 0, 0, 0];
    for (let k = 0; k < 4000; k++) at[orderOptions(ids, `quiz:Q${k}`, undefined, 1).indexOf('a')]!++;
    for (const n of at) expect(n).toBeGreaterThan(850);
  });

  it('follows the voyage seed, and a fixed-order quiz keeps its order', () => {
    const quiz = { id: 'K3.2', options: ids.map((id) => ({ id })) };
    setVoyageSeed(() => 11);
    const a = quizOptions(quiz).map((o) => o.id);
    expect(a).toEqual(orderOptions(ids, 'quiz:K3.2', undefined, 11));
    setVoyageSeed(() => 12);
    expect(quizOptions(quiz).map((o) => o.id)).toEqual(orderOptions(ids, 'quiz:K3.2', undefined, 12));
    expect(quizOptions({ ...quiz, fixedOrder: true }).map((o) => o.id)).toEqual(ids);
    setVoyageSeed(() => 0);
  });

  it('hashes keys apart', () => {
    expect(orderSeed('quiz:K3.1', 0)).not.toBe(orderSeed('quiz:K3.2', 0));
    expect(orderSeed('quiz:K3.1', 0)).not.toBe(orderSeed('quiz:K3.1', 1));
  });
});
