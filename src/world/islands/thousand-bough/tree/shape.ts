import { mulberry32, segmentDistance } from '../../../../util/math';
import { HELIX, THOUSAND_BOUGH as TB, TREE, atBearing, bearingOf } from '../layout';
import { fernWalkAt, thousandBoughHeight } from '../height';
import {
  BRIDGES,
  CROWN,
  COLUMN_TOP,
  DECKS,
  GALLERY_RECT,
  PILLARS,
  inRect,
  type Rect,
} from '../village/surfaces';
import type { WalkClearance } from '../village/clearance';

/**
 * The great banyan's shape as numbers (spec §3.5): the fluted core, its 7 fused pillars, the limbs and
 * the crew houses' boughs (each crossing the stair band per the clearance rule), the two leaders to
 * the high crown, the prop roots, and the canopy's pads and leaf clusters. The tree's meshes, the
 * colliders and the layout tests all read these.
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
  /** Whether it's a limb that carries canopy (pads hang off its outer end). */
  canopy: boolean;
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
    id: 'bough-feature',
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
    id: 'bough-bugfix',
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
    id: 'bough-docs',
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

/** The two leaders from the column's top to the high crown's masses (north-east). */
export const CROWN_MASSES = [
  // Raised and broadened past the spec's 77 m so the crown breaks the ridge's skyline from the sea.
  { bearing: 30, r: 27, y: 82, rx: 25, ry: 17, rz: 22 },
  { bearing: 72, r: 32, y: 75, rx: 23, ry: 14, rz: 20 },
] as const;

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

/** Whether a branch segment (radius r) comes up into a deck's or a landing's boards or the walk over them. */
function throughDeck(a: P3, b: P3, r: number): boolean {
  const walks = [
    ...Object.values(DECKS).map((d) => ({ rect: d.rect, y: d.y })),
    { rect: GALLERY_RECT, y: TB.gallery.y },
  ];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    for (const w of walks)
      if (inRect(w.rect, x, z, r * 1.3 + 0.6) && y + r * 1.3 > w.y - 0.8 && y - r * 1.3 < w.y + 4.5)
        return true;
  }
  return false;
}

function segmentDistance3(p: P3, a: P3, b: P3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1),
    ),
  );
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t, p.z - a.z - dz * t);
}

/**
 * Twigs: forks off each canopy limb's outer half rising into its pad, and off the leaders into the
 * high crown, so the leaves hang from wood, not from nothing.
 */
function twigBranches(limbs: readonly Branch[]): Branch[] {
  const rand = mulberry32(0x7719);
  const out: Branch[] = [];
  for (const limb of limbs) {
    const pts = limb.points;
    for (let k = 0; k < 5; k++) {
      const t = 0.45 + (k / 5) * 0.5 + rand() * 0.06;
      const f = t * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const u = f - i;
      const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
      const r0 = (a.r + (b.r - a.r) * u) * 0.55;
      const ang = rand() * Math.PI * 2;
      const reach = 5 + rand() * 6;
      const rise = 4 + rand() * 6;
      const mid = {
        x: p.x + Math.cos(ang) * reach * 0.5,
        y: p.y + rise * 0.6,
        z: p.z + Math.sin(ang) * reach * 0.5,
      };
      const end = { x: p.x + Math.cos(ang) * reach, y: p.y + rise, z: p.z + Math.sin(ang) * reach };
      // Not across a camera's view (the puzzle's, the twist's, the Crown's).
      if (CAMERA_SPOTS.some((c) => segmentDistance3(c, mid, end) < 5 || segmentDistance3(c, p, mid) < 5))
        continue;
      // Not up through a deck (a twig under the boards stays under them).
      if (throughDeck(p, mid, r0) || throughDeck(mid, end, r0 * 0.6)) continue;
      out.push({
        id: `${limb.id}-twig-${k}`,
        canopy: false,
        points: [
          { ...p, r: r0 },
          { ...mid, r: r0 * 0.6 },
          { ...end, r: Math.max(0.12, r0 * 0.3) },
        ],
      });
    }
  }
  return out;
}

const MAIN_BRANCHES: readonly Branch[] = [
  ...LIMBS.map(limbBranch),
  ...PILLARS.bearings.map(pillarBranch),
  ...leaderBranches(),
];

export const BRANCHES: readonly Branch[] = [
  ...MAIN_BRANCHES,
  ...twigBranches(MAIN_BRANCHES.filter((b) => b.canopy || b.id.startsWith('leader'))),
];

/** The limbs that carry canopy (pads hang off their outer ends). */
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
  // The deck houses (the Practice Bough's and the Chronicle Loft) and the Crown Beacon.
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
  const a = TB.gondola.station;
  const b = TB.gondola.loft;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (dx * dx + dy * dy + dz * dz)),
  );
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t, z - a.z - dz * t);
}

/** A leaf cluster: a soft clump of leaves. */
export interface Cluster extends P3 {
  r: number;
  /** 0 at a pad's underside, 1 at its sunlit top. */
  up: number;
  seed: number;
  /** The pad's outward normal there (the clump shades as part of the pad's one soft volume). */
  nx: number;
  ny: number;
  nz: number;
}

/** The canopy's pads: 9 round the ring (low through the Sea Window), and the high crown's 2 masses. */
export const PADS = (() => {
  const c = TB.tree.canopy;
  const pads: { bearing: number; r: number; y: number; rx: number; ry: number; rz: number }[] = [];
  for (let i = 0; i < c.ring.pads; i++) {
    const bearing = (i * 360) / c.ring.pads + 12;
    const sea = bearing >= c.seaWindow[0] && bearing <= c.seaWindow[1];
    const top = sea ? c.ring.topSeaWindow : c.ring.top;
    const bottom = c.ring.bottom + (sea ? 1.5 : 0);
    pads.push({
      bearing,
      r: 43 + (i % 3) * 3,
      y: (top + bottom) / 2,
      rx: 15,
      ry: (top - bottom) / 2,
      rz: 13,
    });
  }
  for (const m of CROWN_MASSES)
    pads.push({ bearing: m.bearing, r: m.r, y: m.y, rx: m.rx, ry: m.ry, rz: m.rz });
  return pads;
})();

/**
 * The leaf clusters for a tier's count: spread over the pads' outer surfaces (mostly their tops and
 * sides), each kept clear of every walk surface (6 m above, 4 m beside), the houses, the mast, the
 * Sky Basket, the gondola's cable (4 m) and the cathedral (nothing inside 26 m below 56 m).
 */
export function canopyClusters(count: number, clearance: WalkClearance, scale = 1): Cluster[] {
  const rand = mulberry32(0x7b0b + count);
  const keep = treeKeepouts();
  const c = TB.tree.canopy;
  const out: Cluster[] = [];
  // Each pad's share by its size (the high crown's two masses are the biggest).
  const sizes = PADS.map((p) => p.rx * p.rz);
  const total = sizes.reduce((a, b) => a + b, 0);
  for (const [pi, pad] of PADS.entries()) {
    const perPad = Math.ceil((count * 2.2 * sizes[pi]!) / total);
    const centre = atBearing(pad.bearing, pad.r);
    const b = (pad.bearing * Math.PI) / 180;
    const ux = Math.sin(b);
    const uz = -Math.cos(b);
    for (let i = 0; i < perPad; i++) {
      // A point on the pad's ellipsoid, biased to its top and sides.
      const phi = rand() * Math.PI * 2;
      const cosT = 1 - Math.pow(rand(), 0.8) * 1.55;
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const lu = Math.cos(phi) * sinT * pad.rx * (0.8 + rand() * 0.2);
      const lv = Math.sin(phi) * sinT * pad.rz * (0.8 + rand() * 0.2);
      const ly = Math.max(-1, cosT) * pad.ry;
      const x = centre.x + lu * ux - lv * uz;
      const z = centre.z + lu * uz + lv * ux;
      const y = pad.y + ly;
      const r = (1.25 + rand() * 1.1) * scale;
      const rr = Math.hypot(x - TREE.x, z - TREE.z);
      if (rr < c.openR + r && y - r < c.openBelow) continue;
      if (inKeepout(keep, x, y, z, r)) continue;
      if (cableDistance(x, y, z) < 4 + r) continue;
      if (clearance.conflict(x, y, z, r, { beside: c.clearBeside, above: c.clearAbove, below: 1 })) continue;
      const nu = lu / (pad.rx * pad.rx);
      const nv = lv / (pad.rz * pad.rz);
      const ny = ly / (pad.ry * pad.ry);
      const nx = nu * ux - nv * uz;
      const nz = nu * uz + nv * ux;
      const nl = Math.hypot(nx, ny, nz) || 1;
      out.push({
        x,
        y,
        z,
        r,
        up: (ly / pad.ry + 1) / 2,
        seed: rand(),
        nx: nx / nl,
        ny: ny / nl,
        nz: nz / nl,
      });
    }
  }
  // Even thinning down to the tier's count (seeded, so every run is the same).
  const step = out.length / count;
  const picked: Cluster[] = [];
  if (step <= 1) picked.push(...out);
  else for (let i = 0; i < count; i++) picked.push(out[Math.floor(i * step)]!);
  // Leaves down over the limbs' outer reaches too (the pads hang on them; the limbs don't stop bare
  // short of the leaves): a clump on top of each limb every few metres past r 30.
  for (const limb of CANOPY_LIMBS)
    for (let i = 1; i < limb.points.length; i += 2) {
      const p = limb.points[i]!;
      if (Math.hypot(p.x - TREE.x, p.z - TREE.z) < 30) continue;
      const r = (1.4 + rand() * 0.9) * scale;
      const x = p.x + (rand() - 0.5) * 1.5;
      const y = p.y + p.r * 0.6 + r * 0.5;
      const z = p.z + (rand() - 0.5) * 1.5;
      if (inKeepout(keep, x, y, z, r)) continue;
      if (cableDistance(x, y, z) < 4 + r) continue;
      if (clearance.conflict(x, y, z, r, { beside: c.clearBeside, above: c.clearAbove, below: 1 })) continue;
      picked.push({ x, y, z, r, up: 0.7, seed: rand(), nx: 0, ny: 1, nz: 0 });
    }
  return picked;
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
