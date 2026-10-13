import { describe, expect, it } from 'vitest';
import { roundSolution } from './boards';
import { ChannelRoutingModel, TWIST_CHOICES } from './model';
import { describeRun } from './puzzle';

/** Turns tiles the way a player would (one click at a time) until the round's solved. */
function solveByClicks(m: ChannelRoutingModel): number {
  let clicks = 0;
  for (let guard = 0; guard < 80; guard++) {
    const w = m.wrongTile();
    if (!w) return clicks;
    m.setCursor(w);
    m.turn();
    clicks += 1;
  }
  throw new Error('stuck');
}

describe('Channel Routing rounds', () => {
  it('plays all three rounds and the twist', () => {
    const m = new ChannelRoutingModel(1);
    const first = m.run();
    expect(first.solved).toBe(false);
    expect(first.problem).toMatchObject({ crew: 'feature', end: 'deadEnd', at: [0, 2] });
    expect(describeRun(first, 1)).toBe('Feature’s water stops short at row 1, column 3.');
    m.drain();
    expect(solveByClicks(m)).toBeGreaterThan(0);
    expect(m.run().solved).toBe(true);

    m.startRound(2);
    expect(m.state.board[0]![1]!.rot).toBe(roundSolution(1)[0]![1]); // round 1's tiles stay
    const r2 = m.run();
    expect(r2.solved).toBe(false);
    m.drain();
    solveByClicks(m);
    const ok2 = m.run();
    expect(ok2.solved).toBe(true);
    expect(describeRun(ok2, 2)).toMatch(/nothing mixed/);

    m.startRound(3);
    expect(m.state.board[2]![2]!.kind).toBe('rock');
    expect(m.run().solved).toBe(false);
    m.drain();
    solveByClicks(m);
    expect(m.run().solved).toBe(true);

    m.setPhase('twist');
    expect(m.twist('redig').right).toBe(false);
    expect(m.state.phase).toBe('twist');
    expect(m.twist('share').right).toBe(false);
    expect(m.twist('port5174').right).toBe(true);
    expect(m.state.phase).toBe('done');
  });

  it('describes a mix in words, naming the crew and the tile', () => {
    const m = new ChannelRoutingModel(1);
    m.startRound(2, false);
    const r = m.run();
    expect(r.problem?.end).toBe('mixed');
    expect(describeRun(r, 2)).toBe('Feature’s water mixed with another crew’s at row 1, column 3.');
  });

  it('undoes, resets, and won’t turn a rock or a tile while the water runs', () => {
    const m = new ChannelRoutingModel(3);
    const start = m.state.board;
    expect(m.turn([2, 2])).toBe(false);
    expect(m.turn([0, 0])).toBe(true);
    expect(m.state.board).not.toBe(start);
    expect(m.undo()).toBe(true);
    expect(m.state.board).toBe(start);
    m.turn([0, 0]);
    m.turn([1, 1]);
    m.reset();
    expect(m.state.board).toEqual(start);
    m.run();
    expect(m.turn([0, 0])).toBe(false);
    m.drain();
    expect(m.turn([0, 0])).toBe(true);
  });

  it('turns one wrong tile for Wingman’s third hint', () => {
    const m = new ChannelRoutingModel(3);
    const before = m.wrongTile();
    const fixed = m.fixOne();
    expect(fixed).toEqual(before);
    expect(m.wrongTile()).not.toEqual(before);
  });

  it('keeps the cursor on the board', () => {
    const m = new ChannelRoutingModel(1);
    m.setCursor([0, 0]);
    m.moveCursor(-1, -1);
    expect(m.state.cursor).toEqual([0, 0]);
    m.setCursor([3, 4]);
    m.moveCursor(1, 1);
    expect(m.state.cursor).toEqual([3, 4]);
  });

  it('offers four answers to the twist, two of them right', () => {
    expect(TWIST_CHOICES).toHaveLength(4);
    expect(TWIST_CHOICES.filter((c) => c.right).map((c) => c.id)).toEqual(['port5174', 'closeOne']);
  });
});
