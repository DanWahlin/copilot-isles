import { describe, expect, it } from 'vitest';
import {
  boardingOpen,
  currentQuest,
  migrateQuests,
  npcScript,
  questTarget,
  questTracker,
  type QuestState,
} from './cove-quests';

const ORDER = ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.7', 'Q0.8', 'Q0.10', 'Q0.11'];
const through = (last: string): Record<string, string> => {
  const q: Record<string, string> = {};
  for (const id of ORDER.slice(0, ORDER.indexOf(last) + 1)) q[id] = 'done';
  return q;
};
const migrated = (saved: QuestState) => {
  const q = { ...saved };
  migrateQuests(saved, (id, step) => (q[id] = step));
  return q;
};

describe('Anchorage guidance', () => {
  it('follows Chapter 00 along the harbour in six main tasks and the christening', () => {
    const tasks = questTracker({ 'Q0.2': 'start' }).tasks.map((t) => t.id);
    expect(tasks).toEqual(ORDER);
  });

  it('keeps the gangway up until the ship is christened', () => {
    expect(boardingOpen({ 'Q0.2': 'start' })).toBe(false);
    expect(boardingOpen({ ...through('Q0.10'), 'Q0.11': 'start' })).toBe(false);
    expect(boardingOpen({ ...through('Q0.10'), 'Q0.11': 'sail' })).toBe(true);
    expect(boardingOpen(through('Q0.11'))).toBe(true);
  });

  it('has Nell open her chest of prerequisites while she talks, before the app itself', () => {
    const steps = npcScript('nell', { 'Q0.2': 'start' })!.steps;
    const chest = steps.findIndex((s) => 'cue' in s && s.cue === 'nell-chest');
    const install = steps.findIndex((s) => 'file' in s && s.file === 'pg.install');
    expect(chest).toBeGreaterThan(0);
    expect(install).toBeGreaterThan(chest);
    expect(steps.at(-1)).toEqual({ quest: 'Q0.2', step: 'palette' });
  });

  it('keeps Nell short: a handful of lines, one card (her chest), and the key screens', () => {
    const steps = npcScript('nell', { 'Q0.2': 'start' })!.steps;
    expect(steps.filter((s) => 'say' in s).length).toBeLessThanOrEqual(6);
    // The chest is her only reveal card; the install and New view pages go straight to the Logbook.
    expect(steps.filter((s) => 'page' in s)).toEqual([]);
    const shown = steps.flatMap((s) => ('show' in s ? [s.show] : []));
    expect(shown).toEqual(
      expect.arrayContaining(['shared/app-github-copilot-app', 'ch00/app-sign-in', 'ch01/app-settings']),
    );
  });

  it('has Bo run the checks, which all pass, then GitHub CLI’s sign-in', () => {
    const steps = npcScript('dockhand_b', through('Q0.3'))!.steps;
    const order = steps.flatMap((s) => ('quiz' in s ? [s.quiz] : 'cue' in s ? [s.cue] : []));
    expect(order).toEqual(['H0.4', 'gear-checks', 'S0.1']);
    expect(steps.at(-1)).toEqual({ quest: 'Q0.7', step: 'start' });
    expect(npcScript('dockhand_b', through('Q0.4'))).toBeNull();
  });

  it('has Pim and Pol turn on workflows before the crane', () => {
    const steps = npcScript('pim', { ...through('Q0.4'), 'Q0.7': 'start' })!.steps;
    const workflows = steps.findIndex((s) => 'page' in s && s.page === 'pg.workflows');
    const crane = steps.findIndex((s) => 'quest' in s && s.step === 'crane');
    expect(workflows).toBeGreaterThan(0);
    expect(crane).toBeGreaterThan(workflows);
  });

  it('runs the Trial at the bow and goes straight on to the christening', () => {
    const steps = npcScript('nell', { ...through('Q0.8'), 'Q0.10': 'start' })!.steps;
    const trial = steps.findIndex((s) => 'trial' in s);
    const christen = steps.findIndex((s) => 'cue' in s && s.cue === 'christen');
    expect(trial).toBeGreaterThan(0);
    expect(christen).toBeGreaterThan(trial);
    expect(steps.at(-1)).toEqual({ quest: 'Q0.11', step: 'sail' });
    // Quit after passing: talking to her again picks up at the christening.
    const again = npcScript('nell', { ...through('Q0.10'), 'Q0.11': 'start' })!.steps;
    expect(again.some((s) => 'trial' in s)).toBe(false);
    expect(again.at(-1)).toEqual({ quest: 'Q0.11', step: 'sail' });
  });

  it('shows the next task as current even before anyone has set it', () => {
    const q = { 'Q0.2': 'done' };
    expect(currentQuest(q)).toEqual({
      id: 'Q0.3',
      task: 'Fork the course and add it to Projects',
      step: null,
    });
    const fork = questTracker(q).tasks.find((t) => t.id === 'Q0.3')!;
    expect(fork.status).toBe('active');
    expect(fork.detail).toMatch(/Ezra/);
    expect(questTracker(q).tasks.filter((t) => t.status === 'active')).toHaveLength(1);
  });

  it('points the compass at the current step, and nowhere once the island is done', () => {
    expect(questTarget({ 'Q0.2': 'start' })?.ids).toEqual(['npc:nell']);
    expect(questTarget({ 'Q0.2': 'done' })?.ids).toEqual(['npc:merchant']);
    expect(questTarget(through('Q0.3'))?.ids).toEqual(['npc:dockhand_b']);
    expect(questTarget(through('Q0.4'))?.ids).toEqual(['npc:pim', 'npc:pol']);
    // First Words asks which fitting carries the prompt: the marker mustn't pick one for you.
    expect(questTarget({ ...through('Q0.7'), 'Q0.8': 'pipes' })?.ids).toEqual(['pipe:*']);
    expect(questTarget({ ...through('Q0.8'), 'Q0.10': 'start' })?.ids).toEqual(['npc:nell']);
    expect(questTarget({ ...through('Q0.10'), 'Q0.11': 'sail' })?.ids).toEqual(['ship:board']);
    expect(questTarget(through('Q0.11'))).toBeNull();
  });

  it('skips the optional sluice and bard when working out what is current', () => {
    const q = { ...through('Q0.8'), 'Q0.6': 'start', 'Q0.9': 'start', 'Q0.10': 'start' };
    expect(currentQuest(q)?.id).toBe('Q0.10');
    const optional = questTracker(q).tasks.filter((t) => t.optional);
    expect(optional.map((t) => t.id)).toEqual(['Q0.6', 'Q0.9']);
  });

  it('says what comes next once every task is done', () => {
    expect(questTracker(through('Q0.11')).next).toMatch(/Port Meridian/);
  });
});

describe('older saves', () => {
  it('moves past Nell’s old chest step', () => {
    expect(migrated({ 'Q0.2': 'chest' })['Q0.2']).toBe('palette');
  });

  it('folds the old gear check into Bo’s task', () => {
    const finished = migrated({ ...through('Q0.4'), 'Q0.5': 'done', 'Q0.6': 'sluice' });
    expect(finished['Q0.4']).toBe('done');
    expect(finished['Q0.7']).toBe('start');
    expect(finished['Q0.6']).toBe('sluice');
    const halfway = migrated({ ...through('Q0.4'), 'Q0.5': 'ledger' });
    expect(halfway['Q0.4']).toBe('start');
    expect(halfway['Q0.7']).toBeUndefined();
  });

  it('opens the next step for saves that stopped between tasks', () => {
    expect(migrated(through('Q0.3'))['Q0.4']).toBe('start');
    const afterCrane = migrated(through('Q0.7'));
    expect(afterCrane['Q0.8']).toBe('start');
    expect(afterCrane['Q0.6']).toBe('start');
    expect(migrated(through('Q0.8'))['Q0.10']).toBe('start');
    expect(migrated(through('Q0.10'))['Q0.11']).toBe('start');
  });

  it('leaves a current save alone', () => {
    const q = { ...through('Q0.7'), 'Q0.8': 'pipes', 'Q0.6': 'start' };
    expect(migrated(q)).toEqual(q);
  });
});
