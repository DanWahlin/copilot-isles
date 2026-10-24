import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursePack, setActiveCourse } from '../course/active';
import { COURSE } from '../course/catalog';
import { runScript } from '../game/script';
import type { Dialogue } from '../game/dialogue';
import { QUIZZES } from './content/index';
import { resetCheckLimit } from './github-check';
import { APP_TASKS, questLogLine } from './learning';
import { Progress, type ProgressStorage } from './progress';
import { chartedIslands, LearnStore } from './store';

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

const store = () => new LearnStore(new Progress(new MemStorage(), COURSE.id));
const tick = () => new Promise((r) => setTimeout(r, 0));
const silent = {
  play: async () => undefined,
  say: async () => undefined,
  preload: () => undefined,
} as unknown as Dialogue;

/** Answers the quiz on screen right. */
function answerRight(l: LearnStore): void {
  const q = l.getState().quiz!.quiz;
  if (q.type === 'mc' || q.type === 'scenario') l.submit({ type: q.type, option: q.answer });
  else if (q.type === 'multi') l.submit({ type: 'multi', options: q.answers });
  else throw new Error(`recap asked a ${q.type}`);
}

describe('"Do this in the app" (learning.json app tasks)', () => {
  it('hands a task off on a card: I did it, what did you see, then the story goes on', async () => {
    const l = store();
    const out = l.askAppTask('A0.3');
    expect(l.getState().appTask).toMatchObject({ phase: 'ask', from: 'script' });
    expect(l.busy).toBe(true);
    l.appTaskDid();
    expect(l.getState().appTask?.phase).toBe('seen');
    l.appTaskSeen('settings');
    expect(l.getState().appTask).toMatchObject({ phase: 'answered', answer: 'settings' });
    l.appTaskContinue();
    expect(await out).toBe('done');
    expect(l.progress.data.appTasks['A0.3']).toMatchObject({ status: 'done', seen: 'wrong' });
    // Done: a script asking again doesn't show the card.
    expect(await l.askAppTask('A0.3')).toBe('done');
    expect(l.getState().appTask).toBeNull();
  });

  it('Later never holds the story up, and never undoes a done', async () => {
    const l = store();
    const out = l.askAppTask('A0.6');
    l.appTaskLater();
    expect(await out).toBe('later');
    expect(l.getState().appTasks['A0.6']?.status).toBe('later');
    // Later again shows it again (the checklist keeps it).
    const again = l.askAppTask('A0.6');
    expect(l.getState().appTask?.task.id).toBe('A0.6');
    l.appTaskDid();
    expect(await again).toBe('done');
    l.progress.setAppTask('A0.6', { status: 'later' });
    expect(l.progress.data.appTasks['A0.6']?.status).toBe('done');
  });

  it('runs as a script step, and Later goes straight on to the next line', async () => {
    const l = store();
    const said: string[] = [];
    const dialogue = {
      ...silent,
      play: async (ids: readonly string[]) => void said.push(...ids),
    } as Dialogue;
    const run = runScript([{ say: 'before' }, { appTask: 'A1.1' }, { say: 'after' }], {
      dialogue,
      learn: l,
      speaker: 'Lyra',
    });
    await tick();
    expect(said).toEqual(['before']);
    expect(l.getState().appTask?.task.id).toBe('A1.1');
    l.appTaskLater();
    expect(await run).toBe(true);
    expect(said).toEqual(['before', 'after']);
  });

  it('ticks a quest’s app work in the Logbook only once every task of it is confirmed', () => {
    const l = store();
    const done = 'Your fork is added under Sessions.';
    const learned = coursePack().learning.learned['Q0.3']!;
    expect(questLogLine('Q0.3', done, l.getState().appTasks)).toEqual({ line: learned, app: 'open' });
    l.setAppTaskDone('A0.2', true);
    expect(questLogLine('Q0.3', done, l.getState().appTasks).app).toBe('open');
    l.setAppTaskDone('A0.3', true);
    expect(questLogLine('Q0.3', done, l.getState().appTasks)).toEqual({ line: done, app: 'done' });
    // A quest with no app tasks keeps its own line.
    expect(questLogLine('Q0.10', 'Sealed.', {})).toEqual({ line: 'Sealed.', app: 'none' });
    // Taking a tick back from the checklist makes it Later again.
    l.setAppTaskDone('A0.3', false);
    expect(questLogLine('Q0.3', done, l.getState().appTasks).app).toBe('open');
  });

  it('finishes an app-only quest when its task is confirmed (once)', () => {
    const l = store();
    const heard = vi.fn();
    const off = l.onAppTaskDone(heard);
    l.setAppTaskDone('A2.4', true);
    l.setAppTaskDone('A2.4', true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0]![0].completes).toEqual({ quest: 'Q2.A', step: 'done' });
    off();
  });
});

describe('the opt-in GitHub checks from the checklist', () => {
  afterEach(() => resetCheckLimit());

  it('ask nothing until the player opts in and gives a fork, then tick a found task as checked', async () => {
    const l = store();
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ fork: true, parent: { full_name: COURSE.source.repo } }), {
          status: 200,
        }),
    );
    l.fetchFn = fetchFn;
    expect(l.canCheck('A0.2')).toBe(false);
    expect((await l.checkAppTask('A0.2')).status).toBe('unsupported');
    l.setGithubChecks(true);
    expect((await l.checkAppTask('A0.2')).status).toBe('unsupported');
    l.saveFork({ host: 'github.com', owner: 'robin-sample', repo: 'copilot-app-for-beginners' });
    expect(l.canCheck('A0.2')).toBe(true);
    // A task with no check never asks.
    expect(l.canCheck('A0.3')).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await l.checkAppTask('A0.2')).status).toBe('found');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(l.getState().appTasks['A0.2']).toMatchObject({ status: 'done', verified: true });
    expect(l.getState().checks['A0.2']?.status).toBe('found');
  });

  it('leave the player’s own word when GitHub says no or can’t answer', async () => {
    const l = store();
    l.setGithubChecks(true);
    l.saveFork({ host: 'github.com', owner: 'robin-sample', repo: 'copilot-app-for-beginners' });
    l.setAppTaskDone('A0.7', true);
    l.fetchFn = async () => new Response('{}', { status: 404 });
    expect((await l.checkAppTask('A0.7')).status).toBe('missing');
    expect(l.getState().appTasks['A0.7']?.status).toBe('done');
    l.fetchFn = async () => {
      throw new TypeError('offline');
    };
    expect((await l.checkAppTask('A0.2')).status).toBe('error');
    expect(l.getState().appTasks['A0.2']).toBeUndefined();
  });
});

describe('Wingman’s recap in the store', () => {
  it('asks only quizzes the player has met, from other chapters, after the gap, and rewards right answers', async () => {
    const l = store();
    let now = Date.now();
    l.now = () => now;
    expect(l.recapDue()).toEqual([]);
    // Met two Chapter 00 quizzes (one missed first), and one hotspot (never recapped).
    for (const [id, ok] of [
      ['T0.4', false],
      ['T0.4', true],
      ['N0.1', true],
      ['H0.2', true],
    ] as const)
      l.progress.recordQuiz(id, ok);
    now += 2 * 60 * 60 * 1000;
    expect(l.recapDue('00-setup')).toEqual([]);
    const ids = l.recapDue('01-tour-the-app');
    // The missed one first.
    expect(ids).toEqual(['T0.4', 'N0.1']);
    const coins = l.progress.data.doubloons;
    const run = l.runRecap(ids);
    expect(l.getState().quiz?.recap).toEqual({ index: 0, total: 2 });
    answerRight(l);
    l.closeQuiz();
    await tick();
    expect(l.getState().quiz?.quiz.id).toBe('N0.1');
    answerRight(l);
    l.closeQuiz();
    expect(await run).toEqual({ asked: 2, right: 2 });
    const reward = COURSE.recap!.reward!;
    expect(l.progress.data.doubloons).toBe(coins + 2 * reward.doubloons!);
    expect(l.progress.data.starfishPurse).toBe(reward.starfish);
    // The quiz records stay as they were (a recap isn't a retake); the schedule moves.
    expect(l.progress.data.quizzes['T0.4']).toMatchObject({ attempts: 2, firstTry: false });
    expect(l.progress.data.recap.items['T0.4']).toMatchObject({ box: 1, right: 1 });
    // Too soon for another.
    expect(l.recapDue()).toEqual([]);
  });

  it('ends at Esc before an answer, with no fail state', async () => {
    const l = store();
    let now = Date.now();
    l.now = () => now;
    for (const id of ['T0.4', 'N0.1']) l.progress.recordQuiz(id, false);
    now += 60 * 60 * 1000;
    const ids = l.recapDue();
    const run = l.runRecap(ids);
    l.closeQuiz();
    expect(await run).toEqual({ asked: 0, right: 0 });
    expect(l.progress.data.recap.runs).toBe(1);
    expect(QUIZZES.has(ids[0]!)).toBe(true);
  });
});

describe('the reflection before a Seal, the Seal card and the certificate', () => {
  it('asks once per chapter before the Seal, and keeps the pick', async () => {
    const l = store();
    const trial = coursePack().chapters[0]!.trials[0]!;
    const run = l.runTrial(trial.id);
    for (let i = 0; i < trial.items.length; i++) {
      await tick();
      const q = l.getState().quiz!.quiz;

      if (q.type === 'mc' || q.type === 'scenario') l.submit({ type: q.type, option: q.answer });
      else if (q.type === 'multi') l.submit({ type: 'multi', options: q.answers });
      else if (q.type === 'ordering') l.submit({ type: 'ordering', order: q.items.map((x) => x.id) });
      else if (q.type === 'matching')
        l.submit({
          type: 'matching',
          pairs: Object.fromEntries(q.pairs.map((p) => [p.left.id, p.right.id])),
        });
      else if (q.type === 'hotspot')
        l.submit({ type: 'hotspot-target', target: q.targets.find((t) => t.correct)!.id });
      l.closeQuiz();
    }
    await tick();
    expect(l.getState().reflection?.chapter).toBe('00-setup');
    expect(l.progress.data.seals).toEqual([]);
    l.chooseReflection(l.getState().reflection!.choices[1]!.id);
    await tick();
    expect(l.getState().banner?.title).toBe(trial.reward.seal);
    // The banner's Seal card opens as the banner closes; the Trial waits for it.
    l.sealCard();
    expect(l.getState().badge).toMatchObject({ kind: 'seal', heading: trial.reward.seal });
    l.closeBadge();
    expect(await run).toMatchObject({ passed: true });
    expect(l.getState().reflections['00-setup']?.choice).toBe(
      coursePack().learning.reflections[0]!.choices[1]!.id,
    );
    // Once only.
    await l.askReflection('00-setup');
    expect(l.getState().reflection).toBeNull();
  });

  it('opens the certificate with the last charted Seal', () => {
    const l = store();
    const seals = chartedIslands().flatMap((i) => (i.seal ? [i.seal] : []));
    expect(seals).toHaveLength(3);
    for (const s of seals.slice(0, -1)) l.progress.add('seals', s);
    expect(l.courseComplete()).toBe(false);
    l.progress.add('seals', seals.at(-1)!);
    expect(l.courseComplete()).toBe(true);
    l.progress.setNames('Robin', 'The Gull');
    l.openBadge('course');
    const b = l.getState().badge!;
    expect(b.text).toContain('Captain Robin of The Gull completed every charted chapter of');
    expect(b.text).toContain(COURSE.title);
    expect(b.seals.every((s) => s.held)).toBe(true);
  });
});

describe('where you left off', () => {
  it('summarises the tracker and the last thing learned, honestly', () => {
    const l = store();
    l.progress.setQuest('Q0.3', 'done');
    l.setQuests(
      [
        {
          id: 'Q0.3',
          title: 'Copy the Master Chart',
          detail: 'Your fork is added under Sessions.',
          done: true,
        },
      ],
      {
        island: 'Anchorage Cay',
        chapter: 'Chapter 00',
        goal: 'Set up',
        tasks: [
          {
            id: 'Q0.4',
            title: 'Your Own Deck',
            task: 'Start a session',
            detail: 'Talk to Bo.',
            status: 'active',
          },
        ],
      },
    );
    l.setAppTaskDone('A0.6', false);
    const s = l.resumeSummary()!;
    expect(s.task).toEqual({ title: 'Your Own Deck', task: 'Start a session' });
    expect(s.next).toBe('Talk to Bo.');
    // The fork wasn't confirmed: the learned line, not the claim.
    expect(s.learned).toBe(`Copy the Master Chart: ${coursePack().learning.learned['Q0.3']}`);
    expect(s.later).toBe(1);
  });
});

describe('every app task in the pack', () => {
  it('is indexed, with a card’s worth of steps', () => {
    expect(APP_TASKS.size).toBe(coursePack().learning.appTasks.length);
    for (const t of APP_TASKS.values()) expect(t.steps.length).toBeGreaterThan(0);
  });

  it('is gone in a course without learning.json (nothing to hand off, no tabs)', () => {
    const pack = coursePack();
    setActiveCourse({ ...pack, learning: { ...pack.learning, appTasks: [] } });
    try {
      expect(APP_TASKS.size).toBe(0);
    } finally {
      setActiveCourse(pack);
    }
  });
});
