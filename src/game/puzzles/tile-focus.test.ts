import { describe, expect, it } from 'vitest';
import { FOCUS_HOLD, FOCUS_REACH, tileFocus, type TileGrid } from './tile-focus';

/** The mill race's deck: 3 × 4 tiles of 2.4 m, centred on the origin, row 0 at +z. */
const T = 2.4,
  COLS = 3,
  ROWS = 4;
const grid: TileGrid = {
  tile: T,
  cellAt(x, z) {
    const c = Math.floor(x / T + COLS / 2),
      r = ROWS - 1 - Math.floor(z / T + ROWS / 2);
    return c < 0 || c >= COLS || r < 0 || r >= ROWS ? -1 : r * COLS + c;
  },
};
const centres = Array.from({ length: COLS * ROWS }, (_, i) => ({
  x: ((i % COLS) - (COLS - 1) / 2) * T,
  z: ((ROWS - 1) / 2 - Math.floor(i / COLS)) * T,
}));
const all = () => true;
/** Facing +x is heading π/2 (forward = sin, cos). */
const EAST = Math.PI / 2;

/** Walks a path of (x, z, heading) samples, feeding the focus back like the puzzle does. */
function walk(path: [number, number, number][], turns = all, start = -1): number[] {
  let focus = start;
  return path.map(([x, z, h]) => (focus = tileFocus(grid, centres, turns, focus, x, z, h)));
}
const changes = (focus: number[]) => focus.filter((f, i) => i > 0 && f !== focus[i - 1]).length;

describe('tileFocus (the sluice’s tile focus, #49)', () => {
  it('picks the tile 1 m ahead, else the one underfoot', () => {
    // Standing on tile 3 (row 1, col 0) facing east, 1 m short of tile 4.
    const at = centres[3]!;
    expect(tileFocus(grid, centres, all, -1, at.x + T / 2 - 0.5, at.z, EAST)).toBe(4);
    expect(tileFocus(grid, centres, all, -1, at.x, at.z, EAST)).toBe(3);
    // Ahead isn't turnable: underfoot.
    expect(tileFocus(grid, centres, (i) => i !== 4, -1, at.x + T / 2 - 0.5, at.z, EAST)).toBe(3);
    // Off the deck, facing away.
    expect(tileFocus(grid, centres, all, -1, -10, 0, -EAST)).toBe(-1);
  });

  it('holds the focused tile until the point ahead is past its edge by FOCUS_HOLD', () => {
    const at = centres[3]!;
    const edge = at.x + T / 2;
    // Tile 3 focused; the point ahead just crosses into tile 4: still 3.
    const x = edge - FOCUS_REACH + 0.2;
    expect(tileFocus(grid, centres, all, 3, x, at.z, EAST)).toBe(3);
    // Past the hold: 4.
    expect(tileFocus(grid, centres, all, 3, edge - FOCUS_REACH + FOCUS_HOLD + 0.05, at.z, EAST)).toBe(4);
  });

  it('doesn’t flicker when a stick wobbles the heading at a corner', () => {
    // Stand by the corner of tiles 3, 4, 6 and 7, facing it, with ±15° of wobble.
    const corner = { x: centres[3]!.x + T / 2, z: centres[3]!.z - T / 2 };
    const h0 = Math.atan2(1, -1); // toward +x, −z
    const stand = { x: corner.x - 0.97 * Math.sin(h0), z: corner.z - 0.97 * Math.cos(h0) };
    const path: [number, number, number][] = [];
    for (let k = 0; k < 120; k++) path.push([stand.x, stand.z, h0 + 0.26 * Math.sin(k * 1.7)]);
    const focus = walk(path);
    expect(focus[0]).toBeGreaterThanOrEqual(0);
    expect(changes(focus)).toBe(0);
    // Without the hold (prev never fed back) the same wobble swaps tiles over and over.
    const raw = path.map(([x, z, h]) => tileFocus(grid, centres, all, -1, x, z, h));
    expect(changes(raw)).toBeGreaterThan(10);
  });

  it('moves along an edge one tile at a time, without going back', () => {
    // Walk south along the line between columns 0 and 1, facing south: the point ahead runs down the
    // edge, where the unheld focus would pick either side by a millimetre of drift.
    const x = centres[0]!.x + T / 2;
    const path: [number, number, number][] = [];
    for (let k = 0; k <= 200; k++) {
      const z = centres[0]!.z + T / 2 - (k / 200) * ROWS * T;
      path.push([x + 0.02 * Math.sin(k * 2.3), z, Math.PI + 0.05 * Math.sin(k * 1.3)]);
    }
    const focus = walk(path).filter((f) => f >= 0);
    const rows = focus.map((f) => Math.floor(f / COLS));
    // One focus per row, in order, never returning to an earlier tile.
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThanOrEqual(rows[i - 1]!);
    expect(changes(focus)).toBe(ROWS - 1);
  });

  it('lets go of a tile that stops turning', () => {
    const at = centres[4]!;
    expect(tileFocus(grid, centres, (i) => i !== 4, 4, at.x + 0.7, at.z, EAST)).toBe(5);
  });
});
