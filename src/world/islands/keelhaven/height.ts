import { fbm2 } from '../../terrain/cove-height';
import { clamp01, mulberry32, smoothstep } from '../../../util/math';
import { KEELHAVEN as K, toFrame, toWorld, type ValleyStation } from './layout';

/**
 * Keelhaven's ground: one height function, sampled by the bake.
 *
 * 1. The coast: a long, box-like oval with a wandering edge and a headland. `d` is the signed distance
 *    inland from it, `s` the distance along it.
 * 2. The spurs (the massif): every 150-240 m along the coast a spur's prow climbs from the sea cliff to
 *    its front crest (120-180 m), then its crest runs back to the spine (250-285 m). Each spur is a
 *    knife ridge ("tent") whose flanks fall steeply to the V valleys between the spurs; a valley's
 *    floor climbs from a hanging lip to below the spine. The crests are saw-toothed, and each tooth
 *    is a rib that runs down both flanks (so a spire stands where the ribs meet the crest). The prows'
 *    faces have ribs of their own down their fall line, broad facets at their feet.
 * 3. The sea cliff: everywhere the coast rises in a near-sheer face to whatever stands behind it (a
 *    prow's foot, or a valley's lip, so a hanging valley ends in a tall cliff).
 * 4. The cove valley: carved with a smooth minimum (the cove, the beach and berm, the town shelf, the
 *    amphitheatre head at the spine). Its walls have ribs of their own.
 * 5. The sea: deep water close in off the cliffs, a reef flat off each of the cove's headlands, a sea
 *    stack off the south-west headland.
 */

const SEED = 0x3_ee1_4a;
const TAU = Math.PI * 2;
/** < 1: ribs are sharp with concave flanks, gullies wide and rounded. */
const FLUTE_SHARPNESS = 0.6;
/** How round a rib's crest is (in flutes): a few metres, so no rib is a one-sample needle. */
const RIB_ROUND = 0.05;

function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}

function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** 1 on a rib's crest, 0 in the middle of a gully, for a flute at `phase` (one flute per unit). */
function rib(phase: number): number {
  const r = 1 - Math.abs(phase - Math.floor(phase) - 0.5) * 2;
  const soft = Math.sqrt(r * r + RIB_ROUND * RIB_ROUND) - RIB_ROUND;
  return (
    1 - Math.pow(Math.max(0, soft) / (Math.sqrt(1 + RIB_ROUND * RIB_ROUND) - RIB_ROUND), FLUTE_SHARPNESS)
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------
// The coast polygon (world x, z).

const C = K.coast;
const SEGMENTS = C.points;
const segX = new Float64Array(SEGMENTS);
const segZ = new Float64Array(SEGMENTS);
const segDx = new Float64Array(SEGMENTS);
const segDz = new Float64Array(SEGMENTS);
const segLen = new Float64Array(SEGMENTS);
const segStart = new Float64Array(SEGMENTS);
let coastLength = 0;
{
  const px: number[] = [];
  const pz: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i / SEGMENTS) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / C.power);
    const ez = Math.sign(s) * Math.pow(Math.abs(s), 2 / C.power);
    let x = K.center.x + C.halfX * ex;
    let z = K.center.z + C.halfZ * ez;
    const rx = x - K.center.x;
    const rz = z - K.center.z;
    const rl = Math.hypot(rx, rz) || 1;
    const k = 2400 / C.noiseScale / 4;
    let push =
      C.noise * fbm2(c * k, s * k, 3, SEED + 41) + C.ragged * fbm2(c * k * 5, s * k * 5, 2, SEED + 47);
    for (const h of C.headlands) {
      const g = Math.hypot(x - h.x, z - h.z) / h.radius;
      push += h.out * Math.exp(-g * g);
    }
    for (const b of C.bays) {
      const g = Math.hypot(x - b.x, z - b.z) / b.radius;
      push -= b.in * Math.exp(-g * g);
    }
    x += (rx / rl) * push;
    z += (rz / rl) * push;
    px.push(x);
    pz.push(z);
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const j = (i + 1) % SEGMENTS;
    const len = Math.hypot(px[j]! - px[i]!, pz[j]! - pz[i]!);
    segX[i] = px[i]!;
    segZ[i] = pz[i]!;
    segDx[i] = (px[j]! - px[i]!) / len;
    segDz[i] = (pz[j]! - pz[i]!) / len;
    segLen[i] = len;
    segStart[i] = coastLength;
    coastLength += len;
  }
}
/** The coast's length (m). */
export const COAST_LENGTH = coastLength;

const segDist = new Float64Array(SEGMENTS);
const segAlong = new Float64Array(SEGMENTS);
/** How fast a segment's say in `s` falls off with its extra distance (m). */
const S_BLEND = 14;

/** What the coast says about a point. */
interface CoastHit {
  /** Signed distance from the coast: > 0 inland. */
  d: number;
  /** The distance along the coast (m) of the (smoothed) nearest point. */
  s: number;
}

/**
 * Where (x, z) is from the coast. `s` is a mean over the segments, weighted by how near each is (a mean
 * angle round the closed coast): the nearest point alone jumps along the bisector of every corner, and
 * the spurs would step there.
 */
function coastAt(x: number, z: number, out: CoastHit): CoastHit {
  let inside = false;
  let best = Infinity;
  for (let i = 0; i < SEGMENTS; i++) {
    const ax = segX[i]!;
    const az = segZ[i]!;
    const bx = ax + segDx[i]! * segLen[i]!;
    const bz = az + segDz[i]! * segLen[i]!;
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
    const t = Math.min(segLen[i]!, Math.max(0, (x - ax) * segDx[i]! + (z - az) * segDz[i]!));
    const nx = ax + segDx[i]! * t - x;
    const nz = az + segDz[i]! * t - z;
    const dist = Math.hypot(nx, nz);
    segDist[i] = dist;
    segAlong[i] = segStart[i]! + t;
    best = Math.min(best, dist);
  }
  let cosSum = 0;
  let sinSum = 0;
  for (let i = 0; i < SEGMENTS; i++) {
    const w = Math.exp(-(segDist[i]! - best) / S_BLEND);
    const angle = (segAlong[i]! / coastLength) * TAU;
    cosSum += w * Math.cos(angle);
    sinSum += w * Math.sin(angle);
  }
  const angle = Math.atan2(sinSum, cosSum);
  out.d = inside ? best : -best;
  out.s = ((angle < 0 ? angle + TAU : angle) / TAU) * coastLength;
  return out;
}

// ---------------------------------------------------------------------------------------------
// The spurs and the valleys between them, round the whole coast.

interface Spur {
  s: number;
  foot: number;
  prowSlope: number;
  front: number;
  flankSlope: number;
  /** The valley that follows this spur (toward the next one): its lip. */
  lip: number;
  /** The teeth's phase offset along the crest. */
  teeth: number;
}

const SP = K.spurs;
const SPURS: Spur[] = [];
{
  const rand = mulberry32(SEED + 7);
  const range = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * rand();
  const gaps: number[] = [];
  let total = 0;
  while (total < coastLength - SP.spacing[0]) {
    const g = range(SP.spacing);
    gaps.push(g);
    total += g;
  }
  const scale = coastLength / total;
  let s = 0;
  for (const g of gaps) {
    SPURS.push({
      s,
      foot: range(SP.prowFoot),
      prowSlope: range(SP.prowSlope),
      front: range(SP.front),
      flankSlope: range(SP.flankSlope),
      lip: range(SP.lip),
      teeth: rand(),
    });
    s += g * scale;
  }
}
const SPUR_COUNT = SPURS.length;

function wrapS(s: number): number {
  const m = s % coastLength;
  return m < 0 ? m + coastLength : m;
}

/** The spur at or before `s` (index into SPURS). */
function spurBefore(s: number): number {
  let lo = 0;
  let hi = SPUR_COUNT - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SPURS[mid]!.s <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The spine's height (m) at (x, z). */
function spineAt(x: number, z: number): number {
  const sp = SP.spine;
  let h = sp.base + sp.vary * 1.6 * fbm2(x / sp.scale, z / sp.scale, 3, SEED + 13);
  for (const p of SP.peaks) {
    const g = Math.hypot(x - p.x, z - p.z) / p.radius;
    if (g < 3) h += p.rise * Math.exp(-g * g);
  }
  return h;
}

/**
 * A spur's crest at `d` inland, with its teeth: its prow's face, then the ridge back to the spine.
 * `off` is how far down its flank (along the coast) the point is: the teeth's ribs fade down the flank,
 * so they stand as spires on the crest and don't ridge the whole flank.
 */
function crest(spur: Spur, d: number, spine: number, sAbs: number, off: number): number {
  const band = spur.foot / K.seaCliff.steepness;
  const run = Math.max(0, d - band);
  // The prow's face: ribs down its fall line (along d), broad facets at the foot.
  const f = K.flutes;
  const facet = smoothstep(0, 60, run);
  const frontRib =
    f.depth *
    smoothstep(0, 14, run) *
    Math.pow(rib(sAbs / f.spacing + 0.4 * fbm2(sAbs / 140, d / 90, 2, SEED + 5)), lerp(0.35, 1.0, facet));
  const prow = spur.foot + spur.prowSlope * run + frontRib;
  const dFront = band + (spur.front - spur.foot) / spur.prowSlope;
  const back = Math.max(60, SP.spineAt - dFront);
  const t = clamp01((d - dFront) / back);
  const ridge = spur.front + (spine - spur.front) * Math.pow(t, 0.8);
  // Teeth: sharp spires along the crest, each one a rib down both flanks.
  const phase = d / SP.teeth + spur.teeth + 0.3 * fbm2(sAbs / 200, d / 120, 2, SEED + 17);
  const tooth =
    SP.toothHeight *
    (rib(phase) + f.fine * rib(phase * 2 + 0.5)) *
    smoothstep(dFront * 0.6, dFront + 20, d) *
    (0.6 + 0.4 * smoothstep(-0.2, 0.3, fbm2(d / 80, sAbs / 80, 2, SEED + 19)));
  return smin(prow, ridge + tooth * (0.25 + 0.75 * Math.exp(-off / 30)), 18);
}

/** Over this length (m) past the start of the coast, `s`'s detail eases from its end's (no seam). */
const WRAP_BLEND = 200;

/** `crest`, eased across the coast's start (where `s` wraps from its length back to 0). */
function crestAt(spur: Spur, d: number, spine: number, s: number, off: number): number {
  const own = crest(spur, d, spine, s, off);
  if (s >= WRAP_BLEND) return own;
  const before = crest(spur, d, spine, s + coastLength, off);
  return before + (own - before) * smoothstep(0, WRAP_BLEND, s);
}

const coast: CoastHit = { d: 0, s: 0 };
const probe: CoastHit = { d: 0, s: 0 };

/**
 * 1 on the spine and on every other crease of the coast distance (the middle line where the nearest
 * coast changes side, also between a headland and the coast), easing to 0 about 40 m off it: there
 * the distance stands above its mean 45 m round. Read from the distance alone, so it's continuous
 * where the nearest coast point jumps.
 */
function spineCrease(x: number, z: number, d: number): number {
  const r = 45;
  const mean =
    (coastAt(x + r, z, probe).d +
      coastAt(x - r, z, probe).d +
      coastAt(x, z + r, probe).d +
      coastAt(x, z - r, probe).d) /
    4;
  return smoothstep(1, 18, d - mean);
}

/** The massif (the spurs, valleys and sea cliff) at (x, z). */
function massif(x: number, z: number): number {
  coastAt(x, z, coast);
  const n = K.coastNoise;
  const d = coast.d + n.amplitude * fbm2(x / n.scale, z / n.scale, 3, SEED + 3);
  if (d <= 0) return seaFloor(d);
  const spine = spineAt(x, z);
  const sigma = wrapS(coast.s - SP.lean * d);
  const i0 = spurBefore(sigma);
  const i1 = (i0 + 1) % SPUR_COUNT;
  const a = SPURS[i0]!;
  const b = SPURS[i1]!;
  const aOff = sigma - a.s;
  const bOff = wrapS(b.s - sigma);
  const tentA = crestAt(a, d, spine, coast.s, aOff) - a.flankSlope * aOff;
  const tentB = crestAt(b, d, spine, coast.s, bOff) - b.flankSlope * bOff;
  // The valleys' floor: it climbs from its hanging lip to the head under the spine; the spurs' flanks
  // make the V across it. Its lip eases from one valley's to the next along the coast (no step where
  // the nearest spur changes).
  const lip = lipAt(sigma, i0);
  const floor = lip + (spine - SP.headBelow - lip) * Math.pow(clamp01(d / SP.spineAt), 0.75);
  let h = smax(smax(tentA, tentB, 6), floor, 12);
  // On a crease the two sides' spurs meet: there both ease to one crest (from the distance and world
  // position only), so the ground is continuous where the nearest coast changes side.
  const meet = spineCrease(x, z, coast.d);
  if (meet > 0) {
    // One crest from both sides: the spurs' mean profile (a prow to the mean front crest, then the
    // ridge back to the spine), with its own teeth.
    const front = (SP.front[0] + SP.front[1]) / 2;
    const prow = (SP.prowSlope[0] + SP.prowSlope[1]) / 2;
    const dFront = (front - 25) / prow;
    const ridge =
      d < dFront
        ? 25 + prow * d
        : front + (spine - front) * Math.pow(clamp01((d - dFront) / (SP.spineAt - dFront)), 0.8);
    const teeth =
      SP.toothHeight * 0.8 * rib((x + z * 0.4) / SP.teeth + 0.4 * fbm2(x / 160, z / 160, 2, SEED + 43));
    h += (ridge - SP.toothHeight * 0.4 + teeth * smoothstep(40, 120, d) - h) * meet;
  }
  // The sea cliff: near-sheer from the sea to whatever stands behind it, up to its top (25-55 m);
  // above that a high prow climbs on as a steep face, not a sheer one.
  const sc = K.seaCliff;
  const top = sc.top + sc.topVary * fbm2(x / 160, z / 160, 2, SEED + 79);
  const run = top / sc.steepness;
  const cliff = d < run ? d * sc.steepness : top + (d - run) * sc.above;
  return Math.min(cliff, h);
}

/** The valley (after which spur) whose middle lies nearest the coast point nearest (x, z). */
function valleyNear(x: number, z: number): number {
  const hit = coastAt(x, z, { d: 0, s: 0 });
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < SPUR_COUNT; i++) {
    const next = SPURS[(i + 1) % SPUR_COUNT]!.s + (i + 1 === SPUR_COUNT ? coastLength : 0);
    const mid = wrapS((SPURS[i]!.s + next) / 2);
    const g = Math.min(Math.abs(mid - hit.s), coastLength - Math.abs(mid - hit.s));
    if (g < bestGap) {
      bestGap = g;
      best = i;
    }
  }
  return best;
}

/** Valleys whose lip is set: the hanging valley (high over the sea) and the bays' (low: small coves). */
const LIPS = new Map<number, number>();
for (const b of C.bays) LIPS.set(valleyNear(b.x, b.z), b.lip);
{
  const p = toWorld(K.hanging.u, K.hanging.v);
  LIPS.set(valleyNear(p.x, p.z), K.hanging.lip);
}

function valleyLip(index: number): number {
  return LIPS.get(index) ?? SPURS[index]!.lip;
}

/** The middle (along the coast) of the valley after spur `index`. */
function valleyMiddle(index: number): number {
  const i = ((index % SPUR_COUNT) + SPUR_COUNT) % SPUR_COUNT;
  const next = i + 1 === SPUR_COUNT ? SPURS[0]!.s + coastLength : SPURS[i + 1]!.s;
  return (SPURS[i]!.s + next) / 2;
}

/** The valley floor's lip at `sigma` along the coast (`i0`: the spur at or before it), eased between valleys. */
function lipAt(sigma: number, i0: number): number {
  const mid = valleyMiddle(i0);
  const j = sigma < mid ? i0 - 1 : i0;
  let m0 = valleyMiddle(j);
  let m1 = valleyMiddle(j + 1);
  if (m0 > sigma + coastLength / 2) m0 -= coastLength;
  if (m1 < m0) m1 += coastLength;
  let at = sigma;
  if (at < m0) at += coastLength;
  const t = smoothstep(m0, m1, at);
  const wrap = (k: number) => ((k % SPUR_COUNT) + SPUR_COUNT) % SPUR_COUNT;
  return valleyLip(wrap(j)) + (valleyLip(wrap(j + 1)) - valleyLip(wrap(j))) * t;
}

function seaFloor(d: number): number {
  const off = -d;
  return Math.max(-(3 * smoothstep(0, 6, off) + 0.42 * off), -K.deepDepth);
}

// ---------------------------------------------------------------------------------------------
// The cove valley: a floor along the cove frame's u, walls from its edge, a bowl at the head.

/** Monotone cubic interpolation (no overshoot) through stations' values. */
function pchip(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const m = new Float64Array(n);
  const delta = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) delta[i] = (ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!);
  m[0] = delta[0]!;
  m[n - 1] = delta[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const p = delta[i - 1]!;
    const q = delta[i]!;
    m[i] = p * q <= 0 ? 0 : (2 * p * q) / (p + q);
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h * m[i + 1]!
    );
  };
}

const STATIONS: readonly ValleyStation[] = K.valley.stations;
const stationU = STATIONS.map((st) => st.u);
const valleyFloor = pchip(
  stationU,
  STATIONS.map((st) => st.floor),
);
const valleyHalfWidth = pchip(
  stationU,
  STATIONS.map((st) => st.halfWidth),
);
const HEAD = STATIONS[STATIONS.length - 1]!;

/** Height of a valley wall `e` metres out from the floor's edge: a fillet, then `slope` rise/run. */
function wallRise(e: number, fillet: number, slope: number = K.valley.wallSlope): number {
  if (e <= 0) return 0;
  return slope * (e - fillet * (1 - Math.exp(-e / fillet)));
}

/** Where a point is in the valley: distance out from the floor's edge, and the place round the rim. */
const vHit = { e: 0, rim: 0 };

/**
 * The valley runs along u (its middle line at `across` 0) to a bowl at the head: `e` is the distance
 * out from the floor's edge, `rim` the distance round the rim from the middle of the bowl (one side
 * positive, the other negative), so it's continuous.
 */
function valleyHit(along: number, across: number, w: number) {
  const rimRadius = HEAD.halfWidth + 40;
  if (along <= HEAD.u) {
    vHit.e = Math.abs(across) - w;
    const round = HEAD.u - along + (Math.PI / 2) * rimRadius;
    vHit.rim = across >= 0 ? round : -round;
  } else {
    const du = along - HEAD.u;
    vHit.e = Math.hypot(du, across) - HEAD.halfWidth;
    vHit.rim = Math.atan2(across, du) * rimRadius;
  }
}

/**
 * The ribs on the cove valley's walls (m, ≥ 0): big buttresses about `valleySpacing` × 3 apart (their
 * noses climb as steep facets), flutes on them, both of irregular depth, and spires where they reach
 * the crest.
 */
function valleyRibs(x: number, z: number): number {
  if (vHit.e <= 0) return 0;
  const f = K.flutes;
  const warp = f.warp * fbm2(vHit.rim / 150, vHit.e / 110, 2, SEED + 23);
  const vary = 0.4 + 1.2 * clamp01(0.5 + 1.4 * fbm2(x / 70, z / 70, 2, SEED + 29));
  const facet = smoothstep(0, 50, vHit.e);
  const buttress =
    40 *
    Math.pow(rib(vHit.rim / (f.valleySpacing * 3) + 0.31 + warp * 0.6), lerp(0.5, 1, facet)) *
    smoothstep(4, 70, vHit.e);
  const phase = vHit.rim / f.valleySpacing + warp;
  const flute =
    f.depth *
    vary *
    smoothstep(0, 18, vHit.e) *
    (Math.pow(rib(phase), lerp(0.4, 1, facet)) + f.fine * rib(phase * 2 + 0.5));
  return buttress + flute;
}

/** The cove valley's carved height at cove frame (u, v). */
function coveValley(u: number, v: number, x: number, z: number): number {
  const V = K.valley;
  if (u < -520) return Infinity;
  const w0 = valleyHalfWidth(u);
  const vc = V.meander * Math.sin(u / 95 + 0.8) * smoothstep(160, 240, u);
  const across = v - vc;
  const q = Math.min(1, (across / Math.max(1, w0)) ** 2);
  const uFloor = u + V.beachBend * q * (1 - smoothstep(0, 120, u));
  const floor = valleyFloor(Math.min(uFloor, HEAD.u));
  valleyHit(u, across, w0);
  if (vHit.e > 330) return Infinity;
  // Inland of the town shelf: side spurs reach into the valley from its walls (the floor's edge moves
  // in at each spur, so the walls come with it), and the floor rolls.
  const inland = smoothstep(185, 235, u);
  if (inland > 0) {
    const spur = rib(vHit.rim / V.spurSpacing + 0.15 + 0.25 * fbm2(vHit.rim / 200, 0.5, 2, SEED + 53));
    vHit.e +=
      V.spurReach * inland * spur * (0.6 + 0.4 * clamp01(0.5 + fbm2(vHit.rim / 90, 1.5, 2, SEED + 59)));
  }
  const roll = V.roll * inland * fbm2(x / 70, z / 70, 3, SEED + 61);
  const dish = vHit.e < 0 ? 1.5 * clamp01(1 + vHit.e / Math.max(1, w0)) ** 2 * smoothstep(60, 110, u) : 0;
  // Behind the beach the walls stand on toe slopes (talus aprons, the fillet, longer in some places
  // than others) with a bench part-way up, so the floor meets them in a curve, not a corner.
  const toe = smoothstep(40, 110, u);
  const apron = 0.6 + 0.8 * clamp01(0.5 + fbm2(vHit.rim / 120, 3.5, 2, SEED + 71));
  const fillet =
    V.wallFillet +
    (V.toeFillet * apron - V.wallFillet) * toe +
    (V.headFillet - V.toeFillet) * smoothstep(200, 290, u);
  const benchAt = V.bench.at + 14 * fbm2(vHit.rim / 150, 5.5, 2, SEED + 73);
  const e = vHit.e - 0.85 * toe * Math.min(V.bench.width, Math.max(0, vHit.e - benchAt));
  return floor + roll + dish + wallRise(e, fillet) + valleyRibs(x, z);
}

// ---------------------------------------------------------------------------------------------
// The sea: reefs, the sea stack, the edge of the bake.

function reefs(u: number, v: number, x: number, z: number, h: number): number {
  for (const r of K.reefs) {
    const q = Math.hypot((u - r.u) / r.along, (v - r.v) / r.across);
    if (q > 1.7) continue;
    const lumps = Math.abs(fbm2(x / 9, z / 9, 3, SEED + 31)) * 1.1;
    // The flat falls off in a steep skirt that ends well under the deep floor (no step where it stops).
    const reef =
      r.crest - lumps - 16 * smoothstep(0.6, 1.25, q) - (K.deepDepth - 10) * smoothstep(1.2, 1.7, q);
    h = smax(h, reef, 2.5);
  }
  return h;
}

function seaStacks(x: number, z: number, h: number): number {
  for (const st of K.seaStacks) {
    const r = Math.hypot(x - st.x, z - st.z);
    if (r > st.radius * 2.2) continue;
    const ragged = st.radius * (1 + 0.18 * fbm2(x / 7, z / 7, 2, SEED + 37));
    const top = st.height - st.height * 0.16 * smoothstep(0.2, 1, r / ragged);
    // Its foot falls past the deep floor before the cut-off (no step where it stops).
    const stack = top - (top + K.deepDepth + 10) * smoothstep(ragged * 0.85, ragged * 1.6, r);
    h = smax(h, stack, 3);
  }
  return h;
}

/** The sea floor eases down to the deep floor in the last 60 m inside the baked bounds (no step at the edge). */
function edgeApron(x: number, z: number, h: number): number {
  const b = K.bounds;
  const edge = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
  if (edge >= 60 || h > -1) return h;
  return h + (-K.deepDepth - h) * smoothstep(60, 4, edge) * smoothstep(-1, -8, h);
}

const frame = { u: 0, v: 0 };

/** Keelhaven's ground height (m) at world (x, z), before any fresh water is carved. */
export function keelhavenHeightDry(x: number, z: number): number {
  toFrame(x, z, frame);
  const { u, v } = frame;
  let h = massif(x, z);
  const cove = coveValley(u, v, x, z);
  if (cove < h + 8) h = smin(h, cove, 8);
  h = seaStacks(x, z, h);
  if (h < 0) h = reefs(u, v, x, z, h);
  return edgeApron(x, z, Math.max(h, -K.deepDepth));
}

/** Keelhaven's ground height (m) at world (x, z). No fresh water is carved yet. */
export function keelhavenHeight(x: number, z: number): number {
  return keelhavenHeightDry(x, z);
}

/** The ground's normal at (x, z), from the height's central differences 1.5 m either side. */
export function keelhavenNormal(
  x: number,
  z: number,
  out: Float32Array | number[],
  heightAt: (x: number, z: number) => number = keelhavenHeight,
): Float32Array | number[] {
  const e = 1.5;
  const nx = -(heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const nz = -(heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const len = Math.hypot(nx, 1, nz) || 1;
  out[0] = nx / len;
  out[1] = 1 / len;
  out[2] = nz / len;
  return out;
}

/** The signed distance (m) inland from the coast at world (x, z) (no fine noise; < 0 at sea). */
export function keelhavenCoastDistance(x: number, z: number): number {
  return coastAt(x, z, { d: 0, s: 0 }).d;
}

/**
 * How far below its neighbours the ground lies (m): the mean height `r` metres away, less the height
 * here. > 0 in a gully or a hollow, < 0 on a rib or a crest.
 */
function concavity(heightAt: (x: number, z: number) => number, x: number, z: number, h: number, r: number) {
  return (heightAt(x + r, z) + heightAt(x - r, z) + heightAt(x, z + r) + heightAt(x, z - r)) / 4 - h;
}

const normal = [0, 1, 0];
const maskFrame = { u: 0, v: 0 };
const maskCoast: CoastHit = { d: 0, s: 0 };

/**
 * Ground masks. Sand: the cove's beach. Cliff: the sea cliff only (the dark basalt at the foot of the
 * walls). Rock: in patches, not stripes: the gully floors and the spurs' noses, scars on sharp crests,
 * the sheerest faces, and the talus fans at the walls' feet (red-brown soil). Grass: the rest (the
 * green walls, the town shelf, the valley floor). `heightAt` lets the bake read its own grid (fast).
 */
export function keelhavenMasks(
  x: number,
  z: number,
  heightAt: (x: number, z: number) => number = keelhavenHeight,
): { sand: number; grass: number; rock: number; cliff: number } {
  const h = heightAt(x, z);
  const n = keelhavenNormal(x, z, normal, heightAt);
  const slope = Math.hypot(n[0]!, n[2]!) / Math.max(0.05, n[1]!);
  toFrame(x, z, maskFrame);
  coastAt(x, z, maskCoast);
  const inCove = smoothstep(90, 50, maskFrame.u) * smoothstep(-320, -250, maskFrame.u);
  const beachBand = smoothstep(-2.2, -0.8, h) * (1 - smoothstep(3.2, 4.4, h));
  let sand = inCove * beachBand * (1 - smoothstep(0.22, 0.4, slope));
  // The sea cliff: steep, low, near the coast. Its top follows the cliff (up to a valley's lip).
  const band =
    smoothstep(1.6, 2.6, slope) *
    (1 - smoothstep(30, 48, h)) *
    (1 - smoothstep(16, 34, maskCoast.d)) *
    smoothstep(-8, -3, h);
  const near = slope > 0.4 ? concavity(heightAt, x, z, h, 8) : 0;
  const wide = slope > 0.4 ? concavity(heightAt, x, z, h, 30) : 0;
  // Patches broken up by noise, so no rock follows a rib all the way down.
  const patch = smoothstep(-0.05, 0.25, fbm2(x / 34, z / 34, 3, SEED + 51));
  // Only steep gullies (a valley's floor between spurs is a long hollow too, but it keeps its forest).
  const gully = smoothstep(1.5, 4.5, near) * smoothstep(1.4, 2.2, slope) * patch;
  const nose = smoothstep(5, 14, -wide) * smoothstep(0.9, 1.7, slope) * (1 - smoothstep(90, 150, h)) * patch;
  const scar =
    smoothstep(3, 7, -near) * smoothstep(0.8, 1.4, slope) * smoothstep(0.15, 0.4, patch - 0.3) * 0.8;
  const fan = smoothstep(2, 8, wide) * smoothstep(0.45, 0.6, slope) * (1 - smoothstep(0.75, 0.95, slope));
  // Plants hold on up to about 75° (Na Pali's walls stay green); only sheerer faces are bare.
  const sheer = smoothstep(3.4, 5, slope);
  // Under the sea: pale sand on the shelves and the reef flats, dark rock in the reef's heads and lumps,
  // rock off the cliffs' feet.
  const heads = smoothstep(0.05, 0.3, fbm2(x / 11, z / 11, 3, SEED + 67));
  const underSea = 1 - smoothstep(-1.2, -0.2, h);
  const shelfSand = underSea * smoothstep(-22, -6, h);
  const seabed = underSea * Math.max(0.3, heads * 0.9);
  if (underSea > 0) sand = Math.max(sand, shelfSand * (1 - heads * 0.85));
  let rock = Math.max(gully * 0.8, nose, scar, fan * 0.9 * patch, sheer, seabed);
  let grass = smoothstep(0.5, 3, h) * (1 - band);
  const cliff = clamp01(band);
  rock = clamp01(rock * (1 - cliff));
  sand = clamp01(sand * (1 - cliff));
  grass = clamp01(grass * (1 - sand * 0.8) * (1 - rock * 0.8));
  const total = sand + grass + rock + cliff;
  if (total < 0.001) return { sand: 0.3, grass: 0, rock: 0.7, cliff: 0 };
  return { sand: sand / total, grass: grass / total, rock: rock / total, cliff: cliff / total };
}
