import { describe, expect, it } from 'vitest';
import { BOARD_A_KINDS, CREWS, makeBoard, roundBoard, roundLive, roundSolution, START_A } from './boards';
import { openGates, pathSets, ports, rotate, solved, tileLabel, wrongTile } from './logic';
import type { Crew, Flow, FlowEnd, Rot, Tile } from './types';

const solve = (board: Tile[][], round: 1 | 2 | 3): Tile[][] => {
  let b = board;
  for (let guard = 0; guard < 80; guard++) {
    const w = wrongTile(b, roundSolution(round));
    if (!w) return b;
    b = rotate(b, w[0], w[1]);
  }
  throw new Error('no solution');
};
const ends = (fl: readonly Flow[]) => Object.fromEntries(fl.map((f) => [f.crew, f.end]));

describe('channel routing', () => {
  it('opens the right sides for each tile', () => {
    expect(ports({ kind: 'straight', rot: 0 })).toBe(0b0101);
    expect(ports({ kind: 'straight', rot: 1 })).toBe(0b1010);
    expect(ports({ kind: 'elbow', rot: 0 })).toBe(0b0011); // N–E
    expect(ports({ kind: 'elbow', rot: 1 })).toBe(0b0110); // E–S
    expect(ports({ kind: 'elbow', rot: 2 })).toBe(0b1100); // S–W
    expect(ports({ kind: 'elbow', rot: 3 })).toBe(0b1001); // W–N
    expect(ports({ kind: 'rock', rot: 0 })).toBe(0);
  });

  it('has exactly one set of paths for rounds 1 and 2 (draw.py)', () => {
    expect(pathSets(BOARD_A_KINDS, ['feature'])).toHaveLength(1);
    expect(pathSets(BOARD_A_KINDS, [...CREWS])).toHaveLength(1);
  });

  it('solves rounds 1 and 2 with the solution rotations, and both starts are unsolved', () => {
    for (const round of [1, 2] as const) {
      const start = roundBoard(round);
      expect(solved(openGates(start, roundLive(round)), roundLive(round)), `start ${round}`).toBe(false);
      const done = solve(start, round);
      expect(solved(openGates(done, roundLive(round)), roundLive(round)), `solved ${round}`).toBe(true);
    }
  });

  it('starts round 3 with every crew in its own channel (it’s about where they work)', () => {
    const b = roundBoard(3);
    expect(wrongTile(b, roundSolution(3))).toBeNull();
    expect(solved(openGates(b, roundLive(3)), roundLive(3))).toBe(true);
  });

  it('round 1’s start sends Feature into Bug Fix’s column, and that mixes in round 2', () => {
    const start = roundBoard(1);
    const r1 = openGates(start, roundLive(1));
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ crew: 'feature', end: 'deadEnd', at: [0, 2] });
    const r2 = openGates(start, roundLive(2));
    expect(ends(r2).feature).toBe('mixed');
    expect(r2.find((f) => f.crew === 'feature')!.at).toEqual([0, 2]);
  });

  it('keeps round 1’s tiles for round 2: Feature still flows, Docs and Bug Fix need work', () => {
    const r1 = solve(roundBoard(1), 1);
    const fl = openGates(r1, roundLive(2));
    expect(ends(fl).feature).toBe('wheel');
    expect(solved(fl, roundLive(2))).toBe(false);
  });

  it('can reach every kind of ending', () => {
    const live = roundLive(2);
    const seen = new Set<FlowEnd>();
    const a = makeBoard(BOARD_A_KINDS, START_A);
    for (const f of openGates(a, live)) seen.add(f.end);
    // Feature straight down c1? r1c1 is a rock: a dead end. Turn r0c1 to E–S.
    const dead = rotate(a, 0, 1);
    for (const f of openGates(dead, live)) seen.add(f.end);
    // Bug Fix runs straight down c2 to its own wheel on the start board.
    expect(ends(openGates(a, live)).bugfix).toBe('wheel');
    // Feature to the Great Hall: r0c0 turned E–S → N–E sends it off the north edge.
    const hall = rotate(solve(a, 2), 0, 0, -1);
    expect(openGates(hall, live).find((f) => f.crew === 'feature')!.end).toBe('mainHall');
    seen.add('mainHall');
    // Docs into Bug Fix's wheel (not on Board A, which can't send a crew to another's wheel): an
    // elbow W–N at r0c3 and one E–S at r0c2 send it west and down c2.
    const z = [0, 0, 0, 0, 0] as const;
    const swapped = makeBoard(['SSLLS', 'SSSSS', 'SSSSS', 'SSSSS'], [[0, 0, 1, 3, 0], z, z, z]);
    const docs = openGates(swapped, { feature: false, bugfix: false, docs: true })[0]!;
    expect(docs.end).toBe('wrongWheel');
    expect(docs.wheel).toBe('bugfix');
    seen.add('wrongWheel');
    seen.add('wheel');
    expect([...seen].sort()).toEqual(['deadEnd', 'mainHall', 'mixed', 'wheel', 'wrongWheel']);
  });

  it('reuses its arrays and cells between runs (no allocation when the gates open again)', () => {
    const b = roundBoard(2);
    const first = openGates(b, roundLive(2));
    const cells = first.map((f) => f.cells);
    const again = openGates(b, roundLive(2));
    expect(again).toBe(first);
    again.forEach((f, i) => expect(f.cells).toBe(cells[i]));
  });

  it('names every tile for screen readers', () => {
    expect(tileLabel({ kind: 'elbow', rot: 0 }, 1, 2)).toBe('Row 2, column 3, elbow, north to east');
    expect(tileLabel({ kind: 'elbow', rot: 3 }, 0, 0)).toBe('Row 1, column 1, elbow, west to north');
    expect(tileLabel({ kind: 'straight', rot: 1 }, 3, 4)).toBe('Row 4, column 5, straight, east to west');
    expect(tileLabel({ kind: 'rock', rot: 0 }, 2, 2)).toBe('Row 3, column 3, rock');
  });

  it('never turns a rock', () => {
    const b = roundBoard(2);
    expect(rotate(b, 1, 1)[1]![1]).toEqual({ kind: 'rock', rot: 0 });
  });

  it('accepts either straight orientation that matches the solution', () => {
    const b = roundBoard(2).map((row) => row.map((t) => ({ ...t })));
    const solvedBoard = solve(b, 2);
    const flipped = rotate(rotate(solvedBoard, 1, 0), 1, 0); // straight turned half way round
    expect(solvedBoard[1]![0]!.rot).not.toBe(flipped[1]![0]!.rot);
    expect(wrongTile(flipped, roundSolution(2))).toBeNull();
    const live: Record<Crew, boolean> = { feature: true, bugfix: true, docs: true };
    expect(solved(openGates(flipped, live), live)).toBe(true);
    const rot: Rot = flipped[1]![0]!.rot;
    expect(rot % 2).toBe(0);
  });
});
