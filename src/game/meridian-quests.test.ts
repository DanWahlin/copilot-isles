import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, PAGES, QUIZZES, TRIALS } from '../learn/content/index';
import {
  MERIDIAN_QUESTS,
  MERIDIAN_TARGETS,
  MERIDIAN_WELCOME,
  meridianCurrent,
  meridianNpcScript,
  meridianTarget,
  meridianTracker,
} from './meridian-quests';
import type { ScriptStep } from './script';

const NPCS = ['tobias', 'mina', 'lyra_meridian', 'anders', 'rhea', 'oren', 'pell', 'admiral'];
const voiced = new Set(
  (
    JSON.parse(readFileSync(join(__dirname, '../../courses/copilot-app/voice/lines.json'), 'utf8')) as {
      lines: { id: string }[];
    }
  ).lines.map((l) => l.id),
);

/** Plays a script's quest steps (and passes its quizzes and exam) into the state. */
function play(steps: readonly ScriptStep[], q: Record<string, string>): void {
  for (const s of steps) if ('quest' in s) q[s.quest] = s.step;
}

describe('Meridian quest line', () => {
  it('references only voiced lines, known quizzes, pages, terms and trials', () => {
    const states: Record<string, string>[] = [{}];
    for (const d of MERIDIAN_QUESTS)
      for (const step of Object.keys(d.steps))
        states.push({ ...Object.fromEntries(MERIDIAN_QUESTS.map((x) => [x.id, 'done'])), [d.id]: step });
    for (const q of states)
      for (const npc of NPCS)
        for (const s of meridianNpcScript(npc, q)?.steps ?? []) {
          if ('say' in s) expect(voiced.has(s.say), s.say).toBe(true);
          if ('quiz' in s) expect(QUIZZES.has(s.quiz), s.quiz).toBe(true);
          if ('page' in s) expect(PAGES.has(s.page), s.page).toBe(true);
          if ('file' in s) expect(PAGES.has(s.file), s.file).toBe(true);
          if ('term' in s) expect(GLOSSARY.has(s.term), s.term).toBe(true);
          if ('trial' in s) expect(TRIALS.has(s.trial), s.trial).toBe(true);
          if ('show' in s) expect(s.show).toMatch(/^(ch0[01]|shared)\//);
        }
    for (const id of MERIDIAN_WELCOME) expect(voiced.has(id), id).toBe(true);
  });

  it('runs in the course’s order, each talk handing on to the next', () => {
    const q: Record<string, string> = {};
    const order: string[] = [];
    // Talking to anyone out of turn changes nothing.
    play(meridianNpcScript('admiral', q)!.steps, q);
    expect(q).toEqual({});
    const talk = (npc: string) => {
      order.push(npc);
      play(meridianNpcScript(npc, q)!.steps, q);
    };
    talk('tobias');
    talk('mina');
    talk('lyra_meridian');
    talk('anders');
    expect(q['Q1.4']).toBe('crates');
    q['Q1.4'] = 'solved'; // the crate yard
    talk('anders');
    talk('rhea');
    expect(q['Q1.5']).toBe('helms');
    q['Q1.5'] = 'solved'; // the Three Helms
    talk('rhea');
    talk('oren');
    // Oren sends you to Gilda's Model Market for his practice; the market moves Q1.6 on.
    expect(q['Q1.6']).toBe('market');
    expect(meridianTarget(q)).toMatchObject({ ids: ['market:counter'] });
    talk('oren');
    expect(q['Q1.6']).toBe('market');
    q['Q1.6'] = 'practiced'; // the market's practice (puzzles/market.json → lesson)
    talk('oren');
    expect(q['Q1.6']).toBe('done');
    talk('pell');
    expect(q['Q1.7']).toBe('letters');
    q['Q1.7'] = 'solved'; // the Lost Letters
    talk('pell');
    talk('admiral');
    expect(MERIDIAN_QUESTS.every((d) => d.optional || q[d.id] === 'done')).toBe(true);
    expect(meridianCurrent(q)).toBeNull();
    expect(meridianTracker(q).tasks.every((t) => t.status === 'done')).toBe(true);
  });

  it('points the compass at every step, and the Admiral skips her introduction on a retry', () => {
    for (const d of MERIDIAN_QUESTS.filter((x) => !x.optional))
      for (const step of Object.keys(d.steps))
        if (step !== 'done') expect(MERIDIAN_TARGETS[`${d.id}:${step}`], `${d.id}:${step}`).toBeTruthy();
    expect(meridianTarget({})?.label).toBe('Tobias');
    const retry = meridianNpcScript('admiral', { 'Q1.7': 'done', 'Q1.8': 'exam' })!.steps;
    expect(retry[0]).toEqual({ say: 'mer.admiral.retry' });
    expect(retry).toContainEqual({ trial: 'A1' });
  });

  it('keeps Oren’s talk short, practises at the market, and moves prompt history to Pell', () => {
    const before = { 'Q1.1': 'done', 'Q1.2': 'done', 'Q1.3': 'done', 'Q1.4': 'done', 'Q1.5': 'done' };
    const intro = meridianNpcScript('oren', { ...before, 'Q1.6': 'start' })!.steps;
    // One check (the model control) before the practice, and the setup form; Retry's check comes after.
    expect(intro.filter((s) => 'quiz' in s)).toEqual([{ quiz: 'H1.3' }]);
    expect(intro).toContainEqual({ askSetup: 'model' });
    expect(intro.at(-1)).toEqual({ quest: 'Q1.6', step: 'market' });
    expect(intro.some((s) => 'askSetup' in s && s.askSetup === 'os')).toBe(false);
    expect(meridianNpcScript('oren', { ...before, 'Q1.6': 'market' })!.steps).toEqual([
      { say: 'mer.oren.market.wait' },
    ]);
    const debrief = meridianNpcScript('oren', { ...before, 'Q1.6': 'practiced' })!.steps;
    expect(debrief.filter((s) => 'quiz' in s)).toEqual([{ quiz: 'R1.1' }]);
    expect(debrief).toContainEqual({ quest: 'Q1.6', step: 'done' });
    expect(meridianTarget({ ...before, 'Q1.6': 'practiced' })).toMatchObject({
      ids: ['lift:bottom', 'npc:oren'],
    });
    const pell = meridianNpcScript('pell', { ...before, 'Q1.6': 'done', 'Q1.7': 'solved' })!.steps;
    const at = (x: object) => pell.findIndex((s) => JSON.stringify(s) === JSON.stringify(x));
    expect(at({ say: 'mer.pell.prompts' })).toBeGreaterThan(-1);
    expect(at({ askSetup: 'os' })).toBe(at({ say: 'mer.pell.prompts' }) + 1);
    expect(at({ quiz: 'N1.5' })).toBe(at({ askSetup: 'os' }) + 1);
    expect(at({ file: 'pg1.prompts' })).toBeGreaterThan(at({ quiz: 'N1.5' }));
  });

  it('sends you to Pell’s letters, debriefs once they’re filed, and offers them to older saves', () => {
    const before = { 'Q1.1': 'done', 'Q1.2': 'done', 'Q1.3': 'done', 'Q1.4': 'done', 'Q1.5': 'done' };
    const q: Record<string, string> = { ...before, 'Q1.6': 'done', 'Q1.7': 'start' };
    const intro = meridianNpcScript('pell', q)!.steps;
    expect(intro).toContainEqual({ quest: 'Q1.7', step: 'letters' });
    expect(intro.some((s) => 'quiz' in s)).toBe(false);
    expect(meridianTarget({ ...q, 'Q1.7': 'letters' })).toMatchObject({ ids: ['letters:*'] });
    expect(meridianNpcScript('pell', { ...q, 'Q1.7': 'letters' })!.steps).toEqual([
      { say: 'mer.pell.letters.wait' },
    ]);
    const debrief = meridianNpcScript('pell', { ...q, 'Q1.7': 'solved' })!.steps;
    expect(debrief).toContainEqual({ quiz: 'H1.4' });
    expect(debrief).toContainEqual({
      show: expect.stringMatching(/app-settings/),
      caption: expect.any(String),
    });
    expect(debrief.at(-1)).toEqual({ quest: 'Q1.8', step: 'start' });
    // A save that finished Pell before the letters existed keeps its quest, and hears there's a bundle.
    const old = { ...q, 'Q1.7': 'done' };
    expect(meridianNpcScript('pell', old, { lettersFiled: false })!.steps).toEqual([
      { say: 'mer.pell.letters.again' },
    ]);
    expect(meridianNpcScript('pell', old, { lettersFiled: true })!.steps).toEqual([{ say: 'mer.pell.done' }]);
    expect(meridianNpcScript('pell', old)!.steps).toEqual([{ say: 'mer.pell.done' }]);
    expect(meridianCurrent(old)?.id).toBe('Q1.8');
  });

  it('keeps the Model Market optional: listed once Gilda’s said hello, never in the way of the Seal', () => {
    const market = MERIDIAN_QUESTS.find((d) => d.id === 'Q1.A')!;
    expect(market.optional).toBe(true);
    expect(meridianTracker({}).tasks.some((t) => t.id === 'Q1.A')).toBe(false);
    const started = meridianTracker({ 'Q1.A': 'start' });
    expect(started.tasks.find((t) => t.id === 'Q1.A')).toMatchObject({ status: 'active', optional: true });
    expect(started.tasks.find((t) => t.id === 'Q1.A')!.detail).toMatch(/Gilda/);
    expect(meridianCurrent({ 'Q1.A': 'start' })?.id).toBe('Q1.1');
    const all = Object.fromEntries(MERIDIAN_QUESTS.filter((d) => !d.optional).map((d) => [d.id, 'done']));
    expect(meridianCurrent({ ...all, 'Q1.A': 'start' })).toBeNull();
    expect(meridianTracker({ ...all, 'Q1.A': 'done' }).tasks.at(-1)).toMatchObject({
      id: 'Q1.A',
      status: 'done',
    });
  });

  it('shows the current step’s detail in the tracker', () => {
    const t = meridianTracker({ 'Q1.1': 'done', 'Q1.2': 'done', 'Q1.3': 'done', 'Q1.4': 'crates' });
    const active = t.tasks.find((x) => x.status === 'active')!;
    expect(active.id).toBe('Q1.4');
    expect(active.detail).toMatch(/crate/);
  });
});
