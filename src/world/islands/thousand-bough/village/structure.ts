import type { BoxCollider } from '../../../../game/collision';
import type { CircleObstacle } from '../../../contracts';
import type { CameraBlockerBox } from '../../../terrain/camera-blockers';
import { HELIX, THOUSAND_BOUGH as TB, TREE, atBearing, helixY } from '../layout';
import { thousandBoughHeight } from '../height';
import { BRANCHES, ROOT_GATE } from '../tree/shape';
import { PAINT, beam, box, gridSurface, rod, rope, type Buckets } from './pieces';
import {
  BASKET,
  BASKET_LANDING,
  CAVE_FLOOR,
  FALLS_LEDGE,
  BRIDGES,
  CROWN,
  COLUMN_TOP,
  DECKS,
  GALLERY_RECT,
  LANDING_SWEEP,
  PILLARS,
  TOP_LANDING,
  PLINTH,
  SPIRE_LEDGE,
  SPIRE_TOP,
  LANDING_DECK,
  WHARF,
  WHARF_RAMP,
  bridgeY,
  helixWalkY,
  rectWorld,
  type DeckId,
  type Rect,
} from './surfaces';

/** What the structure adds besides geometry: the walker's fences, the camera's blockers, the lanterns. */
export interface StructureOut {
  colliders: BoxCollider[];
  circles: CircleObstacle[];
  cameraBoxes: CameraBlockerBox[];
  /** Lantern spots (the glass's centre), in the order the Seal's cascade lights them (top first later). */
  lanterns: { x: number; y: number; z: number; hang: boolean }[];
  /** Colliders that only apply once a late bridge is open, keyed by bridge id (R3's end gates). */
  lateColliders: Map<string, BoxCollider[]>;
}

export function emptyStructure(): StructureOut {
  return { colliders: [], circles: [], cameraBoxes: [], lanterns: [], lateColliders: new Map() };
}

interface WalkPoint {
  x: number;
  y: number;
  z: number;
}

/** Rail height and the posts' spacing. */
const RAIL = { height: 1.08, every: 2.3, post: 0.13 } as const;

/**
 * A rail along a polyline of walk points: posts, a timber top rail, a rope mid-rail, and the walker's
 * fence (boxes spanning the walk height and 1.3 m over it). `skip(i)` leaves out segment i (an opening).
 */
export function rail(
  buckets: Buckets,
  out: StructureOut,
  pts: readonly WalkPoint[],
  o: {
    skip?: (i: number) => boolean;
    topColour?: number;
    rope?: boolean;
    lanternEvery?: number;
    /** The top rail's height (a low rope rail where it mustn't cross a view). */
    height?: number;
  } = {},
): void {
  const H = o.height ?? RAIL.height;
  let sinceLantern = 0;
  let lastPost: WalkPoint | null = null;
  const post = (p: WalkPoint) => {
    if (lastPost && Math.hypot(p.x - lastPost.x, p.z - lastPost.z) < 0.2) return;
    box(buckets, 'wood', p.x, p.y + H / 2 - 0.05, p.z, RAIL.post, H + 0.1, RAIL.post, 0, PAINT.weathered);
    lastPost = p;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    if (o.skip?.(i)) continue;
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.05) continue;
    const n = Math.max(1, Math.ceil(len / RAIL.every));
    let prev = a;
    post(a);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      post(p);
      beam(
        buckets,
        'wood',
        { x: prev.x, y: prev.y + H, z: prev.z },
        { x: p.x, y: p.y + H, z: p.z },
        0.12,
        0.09,
        o.topColour ?? PAINT.teak,
      );
      if (o.rope !== false)
        rope(
          buckets,
          { x: prev.x, y: prev.y + 0.55, z: prev.z },
          { x: p.x, y: p.y + 0.55, z: p.z },
          0.06,
          0.028,
          PAINT.rope,
          2,
        );
      sinceLantern += Math.hypot(p.x - prev.x, p.z - prev.z);
      if (o.lanternEvery && sinceLantern >= o.lanternEvery) {
        sinceLantern = 0;
        out.lanterns.push({ x: p.x, y: p.y + H + 0.55, z: p.z, hang: false });
      }
      prev = p;
    }
    // The walker's fence: from just under the walk to 1.3 m over it, along the segment.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    out.colliders.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      hx: len / 2 + 0.05,
      hz: 0.12,
      rot: Math.atan2(-dz, dx),
      y0: Math.min(a.y, b.y) - 0.45,
      y1: Math.max(a.y, b.y) + 1.3,
      height: H,
    });
  }
}

/** Points round a rectangle's edge (in its local u, v), at height y, for a rail. */
function rectEdge(r: Rect, y: number, from: [number, number], to: [number, number]): WalkPoint[] {
  const a = rectWorld(r, from[0], from[1]);
  const b = rectWorld(r, to[0], to[1]);
  return [
    { x: a.x, y, z: a.z },
    { x: b.x, y, z: b.z },
  ];
}

/** An opening on one of a rectangle's edges, by its span along that edge. */
interface Opening {
  edge: 'in' | 'out' | 'ccw' | 'cw';
  from: number;
  to: number;
}

/** Rails round a deck, leaving its openings (stair, bridges, boardwalk). */
function deckRails(
  buckets: Buckets,
  out: StructureOut,
  r: Rect,
  y: number,
  openings: readonly Opening[],
  lanternEvery = 0,
): void {
  const edges: { edge: Opening['edge']; a: [number, number]; b: [number, number]; along: 'u' | 'v' }[] = [
    { edge: 'in', a: [-r.hu, -r.hv], b: [-r.hu, r.hv], along: 'v' },
    { edge: 'cw', a: [-r.hu, r.hv], b: [r.hu, r.hv], along: 'u' },
    { edge: 'out', a: [r.hu, r.hv], b: [r.hu, -r.hv], along: 'v' },
    { edge: 'ccw', a: [r.hu, -r.hv], b: [-r.hu, -r.hv], along: 'u' },
  ];
  for (const e of edges) {
    // Split the edge at its openings.
    const along = (p: [number, number]) => (e.along === 'u' ? p[0] : p[1]);
    const s0 = along(e.a);
    const s1 = along(e.b);
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    const cuts = openings
      .filter((o) => o.edge === e.edge)
      .map((o) => [Math.max(lo, Math.min(o.from, o.to)), Math.min(hi, Math.max(o.from, o.to))] as const)
      .sort((p, q) => p[0] - q[0]);
    const spans: [number, number][] = [];
    let cur = lo;
    for (const [c0, c1] of cuts) {
      if (c0 > cur + 0.3) spans.push([cur, c0]);
      cur = Math.max(cur, c1);
    }
    if (hi > cur + 0.3) spans.push([cur, hi]);
    for (const [p0, p1] of spans) {
      const at = (s: number): [number, number] => (e.along === 'u' ? [s, e.a[1]] : [e.a[0], s]);
      rail(buckets, out, rectEdge(r, y, at(p0), at(p1)), { lanternEvery });
    }
  }
}

/** A plank deck: boards on joists, with a fascia; `y` is its top. */
function deckBoards(buckets: Buckets, r: Rect, y: number, colour: number = PAINT.plank): void {
  const yaw = Math.atan2(r.ux, r.uz) - Math.PI / 2;
  // Boards run across the deck's depth, 0.3 m wide with a 2 cm gap.
  const n = Math.max(1, Math.round((r.hv * 2) / 0.32));
  for (let i = 0; i < n; i++) {
    const v = -r.hv + (i + 0.5) * ((r.hv * 2) / n);
    const c = rectWorld(r, 0, v);
    box(
      buckets,
      'wood',
      c.x,
      y - 0.06,
      c.z,
      r.hu * 2,
      0.12,
      (r.hv * 2) / n - 0.025,
      yaw,
      i % 3 === 0 ? PAINT.teak : colour,
    );
  }
  // Joists under, and the fascia round the edge.
  for (const v of [-r.hv + 0.3, 0, r.hv - 0.3]) {
    const a = rectWorld(r, -r.hu, v);
    const b = rectWorld(r, r.hu, v);
    beam(
      buckets,
      'wood',
      { x: a.x, y: y - 0.32, z: a.z },
      { x: b.x, y: y - 0.32, z: b.z },
      0.22,
      0.3,
      PAINT.teakDark,
    );
  }
  for (const [u0, v0, u1, v1] of [
    [-r.hu, -r.hv, r.hu, -r.hv],
    [-r.hu, r.hv, r.hu, r.hv],
    [r.hu, -r.hv, r.hu, r.hv],
  ] as const) {
    const a = rectWorld(r, u0, v0);
    const b = rectWorld(r, u1, v1);
    beam(
      buckets,
      'wood',
      { x: a.x, y: y - 0.2, z: a.z },
      { x: b.x, y: y - 0.2, z: b.z },
      0.08,
      0.26,
      PAINT.weathered,
    );
  }
}

/** Cross joists under a deck's long joists, and a deep girder along each of its ends. */
function deckJoists(buckets: Buckets, r: Rect, y: number): void {
  const n = Math.max(2, Math.round((r.hu * 2) / 1.5));
  for (let i = 0; i <= n; i++) {
    const u = -r.hu + 0.25 + ((r.hu * 2 - 0.5) * i) / n;
    const a = rectWorld(r, u, -r.hv + 0.15);
    const b = rectWorld(r, u, r.hv - 0.15);
    beam(
      buckets,
      'wood',
      { x: a.x, y: y - 0.6, z: a.z },
      { x: b.x, y: y - 0.6, z: b.z },
      0.18,
      0.26,
      PAINT.teakDark,
    );
  }
  for (const v of [-r.hv + 0.2, r.hv - 0.2]) {
    const a = rectWorld(r, -r.hu, v);
    const b = rectWorld(r, r.hu, v);
    beam(
      buckets,
      'wood',
      { x: a.x, y: y - 0.62, z: a.z },
      { x: b.x, y: y - 0.62, z: b.z },
      0.24,
      0.42,
      PAINT.weathered,
    );
  }
}

/** Brackets from a deck's underside down onto the limbs that pass beneath it (the tree carries it). */
function limbBrackets(buckets: Buckets, r: Rect, y: number): void {
  for (const [u, v] of [
    [r.hu * 0.2, -r.hv * 0.6],
    [r.hu * 0.2, r.hv * 0.6],
    [r.hu * 0.75, -r.hv * 0.6],
    [r.hu * 0.75, r.hv * 0.6],
  ] as const) {
    const top = rectWorld(r, u, v);
    let best: { x: number; y: number; z: number; d: number } | null = null;
    for (const b of BRANCHES) {
      if (b.id.startsWith('pillar') || b.id.includes('twig')) continue;
      for (const p of b.points) {
        const dh = Math.hypot(p.x - top.x, p.z - top.z);
        const dy = y - (p.y + p.r);
        if (dy < 1.2 || dy > 7 || dh > 4.5) continue;
        const d = dh + dy * 0.5;
        if (!best || d < best.d) best = { x: p.x, y: p.y + p.r * 0.7, z: p.z, d };
      }
    }
    if (!best) continue;
    beam(
      buckets,
      'wood',
      { x: top.x, y: y - 0.7, z: top.z },
      { x: best.x, y: best.y, z: best.z },
      0.2,
      0.2,
      PAINT.teakDark,
    );
    // A rope lashing where it meets the limb.
    rod(
      buckets,
      'rope',
      { x: best.x, y: best.y - 0.15, z: best.z },
      { x: best.x, y: best.y + 0.15, z: best.z },
      0.26,
      6,
      PAINT.rope,
    );
  }
}

/** Knee braces from a deck's inner edge down to the trunk's pillars, so it reads as carried by the tree. */
function deckBraces(buckets: Buckets, r: Rect, y: number): void {
  for (const v of [-r.hv * 0.7, 0, r.hv * 0.7]) {
    const top = rectWorld(r, -r.hu + 0.6, v);
    const foot = rectWorld(r, -r.hu - 4.6, v * 0.75);
    beam(
      buckets,
      'wood',
      { x: top.x, y: y - 0.4, z: top.z },
      { x: foot.x, y: y - 5.2, z: foot.z },
      0.24,
      0.24,
      PAINT.teakDark,
    );
  }
}

/** Tall stilts from a deck's outer corners down to the ground (where the ground is clear). */
function deckStilts(
  buckets: Buckets,
  out: StructureOut,
  r: Rect,
  y: number,
  clear: (x: number, z: number) => boolean,
): void {
  for (const [u, v] of [
    [r.hu - 0.5, -r.hv + 0.5],
    [r.hu - 0.5, r.hv - 0.5],
    [r.hu * 0.1, -r.hv + 0.5],
    [r.hu * 0.1, r.hv - 0.5],
  ] as const) {
    const p = rectWorld(r, u, v);
    if (!clear(p.x, p.z)) continue;
    const ground = thousandBoughHeight(p.x, p.z);
    if (y - ground < 1.5) continue;
    rod(
      buckets,
      'wood',
      { x: p.x, y: ground - 0.6, z: p.z },
      { x: p.x, y: y - 0.3, z: p.z },
      0.22,
      7,
      PAINT.weathered,
      0.18,
    );
    out.circles.push({ x: p.x, z: p.z, r: 0.35, y0: ground - 1, y1: y - 0.4, height: y - ground });
  }
}

/** The Great Stair: its walkway, stringers, rails, lanterns, brackets, and the stone plinth under its foot. */
function greatStair(buckets: Buckets, out: StructureOut): void {
  const total = HELIX.sweep + LANDING_SWEEP;
  const step = 1.5;
  const rows: WalkPoint[] = [];
  const rowsUnder: WalkPoint[] = [];
  let n = 0;
  for (let t = 0; t <= total + 1e-6; t += step, n++) {
    const y = helixWalkY(t);
    for (const r of [HELIX.rInner, HELIX.rOuter]) {
      const p = atBearing(HELIX.startBearing + t, r);
      rows.push({ x: p.x, y, z: p.z });
      rowsUnder.push({ x: p.x, y: y - 0.32, z: p.z });
    }
  }
  gridSurface(buckets, 'wood', rows, n, 2, PAINT.plank, 1.4);
  // The underside, then the two edges' stringers.
  const flipped: WalkPoint[] = [];
  for (let i = 0; i < n; i++) flipped.push(rowsUnder[i * 2 + 1]!, rowsUnder[i * 2]!);
  gridSurface(buckets, 'wood', flipped, n, 2, PAINT.teakDark, 1.4);
  for (const r of [HELIX.rInner, HELIX.rOuter]) {
    const strip: WalkPoint[] = [];
    for (let i = 0; i < n; i++) {
      const t = i * step;
      const p = atBearing(HELIX.startBearing + t, r);
      const y = helixWalkY(t);
      strip.push({ x: p.x, y: y + 0.04, z: p.z }, { x: p.x, y: y - 0.55, z: p.z });
    }
    gridSurface(buckets, 'wood', strip, n, 2, PAINT.teakDark, 1.4);
  }
  // Cleats across the walkway every 1.1 m of walk (4 cm proud): they read as treads on the ramp.
  const cleatEvery = (1.1 / (2 * Math.PI * HELIX.rMid)) * 360;
  for (let t = cleatEvery; t < HELIX.sweep; t += cleatEvery) {
    const a = atBearing(HELIX.startBearing + t, HELIX.rInner + 0.15);
    const b = atBearing(HELIX.startBearing + t, HELIX.rOuter - 0.15);
    const y = helixY(t) + 0.02;
    beam(buckets, 'wood', { x: a.x, y, z: a.z }, { x: b.x, y, z: b.z }, 0.14, 0.04, PAINT.weathered);
  }
  // Rails: the outer one open where the decks join; the inner one all the way.
  const openAt = (Object.values(DECKS) as (typeof DECKS)[DeckId][])
    .filter((d) => d.theta !== null)
    .map((d) => ({ t: d.theta!, half: ((4.2 / HELIX.rOuter) * 180) / Math.PI }));
  const outerPts: WalkPoint[] = [];
  const innerPts: WalkPoint[] = [];
  const railStep = 3;
  for (let t = 1.5; t <= total - 0.5; t += railStep) {
    const y = helixWalkY(t);
    const o = atBearing(HELIX.startBearing + t, HELIX.rOuter - 0.08);
    const i = atBearing(HELIX.startBearing + t, HELIX.rInner + 0.08);
    outerPts.push({ x: o.x, y, z: o.z });
    innerPts.push({ x: i.x, y, z: i.z });
  }
  const tOf = (i: number) => 1.5 + i * railStep;
  const landingSkip = (i: number) => tOf(i) > HELIX.sweep - 2;
  rail(buckets, out, outerPts, {
    skip: (i) => landingSkip(i) || openAt.some((o) => Math.abs(tOf(i) + railStep / 2 - o.t) < o.half),
    lanternEvery: HELIX.lanternEvery,
  });
  rail(buckets, out, innerPts, { skip: (i) => tOf(i) + railStep > HELIX.sweep - 4, rope: true });
  // Brackets under the walkway to the pillars' line (above the plinth's reach).
  for (let t = PLINTH.to; t < HELIX.sweep; t += 22) {
    const y = helixY(t);
    for (const r of [HELIX.rOuter - 0.3, HELIX.rInner + 0.6]) {
      const top = atBearing(HELIX.startBearing + t, r);
      const foot = atBearing(HELIX.startBearing + t - 6, PILLARS.r + 0.8);
      beam(
        buckets,
        'wood',
        { x: top.x, y: y - 0.4, z: top.z },
        { x: foot.x, y: y - 4.2, z: foot.z },
        0.22,
        0.22,
        PAINT.teakDark,
      );
    }
  }
  // The plinth: stone walls under the low turns, so nobody walks under them.
  const plinthRows: WalkPoint[][] = [[], []];
  let pn = 0;
  for (let t = PLINTH.from - 1; t <= PLINTH.to + 1e-6; t += 3, pn++) {
    const top = helixY(t) - 0.3;
    for (const [k, r] of [
      [0, HELIX.rOuter + 0.02],
      [1, HELIX.rInner - 0.02],
    ] as const) {
      const p = atBearing(HELIX.startBearing + t, r);
      plinthRows[k]!.push({ x: p.x, y: top, z: p.z }, { x: p.x, y: TB.rootHall.y - 0.3, z: p.z });
    }
  }
  gridSurface(buckets, 'stone', plinthRows[0]!, pn, 2, PAINT.stone, 0.5);
  gridSurface(buckets, 'stone', plinthRows[1]!, pn, 2, PAINT.stone, 0.5);
  for (const [r, sign] of [
    [HELIX.rOuter + 0.25, 1],
    [HELIX.rInner - 0.25, -1],
  ] as const) {
    const pts: WalkPoint[] = [];
    for (let t = PLINTH.from; t <= PLINTH.to; t += 6) {
      const p = atBearing(HELIX.startBearing + t, r);
      pts.push({ x: p.x, y: TB.rootHall.y, z: p.z });
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const t = PLINTH.from + i * 6;
      const top = helixY(t) - 0.5;
      out.colliders.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        hx: Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.05,
        hz: 0.3,
        rot: Math.atan2(-(b.z - a.z), b.x - a.x),
        y0: TB.rootHall.y - 0.5,
        y1: top,
        height: top - TB.rootHall.y,
      });
      out.cameraBoxes.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        hx: Math.hypot(b.x - a.x, b.z - a.z) / 2,
        hz: 0.4,
        rot: Math.atan2(-(b.z - a.z), b.x - a.x),
        y0: TB.rootHall.y,
        y1: top,
      });
      void sign;
    }
  }
}

/** The Root Hall ring: radial boards round the core, collars round the pillars, a curb at the rim. */
function rootHall(buckets: Buckets): void {
  const R = TB.rootHall;
  const y = R.y;
  const sectors = 90;
  for (let i = 0; i < sectors; i++) {
    const b0 = (i * 360) / sectors;
    const b1 = ((i + 1) * 360) / sectors;
    for (let r0 = 8.4; r0 < R.rOuter; r0 += 1.55) {
      const r1 = Math.min(R.rOuter, r0 + 1.55);
      const mid = atBearing((b0 + b1) / 2, (r0 + r1) / 2);
      // Not inside a pillar (its collar covers the edge) or under the stair's plinth.
      let skip = false;
      for (const pb of PILLARS.bearings) {
        const p = atBearing(pb, PILLARS.r);
        if (Math.hypot(mid.x - p.x, mid.z - p.z) < PILLARS.radius + 0.4) skip = true;
      }
      const t = ((b0 + b1) / 2 - HELIX.startBearing + 360) % 360;
      if (r1 > HELIX.rInner && r0 < HELIX.rOuter && t > PLINTH.from && t < PLINTH.to) skip = true;
      if (skip) continue;
      const pts: WalkPoint[] = [];
      for (const r of [r0, r1]) {
        const a = atBearing(b0, r);
        const b = atBearing(b1, r);
        pts.push({ x: a.x, y, z: a.z }, { x: b.x, y, z: b.z });
      }
      gridSurface(buckets, 'wood', pts, 2, 2, (i + Math.round(r0)) % 4 === 0 ? PAINT.teak : PAINT.plank, 1);
    }
  }
  // Collars round the pillars where they pass through the deck.
  for (const pb of PILLARS.bearings) {
    const p = atBearing(pb, PILLARS.r);
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2;
      const a1 = ((k + 1) / 12) * Math.PI * 2;
      const rr = PILLARS.radius + 0.35;
      beam(
        buckets,
        'wood',
        { x: p.x + Math.cos(a0) * rr, y: y + 0.05, z: p.z + Math.sin(a0) * rr },
        { x: p.x + Math.cos(a1) * rr, y: y + 0.05, z: p.z + Math.sin(a1) * rr },
        0.7,
        0.16,
        PAINT.teakDark,
      );
    }
  }
  // The rim's curb (a low edge beam, flush with the ground outside).
  for (let k = 0; k < 72; k++) {
    const a = atBearing(k * 5, R.rOuter - 0.1);
    const b = atBearing((k + 1) * 5, R.rOuter - 0.1);
    beam(
      buckets,
      'wood',
      { x: a.x, y: y - 0.2, z: a.z },
      { x: b.x, y: y - 0.2, z: b.z },
      0.2,
      0.36,
      PAINT.weathered,
    );
  }
}

/** The decks on the tree, with their openings onto the stair, the bridges and the boardwalk. */
function treeDecks(buckets: Buckets, out: StructureOut, clear: (x: number, z: number) => boolean): void {
  const stairOpen: Opening = { edge: 'in', from: -4.2, to: 4.2 };
  const r2 = BRIDGES.find((b) => b.id === 'R2')!;
  const r3 = BRIDGES.find((b) => b.id === 'R3')!;
  const r1 = BRIDGES.find((b) => b.id === 'R1')!;
  const l1e = DECKS.L1E.rect;
  // L1E: R2 and R3 leave its east (outer) edge; the boardwalk its north (counter-clockwise) edge.
  const vOf = (r: Rect, x: number, z: number) => -(x - r.x) * r.uz + (z - r.z) * r.ux;
  const uOf = (r: Rect, x: number, z: number) => (x - r.x) * r.ux + (z - r.z) * r.uz;
  const bw = TB.boardwalk.points[0]!;
  const open: Record<DeckId, Opening[]> = {
    L1E: [
      stairOpen,
      { edge: 'out', from: vOf(l1e, r2.from.x, r2.from.z) - 1.3, to: vOf(l1e, r2.from.x, r2.from.z) + 1.3 },
      { edge: 'out', from: vOf(l1e, r3.from.x, r3.from.z) - 1.3, to: vOf(l1e, r3.from.x, r3.from.z) + 1.3 },
      { edge: 'ccw', from: uOf(l1e, bw.x, bw.z) - 1.6, to: uOf(l1e, bw.x, bw.z) + 1.6 },
    ],
    L2SW: [stairOpen, { edge: 'ccw', from: -1.0, to: 1.8 }],
    L2S: [
      {
        edge: 'cw',
        from: uOf(DECKS.L2S.rect, r1.to.x, r1.to.z) - 1.3,
        to: uOf(DECKS.L2S.rect, r1.to.x, r1.to.z) + 1.3,
      },
    ],
    L3SE: [stairOpen],
  };
  for (const id of Object.keys(DECKS) as DeckId[]) {
    const d = DECKS[id];
    deckBoards(buckets, d.rect, d.y);
    deckRails(buckets, out, d.rect, d.y, open[id], id === 'L2S' ? 0 : 9);
    deckBraces(buckets, d.rect, d.y);
    deckJoists(buckets, d.rect, d.y);
    limbBrackets(buckets, d.rect, d.y);
    if (id === 'L1E') deckStilts(buckets, out, d.rect, d.y, clear);
  }
  void r1;
}

/** The Crown Deck: a plank disc round the column, its rail, the beacon's mast, and the stair's top landing. */
function crownDeck(buckets: Buckets, out: StructureOut): void {
  const y = CROWN.y;
  // Narrow boards (about 0.6 m at the rim), so the wood's grain reads at a plank's scale.
  const rings = 6;
  const sectors = 96;
  for (let i = 0; i < sectors; i++)
    for (let k = 0; k < rings; k++) {
      const r0 = CROWN.column - 0.4 + ((CROWN.r - CROWN.column + 0.4) * k) / rings;
      const r1 = CROWN.column - 0.4 + ((CROWN.r - CROWN.column + 0.4) * (k + 1)) / rings;
      const pts: WalkPoint[] = [];
      for (const r of [r0, r1]) {
        const a0 = (i / sectors) * Math.PI * 2;
        const a1 = ((i + 1) / sectors) * Math.PI * 2;
        pts.push(
          { x: CROWN.x + Math.sin(a0) * r, y, z: CROWN.z - Math.cos(a0) * r },
          { x: CROWN.x + Math.sin(a1) * r, y, z: CROWN.z - Math.cos(a1) * r },
        );
      }
      // Inside the column's footprint (it's off the disc's centre) the boards hide in the trunk.
      gridSurface(buckets, 'wood', pts, 2, 2, (i + k) % 3 === 0 ? PAINT.teak : PAINT.plank, 1);
    }
  // The rail round the rim, open to the stair's landing (east) and the Sky Basket's landing (west).
  const pts: WalkPoint[] = [];
  for (let a = 0; a <= 360; a += 7.5) {
    const ar = (a * Math.PI) / 180;
    pts.push({ x: CROWN.x + Math.sin(ar) * (CROWN.r - 0.1), y, z: CROWN.z - Math.cos(ar) * (CROWN.r - 0.1) });
  }
  // A full rail on the land side; on the sea side (bearings 120–240, the view of H7) a low one.
  const crownSkip = (i: number) => {
    const a = i * 7.5 + 3.75;
    return (a > 64 && a < 106) || (a > 262 && a < 278);
  };
  const seaSide = (i: number) => {
    const a = i * 7.5 + 3.75;
    return a > 120 && a < 240;
  };
  rail(buckets, out, pts, { skip: (i) => crownSkip(i) || seaSide(i), lanternEvery: 6 });
  rail(buckets, out, pts, { skip: (i) => crownSkip(i) || !seaSide(i), height: 0.72, lanternEvery: 6 });
  // The stair's top landing: level boards from the last step onto the disc.
  const land = TOP_LANDING;
  deckBoards(buckets, land, y);
  // Railed on its far side and its outer edge; open to the stair and to the disc.
  rail(
    buckets,
    out,
    [
      rectWorld(land, -land.hu + 1.6, land.hv),
      rectWorld(land, land.hu, land.hv),
      rectWorld(land, land.hu, -land.hv + 0.4),
    ].map((p) => ({ ...p, y })),
  );
  // The Sky Basket's landing.
  deckBoards(buckets, BASKET_LANDING, TB.skyBasket.topY);
  for (const side of [-1, 1]) {
    const a = rectWorld(BASKET_LANDING, -BASKET_LANDING.hu + 1.2, side * BASKET_LANDING.hv);
    const b = rectWorld(BASKET_LANDING, BASKET_LANDING.hu, side * BASKET_LANDING.hv);
    rail(buckets, out, [
      { x: a.x, y, z: a.z },
      { x: b.x, y, z: b.z },
    ]);
  }
  // The column through the deck (the Crown Beacon stands on its top).
  out.circles.push({
    x: TREE.x,
    z: TREE.z,
    r: CROWN.column + 0.25,
    y0: y - 1,
    y1: COLUMN_TOP,
    height: COLUMN_TOP - y,
  });
}

/** The Flume Gallery and its boardwalk on trestles. */
function galleryAndBoardwalk(buckets: Buckets, out: StructureOut): void {
  const g = GALLERY_RECT;
  deckBoards(buckets, g, TB.gallery.y);
  // Open toward the boardwalk (its north-east corner); rails elsewhere.
  deckRails(buckets, out, g, TB.gallery.y, [{ edge: 'out', from: g.hv - 3.6, to: g.hv }], 6);
  const pts = TB.boardwalk.points;
  const half = TB.boardwalk.width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    const n = Math.ceil(len / 0.34);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t;
      box(
        buckets,
        'wood',
        x,
        y - 0.06,
        z,
        half * 2,
        0.12,
        len / n - 0.03,
        Math.atan2(ux, uz),
        k % 4 === 0 ? PAINT.teak : PAINT.plank,
      );
    }
    // Trestles every 5 m.
    for (let s = 2.5; s < len; s += 5) {
      const x = a.x + ux * s;
      const z = a.z + uz * s;
      const y = a.y + ((b.y - a.y) * s) / len;
      for (const side of [-1, 1]) {
        const px = x - uz * side * (half - 0.2);
        const pz = z + ux * side * (half - 0.2);
        const ground = thousandBoughHeight(px, pz);
        rod(
          buckets,
          'wood',
          { x: px, y: ground - 0.5, z: pz },
          { x: px, y: y - 0.12, z: pz },
          0.16,
          6,
          PAINT.weathered,
        );
      }
      beam(
        buckets,
        'wood',
        { x: x - uz * half, y: y - 0.3, z: z + ux * half },
        { x: x + uz * half, y: y - 0.3, z: z - ux * half },
        0.2,
        0.24,
        PAINT.teakDark,
      );
    }
    for (const side of [-1, 1]) {
      const off = (half - 0.08) * side;
      const railPts: WalkPoint[] = [
        { x: a.x - uz * off, y: a.y, z: a.z + ux * off },
        { x: b.x - uz * off, y: b.y, z: b.z + ux * off },
      ];
      // Leave the ends open where the boardwalk meets L1E and the gallery.
      const trim = (p: WalkPoint, q: WalkPoint, d: number): WalkPoint => {
        const l = Math.hypot(q.x - p.x, q.z - p.z);
        return {
          x: p.x + ((q.x - p.x) * d) / l,
          y: p.y + ((q.y - p.y) * d) / l,
          z: p.z + ((q.z - p.z) * d) / l,
        };
      };
      const s0 = i === 0 ? trim(railPts[0]!, railPts[1]!, 1.2) : railPts[0]!;
      const s1 = i === pts.length - 2 ? trim(railPts[1]!, railPts[0]!, 2.4) : railPts[1]!;
      rail(buckets, out, [s0, s1], { lanternEvery: 10 });
    }
  }
}

/** A rope bridge: planks with gaps along the sag, rope hand-lines, stays and end posts. */
export function ropeBridge(
  buckets: Buckets,
  out: StructureOut,
  b: (typeof BRIDGES)[number],
  colliders: BoxCollider[] = out.colliders,
): void {
  const dx = b.to.x - b.from.x;
  const dz = b.to.z - b.from.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const half = b.width / 2;
  const yaw = Math.atan2(ux, uz);
  const planks = Math.round(len / 0.36);
  for (let k = 0; k < planks; k++) {
    const t = (k + 0.5) / planks;
    const y = bridgeY(b, t);
    const slope = (bridgeY(b, Math.min(1, t + 0.01)) - bridgeY(b, Math.max(0, t - 0.01))) / (0.02 * len);
    box(
      buckets,
      'wood',
      b.from.x + dx * t,
      y - 0.05,
      b.from.z + dz * t,
      b.width + (k % 2) * 0.12,
      0.08,
      len / planks - 0.04,
      yaw,
      k % 5 === 0 ? PAINT.weathered : PAINT.plank,
      -Math.atan(slope),
    );
  }
  // Stringers under the planks, hand-lines, and stays down to the planks every 1.2 m.
  for (const side of [-1, 1]) {
    const ox = -uz * side * (half + 0.05);
    const oz = ux * side * (half + 0.05);
    let prev: WalkPoint | null = null;
    let prevLow: WalkPoint | null = null;
    const n = Math.ceil(len / 1.2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = bridgeY(b, t);
      const low = { x: b.from.x + dx * t + ox, y: y - 0.12, z: b.from.z + dz * t + oz };
      // The hand-line sags less than the walkway.
      const hy = b.from.y + (b.to.y - b.from.y) * t - b.sag * 0.55 * 4 * t * (1 - t) + 1.1;
      const high = { x: low.x, y: hy, z: low.z };
      if (prev && prevLow) {
        rod(buckets, 'rope', prev, high, 0.035, 5, PAINT.rope);
        rod(buckets, 'rope', prevLow, low, 0.045, 5, PAINT.rope);
        const len2 = Math.hypot(high.x - prev.x, high.z - prev.z);
        colliders.push({
          x: (high.x + prev.x) / 2,
          z: (high.z + prev.z) / 2,
          hx: len2 / 2 + 0.05,
          hz: 0.12,
          rot: Math.atan2(-(high.z - prev.z), high.x - prev.x),
          y0: Math.min(low.y, prevLow.y) - 0.4,
          y1: Math.max(high.y, prev.y) + 0.3,
          height: 1.1,
        });
      }
      if (i > 0 && i < n) rod(buckets, 'rope', low, high, 0.02, 3, PAINT.rope);
      prev = high;
      prevLow = low;
    }
    // End posts.
    for (const end of [b.from, b.to]) {
      const px = end.x + ox * 1.05;
      const pz = end.z + oz * 1.05;
      rod(
        buckets,
        'wood',
        { x: px, y: end.y - 0.4, z: pz },
        { x: px, y: end.y + 1.45, z: pz },
        0.13,
        6,
        PAINT.teakDark,
      );
    }
  }
}

/** The Spire's lookouts: rails round the top (open to R2) and the ledge (open to R3). */
function spireLookouts(buckets: Buckets, out: StructureOut): void {
  const r2 = BRIDGES.find((b) => b.id === 'R2')!;
  const r3 = BRIDGES.find((b) => b.id === 'R3')!;
  const toward = (b: (typeof BRIDGES)[number]) => Math.atan2(b.from.x - b.to.x, -(b.from.z - b.to.z));
  const a2 = toward(r2);
  const pts: WalkPoint[] = [];
  for (let a = 0; a <= 360; a += 10) {
    const ar = (a * Math.PI) / 180;
    pts.push({
      x: SPIRE_TOP.x + Math.sin(ar) * (SPIRE_TOP.r - 0.15),
      y: SPIRE_TOP.y,
      z: SPIRE_TOP.z - Math.cos(ar) * (SPIRE_TOP.r - 0.15),
    });
  }
  const angTo = (i: number) => {
    const a = ((i * 10 + 5) * Math.PI) / 180;
    let d = a - ((a2 + Math.PI * 2) % (Math.PI * 2));
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d);
  };
  rail(buckets, out, pts, { skip: (i) => angTo(i) < 0.24, lanternEvery: 7 });
  // The ledge: rails on its south, east and west, open on its north-west corner to R3.
  const L = SPIRE_LEDGE;
  const y = TB.spire.ledge.y;
  deckBoards(buckets, L, y, PAINT.weathered);
  const corner = (u: number, v: number) => ({ ...rectWorld(L, u, v), y });
  rail(buckets, out, [corner(-L.hu, L.hv), corner(L.hu, L.hv), corner(L.hu, -L.hv)]);
  const r3end = { x: r3.to.x, z: r3.to.z };
  const vEnd = -(r3end.x - L.x) * L.uz + (r3end.z - L.z) * L.ux;
  rail(buckets, out, [corner(-L.hu, L.hv), corner(-L.hu, Math.min(L.hv, vEnd + 1.4))]);
  void a2;
}

/**
 * The ledge behind Great Falls: stone slabs along the cliff's foot, stepped where it climbs, on rubble
 * footings, a rope rail on its pool side; and the cave's flagged floor.
 */
function fallsLedge(buckets: Buckets, out: StructureOut): void {
  const half = TB.cave.ledgeWidth / 2;
  for (let i = 0; i < FALLS_LEDGE.length - 1; i++) {
    const a = FALLS_LEDGE[i]!;
    const b = FALLS_LEDGE[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(len / 1.1);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t;
      box(
        buckets,
        'stone',
        x,
        y - 0.18,
        z,
        half * 2 + 0.3,
        0.36,
        len / n - 0.04,
        yaw,
        k % 2 ? PAINT.stone : PAINT.basalt,
      );
      const g = thousandBoughHeight(x, z);
      if (y - 0.36 - g > 0.1)
        box(
          buckets,
          'stone',
          x,
          (y - 0.36 + g - 0.4) / 2,
          z,
          half * 2,
          y - 0.36 - g + 0.4,
          len / n,
          yaw,
          PAINT.basalt,
        );
    }
  }
  // A rope rail on the pool side, posts every 2.3 m.
  const side: WalkPoint[] = FALLS_LEDGE.map((p, i) => {
    const q = FALLS_LEDGE[Math.min(i + 1, FALLS_LEDGE.length - 1)]!;
    const r = FALLS_LEDGE[Math.max(i - 1, 0)]!;
    const dx = q.x - r.x;
    const dz = q.z - r.z;
    const l = Math.hypot(dx, dz) || 1;
    // The pool lies to the ledge's right as it climbs (east of its line).
    return { x: p.x - (dz / l) * (half - 0.1), y: p.y, z: p.z + (dx / l) * (half - 0.1) };
  });
  rail(buckets, out, side.slice(0, -1));
  const c = CAVE_FLOOR;
  for (let k = 0; k < 6; k++) {
    const z = c.z - c.hv + (k + 0.5) * ((c.hv * 2) / 6);
    box(
      buckets,
      'stone',
      c.x,
      TB.cave.floor - 0.15,
      z,
      c.hu * 2 + 0.6,
      0.3,
      (c.hv * 2) / 6 - 0.04,
      0,
      k % 2 ? PAINT.stone : PAINT.basalt,
    );
  }
}

/** The trunk's own blockers: the core, the pillars, and the column (walker and camera). */
function trunkBlockers(out: StructureOut): void {
  out.circles.push({ x: TREE.x, z: TREE.z, r: 10.1, y0: 14, y1: CROWN.y - 0.5, height: 36 });
  for (const b of PILLARS.bearings) {
    const p = atBearing(b, PILLARS.r);
    out.circles.push({ x: p.x, z: p.z, r: PILLARS.radius + 0.3, y0: 14, y1: 46, height: 30 });
  }
  // The camera keeps out of the core and the pillars' ring (an octagon of boxes, every 5 m of height).
  for (let y = 18; y < COLUMN_TOP; y += 5) {
    const r = y < 47 ? 12.6 : CROWN.column + 0.3;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const c = atBearing((a * 180) / Math.PI, r * 0.62);
      out.cameraBoxes.push({ x: c.x, z: c.z, hx: r * 0.42, hz: r * 0.42, rot: -a, y0: y, y1: y + 5 });
    }
  }
}

/** A thin camera blocker just under a walk (its boards and joists): the camera can't pass up through it. */
function slab(out: StructureOut, x: number, z: number, hx: number, hz: number, rot: number, y: number): void {
  out.cameraBoxes.push({ x, z, hx, hz, rot, y0: y - 0.75, y1: y - 0.06 });
}

function rectSlab(out: StructureOut, r: Rect, y: number): void {
  slab(out, r.x, r.z, r.hu, r.hv, Math.atan2(-r.uz, r.ux), y);
}

/** A slab along a walk from a to b (`half` its half-width), its top at the lower end's height. */
function segmentSlab(out: StructureOut, a: WalkPoint, b: WalkPoint, half: number): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  slab(
    out,
    (a.x + b.x) / 2,
    (a.z + b.z) / 2,
    Math.hypot(dx, dz) / 2,
    half,
    Math.atan2(-dz, dx),
    Math.min(a.y, b.y),
  );
}

/**
 * Camera blockers under every raised walk (decks, stair, bridges, landings, the wharf) and along the
 * stair's brackets, so a camera swinging low can't look up through the boards or sit in a timber.
 */
function walkSlabs(out: StructureOut): void {
  for (const d of Object.values(DECKS)) rectSlab(out, d.rect, d.y);
  rectSlab(out, GALLERY_RECT, TB.gallery.y);
  rectSlab(out, TOP_LANDING, CROWN.y);
  rectSlab(out, BASKET_LANDING, TB.skyBasket.topY);
  rectSlab(out, LANDING_DECK, TB.harbor.boughLanding.y);
  rectSlab(
    out,
    { ...WHARF, z: (WHARF_RAMP.z1 + TB.harbor.jetty.z1) / 2, hv: (TB.harbor.jetty.z1 - WHARF_RAMP.z1) / 2 },
    TB.harbor.jetty.height,
  );
  const bw = TB.boardwalk.points;
  for (let i = 0; i < bw.length - 1; i++) segmentSlab(out, bw[i]!, bw[i + 1]!, TB.boardwalk.width / 2);
  // The Crown Deck's ring, as eight boxes round the column.
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    const rm = (CROWN.r + CROWN.column) / 2;
    const c = { x: CROWN.x + Math.sin(a) * rm, z: CROWN.z - Math.cos(a) * rm };
    slab(
      out,
      c.x,
      c.z,
      (CROWN.r - CROWN.column) / 2,
      rm * Math.tan(Math.PI / 8),
      Math.atan2(Math.cos(a), Math.sin(a)),
      CROWN.y,
    );
  }
  for (const b of BRIDGES) {
    const n = Math.max(2, Math.ceil(Math.hypot(b.to.x - b.from.x, b.to.z - b.from.z) / 2.5));
    for (let i = 0; i < n; i++) {
      const p = (t: number): WalkPoint => ({
        x: b.from.x + (b.to.x - b.from.x) * t,
        y: bridgeY(b, t),
        z: b.from.z + (b.to.z - b.from.z) * t,
      });
      segmentSlab(out, p(i / n), p((i + 1) / n), b.width / 2);
    }
  }
  // The Great Stair, in 5° pieces above the plinth (the plinth's own boxes are below it).
  const total = HELIX.sweep + LANDING_SWEEP;
  for (let t = PLINTH.to; t < total; t += 5) {
    const t1 = Math.min(total, t + 5);
    const a = atBearing(HELIX.startBearing + t, HELIX.rMid);
    const b = atBearing(HELIX.startBearing + t1, HELIX.rMid);
    segmentSlab(
      out,
      { x: a.x, y: helixWalkY(t), z: a.z },
      { x: b.x, y: helixWalkY(t1), z: b.z },
      (HELIX.rOuter - HELIX.rInner) / 2 + 0.1,
    );
  }
  // The stair's brackets: four short boxes down each one.
  for (let t = PLINTH.to; t < HELIX.sweep; t += 22) {
    const y = helixY(t);
    for (const r of [HELIX.rOuter - 0.3, HELIX.rInner + 0.6]) {
      const top = atBearing(HELIX.startBearing + t, r);
      const foot = atBearing(HELIX.startBearing + t - 6, PILLARS.r + 0.8);
      for (let k = 0; k < 4; k++) {
        const ax = top.x + ((foot.x - top.x) * k) / 4;
        const az = top.z + ((foot.z - top.z) * k) / 4;
        const bx = top.x + ((foot.x - top.x) * (k + 1)) / 4;
        const bz = top.z + ((foot.z - top.z) * (k + 1)) / 4;
        const y0 = y - 0.4 - (3.8 * (k + 1)) / 4;
        out.cameraBoxes.push({
          x: (ax + bx) / 2,
          z: (az + bz) / 2,
          hx: Math.hypot(bx - ax, bz - az) / 2 + 0.15,
          hz: 0.2,
          rot: Math.atan2(-(bz - az), bx - ax),
          y0: y0 - 0.15,
          y1: y0 + 3.8 / 4 + 0.15,
        });
      }
    }
  }
}

/** The ship's obstacles along the Root Wharf: two rows of circles on its piles and one across its end. */
export function wharfShipObstacles(): CircleObstacle[] {
  const j = TB.harbor.jetty;
  const r = 1.5;
  const list: CircleObstacle[] = [];
  for (let z = j.z0 + 3; z <= j.z1 - r; z += 3) list.push({ x: j.x0 + r, z, r }, { x: j.x1 - r, z, r });
  list.push({ x: (j.x0 + j.x1) / 2, z: j.z1 - r, r });
  return list;
}

/**
 * The Root Wharf on its piles (fenders down its face, bollards, a rail on its landward side and end)
 * and Bough Landing's deck on short stilts, railed but for the wharf and the Fern Walk.
 */
function wharfAndLanding(buckets: Buckets, out: StructureOut): void {
  const j = TB.harbor.jetty;
  const top = j.height;
  const rampY = (z: number) => {
    const t = Math.max(0, Math.min(1, (WHARF_RAMP.z1 - z) / (WHARF_RAMP.z1 - WHARF_RAMP.z0)));
    return top + (TB.harbor.boughLanding.y - top) * t;
  };
  // Boards across the wharf (the ramp's follow its rise), on three stringers.
  const n = Math.round((j.z1 - WHARF.z + WHARF.hv - 1) / 0.32);
  const z0 = j.z0 + 1;
  const step = (j.z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    const z = z0 + (i + 0.5) * step;
    box(
      buckets,
      'wood',
      (j.x0 + j.x1) / 2,
      rampY(z) - 0.06,
      z,
      j.x1 - j.x0,
      0.12,
      step - 0.025,
      0,
      i % 3 === 0 ? PAINT.teak : PAINT.plank,
    );
  }
  for (const x of [j.x0 + 0.4, (j.x0 + j.x1) / 2, j.x1 - 0.4])
    for (const [za, zb] of [
      [z0, WHARF_RAMP.z1],
      [WHARF_RAMP.z1, j.z1],
    ] as const)
      beam(
        buckets,
        'wood',
        { x, y: rampY(za) - 0.3, z: za },
        { x, y: rampY(zb) - 0.3, z: zb },
        0.2,
        0.3,
        PAINT.teakDark,
      );
  // Piles: pairs every 3 m into the sea bed, a cross-head under the deck, a brace on every other pair.
  for (let z = j.z0 + 3; z <= j.z1 - 0.3; z += 3) {
    const y = rampY(z) - 0.45;
    for (const x of [j.x0 + 0.3, j.x1 - 0.3]) {
      const ground = thousandBoughHeight(x, z);
      if (y - ground < 0.4) continue;
      rod(buckets, 'wood', { x, y: ground - 0.8, z }, { x, y, z }, 0.2, 7, PAINT.weathered, 0.18);
    }
    beam(
      buckets,
      'wood',
      { x: j.x0 + 0.1, y: y - 0.05, z },
      { x: j.x1 - 0.1, y: y - 0.05, z },
      0.26,
      0.24,
      PAINT.teakDark,
    );
    const g = Math.max(thousandBoughHeight(j.x0 + 0.3, z), thousandBoughHeight(j.x1 - 0.3, z));
    if ((Math.round((z - j.z0) / 3) & 1) === 0 && y - g > 2.2)
      beam(
        buckets,
        'wood',
        { x: j.x0 + 0.3, y: Math.max(g + 0.4, -0.6), z },
        { x: j.x1 - 0.3, y: y - 0.35, z },
        0.14,
        0.14,
        PAINT.teakDark,
      );
  }
  // The face (where the ship lies): a rubbing strake, fenders every 6 m, and a low kerb on the deck.
  beam(
    buckets,
    'wood',
    { x: j.x0 - 0.12, y: top - 0.45, z: WHARF_RAMP.z1 },
    { x: j.x0 - 0.12, y: top - 0.45, z: j.z1 },
    0.16,
    0.3,
    PAINT.teakDark,
  );
  for (let z = WHARF_RAMP.z1 + 3; z <= j.z1 - 1; z += j.fenderEvery) {
    box(buckets, 'wood', j.x0 - 0.28, top - 1.3, z, 0.22, 2.1, 0.32, 0, PAINT.teakDark);
    rod(
      buckets,
      'rope',
      { x: j.x0 - 0.42, y: top - 0.55, z },
      { x: j.x0 - 0.42, y: top - 1.05, z },
      0.17,
      8,
      PAINT.rope,
    );
  }
  box(
    buckets,
    'wood',
    j.x0 + 0.12,
    top + 0.08,
    (WHARF_RAMP.z1 + j.z1) / 2,
    0.22,
    0.16,
    j.z1 - WHARF_RAMP.z1,
    0,
    PAINT.weathered,
  );
  // Bollards on the face, clear of where you step ashore.
  for (const z of [-1410, -1392, -1362, -1354]) {
    rod(
      buckets,
      'wood',
      { x: j.x0 + 0.55, y: top, z },
      { x: j.x0 + 0.55, y: top + 0.62, z },
      0.2,
      8,
      PAINT.teakDark,
      0.17,
    );
    rod(
      buckets,
      'rope',
      { x: j.x0 + 0.55, y: top + 0.36, z },
      { x: j.x0 + 0.55, y: top + 0.44, z },
      0.25,
      8,
      PAINT.rope,
    );
    out.circles.push({ x: j.x0 + 0.55, z, r: 0.3, y0: top - 0.5, y1: top + 0.7, height: 0.7 });
  }
  // A rail down the landward side and across the end.
  rail(buckets, out, [
    { x: j.x1 - 0.1, y: rampY(WHARF_RAMP.z1 - 1), z: WHARF_RAMP.z1 - 1 },
    { x: j.x1 - 0.1, y: top, z: WHARF_RAMP.z1 },
    { x: j.x1 - 0.1, y: top, z: j.z1 - 0.1 },
    { x: j.x0 + 0.4, y: top, z: j.z1 - 0.1 },
  ]);

  // Bough Landing: boards on joists, stilts to the graded ground, a rail round its sea and land sides.
  const L = LANDING_DECK;
  const y = TB.harbor.boughLanding.y;
  deckBoards(buckets, L, y);
  for (let u = -L.hu + 0.5; u <= L.hu - 0.4; u += 3.6)
    for (const v of [-L.hv + 0.5, 0, L.hv - 0.5]) {
      const p = rectWorld(L, u, v);
      const ground = thousandBoughHeight(p.x, p.z);
      if (y - ground < 0.35) continue;
      rod(
        buckets,
        'wood',
        { x: p.x, y: ground - 0.4, z: p.z },
        { x: p.x, y: y - 0.35, z: p.z },
        0.17,
        6,
        PAINT.weathered,
      );
    }
  // The wharf joins the south edge (u −11…−2, the shore path beside it) and the Fern Walk leaves the north edge (u −3.5…3.5).
  const wharfU0 = j.x0 - L.x;
  const wharfU1 = j.x1 - L.x;
  deckRails(
    buckets,
    out,
    L,
    y,
    [
      { edge: 'cw', from: wharfU0 - 0.1, to: wharfU1 + 3 },
      { edge: 'ccw', from: -3.6, to: 3.6 },
    ],
    9,
  );
}

/** Every structural piece of the tree village (no houses): see the module's builders. */
export function buildStructure(
  buckets: Buckets,
  lateBuckets: Buckets,
  clear: (x: number, z: number) => boolean,
  wharfBuckets: Buckets = buckets,
): StructureOut {
  const out = emptyStructure();
  trunkBlockers(out);
  rootHall(buckets);
  greatStair(buckets, out);
  treeDecks(buckets, out, clear);
  crownDeck(buckets, out);
  galleryAndBoardwalk(buckets, out);
  for (const b of BRIDGES) {
    if (b.id !== 'R3') {
      ropeBridge(buckets, out, b);
      continue;
    }
    // R3 is drawn apart (shown when it unrolls); its hand-lines fence its walk from the start (nobody
    // can stand there before), and two gates close its ends until then.
    ropeBridge(lateBuckets, out, b);
    const gates: BoxCollider[] = [];
    for (const [end, other] of [
      [b.from, b.to],
      [b.to, b.from],
    ] as const) {
      const dx = other.x - end.x;
      const dz = other.z - end.z;
      const l = Math.hypot(dx, dz);
      gates.push({
        x: end.x + (dx / l) * 0.3,
        z: end.z + (dz / l) * 0.3,
        hx: b.width / 2 + 0.3,
        hz: 0.15,
        rot: Math.atan2(-dx, -dz),
        y0: end.y - 0.5,
        y1: end.y + 1.6,
        height: 1.2,
      });
    }
    out.colliders.push(...gates);
    out.lateColliders.set('R3', gates);
  }
  spireLookouts(buckets, out);
  fallsLedge(buckets, out);
  wharfAndLanding(wharfBuckets, out);
  walkSlabs(out);
  // The Root Gate's two roots: their feet fence the walker, the arch over the path the camera.
  for (const pts of ROOT_GATE) {
    const f = pts[0]!;
    out.circles.push({ x: f.x, z: f.z, r: f.r + 0.15, y0: f.y - 1, y1: f.y + 6, height: 6 });
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      out.cameraBoxes.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        hx: Math.hypot(b.x - a.x, b.z - a.z) / 2 + a.r,
        hz: a.r,
        rot: Math.atan2(-(b.z - a.z), b.x - a.x),
        y0: Math.min(a.y, b.y) - a.r,
        y1: Math.max(a.y, b.y) + a.r,
      });
    }
  }
  void BASKET;
  return out;
}
