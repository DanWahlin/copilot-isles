import { describe, expect, it } from 'vitest';
import { beatSteps, pickBeat, type Beat } from './beats';

const BEATS: readonly Beat[] = [
  { npc: 'mina', when: { 'Q1.1': { not: 'done' } }, say: 'wait' },
  { npc: 'mina', when: { 'Q1.2': ['talk', null] }, script: 'tour' },
  { npc: ['mina', 'pell'], when: { $filed: true }, say: 'filed' },
  { npc: 'mina', when: { 'Q1.2': 'done' }, none: true },
];

describe('NPC beats (COURSE-PACKS.md §9, step 2)', () => {
  it('takes the first row for the NPC whose conditions all hold', () => {
    expect(pickBeat(BEATS, 'mina', {})?.say).toBe('wait');
    expect(pickBeat(BEATS, 'mina', { 'Q1.1': 'done' })?.script).toBe('tour');
    expect(pickBeat(BEATS, 'mina', { 'Q1.1': 'done', 'Q1.2': 'talk' })?.script).toBe('tour');
    expect(pickBeat(BEATS, 'mina', { 'Q1.1': 'done', 'Q1.2': 'go' })).toBeNull();
  });

  it('reads flags exactly, and a row may serve several NPCs', () => {
    const q = { 'Q1.1': 'done', 'Q1.2': 'go' };
    expect(pickBeat(BEATS, 'mina', q, { filed: true })?.say).toBe('filed');
    expect(pickBeat(BEATS, 'pell', q, { filed: true })?.say).toBe('filed');
    expect(pickBeat(BEATS, 'pell', q, {})).toBeNull();
  });

  it('turns a beat into steps: a line, a script, or nothing to offer', () => {
    const script = (name: string) => [{ say: `${name}.01` }];
    expect(beatSteps({ npc: 'x', say: 'a' }, script)).toEqual({ steps: [{ say: 'a' }] });
    expect(beatSteps({ npc: 'x', script: 'tour' }, script)).toEqual({ steps: [{ say: 'tour.01' }] });
    expect(beatSteps(pickBeat(BEATS, 'mina', { 'Q1.1': 'done', 'Q1.2': 'done' }), script)).toBeNull();
    expect(beatSteps(null, script)).toBeNull();
  });
});
