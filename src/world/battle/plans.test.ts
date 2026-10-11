import { describe, expect, it } from 'vitest';
import { QUIZZES } from '../../learn/content';
import { BATTLE_PLANS } from './battle';

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
});
