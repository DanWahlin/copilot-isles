import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  currentQuest,
  npcScript,
  POL_SOLVED,
  questTarget,
  questTracker,
  type QuestState,
} from './cove-quests';
import { migrateQuests, storyHolds } from './story';

const ORDER = ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.7', 'Q0.8', 'Q0.10', 'Q0.11'];
const through = (last: string): Record<string, string> => {
  const q: Record<string, string> = {};
  for (const id of ORDER.slice(0, ORDER.indexOf(last) + 1)) q[id] = 'done';
  return q;
};
const boardingOpen = (q: QuestState) => storyHolds('anchorage', 'gangwayDown', q);
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

  it('keeps Nell short: a handful of lines, one card (her chest), a sign-in hotspot, and the key screens', () => {
    const steps = npcScript('nell', { 'Q0.2': 'start' })!.steps;
    expect(steps.filter((s) => 'say' in s).length).toBeLessThanOrEqual(5);
    // The chest is her only reveal card; the install and New view pages go straight to the Logbook.
    expect(steps.filter((s) => 'page' in s)).toEqual([]);
    // Which button signs you in is yours to pick (on the sign-in screen), before Connect your repositories.
    const signIn = steps.findIndex((s) => 'quiz' in s && s.quiz === 'H0.1');
    expect(signIn).toBeGreaterThan(steps.findIndex((s) => 'say' in s && s.say === 'nell.papers.app'));
    expect(signIn).toBeLessThan(steps.findIndex((s) => 'say' in s && s.say === 'nell.papers.05'));
    const shown = steps.flatMap((s) => ('show' in s ? [s.show] : []));
    expect(shown).toEqual(expect.arrayContaining(['shared/app-github-copilot-app', 'ch01/app-settings']));
  });

  it('splits Bo in two: the session at Bo, then the checks you run at his rack', () => {
    const steps = npcScript('dockhand_b', through('Q0.3'))!.steps;
    expect(steps.flatMap((s) => ('quiz' in s ? [s.quiz] : []))).toEqual(['H0.4']);
    expect(steps.filter((s) => 'say' in s).length).toBeLessThanOrEqual(4);
    expect(steps.at(-1)).toEqual({ quest: 'Q0.4', step: 'checks' });
    const checks = { ...through('Q0.3'), 'Q0.4': 'checks' };
    expect(questTarget(checks)).toEqual({ ids: ['gear:rack'], label: 'Bo’s gear rack' });
    // At the rack, Bo barks; the rack's own scripts carry the rest (puzzles/gear-rack.json).
    expect(npcScript('dockhand_b', checks)).toBeNull();
    expect(npcScript('dockhand_b', through('Q0.4'))).toBeNull();
  });

  it('sends you from Bo to Suri’s gate lever (Actions first), then up the pier to Pim and Pol, with no walk back', () => {
    const actions = { ...through('Q0.4'), 'Q0.7': 'actions' };
    expect(currentQuest(actions)).toMatchObject({ id: 'Q0.7', step: 'actions' });
    expect(questTarget(actions)).toEqual({ ids: ['npc:suri', 'mill:lever'], label: 'Suri’s gate lever' });
    expect(questTracker(actions).tasks.find((t) => t.id === 'Q0.7')!.detail).toMatch(/Actions tab/);
    // Suri explains her gate (your fork's Actions tab) and gives the page; Pim and Pol point you to her.
    const suri = npcScript('suri', actions)!.steps;
    expect(suri[0]).toEqual({ say: 'suri.actions.01' });
    expect(suri).toContainEqual({ page: 'pg.workflows', doubloons: 10 });
    expect(suri.some((s) => 'quest' in s)).toBe(false);
    expect(npcScript('pol', actions)!.steps).toEqual([{ say: 'pim.brief.03' }]);
    // Lever pulled: Pim and Pol brief you at the crane, then it's yours.
    const brief = { ...through('Q0.4'), 'Q0.7': 'brief' };
    expect(questTarget(brief)).toEqual({ ids: ['npc:pim', 'npc:pol'], label: 'Pim and Pol' });
    const steps = npcScript('pim', brief)!.steps;
    expect(steps.at(-1)).toEqual({ quest: 'Q0.7', step: 'crane' });
    // A captain who pulled the lever without Suri's talk still gets the Actions page, silently.
    expect(steps).toContainEqual({ file: 'pg.workflows', doubloons: 10 });
    expect(npcScript('suri', brief)!.steps).toEqual([{ say: 'suri.actions.02' }]);
    const crane = { ...through('Q0.4'), 'Q0.7': 'crane' };
    expect(questTarget(crane)?.ids).toEqual(['crane:*']);
    expect(npcScript('suri', crane)!.steps).toEqual([{ say: 'suri.actions.02' }]);
    expect(npcScript('suri', through('Q0.3'))!.steps).toEqual([{ say: 'suri.idle.dry' }]);
  });

  it('keeps the crane talk short: five lines to brief, five to close (with what to do if the line’s wrong or the issues are missing)', () => {
    const brief = npcScript('pim', { ...through('Q0.4'), 'Q0.7': 'brief' })!.steps;
    expect(brief.filter((s) => 'say' in s)).toHaveLength(5);
    const solved = npcScript('pol', { ...through('Q0.4'), 'Q0.7': 'solved' })!.steps;
    expect(solved.filter((s) => 'say' in s)).toHaveLength(5);
    expect(solved).toContainEqual({ say: 'pim.solved.fork' });
    expect(solved).toContainEqual({ say: 'pol.solved.issues' });
    expect(solved).toContainEqual({ file: 'pg.items-missing' });
  });

  it('has Suri show the practice checks once the crane’s done, one failing on purpose', () => {
    const q = { ...through('Q0.7'), 'Q0.6': 'start' };
    const brief = npcScript('suri', q)!.steps;
    expect(brief.at(-1)).toEqual({ quest: 'Q0.6', step: 'sluice' });
    const solved = npcScript('suri', { ...q, 'Q0.6': 'solved' })!.steps;
    expect(solved).toContainEqual({ page: 'pg.checks', doubloons: 15 });
    expect(solved.at(-1)).toEqual({ quest: 'Q0.6', step: 'done' });
  });

  it('asks for your fork at Ezra’s register, and again at the crane before its Actions link', () => {
    const ezra = npcScript('merchant', through('Q0.2'))!.steps;
    const register = ezra.findIndex((s) => 'askFork' in s);
    expect(ezra[register]).toEqual({ askFork: 'ezra', line: 'ezra.fork.register' });
    expect(register).toBeGreaterThan(ezra.findIndex((s) => 'page' in s && s.page === 'pg.fork'));
    expect(register).toBeLessThan(ezra.findIndex((s) => 'quiz' in s && s.quiz === 'S0.3'));
    const brief = npcScript('pim', { ...through('Q0.4'), 'Q0.7': 'brief' })!.steps;
    const ask = brief.findIndex((s) => 'askFork' in s);
    expect(ask).toBeGreaterThan(0);
    expect(ask).toBeLessThan(brief.findIndex((s) => 'file' in s && s.file === 'pg.workflows'));
    const voiced = new Set(
      (
        JSON.parse(readFileSync(join(__dirname, '../../courses/copilot-app/voice/lines.json'), 'utf8')) as {
          lines: { id: string }[];
        }
      ).lines.map((l) => l.id),
    );
    const suri = ['start', 'solved'].flatMap(
      (step) => npcScript('suri', { ...through('Q0.7'), 'Q0.6': step })!.steps,
    );
    const actions = [
      ...npcScript('suri', { ...through('Q0.4'), 'Q0.7': 'actions' })!.steps,
      ...npcScript('suri', { ...through('Q0.4'), 'Q0.7': 'brief' })!.steps,
      ...npcScript('suri', { ...through('Q0.4'), 'Q0.7': 'crane' })!.steps,
      { say: 'pol.refuse.actions.01' },
    ];
    for (const s of [...ezra, ...brief, ...POL_SOLVED, ...suri, ...actions]) {
      if ('say' in s) expect(voiced.has(s.say), s.say).toBe(true);
      if ('askFork' in s && s.line) expect(voiced.has(s.line), s.line).toBe(true);
    }
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
      task: 'Fork the course and add it under Sessions',
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
    expect(questTarget({ ...through('Q0.3'), 'Q0.4': 'checks' })?.ids).toEqual(['gear:rack']);
    expect(questTarget({ ...through('Q0.4'), 'Q0.7': 'actions' })?.ids).toEqual(['npc:suri', 'mill:lever']);
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
    expect(finished['Q0.7']).toBe('actions');
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

  it('sends a save waiting at the crane back to Suri’s gate lever if workflows are still off', () => {
    const waiting: Record<string, string> = { ...through('Q0.4'), 'Q0.7': 'crane' };
    const back: Record<string, string> = { ...waiting };
    migrateQuests(waiting, (id, step) => (back[id] = step), { workflowsOn: false });
    expect(back['Q0.7']).toBe('actions');
    const on: Record<string, string> = { ...waiting };
    migrateQuests(waiting, (id, step) => (on[id] = step), { workflowsOn: true });
    expect(on).toEqual(waiting);
    // No save to read (dev pages): leave it.
    expect(migrated(waiting)).toEqual(waiting);
    // Any other crane step stays, whatever the gate: a finished crane counts as workflows on.
    for (const step of ['actions', 'brief', 'solved', 'done']) {
      const q: Record<string, string> = { ...through('Q0.4'), 'Q0.7': step };
      const out: Record<string, string> = { ...q };
      migrateQuests(q, (id, s) => (out[id] = s), { workflowsOn: false });
      expect(out['Q0.7']).toBe(step);
    }
  });

  it('moves the old first crane step (Pim and Pol before the lever) to Suri’s gate, or on to the briefing', () => {
    const old: Record<string, string> = { ...through('Q0.4'), 'Q0.7': 'start' };
    const run = (workflowsOn?: boolean) => {
      const out: Record<string, string> = { ...old };
      migrateQuests(old, (id, s) => (out[id] = s), { workflowsOn });
      return out['Q0.7'];
    };
    expect(run(false)).toBe('actions');
    expect(run(undefined)).toBe('actions');
    expect(run(true)).toBe('brief');
    // Twice changes nothing.
    const once = migrated(old);
    expect(migrated(once)).toEqual(once);
  });

  it('leaves a current save alone', () => {
    const q = { ...through('Q0.7'), 'Q0.8': 'pipes', 'Q0.6': 'start' };
    expect(migrated(q)).toEqual(q);
  });
});
