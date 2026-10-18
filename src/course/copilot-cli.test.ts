import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activateCourse } from './load';
import { COURSE, COURSES, courseVoiced } from './catalog';
import { coursePack } from './active';
import { puzzleOn } from './puzzles';
import { meridianOpen } from '../game/meridian-open';
import { thousandBoughOpen } from '../game/thousand-bough-open';
import { openIslands } from '../game/islands';
import { npcScript, questTracker, migrateQuests } from '../game/cove-quests';
import { ARCHIPELAGO } from '../ui/chart/archipelago';
import { CRANE_CARGO, CRANE_FACINGS } from '../world/sites/crane-logic';
import { GEAR_IDS, gearDef } from '../world/sites/gear-logic';
import { BATTLE_PLANS } from '../world/battle/battle';
import { QUIZZES, PAGES, TRIALS } from '../learn/content/index';
import { chartLabel } from '../learn/content/labels';
import { islandCourseBoard } from '../learn/course-board';
import { BRIEFING } from '../opening/briefing';
import { COURSE_ISSUE } from '../learn/setup';
import { MERIDIAN_WELCOME } from '../game/meridian-quests';
import type { ScriptStep } from '../game/script';

/**
 * The second course (docs/specs/COURSE-PACKS.md §8): GitHub Copilot CLI for Beginners, Anchorage only,
 * text only. Activating it swaps every course-derived value the game keeps; activating the Copilot app
 * course again puts them back.
 */
describe('the Copilot CLI course pack', () => {
  beforeAll(async () => {
    await activateCourse('copilot-cli');
  });
  afterAll(async () => {
    await activateCourse('copilot-app');
  });

  it('is in the catalog, text only, on Anchorage alone', () => {
    expect(COURSES.map((c) => c.id)).toEqual(['copilot-app', 'copilot-cli']);
    expect(COURSE.id).toBe('copilot-cli');
    expect(coursePack().id).toBe('copilot-cli');
    expect(courseVoiced()).toBe(false);
    expect(COURSE.islands.map((i) => i.island)).toEqual(['anchorage']);
    expect(meridianOpen()).toBe(false);
    expect(thousandBoughOpen()).toBe(false);
    expect(openIslands().map((i) => i.id)).toEqual(['anchorage']);
    // Uncharted: the other islands have no chapter in this course.
    expect(ARCHIPELAGO.filter((i) => i.chapter).map((i) => i.id)).toEqual(['anchorage']);
    expect(MERIDIAN_WELCOME).toEqual([]);
    expect(COURSE_ISSUE).toBe(0);
  });

  it('plays its quest line: each NPC’s beat at each step, ending at the christening', () => {
    const steps = (npc: string, q: Record<string, string>) =>
      (npcScript(npc, q)?.steps ?? []).flatMap((s: ScriptStep) =>
        'quest' in s ? [`${s.quest}:${s.step}`] : [],
      );
    let q: Record<string, string> = { 'Q0.2': 'start' };
    const play = (npc: string) => {
      for (const s of steps(npc, q)) {
        const [id, step] = s.split(':') as [string, string];
        q = { ...q, [id]: step };
      }
    };
    play('nell');
    expect(q['Q0.3']).toBe('start');
    play('merchant');
    play('dockhand_b');
    play('pim');
    expect(q).toMatchObject({
      'Q0.2': 'done',
      'Q0.3': 'done',
      'Q0.4': 'done',
      'Q0.7': 'done',
      'Q0.8': 'start',
    });
    play('juno');
    expect(q['Q0.8']).toBe('pipes');
    // First Words' reply (the puzzle) finishes Q0.8 and starts the Trial.
    q = { ...q, 'Q0.8': 'done', 'Q0.10': 'start' };
    play('nell');
    expect(q).toMatchObject({ 'Q0.10': 'done', 'Q0.11': 'sail' });
    expect(questTracker(q).tasks.every((t) => t.status === 'done' || t.id === 'Q0.11')).toBe(true);
    // The Copilot app course's save fixes don't touch this course's quests.
    const touched: string[] = [];
    migrateQuests({ 'Q0.4': 'done' }, (id) => touched.push(id));
    expect(touched).toEqual([]);
  });

  it('keeps the puzzles it can’t teach as scenery, and runs First Words', () => {
    expect(puzzleOn('first-words')).toBe(true);
    expect(puzzleOn('christening')).toBe(true);
    for (const off of ['crane', 'sluice', 'gear-rack', 'palette', 'bard'])
      expect(puzzleOn(off), off).toBe(false);
    expect(CRANE_FACINGS.every((f) => f.owner === null)).toBe(true);
    expect(CRANE_CARGO).toEqual([]);
    expect(GEAR_IDS).toHaveLength(4);
    expect(gearDef(GEAR_IDS[0]!).tool).toBe('');
    expect(BATTLE_PLANS.every((p) => p.waves.every((w) => w.quiz === '') && !p.won)).toBe(true);
  });

  it('has its own teaching content, board, label and cabin lines', () => {
    expect(QUIZZES.has('S0.2')).toBe(true);
    expect(PAGES.get('pg.install')?.source.chapter).toBe('00-quick-start');
    expect(TRIALS.get('T0')?.items).toHaveLength(7);
    expect(chartLabel('arrival:anchorage')?.c).toBe('Quick Start');
    expect(chartLabel('puzzle:P0.1')).toBeNull();
    const board = islandCourseBoard('anchorage');
    expect(board?.chapter).toBe('00-quick-start');
    expect(board?.topics.map((t) => t.title)).toContain('Learning Objectives');
    expect(BRIEFING[0]).toBe('cli.juno.cabin.01');
  });
});
