import { describe, expect, it } from 'vitest';
import {
  MERIDIAN_YARD,
  deadCrate,
  crateAt,
  initialState,
  plateAt,
  push,
  reachable,
  solve,
  solved,
} from './crate-yard-logic';

const L = MERIDIAN_YARD;

describe('crate yard', () => {
  it('has three crates of each kind, one plate each, all starting off the plates in the yard', () => {
    expect(L.crates.filter((c) => c.kind === 'chat')).toHaveLength(L.chatPlates.length);
    expect(L.crates.filter((c) => c.kind === 'project')).toHaveLength(L.projectPlates.length);
    const s = initialState(L);
    for (const [x, z] of s.at) expect(plateAt(L, x, z)).toBeNull();
    expect(new Set(s.at.map(([x, z]) => `${x},${z}`)).size).toBe(L.crates.length);
    expect(crateAt(s, L.entry[0], L.entry[1])).toBe(-1);
    for (const c of L.crates) {
      expect(c.label.join(' ').length).toBeLessThanOrEqual(24);
      expect(c.why.length).toBeGreaterThan(20);
    }
  });

  it('refuses the wrong crate on a plate and leaves it where it was', () => {
    const s = initialState(L);
    // "Ask a quick question" (chat) next to a project plate, pushed east onto it.
    const q = L.crates.findIndex((c) => c.id === 'question');
    s.at[q] = [4, 3];
    const pr = L.crates.findIndex((c) => c.id === 'pr');
    s.at[pr] = [2, 1];
    const r = push(L, s, [3, 3], 'e');
    expect(r).toEqual({ ok: false, reason: 'wrong-plate', crate: q });
    expect(s.at[q]).toEqual([4, 3]);
  });

  it('pushes a crate onto the right plate, but not through another crate or the edge', () => {
    const s = initialState(L);
    const q = L.crates.findIndex((c) => c.id === 'question');
    // "Ask a quick question" at [1,2] goes straight onto the chat plate at [0,2].
    expect(push(L, s, [2, 2], 'w')).toMatchObject({ ok: true, crate: q, to: [0, 2], placed: true });
    // "Fix a bug" at [2,3] can't be pushed west onto "Summarize" at [1,3].
    const bug = L.crates.findIndex((c) => c.id === 'bug');
    expect(push(L, s, [3, 3], 'w')).toMatchObject({ ok: false, reason: 'blocked', crate: bug });
    // Nor off the yard's edge.
    const test = L.crates.findIndex((c) => c.id === 'test');
    expect(push(L, s, [4, 2], 'n')).toMatchObject({ ok: true, crate: test, to: [4, 0] });
    expect(push(L, s, [4, 1], 'n')).toMatchObject({ ok: false, reason: 'blocked', crate: test });
    expect(push(L, s, [3, 4], 'n')).toMatchObject({ ok: false, reason: 'none' });
  });

  it('can be solved from the start in a handful of pushes, and isn’t trivial', () => {
    const path = solve(L, initialState(L), L.entry);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(13);
    // Replaying the solution solves the yard.
    const s = initialState(L);
    for (const step of path!) expect(push(L, s, step.from, step.dir).ok).toBe(true);
    expect(solved(L, s)).toBe(true);
  });

  it('knows a crate pushed against an edge without its plate is stuck', () => {
    expect(deadCrate(L, 'chat', 3, 0)).toBe(true);
    expect(deadCrate(L, 'chat', 0, 0)).toBe(true);
    expect(deadCrate(L, 'chat', 0, 2)).toBe(false);
    expect(deadCrate(L, 'project', 0, 2)).toBe(true);
    expect(deadCrate(L, 'project', 3, 2)).toBe(false);
    expect(deadCrate(L, 'project', 5, 2)).toBe(false);
  });

  it('the player can reach a cell next to every crate at the start', () => {
    const s = initialState(L);
    const reach = reachable(L, s, L.entry);
    expect(reach.size).toBeGreaterThan(20);
  });
});
