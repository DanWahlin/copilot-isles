/** A square tile grid the player stands on (the mill race's channel deck). */
export interface TileGrid {
  /** A tile's side (m). */
  readonly tile: number;
  /** Tile under (x, z), or -1. */
  cellAt(x: number, z: number): number;
}

/** How far ahead of the feet (m) the player's facing picks a tile. */
export const FOCUS_REACH = 1.0;
/**
 * How far past its edges (m) a focused tile keeps the focus. At 1 m reach it's ~20° of heading, more
 * than an analogue stick's wobble or a heading still easing round, and well under half a tile, so a
 * deliberate look at the next tile still moves the focus there.
 */
export const FOCUS_HOLD = 0.4;

/**
 * The tile the player means (issue #49): the one 1 m ahead, else the one underfoot, with hysteresis.
 * The focused tile `prev` keeps the focus while the point ahead (or, when ahead is off the turnable
 * tiles, the feet) stays within `FOCUS_HOLD` of its square, so at a corner or an edge the focus
 * doesn't flicker between neighbours. `centres` are the tiles' centres (built once, no allocation).
 */
export function tileFocus(
  grid: TileGrid,
  centres: readonly { readonly x: number; readonly z: number }[],
  turns: (i: number) => boolean,
  prev: number,
  x: number,
  z: number,
  heading: number,
): number {
  const ax = x + Math.sin(heading) * FOCUS_REACH,
    az = z + Math.cos(heading) * FOCUS_REACH;
  const held = prev >= 0 && turns(prev) ? centres[prev] : undefined;
  const reach = grid.tile / 2 + FOCUS_HOLD;
  if (held && within(held, reach, ax, az)) return prev;
  const ahead = grid.cellAt(ax, az);
  if (ahead >= 0 && turns(ahead)) return ahead;
  if (held && within(held, reach, x, z)) return prev;
  const under = grid.cellAt(x, z);
  return under >= 0 && turns(under) ? under : -1;
}

function within(c: { readonly x: number; readonly z: number }, reach: number, x: number, z: number): boolean {
  return Math.abs(x - c.x) <= reach && Math.abs(z - c.z) <= reach;
}
