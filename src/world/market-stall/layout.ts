/**
 * A Model Market stall's frame and where its parts are (docs/specs/MODEL-MARKET.md §2). Every island's
 * stall is island data (its place, its shell and its layout, in the island's package); the parts they
 * share (boards, counter, till, awning, shelves, jobs board, lanterns) are built by `parts.ts`, the
 * lettering by `src/world/sites/model-market.ts` and the market itself by the puzzle.
 *
 * A stall's own frame: origin on its floor at the boards' centre line, +z out toward you, +x to your
 * right as you face it.
 */

/** Where a stall stands: its origin and the way its front faces (radians, as an anchor's heading). */
export interface StallPlace {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/**
 * One hanging board, smallest first: its centre x, face size (bigger model, bigger board), the face's
 * top, the outline's top shape, and the foot of the beam it hangs from (each a step higher).
 */
export interface StallBoardSpot {
  readonly x: number;
  readonly w: number;
  readonly h: number;
  readonly top: number;
  readonly shape: 'scallop' | 'crest';
  readonly beam: number;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
}

/** Where things are in a stall's frame (shared by its builder, its signs and the market). */
export interface MarketStallLayout {
  readonly boards: readonly [StallBoardSpot, StallBoardSpot, StallBoardSpot];
  /** The boards' painted faces. */
  readonly boardZ: number;
  /** The chalk plaque on the counter's front (House special: Auto). */
  readonly plaque: Rect;
  /** The small carved name plaque. */
  readonly name: Rect;
  /** The cork jobs board's face, its four notes and their size. */
  readonly cork: Rect;
  readonly notes: readonly { readonly x: number; readonly y: number; readonly rz: number }[];
  readonly noteSize: { readonly w: number; readonly h: number };
  /** The keeper's spot behind the counter, and yours in front of it. */
  readonly vendor: { readonly x: number; readonly z: number; readonly y: number };
  readonly stand: { readonly x: number; readonly z: number };
  /** The counter's front, where E works from. */
  readonly counter: { readonly x: number; readonly z: number };
  /** The starfish jar on the counter. */
  readonly jar: { readonly x: number; readonly y: number; readonly z: number };
  /** The counter camera, held while the market's open: its eye and where it looks. */
  readonly shot: {
    readonly eye: readonly [number, number, number];
    readonly at: readonly [number, number, number];
  };
}

/** A point in a stall's frame, in the world. */
export function stallToWorld(p: StallPlace, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(p.heading);
  const s = Math.sin(p.heading);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}
