import { describe, expect, it } from 'vitest';
import {
  ANCHORAGE_SLUICE,
  E,
  N,
  S,
  W,
  flow,
  nearestBreak,
  openings,
  sameOpenings,
  shortestTurn,
  solutionPath,
  type SluiceLayout,
} from './sluice-logic';

const L = ANCHORAGE_SLUICE;
const solution = L.tiles.map((t) => t.solution);
const start = L.tiles.map((t) => t.start);

describe('sluice tiles', () => {
  it('rotates openings clockwise', () => {
    expect(openings('corner', 0)).toBe((1 << N) | (1 << E));
    expect(openings('corner', 1)).toBe((1 << E) | (1 << S));
    expect(openings('corner', 2)).toBe((1 << S) | (1 << W));
    expect(openings('corner', 3)).toBe((1 << W) | (1 << N));
    expect(openings('corner', 4)).toBe(openings('corner', 0));
    expect(openings('corner', -1)).toBe(openings('corner', 3));
    expect(sameOpenings('straight', 0, 2)).toBe(true);
    expect(openings('blank', 3)).toBe(0);
    expect(openings('tee', 0)).toBe((1 << N) | (1 << E) | (1 << W));
    expect(openings('tee', 2)).toBe((1 << S) | (1 << W) | (1 << E));
  });

  it('finds the fewest presses either way (E clockwise, Shift+E back)', () => {
    expect(shortestTurn('corner', 1, 1)).toBe(0);
    expect(shortestTurn('corner', 1, 2)).toBe(1);
    expect(shortestTurn('corner', 1, 0)).toBe(-1);
    expect(shortestTurn('corner', 1, 3)).toBe(2);
    expect(shortestTurn('straight', 0, 3)).toBe(1);
    expect(shortestTurn('tee', 3, 2)).toBe(-1);
  });
});

describe('Anchorage sluice', () => {
  it('is solved by the solution: 8 tiles to the wheel, and a branch to the jammed check gate', () => {
    const f = flow(L, solution, true);
    expect(f.solved).toBe(true);
    expect(f.wheel).toBe(true);
    expect(f.check).toBe(true);
    expect(f.path).toEqual([2, 5, 4, 3, 6, 7, 10, 9, 11]);
    expect(solutionPath(L)).toEqual(f.path);
    // The check gate's jammed: the water backs up against it rather than running on.
    expect(f.cells[11]!.pooled & (1 << N)).toBeTruthy();
    expect(f.cells[11]!.through).toBe(0);
    expect(f.cells[9]!.through & (1 << N)).toBeTruthy();
  });

  it('turns the wheel before the check gate has water, but isn’t solved until both outlets do', () => {
    const rots = solution.slice();
    rots[10] = L.tiles[10]!.start; // the tee's start: open west and north, not east
    const f = flow(L, rots, true);
    expect(f.wheel).toBe(true);
    expect(f.check).toBe(false);
    expect(f.solved).toBe(false);
    expect(f.cells[11]!.wet).toBe(false);
  });

  it('stays dry until the gate opens', () => {
    const f = flow(L, solution, false);
    expect(f.solved).toBe(false);
    expect(f.cells.every((c) => !c.wet)).toBe(true);
  });

  it('starts unsolved with only the first channel carrying water', () => {
    const f = flow(L, start, true);
    expect(f.solved).toBe(false);
    expect(f.cells.filter((c) => c.wet).length).toBe(1);
    expect(f.cells[2]!.wet).toBe(true);
    // The first tile's north end runs into a corner facing away, so the water pools there.
    expect(f.cells[2]!.pooled).toBe(1 << N);
  });

  it('has exactly one solution (up to identical openings)', () => {
    const rotatable = L.tiles.map((t, i) => (t.kind === 'blank' ? -1 : i)).filter((i) => i >= 0);
    const choices = rotatable.map((i) => (L.tiles[i]!.kind === 'straight' ? 2 : 4));
    expect(rotatable).toHaveLength(11);
    const rots = L.tiles.map(() => 0);
    let solutions = 0;
    const walk = (k: number) => {
      if (k === rotatable.length) {
        if (flow(L, rots, true).solved) {
          solutions++;
          for (const i of solutionPath(L))
            expect(sameOpenings(L.tiles[i]!.kind, rots[i]!, L.tiles[i]!.solution)).toBe(true);
        }
        return;
      }
      for (let r = 0; r < choices[k]!; r++) {
        rots[rotatable[k]!] = r;
        walk(k + 1);
      }
    };
    walk(0);
    // Caps don't touch the path, so each of their 4 × 4 turns leaves the same solution.
    expect(solutions).toBe(16);
  });

  it('takes a dozen presses from the start with Shift+E, two of them anticlockwise', () => {
    const turns = solutionPath(L).map((i) => shortestTurn(L.tiles[i]!.kind, start[i]!, solution[i]!));
    expect(turns.reduce((a, k) => a + Math.abs(k), 0)).toBe(12);
    expect(turns.filter((k) => k < 0)).toHaveLength(2);
  });

  it('points hint tier 2 at the first wrong tile from the spring', () => {
    const path = solutionPath(L);
    expect(nearestBreak(L, start, path)).toBe(5);
    const almost = solution.slice();
    almost[9] = 1;
    expect(nearestBreak(L, almost, path)).toBe(9);
    expect(nearestBreak(L, solution, path)).toBe(-1);
  });

  it('marks dead ends against the edge and caps as pooled', () => {
    const tiny: SluiceLayout = {
      rows: 1,
      cols: 2,
      tiles: [
        { kind: 'straight', solution: 1, start: 1 },
        { kind: 'cap', solution: 3, start: 3 },
      ],
      source: { row: 0, col: 0, side: W },
      outlet: { row: 0, col: 1, side: E },
    };
    const f = flow(tiny, [1, 3], true, 2.4);
    expect(f.solved).toBe(false);
    expect(f.cells[1]!.wet).toBe(true);
    expect(f.cells[1]!.distance).toBeCloseTo(2.4);
    expect(f.cells[0]!.through).toBe(1 << E);
  });
});
