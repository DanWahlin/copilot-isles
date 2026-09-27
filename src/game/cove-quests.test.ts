import { describe, expect, it } from 'vitest';
import { boardingOpen, currentQuest, npcScript, questTarget, questTracker } from './cove-quests';

const through = (last: string): Record<string, string> => {
  const order = ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.6', 'Q0.7', 'Q0.8', 'Q0.10', 'Q0.11'];
  const q: Record<string, string> = {};
  for (const id of order.slice(0, order.indexOf(last) + 1)) q[id] = 'done';
  return q;
};

describe('Anchorage guidance', () => {
  it('keeps the gangway up until the ship is christened', () => {
    expect(boardingOpen({ 'Q0.2': 'start' })).toBe(false);
    expect(boardingOpen({ ...through('Q0.10'), 'Q0.11': 'start' })).toBe(false);
    expect(boardingOpen({ ...through('Q0.10'), 'Q0.11': 'sail' })).toBe(true);
    expect(boardingOpen(through('Q0.11'))).toBe(true);
  });

  it('ends the christening with the walk up the gangway', () => {
    const beat = npcScript('nell', { ...through('Q0.10'), 'Q0.11': 'start' });
    expect(beat?.steps.at(-1)).toEqual({ quest: 'Q0.11', step: 'sail' });
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
    expect(questTarget({ ...through('Q0.4'), 'Q0.5': 'gear' })?.ids).toEqual(['gear:*']);
    // First Words asks which fitting carries the prompt: the marker mustn't pick one for you.
    expect(questTarget({ ...through('Q0.7'), 'Q0.8': 'pipes' })?.ids).toEqual(['pipe:*']);
    expect(questTarget({ ...through('Q0.10'), 'Q0.11': 'sail' })?.ids).toEqual(['ship:board']);
    expect(questTarget(through('Q0.11'))).toBeNull();
  });

  it('skips the optional bard when working out what is current', () => {
    const q = { ...through('Q0.8'), 'Q0.9': 'start', 'Q0.10': 'start' };
    expect(currentQuest(q)?.id).toBe('Q0.10');
  });

  it('says what comes next once every task is done', () => {
    expect(questTracker(through('Q0.11')).next).toMatch(/Port Meridian/);
  });
});
