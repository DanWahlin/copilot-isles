import { toFrame } from './layout';

/**
 * Keelhaven's walk surfaces (the quay, the chambers' copings, the caissons, the lock gates' walkways,
 * the steps, the footbridge, the verandas and the stair up the North Head), as the builders that make
 * their geometry describe them: each an oriented rectangle in the cove frame (u, v), flat or sloping
 * along its length. No three.js here.
 */
export interface WalkDeck {
  /** Its middle (cove frame). */
  readonly u: number;
  readonly v: number;
  /** Its length's direction (a unit vector in the cove frame). */
  readonly au: number;
  readonly av: number;
  /** Half its length and half its width (m). */
  readonly half: number;
  readonly width: number;
  /** Its top at the start and the end of its length (m). */
  readonly y0: number;
  readonly y1: number;
  /** Timber (footsteps, prompts) or stone. */
  readonly wood: boolean;
}

/** A deck from (u0, v0) to (u1, v1) along the cove frame's axes, its top `y0` at u0 rising to `y1` at u1. */
export function uvDeck(
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  y0: number,
  wood: boolean,
  y1 = y0,
): WalkDeck {
  return {
    u: (u0 + u1) / 2,
    v: (v0 + v1) / 2,
    au: 1,
    av: 0,
    half: Math.abs(u1 - u0) / 2,
    width: Math.abs(v1 - v0) / 2,
    y0,
    y1,
    wood,
  };
}

/** A deck along a line from `a` to `b` (u, v, y), `width` m either side of it. */
export function lineDeck(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  width: number,
  wood: boolean,
): WalkDeck {
  const du = b[0] - a[0];
  const dv = b[1] - a[1];
  const len = Math.hypot(du, dv) || 1;
  return {
    u: (a[0] + b[0]) / 2,
    v: (a[1] + b[1]) / 2,
    au: du / len,
    av: dv / len,
    half: len / 2,
    width,
    y0: a[2],
    y1: b[2],
    wood,
  };
}

/** A deck turned to face direction (fu, fv): `along` m across the face, `out` m deep, its middle at (u, v). */
export function facingDeck(
  u: number,
  v: number,
  fu: number,
  fv: number,
  along: number,
  out: number,
  y: number,
  wood: boolean,
): WalkDeck {
  return { u, v, au: -fv, av: fu, half: along / 2, width: out / 2, y0: y, y1: y, wood };
}

const CELL = 4;
const F = { u: 0, v: 0 };

/**
 * The decks in a grid of 4 m cells, so a lookup (the follow camera asks ~1000 a frame) reads the few
 * that could be there. No allocation per lookup.
 */
export class DeckIndex {
  private readonly decks: readonly WalkDeck[];
  private readonly u0: number;
  private readonly v0: number;
  private readonly nu: number;
  private readonly nv: number;
  private readonly cells: Int32Array;
  private readonly starts: Int32Array;
  /** The deck the last lookup stood on (for its kind), or −1. */
  private last = -1;

  constructor(decks: readonly WalkDeck[]) {
    this.decks = decks;
    let u0 = Infinity,
      u1 = -Infinity,
      v0 = Infinity,
      v1 = -Infinity;
    const reach = decks.map((d) => Math.hypot(d.half, d.width));
    decks.forEach((d, i) => {
      u0 = Math.min(u0, d.u - reach[i]!);
      u1 = Math.max(u1, d.u + reach[i]!);
      v0 = Math.min(v0, d.v - reach[i]!);
      v1 = Math.max(v1, d.v + reach[i]!);
    });
    if (!decks.length) u0 = u1 = v0 = v1 = 0;
    this.u0 = u0;
    this.v0 = v0;
    this.nu = Math.max(1, Math.ceil((u1 - u0) / CELL));
    this.nv = Math.max(1, Math.ceil((v1 - v0) / CELL));
    const lists: number[][] = Array.from({ length: this.nu * this.nv }, () => []);
    decks.forEach((d, i) => {
      const r = reach[i]!;
      const iu0 = Math.max(0, Math.floor((d.u - r - u0) / CELL));
      const iu1 = Math.min(this.nu - 1, Math.floor((d.u + r - u0) / CELL));
      const iv0 = Math.max(0, Math.floor((d.v - r - v0) / CELL));
      const iv1 = Math.min(this.nv - 1, Math.floor((d.v + r - v0) / CELL));
      for (let iv = iv0; iv <= iv1; iv++)
        for (let iu = iu0; iu <= iu1; iu++) lists[iv * this.nu + iu]!.push(i);
    });
    this.starts = new Int32Array(lists.length + 1);
    let n = 0;
    lists.forEach((l, k) => {
      this.starts[k] = n;
      n += l.length;
    });
    this.starts[lists.length] = n;
    this.cells = new Int32Array(n);
    lists.forEach((l, k) => this.cells.set(l, this.starts[k]!));
  }

  /**
   * The deck's top at world (x, z), or null off every deck. Where decks stack (a stair over a
   * landing), `y` (the walker's feet) picks the highest within a step of it; without `y`, the lowest.
   */
  heightAt(x: number, z: number, y?: number): number | null {
    toFrame(x, z, F);
    const iu = Math.floor((F.u - this.u0) / CELL);
    const iv = Math.floor((F.v - this.v0) / CELL);
    this.last = -1;
    if (iu < 0 || iv < 0 || iu >= this.nu || iv >= this.nv) return null;
    const k = iv * this.nu + iu;
    let best: number | null = null;
    for (let j = this.starts[k]!; j < this.starts[k + 1]!; j++) {
      const i = this.cells[j]!;
      const d = this.decks[i]!;
      const du = F.u - d.u;
      const dv = F.v - d.v;
      const along = du * d.au + dv * d.av;
      if (along < -d.half || along > d.half) continue;
      const across = -du * d.av + dv * d.au;
      if (across < -d.width || across > d.width) continue;
      const t = d.half > 0 ? (along + d.half) / (2 * d.half) : 0;
      const h = d.y0 + (d.y1 - d.y0) * t;
      if (y === undefined) {
        if (best === null || h < best) [best, this.last] = [h, i];
      } else if (h <= y + 0.7 && (best === null || h > best)) [best, this.last] = [h, i];
    }
    return best;
  }

  /** Whether world (x, z) is on timber (the deck there, if any, is wood). */
  woodAt(x: number, z: number, y?: number): boolean {
    if (this.heightAt(x, z, y) === null) return false;
    return this.decks[this.last]?.wood ?? false;
  }
}
