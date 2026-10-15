import { describe, expect, it } from 'vitest';
import { roundSolution } from './boards';
import { ChannelRoutingModel, TWIST_CHOICES } from './model';
import { describeRun, workspaceVerdicts } from './puzzle';
import { CREW_ORDERS, WORKSPACES } from './workspaces';

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
    // Every channel's dug: the tiles don't turn, you pick where each crew works.
    expect(m.wrongTile()).toBeNull();
    expect(m.turn([0, 0])).toBe(false);
    expect(m.runWorkspaces()).toBeNull();
    m.pick('feature', 'checkout');
    m.pick('bugfix', 'worktree');
    m.pick('docs', 'checkout');
    const wrong = m.runWorkspaces()!;
    expect(wrong.solved).toBe(false);
    expect(wrong.problem).toEqual({ crew: 'feature', pick: 'checkout', best: 'worktree' });
    expect(wrong.verdicts.docs.right).toBe(true);
    // The current checkout runs into the Great Hall; the cloud crew never touches the board.
    expect(wrong.flows.find((f) => f.crew === 'feature')?.end).toBe('mainHall');
    expect(workspaceVerdicts(wrong).feature).toEqual({
      right: false,
      text: 'Current checkout doesn’t fit this order.',
    });
    m.drain();
    m.pick('feature', 'worktree');
    m.pick('bugfix', 'cloud');
    const ok3 = m.runWorkspaces()!;
    expect(ok3.solved).toBe(true);
    expect(ok3.flows.map((f) => [f.crew, f.end])).toEqual([
      ['feature', 'wheel'],
      ['docs', 'mainHall'],
    ]);
    expect(workspaceVerdicts(ok3).docs.text).toBe(
      'Right: a quick, low-stakes look can run in your current checkout.',
    );
    expect(m.state.phase).toBe('solved');

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
    const m = new ChannelRoutingModel(2);
    const start = m.state.board;
    expect(m.turn([1, 1])).toBe(false);
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

  it('gives every crew a best place, and never calls a new worktree wrong where the order leaves it open', () => {
    expect(WORKSPACES.map((w) => w.name)).toEqual(['New worktree', 'Current checkout', 'Cloud']);
    expect(new Set(Object.values(CREW_ORDERS).map((o) => o.best)).size).toBe(3);
    for (const o of Object.values(CREW_ORDERS)) {
      expect(o.accept, o.order).toContain(o.best);
      for (const w of WORKSPACES)
        if (!o.accept.includes(w.id)) expect(o.why[w.id], `${o.order} ${w.id}`).toBeTruthy();
      // "When in doubt, choose a new worktree": only an order that asks to offload the work and keep
      // the machine untouched may refuse it (02 §Where a Session Runs).
      if (!o.accept.includes('worktree')) {
        expect(o.best).toBe('cloud');
        expect(o.order).toMatch(/offload.*untouched/);
      }
    }
    // The quick look: Current checkout or the safe default.
    expect(CREW_ORDERS.docs.accept).toEqual(['checkout', 'worktree']);
    const m = new ChannelRoutingModel(3);
    expect(m.wrongCrew()).toBe('feature');
    m.pick('feature', 'worktree');
    m.pick('bugfix', 'cloud');
    expect(m.wrongCrew()).toBe('docs');
    m.reset();
    expect(m.picks).toEqual({ feature: null, bugfix: null, docs: null });
  });

  it('takes a new worktree for the quick look too: the safe default is never wrong there', () => {
    const m = new ChannelRoutingModel(3);
    m.pick('feature', 'worktree');
    m.pick('bugfix', 'cloud');
    m.pick('docs', 'worktree');
    expect(m.wrongCrew()).toBeNull();
    const run = m.runWorkspaces()!;
    expect(run.solved).toBe(true);
    expect(workspaceVerdicts(run).docs).toEqual({
      right: true,
      text: 'That works too. A new worktree is the safe default; for a quick look, Current checkout is fine as well.',
    });
    // Docs on its own channel: its water reaches its wheel.
    expect(run.flows.find((f) => f.crew === 'docs')?.end).toBe('wheel');
    const cloud = new ChannelRoutingModel(3);
    cloud.pick('feature', 'worktree');
    cloud.pick('bugfix', 'cloud');
    cloud.pick('docs', 'cloud');
    expect(cloud.runWorkspaces()!.problem).toEqual({ crew: 'docs', pick: 'cloud', best: 'checkout' });
  });

  it('turns one wrong tile for Wingman’s third hint', () => {
    const m = new ChannelRoutingModel(2);
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
