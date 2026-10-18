import type { SurfaceKind } from '../../../../game/collision';
import {
  HELIX,
  THOUSAND_BOUGH as TB,
  TREE,
  atBearing,
  bearingOf,
  helixY,
  type BridgeSpec,
  type TreeDeckSpec,
} from '../layout';

/**
 * The tree village's walk surfaces, as numbers (no three.js): the Great Stair's helix, the Root Hall
 * ring, the tree's decks, the Crown Deck, the Flume Gallery and its boardwalk, the rope bridges, the
 * Spire's lookouts, the wharf, Bough Landing, the booths, the ledge behind Great Falls and the cave.
 * The village builder draws exactly these, the colliders fence their edges, and the walker stands on
 * them, so what you see is what you walk.
 *
 * Stacked surfaces (the helix over itself, decks over the Root Hall) take the walker's feet `y`: of
 * the levels at (x, z) the walker stands on the highest within a step of its feet, or the lowest.
 */

/** Feet within this of a level count as on it (a step is at most 0.45 m; a little more for slopes). */
export const REACH = 0.6;

/** An oriented rectangle: centre, unit axis u (its depth) and half sizes along u and across (v). */
export interface Rect {
  x: number;
  z: number;
  ux: number;
  uz: number;
  hu: number;
  hv: number;
}

/** A walk surface: a footprint box (for quick rejection), its height there, and what it's made of. */
export interface Walk {
  id: string;
  kind: SurfaceKind;
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The surface's height at (x, z), or null off it. */
  height(x: number, z: number): number | null;
}

export function rectLocal(
  r: Rect,
  x: number,
  z: number,
  out: { u: number; v: number },
): { u: number; v: number } {
  const dx = x - r.x;
  const dz = z - r.z;
  out.u = dx * r.ux + dz * r.uz;
  out.v = -dx * r.uz + dz * r.ux;
  return out;
}

export function rectWorld(r: Rect, u: number, v: number): { x: number; z: number } {
  return { x: r.x + u * r.ux - v * r.uz, z: r.z + u * r.uz + v * r.ux };
}

export function rectBox(r: Rect, pad = 0): Walk['box'] {
  const ex = Math.abs(r.ux) * r.hu + Math.abs(r.uz) * r.hv + pad;
  const ez = Math.abs(r.uz) * r.hu + Math.abs(r.ux) * r.hv + pad;
  return { minX: r.x - ex, maxX: r.x + ex, minZ: r.z - ez, maxZ: r.z + ez };
}

/** Whether (x, z) is inside the rectangle grown by `pad`. */
export function inRect(r: Rect, x: number, z: number, pad = 0): boolean {
  rectLocal(r, x, z, LOCAL);
  return Math.abs(LOCAL.u) <= r.hu + pad && Math.abs(LOCAL.v) <= r.hv + pad;
}

const LOCAL = { u: 0, v: 0 };

function rectWalk(id: string, r: Rect, y: number, kind: SurfaceKind = 'wood'): Walk {
  return {
    id,
    kind,
    box: rectBox(r),
    height: (x, z) => (inRect(r, x, z) ? y : null),
  };
}

/**
 * A tree deck's rectangle: its depth along the bearing (`u`, outward) and its width across (`v`,
 * clockwise).
 */
export function deckRect(d: { bearing: number; r: number; radial: number; across: number }): Rect {
  const c = atBearing(d.bearing, d.r);
  const b = (d.bearing * Math.PI) / 180;
  return { x: c.x, z: c.z, ux: Math.sin(b), uz: -Math.cos(b), hu: d.radial / 2, hv: d.across / 2 };
}

export type DeckId = TreeDeckSpec['id'];

/**
 * The decks as built: the layout's centre bearing and height, the inner edge on the stair's outer
 * edge, and each deep enough for its stop and its house (the Practice Bough's house and the
 * top deck's loft stand on the outer end).
 */
export const DECKS: Readonly<Record<DeckId, TreeDeckSpec & { rect: Rect }>> = (() => {
  const inner = HELIX.rOuter - 0.15;
  const make = (id: DeckId, outer: number, rInner = inner) => {
    const d = TB.decks.find((k) => k.id === id)!;
    const spec = { ...d, r: (rInner + outer) / 2, radial: outer - rInner };
    return { ...spec, rect: deckRect(spec) };
  };
  return {
    L1E: make('L1E', 35),
    L2SW: make('L2SW', 32.2),
    L2S: make('L2S', 41, 25),
    L3SE: make('L3SE', 38.5),
  };
})();

/** The Practice Bough's house and the top deck's loft: on the outer end of their decks. */
export const DECK_HOUSES = {
  L2S: { depth: 4.4, width: 5.6, storeys: 1 },
  L3SE: { depth: 6, width: 6.6, storeys: 2 },
} as const;

/** The house's centre along its deck's depth (u from the deck centre). */
export function deckHouseU(id: keyof typeof DECK_HOUSES): number {
  return DECKS[id].rect.hu - DECK_HOUSES[id].depth / 2 - 0.5;
}

/** The Flume Gallery. */
export const GALLERY_RECT: Rect = {
  x: TB.gallery.x,
  z: TB.gallery.z,
  ux: 1,
  uz: 0,
  hu: TB.gallery.sx / 2,
  hv: TB.gallery.sz / 2,
};

/** The Crown Deck: a disc round the trunk's top, with the column through it. */
export const CROWN = { ...TB.crown, column: 5.4 } as const;

/** The trunk's centre column above the Crown Deck (the beacon's mast stands on it). */
export const COLUMN_TOP = 57.5;

/** The 7 fused stems round the core (banyan pillars), at these bearings and radius. */
export const PILLARS = {
  r: 12.4,
  radius: 2.3,
  bearings: [154.3, 205.7, 257.1, 308.6, 0, 51.4, 102.9],
} as const;

/** Where the stair's foot rests on a solid plinth (the walker can't get under the low turns). */
export const PLINTH = { from: 4, to: 150 } as const;

/** The Root Hall ring: from the core to its rim, minus the pillars. */
export function rootHallHeight(x: number, z: number): number | null {
  const r = Math.hypot(x - TREE.x, z - TREE.z);
  const R = TB.rootHall;
  if (r < R.rInner + 0.2 || r > R.rOuter) return null;
  for (const b of PILLARS.bearings) {
    const p = atBearing(b, PILLARS.r);
    if (Math.hypot(x - p.x, z - p.z) < PILLARS.radius + 0.1) return null;
  }
  // Under the plinth (the stair's low turns) there's no deck.
  if (r >= HELIX.rInner && r <= HELIX.rOuter) {
    const t = (((bearingOf(x, z) - HELIX.startBearing) % 360) + 360) % 360;
    if (t > PLINTH.from && t < PLINTH.to) return null;
  }
  return R.y;
}

/** The stair's top landing runs on level past its last step (degrees of turn) to the Crown Deck. */
export const LANDING_SWEEP = 6;

/** The helix turns at (x, z) inside the walkway, as turn angles θ (filled into `out`). */
export function helixThetasAt(x: number, z: number, out: number[]): number[] {
  out.length = 0;
  const r = Math.hypot(x - TREE.x, z - TREE.z);
  if (r < HELIX.rInner || r > HELIX.rOuter) return out;
  const b = bearingOf(x, z);
  for (let t = (((b - HELIX.startBearing) % 360) + 360) % 360; t <= HELIX.sweep + LANDING_SWEEP; t += 360)
    out.push(t);
  return out;
}

/** The stair's walk height at turn angle θ (level on the top landing). */
export function helixWalkY(theta: number): number {
  return helixY(Math.min(theta, HELIX.sweep));
}

/** A rope bridge's walk: the sag curve between its ends (planks read as gaps, walk as one curve). */
export function bridgeY(b: BridgeSpec, t: number): number {
  // Level where it meets each deck, deepest at mid-span.
  const s = Math.sin(Math.PI * t);
  return b.from.y + (b.to.y - b.from.y) * t - b.sag * s * s;
}

/** Along-span position (0..1) and offset across a bridge for (x, z). */
export function bridgeLocal(
  b: BridgeSpec,
  x: number,
  z: number,
  out: { t: number; d: number; len: number },
): { t: number; d: number; len: number } {
  const dx = b.to.x - b.from.x;
  const dz = b.to.z - b.from.z;
  const len = Math.hypot(dx, dz);
  out.t = ((x - b.from.x) * dx + (z - b.from.z) * dz) / (len * len);
  out.d = (-(x - b.from.x) * dz + (z - b.from.z) * dx) / len;
  out.len = len;
  return out;
}

const BL = { t: 0, d: 0, len: 0 };

/** The rope bridges as built: R1 joins the Signal Deck's east end to the Practice Bough's west end. */
export const BRIDGES: readonly BridgeSpec[] = (() => {
  const l2sw = DECKS.L2SW.rect;
  const l2s = DECKS.L2S.rect;
  const from = rectWorld(l2sw, 0.4, -l2sw.hv);
  const to = rectWorld(l2s, -2.4, l2s.hv);
  // R2 lands on the Spire top's rim facing the Three Landings; R3 on the ledge's north edge.
  const r2 = TB.bridges.find((b) => b.id === 'R2')!;
  const dx = r2.from.x - TB.spire.x;
  const dz = r2.from.z - TB.spire.z;
  const dl = Math.hypot(dx, dz);
  const rim = 5.3;
  return TB.bridges.map((b) => {
    if (b.id === 'R1')
      return {
        ...b,
        from: { x: from.x, y: DECKS.L2SW.y, z: from.z },
        to: { x: to.x, y: DECKS.L2S.y, z: to.z },
        sag: 0.8,
      };
    if (b.id === 'R2')
      return {
        ...b,
        to: { x: TB.spire.x + (dx / dl) * rim, y: TB.spire.top, z: TB.spire.z + (dz / dl) * rim },
      };
    if (b.id === 'R3')
      return { ...b, to: { x: TB.spire.ledge.x - 1.2, y: TB.spire.ledge.y, z: TB.spire.ledge.z + 0.6 } };
    return b;
  });
})();

/** Bridges that only open later (R3 is rolled up until the Spire twist). */
export const LATE_BRIDGES = new Set(['R3']);

/** The Spire's lookouts: the top (5173) and the south ledge (5174). */
export const SPIRE_TOP = { x: TB.spire.x, z: TB.spire.z, r: 5.6, y: TB.spire.top } as const;
export const SPIRE_LEDGE: Rect = {
  x: TB.spire.ledge.x,
  z: TB.spire.ledge.z + 2.8,
  ux: 1,
  uz: 0,
  hu: 4.4,
  hv: 2.4,
};

/** The Root Wharf (jetty) and Bough Landing. */
export const WHARF: Rect = (() => {
  const j = TB.harbor.jetty;
  return {
    x: (j.x0 + j.x1) / 2,
    z: (j.z0 + j.z1) / 2,
    ux: 1,
    uz: 0,
    hu: (j.x1 - j.x0) / 2,
    hv: (j.z1 - j.z0) / 2,
  };
})();
export const LANDING_DECK: Rect = (() => {
  const b = TB.harbor.boughLanding;
  return { x: b.x, z: b.z, ux: 1, uz: 0, hu: b.sx / 2, hv: b.sz / 2 };
})();
/** The wharf rises over its last few metres to Bough Landing's height. */
export const WHARF_RAMP = { z0: TB.harbor.jetty.z0 + 0.5, z1: TB.harbor.jetty.z0 + 5 } as const;

/** The stair's top landing: level boards from its last step onto the Crown Deck. */
export const TOP_LANDING: Rect = (() => {
  const c = atBearing(87, 16.2);
  const b = (87 * Math.PI) / 180;
  return { x: c.x, z: c.z, ux: Math.sin(b), uz: -Math.cos(b), hu: 3.4, hv: 2.4 };
})();

/** The Sky Basket's cage and its top landing to the Crown Deck's west edge. */
export const BASKET = atBearing(TB.skyBasket.bearing, TB.skyBasket.r);
export const BASKET_LANDING: Rect = (() => {
  const edgeX = CROWN.x - CROWN.r + 0.8;
  const x0 = BASKET.x - 1.3;
  return { x: (x0 + edgeX) / 2, z: BASKET.z, ux: 1, uz: 0, hu: (edgeX - x0) / 2, hv: 1.5 };
})();

function polylineHeight(
  pts: readonly { x: number; z: number; y: number }[],
  half: number,
  x: number,
  z: number,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d <= half && d < bestD) {
      bestD = d;
      best = a.y + (b.y - a.y) * t;
    }
  }
  return best;
}

/** The booths' log floors over the Booth Pools' east edges. */
export const BOOTHS = (['boothA', 'boothB', 'boothC'] as const).map((id, i) => {
  const a = TB.anchors[id];
  return { id, x: a.x, z: a.z, y: a.y, r: 2.2, pool: TB.pools.booths[i]! };
});

/** The cave's floor, and the ledge behind Great Falls from the Mirror Pool's west shore to it. */
export const CAVE_FLOOR: Rect = (() => {
  const c = TB.cave;
  return {
    x: c.mouth.x,
    z: c.mouth.z - c.depth / 2 + 1,
    ux: 1,
    uz: 0,
    hu: c.width / 2 - 0.7,
    hv: c.depth / 2,
  };
})();
export const FALLS_LEDGE: readonly { x: number; z: number; y: number }[] = [
  { x: 2114, z: -1606, y: 16.05 },
  { x: 2121, z: -1621, y: 16.4 },
  { x: 2128, z: -1634.5, y: 17.4 },
  { x: 2138, z: -1640, y: 18.4 },
  { x: 2145, z: -1641.4, y: 19 },
];

/** Every single-level walk surface (the helix stacks: it's handled on its own). */
export const WALKS: readonly Walk[] = (() => {
  const list: Walk[] = [];
  const R = TB.rootHall;
  list.push({
    id: 'L0',
    kind: 'wood',
    box: {
      minX: TREE.x - R.rOuter,
      maxX: TREE.x + R.rOuter,
      minZ: TREE.z - R.rOuter,
      maxZ: TREE.z + R.rOuter,
    },
    height: rootHallHeight,
  });
  for (const d of Object.values(DECKS)) list.push(rectWalk(d.id, d.rect, d.y));
  list.push(rectWalk('FG', GALLERY_RECT, TB.gallery.y));
  list.push({
    id: 'boardwalk',
    kind: 'wood',
    box: { minX: 2022, maxX: 2044, minZ: -1622, maxZ: -1563 },
    height: (x, z) => polylineHeight(TB.boardwalk.points, TB.boardwalk.width / 2, x, z),
  });
  list.push({
    id: 'L4',
    kind: 'wood',
    box: {
      minX: CROWN.x - CROWN.r,
      maxX: CROWN.x + CROWN.r,
      minZ: CROWN.z - CROWN.r,
      maxZ: CROWN.z + CROWN.r,
    },
    height(x, z) {
      if (Math.hypot(x - CROWN.x, z - CROWN.z) > CROWN.r) return null;
      if (Math.hypot(x - TREE.x, z - TREE.z) < CROWN.column + 0.1) return null;
      return CROWN.y;
    },
  });
  list.push(rectWalk('basketTop', BASKET_LANDING, TB.skyBasket.topY));
  list.push(rectWalk('topLanding', TOP_LANDING, CROWN.y));
  for (const b of BRIDGES) {
    const half = b.width / 2;
    list.push({
      id: b.id,
      kind: 'wood',
      box: {
        minX: Math.min(b.from.x, b.to.x) - half - 1,
        maxX: Math.max(b.from.x, b.to.x) + half + 1,
        minZ: Math.min(b.from.z, b.to.z) - half - 1,
        maxZ: Math.max(b.from.z, b.to.z) + half + 1,
      },
      height(x, z) {
        bridgeLocal(b, x, z, BL);
        // A little past each end, so the deck and the bridge overlap (no gap to fall through).
        const over = 0.6 / BL.len;
        if (BL.t < -over || BL.t > 1 + over || Math.abs(BL.d) > half) return null;
        return bridgeY(b, Math.max(0, Math.min(1, BL.t)));
      },
    });
  }
  list.push({
    id: 'spireTop',
    kind: 'stone',
    box: {
      minX: SPIRE_TOP.x - SPIRE_TOP.r,
      maxX: SPIRE_TOP.x + SPIRE_TOP.r,
      minZ: SPIRE_TOP.z - SPIRE_TOP.r,
      maxZ: SPIRE_TOP.z + SPIRE_TOP.r,
    },
    height: (x, z) => (Math.hypot(x - SPIRE_TOP.x, z - SPIRE_TOP.z) <= SPIRE_TOP.r ? SPIRE_TOP.y : null),
  });
  list.push(rectWalk('spireLedge', SPIRE_LEDGE, TB.spire.ledge.y, 'stone'));
  list.push({
    id: 'wharf',
    kind: 'wood',
    box: rectBox(WHARF),
    height(x, z) {
      if (!inRect(WHARF, x, z)) return null;
      const j = TB.harbor.jetty;
      const t = Math.max(0, Math.min(1, (WHARF_RAMP.z1 - z) / (WHARF_RAMP.z1 - WHARF_RAMP.z0)));
      return j.height + (TB.harbor.boughLanding.y - j.height) * t;
    },
  });
  list.push(rectWalk('boughLanding', LANDING_DECK, TB.harbor.boughLanding.y));
  for (const b of BOOTHS)
    list.push({
      id: b.id,
      kind: 'wood',
      box: { minX: b.x - b.r, maxX: b.x + b.r, minZ: b.z - b.r, maxZ: b.z + b.r },
      height: (x, z) => (Math.hypot(x - b.x, z - b.z) <= b.r ? b.y : null),
    });
  list.push(rectWalk('caveFloor', CAVE_FLOOR, TB.cave.floor, 'stone'));
  list.push({
    id: 'ledge',
    kind: 'stone',
    box: { minX: 2111, maxX: 2148, minZ: -1644, maxZ: -1603 },
    height: (x, z) => polylineHeight(FALLS_LEDGE, TB.cave.ledgeWidth / 2, x, z),
  });
  return list;
})();

const THETAS: number[] = [];

/** Which surface the walker's on (for footsteps and tests). */
export interface WalkHit {
  id: string;
  kind: SurfaceKind;
}

/**
 * The village's walk height at (x, z) for feet at `y` (see the module note), or null off it.
 * `closed` lists surfaces that aren't open yet (R3 before the twist). Reports the surface into `hit`.
 */
export function villageWalkable(
  x: number,
  z: number,
  y?: number,
  hit?: WalkHit,
  closed?: ReadonlySet<string>,
): number | null {
  let best = -Infinity;
  let low = Infinity;
  let bestId = '';
  let lowId = '';
  let bestKind: SurfaceKind = 'wood';
  let lowKind: SurfaceKind = 'wood';
  const consider = (h: number, id: string, kind: SurfaceKind) => {
    if (h < low) {
      low = h;
      lowId = id;
      lowKind = kind;
    }
    if (y !== undefined && h <= y + REACH && h > best) {
      best = h;
      bestId = id;
      bestKind = kind;
    }
  };
  for (const w of WALKS) {
    if (x < w.box.minX || x > w.box.maxX || z < w.box.minZ || z > w.box.maxZ) continue;
    if (closed?.has(w.id)) continue;
    const h = w.height(x, z);
    if (h !== null) consider(h, w.id, w.kind);
  }
  helixThetasAt(x, z, THETAS);
  for (const t of THETAS) consider(helixWalkY(t), 'helix', 'wood');
  if (low === Infinity) return null;
  // With the feet given, a level more than a step over them is overhead (a deck over the path): the
  // walker is under it, on whatever's below.
  if (y !== undefined && best === -Infinity) return null;
  const useBest = y !== undefined;
  if (hit) {
    hit.id = useBest ? bestId : lowId;
    hit.kind = useBest ? bestKind : lowKind;
  }
  return useBest ? best : low;
}
