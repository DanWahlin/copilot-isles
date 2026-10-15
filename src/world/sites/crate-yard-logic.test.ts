import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  undo,
  type PushRecord,
} from './crate-yard-logic';

const L = MERIDIAN_YARD;
const idx = (id: string) => L.crates.findIndex((c) => c.id === id);
const lock = JSON.parse(readFileSync(join(__dirname, '../../../content/course.lock.json'), 'utf8')) as {
  chapters: Record<string, { sections: Record<string, { hash: string }> }>;
};

describe('crate yard', () => {
  it('has a plate for every crate, all starting off the plates in the yard', () => {
    expect(L.crates.filter((c) => c.kind === 'chat')).toHaveLength(L.chatPlates.length);
    expect(L.crates.filter((c) => c.kind === 'project')).toHaveLength(L.projectPlates.length);
    const s = initialState(L);
    for (const [x, z] of s.at) expect(plateAt(L, x, z)).toBeNull();
    expect(new Set(s.at.map(([x, z]) => `${x},${z}`)).size).toBe(L.crates.length);
    expect(crateAt(s, L.entry[0], L.entry[1])).toBe(-1);
    for (const c of L.crates) {
      expect(c.label.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.label.length, c.id).toBeLessThanOrEqual(3);
      for (const line of c.label) expect(line.length, `${c.id}: ${line}`).toBeLessThanOrEqual(12);
      expect(c.why.length).toBeGreaterThan(20);
    }
  });

  it('teaches the course’s rule: the read-only tour needs the repository, the general question doesn’t', () => {
    const tour = L.crates[idx('tour')]!;
    const worktree = L.crates[idx('worktree')]!;
    expect(tour.kind).toBe('project');
    expect(tour.why).toBe('No files change, but it needs your repository. That’s a project session.');
    expect(worktree.kind).toBe('chat');
    // Each trick crate starts one push from the wrong plate.
    expect(plateAt(L, tour.at[0] - 1, tour.at[1])).toBe('chat');
    expect(plateAt(L, worktree.at[0] + 1, worktree.at[1])).toBe('project');
    // No reason leans on "does it change files" alone.
    for (const c of L.crates) expect(c.why, c.id).not.toMatch(/^.*changes files/);
  });

  it('cites a course section for every reason, and the section’s hash is current', () => {
    for (const c of L.crates) {
      const section = lock.chapters[c.source.chapter]?.sections[c.source.anchor];
      expect(section, `${c.id}: #${c.source.anchor}`).toBeDefined();
      expect(c.source.hash, c.id).toBe(section!.hash);
    }
  });

  it('refuses the trick crates on the wrong plate and leaves them where they were', () => {
    const s = initialState(L);
    const tour = idx('tour');
    const [tx, tz] = L.crates[tour]!.at;
    expect(push(L, s, [tx + 1, tz], 'w')).toEqual({ ok: false, reason: 'wrong-plate', crate: tour });
    expect(s.at[tour]).toEqual([tx, tz]);
    const wt = idx('worktree');
    const [wx, wz] = L.crates[wt]!.at;
    expect(push(L, s, [wx - 1, wz], 'e')).toEqual({ ok: false, reason: 'wrong-plate', crate: wt });
    expect(s.at[wt]).toEqual([wx, wz]);
  });

  it('pushes a crate onto the right plate, but not through another crate or the edge', () => {
    const s = initialState(L);
    const pr = idx('pr');
    // "Open a pull request" at [3,2] goes straight onto the project plate at [4,2].
    expect(push(L, s, [2, 2], 'e')).toMatchObject({ ok: true, crate: pr, to: [4, 2], placed: true });
    // "Add a test" at [3,3] can't be pushed west onto "Ask a quick question" at [2,3].
    expect(push(L, s, [4, 3], 'w')).toMatchObject({ ok: false, reason: 'blocked', crate: idx('test') });
    expect(push(L, s, [4, 4], 'n')).toMatchObject({ ok: false, reason: 'none' });
    // Nor off the yard's edge.
    expect(push(L, s, [2, 1], 'n')).toMatchObject({ ok: false, reason: 'blocked', crate: idx('bug') });
    expect(push(L, s, [0, 4], 'n')).toMatchObject({ ok: false, reason: 'none' });
  });

  it('undoes the last push, unless someone’s standing where the crate goes back', () => {
    const s = initialState(L);
    const history: PushRecord[] = [];
    const pr = idx('pr');
    const r = push(L, s, [2, 2], 'e');
    expect(r.ok).toBe(true);
    history.push({ crate: pr, from: [3, 2] });
    expect(undo(s, history, (x, z) => x === 3 && z === 2)).toBe(-1);
    expect(s.at[pr]).toEqual([4, 2]);
    expect(undo(s, history)).toBe(pr);
    expect(s.at[pr]).toEqual([3, 2]);
    expect(history).toHaveLength(0);
    expect(undo(s, history)).toBe(-1);
  });

  it('can be solved from the start in a handful of pushes, quickly enough for a hint', () => {
    const t = performance.now();
    const path = solve(L, initialState(L), L.entry);
    expect(performance.now() - t).toBeLessThan(1500);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(15);
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
    expect(deadCrate(L, 'project', 2, 0)).toBe(false);
    expect(deadCrate(L, 'project', 4, 4)).toBe(true);
    expect(deadCrate(L, 'project', 2, 2)).toBe(false);
  });

  it('the player can reach a cell next to every crate at the start', () => {
    const s = initialState(L);
    const reach = reachable(L, s, L.entry);
    for (const [x, z] of s.at) {
      const beside = [
        [x + 1, z],
        [x - 1, z],
        [x, z + 1],
        [x, z - 1],
      ].some(([a, b]) => reach.has(`${a},${b}`));
      expect(beside, `${x},${z}`).toBe(true);
    }
  });
});
