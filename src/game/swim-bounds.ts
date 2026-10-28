import type { CollisionWorld } from './collision';
import type { SwimLimit } from './player-controller';
import { clamp01 } from '../util/math';
import { BRIGANTINE_BEAM, BRIGANTINE_HALF_LENGTH } from '../world/ship/lines';

/** How far past the last ground you can wade on you may swim (m), unless an island says otherwise. */
export const SWIM_BAND = 30;

/**
 * A stretch of water kept clear of swimmers: a capsule round the segment (x0, z0)-(x1, z1), `r` m
 * wide (0 parks it). The moored ship is one, moved in place each frame.
 */
export interface SwimKeepOut {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  r: number;
}

export interface SwimBoundsOptions {
  /** The band (m) past the last wadeable ground, for where the swimmer is (the island's). */
  band(x: number, z: number): number;
  /** The waters you may swim in at all (the island's): a hard stop well outside the band. */
  inWaters(x: number, z: number): boolean;
  /** The deepest water you can stand in (the walker's `wadeMax`). */
  wadeMax: number;
  /**
   * Whether a deck, quay, pier or gangway is at (x, z): swimmers keep `DECK_CLEAR` m off them, so the
   * camera behind never ends up under one (and nobody swims in under a pier).
   */
  deck?(x: number, z: number): boolean;
}

/** The shore search: rays round the swimmer, rings this far apart (m), refined to ~5 cm. */
const RAYS = 24;
const RING = 1.5;
const REFINE = 5;
/** The search reaches this far past the band (m); past it the room only says "outside". */
const REACH_PAST = 4;
/** The search is redone once the swimmer has moved this far (m). */
const MOVE_AGAIN = 0.4;
/** How far (m) swimmers keep off decks and quays, and how far round them the search looks. */
const DECK_CLEAR = 2.5;
const DECK_REACH = 4;
const DECK_RING = 0.5;

const RAY_X = new Float64Array(RAYS);
const RAY_Z = new Float64Array(RAYS);
for (let i = 0; i < RAYS; i++) {
  RAY_X[i] = Math.sin((i / RAYS) * Math.PI * 2);
  RAY_Z[i] = Math.cos((i / RAYS) * Math.PI * 2);
}

/**
 * Where the captain may swim (Dan: "near the shore only: a band of about 30 m past where wading
 * stops, then a soft stop"). The room left is the band less the distance to the nearest ground you
 * could stand on (the terrain, or the bed of fresh water, at rest: man-made decks and quays don't
 * count, so a pier's end doesn't carry the band out to the ship), and the gap to any keep-out. The
 * player controller slows you and drifts you back in over the last few metres.
 */
export class SwimBounds implements SwimLimit {
  readonly keepOuts: SwimKeepOut[] = [];
  /** The last shore search: where, the distance found and the way back to it. */
  private atX = Number.NaN;
  private atZ = Number.NaN;
  private shore = 0;
  private shoreX = 0;
  private shoreZ = 1;
  /** The nearest deck found (Infinity: none within reach), and the way to it. */
  private deck = Infinity;
  private deckX = 0;
  private deckZ = 0;

  constructor(
    private readonly world: Pick<CollisionWorld, 'stillDepthAt'>,
    private readonly o: SwimBoundsOptions,
  ) {}

  inWaters(x: number, z: number): boolean {
    return this.o.inWaters(x, z);
  }

  /** The water at rest doesn't move, so the search is the same at any time (`_t`). */
  roomAt(x: number, z: number, _t: number, back: { x: number; z: number }): number {
    const band = this.o.band(x, z);
    if (!(Math.hypot(x - this.atX, z - this.atZ) < MOVE_AGAIN)) this.search(x, z, band + REACH_PAST);
    // Between searches the distance follows you along the way back (no steps for the edge to jolt on).
    const moved = (x - this.atX) * this.shoreX + (z - this.atZ) * this.shoreZ;
    let room = band - Math.max(0, this.shore - moved);
    back.x = this.shoreX;
    back.z = this.shoreZ;
    if (this.deck < Infinity) {
      const near = this.deck - ((x - this.atX) * this.deckX + (z - this.atZ) * this.deckZ) - DECK_CLEAR;
      if (near < room) {
        room = near;
        back.x = -this.deckX;
        back.z = -this.deckZ;
      }
    }
    for (let i = 0; i < this.keepOuts.length; i++) {
      const k = this.keepOuts[i]!;
      if (k.r <= 0) continue;
      const dx = k.x1 - k.x0,
        dz = k.z1 - k.z0;
      const u = clamp01(((x - k.x0) * dx + (z - k.z0) * dz) / Math.max(1e-6, dx * dx + dz * dz));
      const ox = x - (k.x0 + dx * u),
        oz = z - (k.z0 + dz * u);
      const d = Math.hypot(ox, oz);
      if (d - k.r >= room) continue;
      room = d - k.r;
      // Away from the keep-out (from its very line, across it).
      if (d > 1e-6) {
        back.x = ox / d;
        back.z = oz / d;
      } else {
        const l = Math.hypot(dx, dz) || 1;
        back.x = -dz / l;
        back.z = dx / l;
      }
    }
    return room;
  }

  /** The distance (to `reach`) to the nearest ground you could wade on, and the way to it. */
  private search(x: number, z: number, reach: number): void {
    this.atX = x;
    this.atZ = z;
    this.searchDecks(x, z);
    if (this.wadeable(x, z)) {
      this.shore = 0;
      return;
    }
    const rings = Math.ceil(reach / RING);
    for (let ring = 1; ring <= rings; ring++) {
      const r = ring * RING;
      let best = Infinity;
      let bx = 0,
        bz = 0;
      for (let i = 0; i < RAYS; i++) {
        const rx = RAY_X[i]!,
          rz = RAY_Z[i]!;
        if (!this.wadeable(x + rx * r, z + rz * r)) continue;
        // Bisect between the last ring (in water) and this one (wadeable).
        let lo = r - RING,
          hi = r;
        for (let k = 0; k < REFINE; k++) {
          const mid = (lo + hi) / 2;
          if (this.wadeable(x + rx * mid, z + rz * mid)) hi = mid;
          else lo = mid;
        }
        if (hi < best) {
          best = hi;
          bx = rx;
          bz = rz;
        }
      }
      if (best < Infinity) {
        this.shore = best;
        this.shoreX = bx;
        this.shoreZ = bz;
        return;
      }
    }
    // Nothing within reach: outside the band (the way back is the last one found).
    this.shore = reach + RING;
  }

  /** The nearest deck within DECK_REACH, on the same rays (none: Infinity). */
  private searchDecks(x: number, z: number): void {
    this.deck = Infinity;
    const deck = this.o.deck;
    if (!deck) return;
    for (let r = 0; r <= DECK_REACH; r += DECK_RING)
      for (let i = 0; i < RAYS; i++) {
        const rx = RAY_X[i]!,
          rz = RAY_Z[i]!;
        if (!deck(x + rx * r, z + rz * r)) continue;
        this.deck = r;
        this.deckX = rx;
        this.deckZ = rz;
        return;
      }
  }

  private wadeable(x: number, z: number): boolean {
    return this.world.stillDepthAt(x, z) <= this.o.wadeMax;
  }
}

/** The moored ship's keep-out: her length plus the bowsprit's reach, her beam plus this clearance (m). */
const SHIP_AFT = BRIGANTINE_HALF_LENGTH + 1;
const SHIP_FORE = BRIGANTINE_HALF_LENGTH + 3;
const SHIP_CLEAR = 5;

/** Puts `k` round a ship at (x, z) heading `heading` (null parks it: she's under way). */
export function placeShipKeepOut(
  k: SwimKeepOut,
  pose: { x: number; z: number; heading: number } | null,
): void {
  if (!pose) {
    k.r = 0;
    return;
  }
  const s = Math.sin(pose.heading),
    c = Math.cos(pose.heading);
  k.x0 = pose.x - s * SHIP_AFT;
  k.z0 = pose.z - c * SHIP_AFT;
  k.x1 = pose.x + s * SHIP_FORE;
  k.z1 = pose.z + c * SHIP_FORE;
  k.r = BRIGANTINE_BEAM / 2 + SHIP_CLEAR;
}
