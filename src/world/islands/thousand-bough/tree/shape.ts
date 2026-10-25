import { lerp, mulberry32, segmentDistance, segmentDistance3, smoothstep } from '../../../../util/math';
import { HELIX, THOUSAND_BOUGH as TB, TREE, atBearing, bearingOf } from '../layout';
import { fernWalkAt, thousandBoughHeight } from '../height';
import {
  BRIDGES,
  CROWN,
  COLUMN_TOP,
  DECKS,
  GALLERY_RECT,
  PILLARS,
  TOP_LANDING,
  inRect,
  type Rect,
} from '../village/surfaces';
import { WalkClearance } from '../village/clearance';
import { THOUSAND_BOUGH_ARRIVAL } from '../../../../islands/thousand-bough';

/**
 * The great banyan's shape as numbers (spec §3.5): the fluted core, its 7 fused pillars, the limbs and
 * the crew houses' boughs (each crossing the stair band per the clearance rule), the two leaders to
 * the high crown, the canopy's sprays reaching out from them, the prop roots, and the leaf clusters
 * (each on its own twig off that wood). The tree's meshes, the colliders and the layout tests all
 * read these.
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A branch: a centre line with its radius at each point. */
export interface Branch {
  id: string;
  points: (P3 & { r: number })[];
  /** Whether it's a limb that carries canopy (its sprays and leaves reach out from its outer half). */
  canopy: boolean;
  /** The branch it forks off (a canopy spray's). */
  parent?: string;
}

/** The core's radius at height y (its fused flutes are added by the mesh). */
export function coreRadius(y: number): number {
  const t = TB.tree.trunk;
  if (y <= t[0]!.y) return t[0]!.r + (t[0]!.y - y) * 0.6;
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i]!;
    const b = t[i + 1]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return CROWN.column;
}

/** The core's surface at (bearing, y): the 7 flutes of the fused trunks. */
export function coreSurface(bearingDeg: number, y: number): number {
  const a = (bearingDeg * Math.PI) / 180;
  return coreRadius(y) * (1 + 0.07 * Math.cos(7 * a + y * 0.05) + 0.025 * Math.sin(13 * a - y * 0.11));
}

/** Where the trunk meets the ground under the Root Hall. */
export const TRUNK_BASE = 16.8;

/** A limb in the tree's polar frame: bearing, and (r, y) points out from the core. */
interface LimbSpec {
  id: string;
  bearing: number;
  path: readonly (readonly [r: number, y: number])[];
  root: number;
  tip: number;
  canopy: boolean;
}

/**
 * Each limb's path is checked against the stair band (r 15.5–19.5) by the layout tests: its underside
 * ≥ 4.5 m over the stair below, its top ≥ 0.6 m under the stair above. Limbs under a deck carry it.
 */
const LIMBS: readonly LimbSpec[] = [
  {
    id: 'limb-16',
    bearing: 16,
    path: [
      [3, 31.5],
      [17.5, 32.5],
      [30, 36.5],
      [43, 40.5],
      [52, 42],
    ],
    root: 1.75,
    tip: 0.7,
    canopy: true,
  },
  {
    id: 'limb-95',
    bearing: 95,
    path: [
      [3, 33],
      [17.5, 35],
      [30, 38.4],
      [42, 41.4],
      [50, 42.6],
    ],
    root: 1.75,
    tip: 0.7,
    canopy: true,
  },
  {
    id: 'limb-134',
    bearing: 134,
    path: [
      [3, 33],
      [17.5, 34.8],
      [24, 37.4],
      [32, 37.8],
      [41, 41.6],
      [48, 43.4],
    ],
    root: 1.6,
    tip: 0.7,
    canopy: true,
  },
  {
    id: 'limb-165',
    bearing: 165,
    path: [
      [3, 24.4],
      [17.5, 25.6],
      [21, 26.4],
      [26, 29.6],
      [37, 30.4],
      [46, 33.8],
      [56, 37],
    ],
    root: 1.6,
    tip: 0.7,
    canopy: true,
  },
  {
    id: 'limb-235',
    bearing: 235,
    path: [
      [3, 26],
      [17.5, 27.5],
      [24, 28.8],
      [32, 29.2],
      [42, 33],
      [50, 36],
    ],
    root: 1.6,
    tip: 0.7,
    canopy: true,
  },
  {
    id: 'limb-300',
    bearing: 300,
    path: [
      [3, 28.5],
      [17.5, 30],
      [30, 33],
      [42, 37],
      [54, 40],
    ],
    root: 1.7,
    tip: 0.7,
    canopy: true,
  },
  {
    id: 'limb-328',
    bearing: 328,
    path: [
      [3, 29.5],
      [17.5, 31],
      [28, 34],
      [38, 38],
      [46, 40],
    ],
    root: 1.6,
    tip: 0.7,
    canopy: true,
  },
  // The crew houses' boughs and the fresh bough under the Three Landings' scaffold.
  {
    id: 'bough-blue',
    bearing: 315,
    path: [
      [3, 27],
      [17.5, 28.4],
      [27, 29.3],
      [35, 29.5],
      [39, 30.2],
    ],
    root: 1.15,
    tip: 0.6,
    canopy: false,
  },
  {
    id: 'bough-green',
    bearing: 350,
    path: [
      [3, 28.5],
      [17.5, 30],
      [27, 31.4],
      [35, 31.6],
      [39, 32.3],
    ],
    root: 1.15,
    tip: 0.6,
    canopy: false,
  },
  {
    id: 'bough-teal',
    bearing: 30,
    path: [
      [3, 30],
      [17.5, 30.6],
      [28, 29.4],
      [36, 29.5],
      [40, 30.2],
    ],
    root: 1.15,
    tip: 0.6,
    canopy: false,
  },
  {
    id: 'bough-scaffold',
    bearing: 112,
    path: [
      [3, 23],
      [17.5, 25],
      [20, 25.4],
      [25, 27.4],
      [32, 28.4],
      [36, 29],
    ],
    root: 1.0,
    tip: 0.5,
    canopy: false,
  },
];

function limbBranch(l: LimbSpec): Branch {
  const n = l.path.length;
  const pts = l.path.map(([r, y], i) => {
    // A gentle drift in bearing as it reaches out, so no limb is ruler-straight.
    const drift = Math.sin(r * 0.11 + l.bearing) * Math.min(1, r / 20) * 2.2;
    const p = atBearing(l.bearing + drift, r);
    const k = i / (n - 1);
    // A strong taper: thick at the trunk, slim at the tip.
    return { x: p.x, y, z: p.z, r: l.root + (l.tip * 0.65 - l.root) * Math.pow(k, 0.75) };
  });
  // Where a limb runs under a deck it passes clear under the boards and joists (the deck rests on
  // brackets down to it), never up through them: its line is pulled down there, every 2 m.
  const out: (P3 & { r: number })[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    out.push({ ...a });
    const b = pts[i + 1];
    if (!b) break;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const m = Math.floor(len / 2);
    for (let k = 1; k < m; k++) {
      const t = k / m;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        r: a.r + (b.r - a.r) * t,
      });
    }
  }
  for (const p of out) {
    const rad = p.r * 1.3;
    for (const d of Object.values(DECKS)) {
      if (!inRect(d.rect, p.x, p.z, rad + 3)) continue;
      if (p.y - rad >= d.y + 4.5) continue;
      p.y = Math.min(p.y, d.y - 0.95 - rad);
    }
  }
  return { id: l.id, canopy: l.canopy, points: out };
}

/** The pillars: from the ground straight up, leaning in to merge with the core under the Crown Deck. */
function pillarBranch(b: number, i: number): Branch {
  const pts: (P3 & { r: number })[] = [];
  const steps = [
    [PILLARS.r + 0.6, TRUNK_BASE - 0.8, PILLARS.radius * 1.35],
    [PILLARS.r, TB.rootHall.y + 1.5, PILLARS.radius],
    [PILLARS.r - 0.1, 30, PILLARS.radius * 0.94],
    [PILLARS.r - 0.4, 40, PILLARS.radius * 0.86],
    [PILLARS.r - 1.8, 45.5, PILLARS.radius * 0.8],
    [7.2, 49.2, PILLARS.radius * 0.85],
  ] as const;
  for (const [r, y, rad] of steps) {
    const p = atBearing(b + Math.sin(y * 0.07 + i) * 1.5, r);
    pts.push({ x: p.x, y, z: p.z, r: rad });
  }
  return { id: `pillar-${i}`, points: pts, canopy: false };
}

/** A mass of leaves in the tree's polar frame: its centre's bearing, distance and height, and its radii. */
interface LeafMass {
  bearing: number;
  r: number;
  y: number;
  rx: number;
  ry: number;
  rz: number;
}

/** The two leaders from the column's top to the high crown's masses (north-east). */
export const CROWN_MASSES: readonly LeafMass[] = [
  // Raised and broadened past the spec's 77 m so the crown breaks the ridge's skyline from the sea.
  { bearing: 30, r: 27, y: 82, rx: 25, ry: 17, rz: 22 },
  { bearing: 72, r: 32, y: 75, rx: 23, ry: 14, rz: 20 },
];

/**
 * A pad of leaves over the Practice Bough: the Sea Window's ring is one thin sheet there, so the deck
 * looked up through its gaps at open sky. The pad's clumps (and the sprays that carry them) are a second
 * layer from about 11 m over the deck (the canopy's clearance is 6 m), and keep under the Sea Window's
 * 48 m top, so the Crown Deck still looks out over them to the sea.
 */
const DECK_PADS: readonly LeafMass[] = [{ bearing: 160, r: 36, y: 45, rx: 12, ry: 4, rz: 11 }];

/** The deck pads' clump spacing at most (m). */
const PAD_SPACING = 6;

function leaderBranches(): Branch[] {
  return CROWN_MASSES.map((m, i) => {
    const top = atBearing(m.bearing, 3);
    const mid = atBearing(m.bearing, m.r * 0.45);
    const end = atBearing(m.bearing, m.r * 0.92);
    return {
      id: `leader-${i}`,
      canopy: false,
      points: [
        { x: TREE.x, y: COLUMN_TOP - 3, z: TREE.z, r: 3.2 },
        { x: top.x, y: COLUMN_TOP + 1.5, z: top.z, r: 2.6 },
        { x: mid.x, y: m.y - 5, z: mid.z, r: 1.8 },
        { x: end.x, y: m.y - 2, z: end.z, r: 0.9 },
      ],
    };
  });
}

/** The authored cameras that need a clear view near them (spec §3.7 and the hero shots). */
export const CAMERA_SPOTS: readonly P3[] = [
  TB.anchors.puzzleCam,
  TB.anchors.twistCam,
  { x: 2010, y: 52.3, z: -1548 },
  { x: 1980, y: 16.5, z: -1532 },
];

const MAIN_BRANCHES: readonly Branch[] = [
  ...LIMBS.map(limbBranch),
  ...PILLARS.bearings.map(pillarBranch),
  ...leaderBranches(),
];

/** The limbs that carry canopy (the sprays fork off them; the prop roots and vines hang from them). */
export const CANOPY_LIMBS = MAIN_BRANCHES.filter((b) => b.canopy);

/** The crew houses on their boughs (centre of the floor, floor height, facing the tree). */
export const CREW_HOUSES = TB.houses.map((h) => {
  const c = atBearing(h.bearing, h.r);
  return { ...h, x: c.x, z: c.z, half: 3.1, height: 7.2 };
});

/** The scaffold platform (the Lantern House after the Seal). */
export const SCAFFOLD = (() => {
  const s = TB.scaffold;
  const c = atBearing(s.bearing, s.r);
  return { x: c.x, z: c.z, y: s.y, half: 2.6, height: 6.5 };
})();

/** Places nothing may hang over or stand in: the house footprints, the Sky Basket shaft, the mast. */
export interface Keepout {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}

export function treeKeepouts(): Keepout[] {
  const out: Keepout[] = [];
  for (const h of CREW_HOUSES)
    out.push({ x: h.x, z: h.z, r: h.half * 1.45 + 1, y0: h.floor - 2, y1: h.floor + h.height + 1.2 });
  out.push({
    x: SCAFFOLD.x,
    z: SCAFFOLD.z,
    r: SCAFFOLD.half * 1.45 + 1,
    y0: SCAFFOLD.y - 2,
    y1: SCAFFOLD.y + 7.5,
  });
  const basket = atBearing(TB.skyBasket.bearing, TB.skyBasket.r);
  out.push({ x: basket.x, z: basket.z, r: 3.2, y0: TB.skyBasket.bottomY - 1, y1: TB.skyBasket.topY + 6 });
  const mast = TB.anchors.flagMast;
  out.push({ x: mast.x, z: mast.z, r: 3.5, y0: mast.y, y1: mast.y + 14 });
  // The deck houses (the Practice Bough's and the top deck's loft) and the Crown Beacon.
  for (const id of ['L2S', 'L3SE'] as const) {
    const d = DECKS[id];
    const hr = d.rect;
    const c = { x: hr.x + hr.ux * (hr.hu - 3), z: hr.z + hr.uz * (hr.hu - 3) };
    out.push({ x: c.x, z: c.z, r: 6, y0: d.y - 1, y1: d.y + (id === 'L3SE' ? 13 : 9) });
  }
  out.push({ x: TREE.x, z: TREE.z, r: 4.5, y0: COLUMN_TOP - 2, y1: TB.crown.beaconTop + 6 });
  return out;
}

function inKeepout(k: readonly Keepout[], x: number, y: number, z: number, r: number): boolean {
  for (const o of k) if (Math.hypot(x - o.x, z - o.z) < o.r + r && y + r > o.y0 && y - r < o.y1) return true;
  return false;
}

/** The gondola cable: from the Three Landings' corner to the Cloud Loft. */
export function cableDistance(x: number, y: number, z: number): number {
  return segmentDistance3(x, y, z, TB.gondola.station, TB.gondola.loft);
}

/** A point on a branch's centre line, with its radius there. */
export type BranchPoint = P3 & { r: number };

/** The ring of canopy round the cathedral: from just outside its open heart to the drip line. */
const RING = { rIn: 27, rOut: 58 } as const;

/** 0 away from the Sea Window, 1 inside it (eased in over the 18° outside its edges). */
function seaWeight(bearing: number): number {
  const [a, b] = TB.tree.canopy.seaWindow;
  return smoothstep(-18, 0, Math.min(bearing - a, b - bearing));
}

/** A leaf layer's underside and top over a point (a lens, closed at its edges), or null off it. */
interface LayerSpan {
  bottom: number;
  top: number;
}

/**
 * The ring's leaf layer: a lens from r 27 to the drip line at r 58, its underside sloping up toward the
 * trunk (the ceiling seen from the decks), its top ≤ 56 m (≤ 48 m over the Sea Window).
 */
function ringLayer(x: number, z: number): LayerSpan | null {
  const r = Math.hypot(x - TREE.x, z - TREE.z);
  if (r < RING.rIn || r > RING.rOut) return null;
  const c = TB.tree.canopy;
  const s = seaWeight(bearingOf(x, z));
  const u = (r - RING.rIn) / (RING.rOut - RING.rIn);
  const bottom = lerp(lerp(44, 41.5, s), c.ring.bottom + 1.5 * s, u);
  const cap = lerp(c.ring.top, c.ring.topSeaWindow, s);
  const thick = lerp(13, 7, s) * Math.sqrt(Math.sin(Math.PI * u));
  return { bottom, top: Math.max(bottom, Math.min(cap, bottom + thick)) };
}

function crownLayer(m: LeafMass, x: number, z: number): LayerSpan | null {
  const c = atBearing(m.bearing, m.r);
  const b = (m.bearing * Math.PI) / 180;
  const ux = Math.sin(b);
  const uz = -Math.cos(b);
  const lu = (x - c.x) * ux + (z - c.z) * uz;
  const lv = -(x - c.x) * uz + (z - c.z) * ux;
  const e = (lu / m.rx) ** 2 + (lv / m.rz) ** 2;
  if (e > 1) return null;
  const k = Math.sqrt(1 - e);
  return { bottom: m.y - m.ry * 0.5 * k, top: m.y + m.ry * 0.92 * k };
}

const LAYERS: readonly ((x: number, z: number) => LayerSpan | null)[] = [
  ringLayer,
  ...CROWN_MASSES.map((m) => (x: number, z: number) => crownLayer(m, x, z)),
];

/** The leaf layers' plan area (m²), for spacing a tier's clumps. */
const LAYER_AREA =
  Math.PI * (RING.rOut ** 2 - RING.rIn ** 2) + CROWN_MASSES.reduce((a, m) => a + Math.PI * m.rx * m.rz, 0);

/** The walks the wood keeps under (by its joists) or 4.5 m over: the decks, the gallery, the top landing. */
const RAISED_WALKS = [
  ...Object.values(DECKS).map((d) => ({ rect: d.rect, y: d.y })),
  { rect: GALLERY_RECT, y: TB.gallery.y },
  { rect: TOP_LANDING, y: CROWN.y },
];

/**
 * Whether wood of radius `r` at a point keeps clear of every walk (under a raised walk's joists or
 * 4.5 m over it, `above` m over the stair, bridges and paths), the houses, the cable and the cameras.
 */
function woodClear(
  clearance: WalkClearance,
  keep: readonly Keepout[],
  p: P3,
  r: number,
  above: number,
): boolean {
  const rad = r * 1.3;
  for (const w of RAISED_WALKS)
    if (inRect(w.rect, p.x, p.z, rad + 0.8) && p.y + rad > w.y - 0.9 && p.y - rad < w.y + 4.6) return false;
  if (clearance.conflict(p.x, p.y, p.z, rad, { beside: 0.8, above, below: 1.2 })) return false;
  if (inKeepout(keep, p.x, p.y, p.z, rad + 0.3)) return false;
  if (cableDistance(p.x, p.y, p.z) < 2.5 + rad) return false;
  if (flightDistance(p.x, p.y, p.z) < 2 + rad) return false;
  return !CAMERA_SPOTS.some((c) => Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) - rad < 4);
}

/** How far a point is from the arrival flyover's path (straight between its keys): it climbs through the cathedral. */
function flightDistance(x: number, y: number, z: number): number {
  const k = THOUSAND_BOUGH_ARRIVAL.keys;
  let best = Infinity;
  for (let i = 0; i < k.length - 1; i++) best = Math.min(best, segmentDistance3(x, y, z, k[i]!, k[i + 1]!));
  return best;
}

/** A branch's centre line every `step` metres (straight between its points). */
function sampleBranch(b: Branch, step: number): BranchPoint[] {
  const out: BranchPoint[] = [];
  const p = b.points;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i]!;
    const c = p[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({
        x: a.x + (c.x - a.x) * t,
        y: a.y + (c.y - a.y) * t,
        z: a.z + (c.z - a.z) * t,
        r: a.r + (c.r - a.r) * t,
      });
    }
  }
  out.push({ ...p[p.length - 1]! });
  return out;
}

/**
 * The canopy's sprays: boughs forking off the canopy limbs (and the leaders, into the high crown) and
 * reaching out into the leaf layer, so every leaf clump has wood within a twig's reach. Each rises
 * from a point on its parent's centre line in a gentle arch, tapering, and keeps clear of every walk.
 */
function canopySprays(parents: readonly Branch[]): Branch[] {
  const clearance = new WalkClearance();
  const keep = treeKeepouts();
  const rand = mulberry32(0x5b4a);
  type Source = { id: string; pts: BranchPoint[]; spray: boolean };
  const limbs: Source[] = parents
    .filter((b) => b.canopy)
    .map((b) => ({ id: b.id, pts: sampleBranch(b, 2), spray: false }));
  const leaders: Source[] = parents
    .filter((b) => b.id.startsWith('leader'))
    .map((b) => ({ id: b.id, pts: sampleBranch(b, 2), spray: false }));
  // Where the sprays reach: rings through the ring's layer (low in it, and up toward its top where
  // it's thick), and a grid through the high crown's masses at two heights.
  type Target = { x: number; y: number; z: number; crown: boolean };
  const targets: Target[] = [];
  for (const [ri, rt] of [31, 39, 47, 55].entries()) {
    const n = Math.round((2 * Math.PI * rt) / 11);
    for (let k = 0; k < n; k++)
      for (const high of [false, true]) {
        const b = ((k + (ri % 2) * 0.5 + (high ? 0.5 : 0) + (rand() - 0.5) * 0.3) / n) * 360;
        const p = atBearing(b, rt + (rand() - 0.5) * 3);
        const l = ringLayer(p.x, p.z);
        if (!l) continue;
        const thick = l.top - l.bottom;
        if (high && thick < 6) continue;
        targets.push({
          x: p.x,
          z: p.z,
          y: high ? l.top - 3 : l.bottom + Math.min(2.5, thick * 0.35),
          crown: false,
        });
      }
  }
  for (const m of CROWN_MASSES) {
    const c = atBearing(m.bearing, m.r);
    for (let gx = -m.rx; gx <= m.rx; gx += 9)
      for (let gz = -m.rz; gz <= m.rz; gz += 9)
        for (const h of [0.15, 0.5, 0.85]) {
          const x = c.x + gx + (rand() - 0.5) * 3 + h * 4;
          const z = c.z + gz + (rand() - 0.5) * 3 + h * 4;
          const l = crownLayer(m, x, z);
          if (!l || l.top - l.bottom < 6) continue;
          targets.push({ x, z, y: l.bottom + (l.top - l.bottom) * h, crown: true });
        }
  }
  const out: Branch[] = [];
  const sprays: Source[] = [];
  /** A spray from `s` to `t`: up first, then out, in a gentle arch, tapering; null if it meets a walk. */
  const grow = (s: BranchPoint, t: P3, rnd: () => number): BranchPoint[] | null => {
    const len = Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z);
    const n = Math.max(3, Math.ceil(len / 3));
    const r0 = Math.min(0.7, s.r * 0.6);
    const sway = (rnd() - 0.5) * 0.12 * len;
    const pts: BranchPoint[] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const lift = 1 - Math.pow(1 - u, 2.2);
      const arch = Math.sin(Math.PI * u) * len * 0.05;
      // Sideways a little, square to the spray (no ruler-straight sprays).
      const sx = (-(t.z - s.z) / len) * sway * Math.sin(Math.PI * u);
      const sz = ((t.x - s.x) / len) * sway * Math.sin(Math.PI * u);
      pts.push({
        x: s.x + (t.x - s.x) * u + sx,
        y: s.y + (t.y - s.y) * lift + arch,
        z: s.z + (t.z - s.z) * u + sz,
        r: r0 + (0.18 - r0) * Math.pow(u, 0.8),
      });
    }
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const c = pts[k]!;
      const m = Math.ceil(Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z));
      for (let j = 1; j <= m; j++) {
        const u = j / m;
        const q = { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u, z: a.z + (c.z - a.z) * u };
        if (Math.hypot(q.x - TREE.x, q.z - TREE.z) < HELIX.rOuter + 1.5) return null;
        if (!woodClear(clearance, keep, q, a.r + (c.r - a.r) * u, 3)) return null;
      }
    }
    return pts;
  };
  /**
   * Grows a spray to each target: off the limbs and the leaders first, then to the targets they
   * couldn't reach off the sprays grown so far. Ids number the targets from `first`.
   */
  const reach = (list: readonly Target[], first: number, rnd: () => number) => {
    let left = list.map((t, k) => ({ t, i: first + k }));
    for (const pass of [0, 1]) {
      const failed: typeof left = [];
      for (const { t, i } of left) {
        const rt = Math.hypot(t.x - TREE.x, t.z - TREE.z);
        const starts: { p: BranchPoint; id: string; d: number }[] = [];
        const from = pass === 0 ? (t.crown ? leaders : limbs) : sprays;
        for (const src of from)
          for (const [k, p] of src.pts.entries()) {
            // Off a spray's middle reach only (not its root, nor its tip).
            if (src.spray && (k < 2 || k > src.pts.length - 2)) continue;
            const rr = Math.hypot(p.x - TREE.x, p.z - TREE.z);
            if (
              t.crown
                ? p.y < COLUMN_TOP + 4 || rr < 6
                : rr < HELIX.rOuter + 2 || rr > rt + (src.spray ? 6 : -2)
            )
              continue;
            if (p.y > t.y + 1) continue;
            starts.push({ p, id: src.id, d: Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) });
          }
        starts.sort((a, b) => a.d - b.d);
        let done = false;
        for (const s of starts.slice(0, 10)) {
          if (s.d < 3.5 || s.d > 28) continue;
          const pts = grow(s.p, t, rnd);
          if (!pts) continue;
          const id = `${s.id.replace(/-spray-\d+$/, '')}-spray-${i}`;
          out.push({ id, canopy: false, points: pts, parent: s.id });
          sprays.push({ id, pts: sampleBranch({ id, canopy: false, points: pts }, 2), spray: true });
          done = true;
          break;
        }
        if (!done) failed.push({ t, i });
      }
      left = failed;
    }
  };
  reach(targets, 0, rand);
  // Then up into the deck pads, off the limbs and the ring's sprays below them (their own random
  // stream, so the ring's and the crown's sprays don't move).
  const padRand = mulberry32(0x9ad5);
  const padTargets: Target[] = [];
  for (const m of DECK_PADS) {
    const c = atBearing(m.bearing, m.r);
    for (let gx = -m.rx; gx <= m.rx; gx += 6)
      for (let gz = -m.rz; gz <= m.rz; gz += 6) {
        const x = c.x + gx + (padRand() - 0.5) * 2;
        const z = c.z + gz + (padRand() - 0.5) * 2;
        const l = crownLayer(m, x, z);
        if (!l || l.top - l.bottom < 4) continue;
        padTargets.push({ x, z, y: l.bottom + (l.top - l.bottom) * 0.3, crown: false });
      }
  }
  reach(padTargets, targets.length, padRand);
  return out;
}

const SPRAYS = canopySprays(MAIN_BRANCHES);

export const BRANCHES: readonly Branch[] = [...MAIN_BRANCHES, ...SPRAYS];

/** The wood a leaf clump may hang from: the canopy limbs, the sprays and the leaders. */
const CANOPY_WOOD: readonly { id: string; pts: readonly BranchPoint[] }[] = [
  ...CANOPY_LIMBS.map((b) => ({
    id: b.id,
    pts: b.points.filter((p) => Math.hypot(p.x - TREE.x, p.z - TREE.z) > 22),
  })),
  ...MAIN_BRANCHES.filter((b) => b.id.startsWith('leader')).map((b) => ({
    id: b.id,
    pts: b.points.slice(1),
  })),
  ...SPRAYS.map((b) => ({ id: b.id, pts: b.points })),
];

/**
 * The sprays that carry leaves (a clump hangs off them, or off a spray forking from them): the only
 * ones a level of detail draws (bare sprays of the bigger, fewer clumps of the lower tiers aren't).
 */
export function carryingSprays(clusters: readonly Cluster[]): Set<string> {
  const parent = new Map(SPRAYS.map((b) => [b.id, b.parent]));
  const out = new Set<string>();
  for (const c of clusters)
    for (let id: string | undefined = c.wood; id && parent.has(id) && !out.has(id); id = parent.get(id))
      out.add(id);
  return out;
}

/** A leaf cluster: a soft clump of leaves, on the end of its own twig. */
export interface Cluster extends P3 {
  r: number;
  /** 0 on the canopy's underside, 1 on its sunlit top. */
  up: number;
  seed: number;
  /** The leaf layer's outward normal there (the clump shades as part of the canopy's one soft volume). */
  nx: number;
  ny: number;
  nz: number;
  /** Its twig: from a point on a limb's, a spray's or a leader's centre line into the clump's heart. */
  twig: readonly BranchPoint[];
  /** The branch its twig comes off. */
  wood: string;
}

/** The nearest point on the canopy's wood to (x, y, z), preferring wood below it (leaves hang, they don't dangle). */
function nearestWood(x: number, y: number, z: number, out: BranchPoint & { id: string }): number {
  let best = Infinity;
  for (const { id, pts: line } of CANOPY_WOOD)
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1)),
      );
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(x - px, y - py, z - pz) + Math.max(0, py - y) * 1.5;
      if (d < best) {
        best = d;
        out.x = px;
        out.y = py;
        out.z = pz;
        out.r = a.r + (b.r - a.r) * t;
        out.id = id;
      }
    }
  return best;
}

/**
 * The leaf clusters for a tier's count: two layers (the underside and the top) of the ring's and the
 * high crown's leaf lenses, packed on a jittered hex grid so they overlap into one ceiling, the
 * spacing (and so the clump size) set by the count. Each is lifted, where it can, to keep clear of
 * every walk surface (6 m above, 4 m beside), the houses, the mast, the Sky Basket, the gondola's
 * cable (4 m) and the cathedral (nothing inside 26 m below 56 m), and hangs from its own twig off the
 * nearest wood (or isn't grown).
 */
export function canopyClusters(count: number, clearance: WalkClearance, scale = 1): Cluster[] {
  const steps = canopyClusterSteps(count, clearance, scale);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** `canopyClusters` a grid row at a time (a sliced build breathes at each yield). */
export function* canopyClusterSteps(
  count: number,
  clearance: WalkClearance,
  scale = 1,
): Generator<void, Cluster[], void> {
  const rand = mulberry32(0x7b0b + count);
  const keep = treeKeepouts();
  const c = TB.tree.canopy;
  const sp = Math.sqrt((2 * LAYER_AREA) / (0.866 * count));
  const out: Cluster[] = [];
  const wood = { x: 0, y: 0, z: 0, r: 0, id: '' };
  const fits = (x: number, y: number, z: number, r: number) => {
    const rr = Math.hypot(x - TREE.x, z - TREE.z);
    if (rr < c.openR + r && y - r < c.openBelow) return false;
    if (inKeepout(keep, x, y, z, r)) return false;
    if (cableDistance(x, y, z) < 4 + r) return false;
    if (flightDistance(x, y, z) < 3.5 + r) return false;
    return !clearance.conflict(x, y, z, r, { beside: c.clearBeside, above: c.clearAbove, below: 1 });
  };
  /** A clump of `layer` at (x, z) in a leaf layer, if it fits and has wood within a twig's reach. */
  const grow = (
    x: number,
    z: number,
    layer: number,
    at: (x: number, z: number) => LayerSpan | null,
    seed: number,
    size: number,
    spacing: number,
  ) => {
    const l = at(x, z);
    if (!l) return;
    // Lifted over a walk's envelope as far as its layer's top allows, and smaller where it
    // still won't fit (the big clumps of the lower tiers, over the decks).
    let r = 0;
    let y = 0;
    let thin = false;
    let placed = false;
    for (const shrink of [1, 0.7, 0.5]) {
      r = spacing * 0.62 * scale * size * shrink;
      thin = l.top - l.bottom < r * 1.1;
      if (thin && layer === 1) break;
      y = thin ? (l.top + l.bottom) / 2 : layer === 0 ? l.bottom + r * 0.55 : l.top - r * 0.5;
      const highest = Math.max(y, l.top);
      while (y <= highest && !fits(x, y, z, r)) y += 1;
      if (y <= highest) {
        placed = true;
        break;
      }
    }
    if (!placed) return;
    // Its twig: from the nearest wood up into its heart, short enough to be a twig.
    const d = nearestWood(x, y - r * 0.3, z, wood);
    if (d > Math.max(7, r * 2.4)) return;
    const len = Math.hypot(x - wood.x, y - wood.y, z - wood.z);
    const twig: BranchPoint[] = [
      { x: wood.x, y: wood.y, z: wood.z, r: Math.min(wood.r * 0.6, 0.12 + r * 0.05) },
      {
        x: wood.x + (x - wood.x) * 0.55,
        y: wood.y + (y - wood.y) * 0.55 + len * 0.1,
        z: wood.z + (z - wood.z) * 0.55,
        r: 0.08 + r * 0.035,
      },
      { x, y, z, r: 0.05 + r * 0.02 },
    ];
    let ok = true;
    for (let k = 1; k <= 4 && ok; k++) {
      const t = k / 5;
      const a = t < 0.55 ? twig[0]! : twig[1]!;
      const b = t < 0.55 ? twig[1]! : twig[2]!;
      const u = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45;
      ok = woodClear(
        clearance,
        keep,
        { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u },
        a.r,
        2.5,
      );
    }
    if (!ok) return;
    // The layer's outward normal (its slope from the neighbouring spans).
    const h = 1.5;
    const sample = (sx: number, sz: number) => {
      const s = at(sx, sz);
      return s ? (layer === 0 && !thin ? s.bottom : s.top) : null;
    };
    const hx0 = sample(x - h, z);
    const hx1 = sample(x + h, z);
    const hz0 = sample(x, z - h);
    const hz1 = sample(x, z + h);
    const sign = layer === 0 && !thin ? -1 : 1;
    let nx = hx0 !== null && hx1 !== null ? (-(hx1 - hx0) / (2 * h)) * sign : (x - TREE.x) * 0.02;
    let nz = hz0 !== null && hz1 !== null ? (-(hz1 - hz0) / (2 * h)) * sign : (z - TREE.z) * 0.02;
    let ny = thin ? 0.2 : sign;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    out.push({ x, y, z, r, up: thin ? 0.55 : layer, seed, nx, ny, nz, twig, wood: wood.id });
  };
  const span = RING.rOut + 6;
  for (const layer of [0, 1])
    for (let j = 0, z0 = TREE.z - span; z0 <= TREE.z + span; j++, z0 += sp * 0.866) {
      for (let x0 = TREE.x - span + ((j % 2) + layer) * 0.5 * sp; x0 <= TREE.x + span; x0 += sp) {
        const x = x0 + (rand() - 0.5) * sp * 0.5;
        const z = z0 + (rand() - 0.5) * sp * 0.5;
        const seed = rand();
        const size = 0.85 + rand() * 0.3;
        for (const at of LAYERS) grow(x, z, layer, at, seed, size, sp);
      }
      yield;
    }
  // The deck pads on a grid of their own, no coarser than PAD_SPACING: the lower tiers' big clumps
  // still roof the deck (their own random stream, so the ring's and the crown's clumps don't move).
  const padRand = mulberry32(0x3d1 + count);
  const psp = Math.min(sp, PAD_SPACING);
  for (const m of DECK_PADS) {
    yield;
    const ctr = atBearing(m.bearing, m.r);
    const at = (x: number, z: number) => crownLayer(m, x, z);
    const reach = Math.max(m.rx, m.rz);
    for (const layer of [0, 1])
      for (let j = 0, z0 = ctr.z - reach; z0 <= ctr.z + reach; j++, z0 += psp * 0.866)
        for (let x0 = ctr.x - reach + ((j % 2) + layer) * 0.5 * psp; x0 <= ctr.x + reach; x0 += psp) {
          const x = x0 + (padRand() - 0.5) * psp * 0.5;
          const z = z0 + (padRand() - 0.5) * psp * 0.5;
          const seed = padRand();
          grow(x, z, layer, at, seed, 0.85 + padRand() * 0.3, psp);
        }
  }
  return out;
}

/** A prop root: from its limb down to the ground. */
export interface PropRoot {
  top: P3;
  foot: P3;
  r: number;
}

/** Walk rectangles the roots keep out of (in plan), grown by the root clearance. */
function rootBlockers(): {
  rects: Rect[];
  segs: { ax: number; az: number; bx: number; bz: number; half: number }[];
} {
  const rects: Rect[] = Object.values(DECKS).map((d) => d.rect);
  rects.push(GALLERY_RECT);
  const segs: { ax: number; az: number; bx: number; bz: number; half: number }[] = [];
  for (const b of BRIDGES)
    segs.push({ ax: b.from.x, az: b.from.z, bx: b.to.x, bz: b.to.z, half: b.width / 2 });
  const bw = TB.boardwalk.points;
  for (let i = 0; i < bw.length - 1; i++)
    segs.push({
      ax: bw[i]!.x,
      az: bw[i]!.z,
      bx: bw[i + 1]!.x,
      bz: bw[i + 1]!.z,
      half: TB.boardwalk.width / 2,
    });
  const mp = TB.sidePaths.mirror;
  for (let i = 0; i < mp.length - 1; i++)
    segs.push({ ax: mp[i]!.x, az: mp[i]!.z, bx: mp[i + 1]!.x, bz: mp[i + 1]!.z, half: 1.5 });
  return { rects, segs };
}

/**
 * The prop roots (spec §3.5): hung from the canopy limbs at r 26–55 down to the ground, none on a
 * path, deck, bridge or pool, nor within 2.5 m of one; the last of the Fern Walk runs between two
 * colonnades of them.
 */
export function propRoots(count: number): PropRoot[] {
  const rand = mulberry32(0x51de + count);
  const pr = TB.tree.propRoots;
  const { rects, segs } = rootBlockers();
  const keep = treeKeepouts();
  const out: PropRoot[] = [];
  const clear = (x: number, z: number, r: number) => {
    const c = pr.pathClearance + r;
    for (const rect of rects) if (inRect(rect, x, z, c)) return false;
    for (const s of segs) if (segmentDistance(x, z, s.ax, s.az, s.bx, s.bz) < s.half + c) return false;
    const walk = fernWalkAt(x, z);
    if (walk && walk.d < TB.fernWalk.width / 2 + c) return false;
    // Not in the Root Hall ring or the stair's band, nor by the wheels.
    if (Math.hypot(x - TREE.x, z - TREE.z) < TB.rootHall.rOuter + c) return false;
    for (const w of TB.water.wheels) {
      const p = atBearing(w.bearing, w.r);
      if (Math.hypot(x - p.x, z - p.z) < 4 + c) return false;
    }
    for (const o of keep) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
    for (const other of out)
      if (Math.hypot(x - other.foot.x, z - other.foot.z) < other.r + r + 2.4) return false;
    return true;
  };
  const candidates: { limb: Branch; i: number; t: number }[] = [];
  for (const limb of CANOPY_LIMBS)
    for (let i = 0; i < limb.points.length - 1; i++)
      for (let t = 0; t < 1; t += 0.2) candidates.push({ limb, i, t });
  for (let tries = 0; tries < 12000 && out.length < count; tries++) {
    const c = candidates[Math.floor(rand() * candidates.length)]!;
    const a = c.limb.points[c.i]!;
    const b = c.limb.points[c.i + 1]!;
    const t = c.t + rand() * 0.2;
    const x = a.x + (b.x - a.x) * t + (rand() - 0.5) * 1.2;
    const z = a.z + (b.z - a.z) * t + (rand() - 0.5) * 1.2;
    const rr = Math.hypot(x - TREE.x, z - TREE.z);
    if (rr < pr.rMin || rr > pr.rMax) continue;
    const r = (pr.dMin + rand() * (pr.dMax - pr.dMin)) / 2;
    if (!clear(x, z, r)) continue;
    const ground = thousandBoughHeight(x, z);
    // Not in fresh water (the roots stand on dry ground).
    if (ground < 6) continue;
    const top = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - 0.4, z: a.z + (b.z - a.z) * t };
    out.push({ top, foot: { x, y: ground, z }, r });
  }
  return out;
}

/** The stair band's passes at bearing b, and whether a sphere at (r, y) of radius `rad` there keeps the clearance rule. */
export function stairClear(bandY: number, rad: number, passes: readonly number[]): boolean {
  for (const p of passes) {
    const under = bandY - rad >= p + 4.5;
    const over = bandY + rad <= p - 0.6;
    if (!under && !over) return false;
  }
  return true;
}

export { HELIX };

/** A surface root: from under the Root Hall's rim out across the ground, half sunk into it. */
export interface GroundRoot {
  points: (P3 & { r: number })[];
}

/**
 * The banyan's surface roots: snaking out from under the Root Hall's rim (r 23) across the knoll, a
 * gap wherever a path, a deck's stilts, a wheel, a prop root or a clearing is. Each point's height is
 * its ground less a third of its radius, so they read as roots breaking the soil.
 */
export function groundRoots(count: number, propFeet: readonly PropRoot[]): GroundRoot[] {
  const rand = mulberry32(0x6a07 + count);
  const pr = TB.tree.propRoots;
  const { rects, segs } = rootBlockers();
  const keep = treeKeepouts();
  const free = (x: number, z: number, r: number) => {
    const c = 0.9 + r;
    for (const rect of rects) if (inRect(rect, x, z, c)) return false;
    for (const s of segs) if (segmentDistance(x, z, s.ax, s.az, s.bx, s.bz) < s.half + c) return false;
    const walk = fernWalkAt(x, z);
    if (walk && walk.d < TB.fernWalk.width / 2 + c) return false;
    for (const w of TB.water.wheels) {
      const p = atBearing(w.bearing, w.r);
      if (Math.hypot(x - p.x, z - p.z) < 4.5 + c) return false;
    }
    for (const o of keep) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
    for (const f of propFeet) if (Math.hypot(x - f.foot.x, z - f.foot.z) < f.r + r + 0.6) return false;
    for (const a of Object.values(TB.anchors)) if (Math.hypot(x - a.x, z - a.z) < 3 + r) return false;
    return true;
  };
  void pr;
  const out: GroundRoot[] = [];
  for (let tries = 0; tries < count * 60 && out.length < count; tries++) {
    const b = rand() * 360;
    const r0 = 0.45 + rand() * 0.35;
    const len = 6 + rand() * 10;
    const bend = (rand() - 0.5) * 1.6;
    const pts: (P3 & { r: number })[] = [];
    let ok = true;
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const rr = TB.rootHall.rOuter - 1.2 + len * t;
      const p = atBearing(b + (bend * t * t * 40) / rr + Math.sin(t * 5 + b) * (6 / rr), rr);
      const r = r0 * (1 - t * 0.7);
      // A root that meets a path or a deck's stilts stops short of it (if it's got out far enough).
      if (rr > TB.rootHall.rOuter + 0.4 && !free(p.x, p.z, r)) {
        ok = k >= 3;
        break;
      }
      const ground = thousandBoughHeight(p.x, p.z);
      // Under the Root Hall's rim it stays below the boards (it comes out from under them).
      const under = rr < TB.rootHall.rOuter + 0.3 ? TB.rootHall.y - 0.3 - r : Infinity;
      pts.push({ x: p.x, y: Math.min(ground - r * 0.35, under), z: p.z, r });
    }
    if (!ok) continue;
    // Not on top of one another.
    if (out.some((o) => Math.abs(((bearingOf(o.points[1]!.x, o.points[1]!.z) - b + 540) % 360) - 180) < 5))
      continue;
    out.push({ points: pts });
  }
  return out;
}

/** A hanging vine or a young air root: from a limb, straight down a few metres, swaying as a leaf. */
export interface Vine {
  top: P3;
  length: number;
  seed: number;
}

/** Vines down from the limbs and the canopy's undersides, clear of every walk and the cameras. */
export function hangingVines(count: number, clearance: WalkClearance): Vine[] {
  const rand = mulberry32(0x71e5 + count);
  const out: Vine[] = [];
  for (let tries = 0; tries < count * 30 && out.length < count; tries++) {
    const limb = CANOPY_LIMBS[Math.floor(rand() * CANOPY_LIMBS.length)]!;
    const i = Math.floor(rand() * (limb.points.length - 1));
    const a = limb.points[i]!;
    const b = limb.points[i + 1]!;
    const t = rand();
    const top = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - (a.r + (b.r - a.r) * t) * 0.7,
      z: a.z + (b.z - a.z) * t,
    };
    if (Math.hypot(top.x - TREE.x, top.z - TREE.z) < 20) continue;
    const length = 3 + rand() * 8;
    const ground = thousandBoughHeight(top.x, top.z);
    if (top.y - length < ground + 3.2) continue;
    let bad = false;
    for (let k = 0; k <= 4 && !bad; k++) {
      const y = top.y - (length * k) / 4;
      if (clearance.conflict(top.x, y, top.z, 0.6, { beside: 1.5, above: 3, below: 3 })) bad = true;
      if (CAMERA_SPOTS.some((c) => Math.hypot(c.x - top.x, c.y - y, c.z - top.z) < 5)) bad = true;
    }
    if (bad || out.some((v) => Math.hypot(v.top.x - top.x, v.top.z - top.z) < 1.5)) continue;
    out.push({ top, length, seed: rand() });
  }
  return out;
}

/**
 * The Root Gate (spec §2.5, wienie 3): two aerial roots down from limb 235 that cross over the Fern
 * Walk where it enters the Root Hall, framing the trunk; their feet flare into the ground either side
 * of the path, and the arch over it is at least 6 m high.
 */
export const ROOT_GATE: readonly (P3 & { r: number })[][] = (() => {
  const g = TB.rootGate;
  const foot = (x: number, z: number) => thousandBoughHeight(x, z) - 0.7;
  return [
    [
      { x: 1993.6, y: foot(1993.6, -1534.9), z: -1534.9, r: 1.35 },
      { x: 1993.4, y: g.y + 1.2, z: -1535.4, r: 0.95 },
      { x: 1993.2, y: g.y + 4, z: -1536, r: 0.8 },
      { x: 1991.8, y: g.y + 7.2, z: -1538.4, r: 0.72 },
      { x: 1991.4, y: g.y + 9, z: -1542.5, r: 0.7 },
      { x: 1992.2, y: 28, z: -1546.3, r: 0.75 },
    ],
    [
      { x: 1990.4, y: foot(1990.4, -1541.1), z: -1541.1, r: 1.2 },
      { x: 1990.6, y: g.y + 1.2, z: -1540.7, r: 0.85 },
      { x: 1990.9, y: g.y + 4, z: -1540.2, r: 0.7 },
      { x: 1992.3, y: g.y + 7.4, z: -1537.6, r: 0.62 },
      { x: 1989.3, y: g.y + 9.6, z: -1538.6, r: 0.6 },
      { x: 1985.6, y: 28.9, z: -1542.2, r: 0.7 },
    ],
  ];
})();
