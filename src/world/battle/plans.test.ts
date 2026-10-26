import { describe, expect, it } from 'vitest';
import { QUIZZES } from '../../learn/content';
import { BATTLE_PLANS, eventsAfter, type BattlePlan } from './battle';

describe('battle plans', () => {
  it('asks a multiple-choice question from the chapter it recaps after every wave', () => {
    for (const plan of BATTLE_PLANS) {
      for (const wave of plan.waves) {
        const quiz = QUIZZES.get(wave.quiz);
        expect(quiz, `${plan.id}: ${wave.quiz}`).toBeDefined();
        expect(['mc', 'scenario']).toContain(quiz!.type);
        expect(quiz!.source.chapter.startsWith(plan.chapter)).toBe(true);
      }
    }
  });

  it('keeps waves small enough for every tier, with a raider name used only once per battle', () => {
    for (const plan of BATTLE_PLANS) {
      const names = plan.waves.flatMap((w) => w.raiders.map((r) => r.name));
      expect(new Set(names).size).toBe(names.length);
      for (const wave of plan.waves) {
        expect(wave.raiders.length).toBeGreaterThan(0);
        expect(wave.raiders.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("brings the kraken after battle 3's first wave, with its course lines; no other battle has an event", () => {
    for (const plan of BATTLE_PLANS) {
      if (plan.id === 'passage-thousand-bough-keelhaven') continue;
      expect(plan.events, plan.id).toEqual([]);
      expect(plan.kraken, plan.id).toBeNull();
    }
    const b3 = BATTLE_PLANS[2]!;
    expect(eventsAfter(b3, 1)).toEqual([{ afterWave: 1, kind: 'kraken' }]);
    for (let w = 2; w <= b3.waves.length; w++) expect(eventsAfter(b3, w)).toEqual([]);
    expect(b3.kraken?.flagship).toBeTruthy();
    // Every raider slot sails one rig after the kraken comes, so each hull it may break is cut once.
    for (let slot = 0; slot < 2; slot++) {
      const rigs = new Set(b3.waves.slice(1).map((w) => w.raiders[slot]?.kind));
      expect(rigs.size, `slot ${slot}`).toBe(1);
    }
    const other: BattlePlan = { ...BATTLE_PLANS[0]!, events: [{ afterWave: 2, kind: 'kraken' }] };
    expect(eventsAfter(other, 1)).toEqual([]);
  });
});
