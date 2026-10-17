import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUIZZES, TRIALS } from '../../learn/content';
import type { CourseLock } from '../../learn/course/lock';
import type { Quiz } from '../../learn/types';
import { BATTLE_PLANS } from './battle';

const lock = JSON.parse(
  readFileSync(join(__dirname, '../../../courses/copilot-app/lock.json'), 'utf8'),
) as CourseLock;
const battleQuestionIds = BATTLE_PLANS.flatMap((plan) => plan.waves.map((wave) => wave.quiz));
const trialQuestionIds = new Set([...TRIALS.values()].flatMap((trial) => trial.items));

function stem(quiz: Quiz): string {
  return [quiz.type === 'scenario' ? quiz.situation : undefined, quiz.prompt]
    .filter((part): part is string => !!part)
    .join(' ')
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

describe('battle questions', () => {
  it('uses fresh scenario questions for the repeated waves', () => {
    expect(BATTLE_PLANS[0]?.waves[1]?.quiz).toBe('N0.2');
    expect(BATTLE_PLANS[1]?.waves[0]?.quiz).toBe('N1.6');

    for (const id of ['N0.2', 'N1.6']) {
      const quiz = QUIZZES.get(id);
      expect(quiz?.type, id).toBe('scenario');
      if (quiz?.type !== 'scenario') continue;

      expect(quiz.situation?.trim(), id).toBeTruthy();
      expect(quiz.explain.correct.trim(), id).toBeTruthy();
      const wrongOptions = quiz.options.filter((option) => option.id !== quiz.answer);
      expect(wrongOptions.length, id).toBeGreaterThan(0);
      for (const option of wrongOptions)
        expect(option.feedback?.trim(), `${id}:${option.id} needs its own why`).toBeTruthy();
    }
  });

  it('cites a current course section in the chapter each battle reviews', () => {
    for (const plan of BATTLE_PLANS) {
      for (const wave of plan.waves) {
        const quiz = QUIZZES.get(wave.quiz);
        expect(quiz, `${plan.id}:${wave.quiz}`).toBeDefined();
        if (!quiz) continue;

        expect(quiz.source.chapter.slice(0, 2), `${plan.id}:${wave.quiz}`).toBe(plan.chapter);
        const section = lock.chapters[quiz.source.chapter]?.sections[quiz.source.anchor];
        expect(section, `${wave.quiz}: #${quiz.source.anchor}`).toBeDefined();
        expect(section?.hash, `${wave.quiz}: #${quiz.source.anchor} changed`).toBe(quiz.source.hash);
      }
    }
  });

  it('does not reuse a Trial/Exam item or duplicate another quiz stem', () => {
    expect(new Set(battleQuestionIds).size).toBe(battleQuestionIds.length);

    for (const id of battleQuestionIds) {
      const quiz = QUIZZES.get(id);
      expect(quiz, id).toBeDefined();
      if (!quiz) continue;
      expect(trialQuestionIds.has(id), `${id} is also in a Trial or Exam`).toBe(false);

      for (const other of QUIZZES.values()) {
        if (other.id === id) continue;
        expect(stem(other), `${id} duplicates ${other.id}`).not.toBe(stem(quiz));
      }
    }
  });
});
