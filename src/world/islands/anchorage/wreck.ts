import {
  BufferAttribute,
  DataTexture,
  Euler,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  Quaternion,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CircleObstacle, Tier } from '../../contracts';
import { COVE } from '../../layout';
import { meshCameraBlockers, type CameraBlockerBox } from '../../terrain/camera-blockers';
import {
  createDeckGeometry,
  createHullGeometry,
  createSternGoldGeometry,
  createTrimGeometry,
} from '../../ship/brigantine-hull';
import { makeShipMaterial, type ShipLabel } from '../../ship/brigantine-materials';
import { BRIGANTINE_MASTS, addFightingTop, type MastSpec } from '../../ship/brigantine-rig';
import { deckHeightAt, halfBeamAt, sheerHeightAt, waterlineHalfBeamAt } from '../../ship/lines';
import { MeshBuilder, type P3 } from '../../ship/mesh-builder';
import { mulberry32, sinHash, smoothstep } from '../../../util/math';
import { wreckDown, wreckShipObstacles, wreckToWorld } from './wreck-pose';

/**
 * Anchorage Cay's wreck (COVE.wreck): a fog raider's brigantine run up on a sand bar between the
 * lighthouse point and the pier, bow up and heeled to starboard, her two remaining masts bare with
 * their fighting tops, slack and broken rigging, a few rags of sail, holes stove in her planking, and
 * a weed line where the tide works on her.
 *
 * She's the battle raiders' own hull, deck and trim, drawn with the ship's material (the raiders'
 * slate livery), so she adds no shader; her weathering is vertex colour. Every part is merged into one
 * mesh (one draw), with less of it on Lite and Low (PLAN §12.1).
 */
export interface WreckSystem {
  mesh: Mesh;
  /** Circles the player's ship keeps out of (the hull, the masts' overhang, the bowsprit). */
  shipObstacles: CircleObstacle[];
  /** Boxes the follow camera keeps out of (the hull above the water). */
  cameraBlockers: CameraBlockerBox[];
  /** Where gulls can stand (world space): the snapped foremast, the main crosstrees, the bowsprit. */
  perches: Vector3[];
  triangleCount: number;
  dispose(): void;
}

const { fore: FORE, main: MAIN, mizzen: MIZZEN } = BRIGANTINE_MASTS;
const W = COVE.wreck;

/**
 * Ship-local damage, after years on the bar: holes stove in her planking with the frames showing
 * through (the big one at her waterline on the high port side, where it shows from the pier and
 * the quay), strakes sprung out in narrow gaps (`slit`: too fine for Lite's hull, so not there),
 * most of her bulwarks gone to stumps, an open hatch, and the gunports that lost their lids or guns.
 */
interface Hole {
  side: 1 | -1;
  z: number;
  y: number;
  rz: number;
  ry: number;
  slit?: boolean;
}
const HOLES: readonly Hole[] = [
  { side: 1, z: 2.0, y: -0.35, rz: 1.95, ry: 1.0 },
  { side: 1, z: 8.7, y: 0.85, rz: 0.8, ry: 0.55 },
  { side: 1, z: -6.6, y: 0.35, rz: 1.35, ry: 0.75 },
  { side: 1, z: -10.0, y: 1.05, rz: 0.6, ry: 0.5 },
  { side: -1, z: -4.2, y: 1.15, rz: 1.1, ry: 0.6 },
  { side: -1, z: 3.6, y: 1.35, rz: 0.8, ry: 0.5 },
  { side: 1, z: -2.6, y: 0.95, rz: 1.5, ry: 0.15, slit: true },
  { side: 1, z: 5.2, y: 0.55, rz: 1.2, ry: 0.14, slit: true },
  { side: 1, z: -0.5, y: 2.15, rz: 1.1, ry: 0.13, slit: true },
  { side: 1, z: 11.0, y: 1.6, rz: 0.8, ry: 0.13, slit: true },
  { side: -1, z: 0.4, y: 1.9, rz: 1.3, ry: 0.14, slit: true },
];
/** The few stretches of bulwark still standing (side, from z, to z); the rest is gone to stumps. */
const RAIL_KEPT = [
  { side: 1, z0: -11.6, z1: -10.4 },
  { side: 1, z0: 3.1, z1: 4.4 },
  { side: -1, z0: -8.0, z1: -6.6 },
  { side: -1, z0: 9.2, z1: 10.6 },
] as const;
const HATCH = { z0: 2.3, z1: 4.0, x: 0.85 } as const;
/** Gunport stations along her side (see brigantine-hull's portZ). */
const PORT_Z = [-8.1, -6.0, -3.9, -1.8, 0.4, 2.6, 4.8, 6.9] as const;
/** The only gunport lids still hanging (side, station z); every other lid is gone. */
const KEPT_LIDS = [
  [1, 0.4],
  [-1, -6.0],
  [-1, 6.9],
] as const;
/** Gunports whose gun went over the side. */
const LOST_GUNS = [
  [1, -1.8],
  [1, 6.9],
  [1, -6.0],
  [1, 2.6],
  [-1, 4.8],
  [-1, -3.9],
] as const;
/** Where her masts and bowsprit snapped (ship-local heights / z). */
const FORE_BREAK = FORE.lowerTop + 1.35;
const MAIN_BREAK = MAIN.topTop - 2.4;
const MIZZEN_BREAK = deckHeightAt(MIZZEN.z) + 1.7;
const BOWSPRIT_END: P3 = { x: 0, y: 2.62, z: 13.7 };

interface Parts {
  hull: Tier;
  deck: Tier | null;
  trim: Tier | null;
  gold: boolean;
  seg: number;
  rope: { sides: number; steps: number };
}

/** What each tier draws: Lite keeps the hull and a plain deck, Low the light deck and trim. */
function partsFor(tier: Tier): Parts {
  if (tier === 'lite')
    return { hull: 'lite', deck: null, trim: null, gold: false, seg: 6, rope: { sides: 3, steps: 6 } };
  if (tier === 'low')
    return { hull: 'low', deck: 'lite', trim: 'lite', gold: false, seg: 8, rope: { sides: 4, steps: 8 } };
  if (tier === 'medium')
    return { hull: 'medium', deck: 'low', trim: 'low', gold: true, seg: 10, rope: { sides: 5, steps: 10 } };
  return { hull: 'high', deck: 'medium', trim: 'medium', gold: true, seg: 12, rope: { sides: 5, steps: 12 } };
}

type Cut = (x: number, y: number, z: number, region: number) => boolean;

/** Drops the triangles `cut` says to (by their centre), so a hole shows the hull's dark inside. */
function dropTriangles(geometry: BufferGeometry, cut: Cut): void {
  const index = geometry.getIndex();
  if (!index) return;
  const p = geometry.getAttribute('position');
  const r = geometry.getAttribute('shipRegion');
  const kept: number[] = [];
  for (let i = 0; i + 2 < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
    const y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
    const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    if (!cut(x, y, z, Math.round(r.getX(a)))) kept.push(a, b, c);
  }
  geometry.setIndex(kept);
}

function inHole(holes: readonly Hole[], x: number, y: number, z: number): boolean {
  for (const h of holes) {
    if (x * h.side <= 0) continue;
    const jag = h.slit
      ? 0.25 * Math.sin(z * 4.3 + y)
      : 0.22 * Math.sin(z * 9.1 + y * 5.3) + 0.12 * Math.sin(y * 17 - z * 3);
    if (((z - h.z) / h.rz) ** 2 + ((y - h.y) / h.ry) ** 2 < 1 + jag) return true;
  }
  return false;
}

/** Outboard and above the deck, where her bulwarks were, and not in a stretch that still stands. */
function inRailGap(x: number, y: number, z: number): boolean {
  if (Math.abs(x) < 2.1) return false;
  const side = x > 0 ? 1 : -1;
  for (const k of RAIL_KEPT) if (k.side === side && z > k.z0 && z < k.z1) return false;
  const ragged = 0.22 * Math.sin(z * 7.3 + side) + 0.1 * Math.sin(z * 17.9);
  return y > deckHeightAt(z) + 0.2 + ragged;
}

function inHatch(x: number, y: number, z: number): boolean {
  return z > HATCH.z0 && z < HATCH.z1 && Math.abs(x) < HATCH.x && y > deckHeightAt(z) - 0.1;
}

/** A gunport's lid (the red panel round it) unless it's one of KEPT_LIDS, or a gun in LOST_GUNS. */
function inLostFitting(x: number, y: number, z: number, region: number): boolean {
  if (region === 2 && y > 1.12 && y < 1.98 && Math.abs(x) > 2) {
    const side = x > 0 ? 1 : -1;
    if (!KEPT_LIDS.some(([s, pz]) => s === side && Math.abs(z - pz) < 0.6)) return true;
  }
  if (region === 4 && y > 1.36 && y < 1.64)
    for (const [side, pz] of LOST_GUNS)
      if (Math.abs(z - pz) < 0.13 && x * side > waterlineHalfBeamAt(pz) + 0.05) return true;
  return false;
}

function damagedBy(holes: readonly Hole[]): Cut {
  return (x, y, z, region) => inHole(holes, x, y, z) || inRailGap(x, y, z) || inLostFitting(x, y, z, region);
}

/** Lite's deck: plain planking edge to edge, two hatches and the quarterdeck step (no fittings). */
function plainDeck(b: MeshBuilder): void {
  b.setRegion(1);
  b.setColor(0xd8b078);
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const z0 = -11 + (21.5 * i) / steps,
      z1 = -11 + (21.5 * (i + 1)) / steps;
    const y0 = deckHeightAt(z0),
      y1 = deckHeightAt(z1);
    const w0 = halfBeamAt(z0, y0) * 0.97,
      w1 = halfBeamAt(z1, y1) * 0.97;
    b.addQuad(
      { x: -w0, y: y0, z: z0 },
      { x: w0, y: y0, z: z0 },
      { x: w1, y: y1, z: z1 },
      { x: -w1, y: y1, z: z1 },
    );
  }
  b.addBox(0, deckHeightAt(-2.45) + 0.16, -2.45, 1.45, 0.22, 2.05);
  b.addBox(0, deckHeightAt(3.15) + 0.16, 3.15, 1.25, 0.22, 1.65);
}

/** A spar or mast with a splintered end at `b`: a few thin spikes past the break. */
function brokenSpar(
  bld: MeshBuilder,
  a: P3,
  b: P3,
  radius: number,
  endRadius: number,
  seg: number,
  splinters = 3,
): void {
  bld.setRegion(1);
  bld.setColor(0x4b2b1b);
  bld.addCylinderBetween(a, b, radius, seg, { endRadius });
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  bld.setColor(0xc9a578);
  for (let i = 0; i < splinters; i++) {
    const ang = (i / splinters) * Math.PI * 2 + a.z;
    const off = endRadius * 0.55;
    // A sideways offset perpendicular-ish to the spar (good enough for short spikes).
    const ox = Math.cos(ang) * off,
      oz = Math.sin(ang) * off;
    const reach = (0.25 + 0.3 * ((i * 37) % 7) * 0.14) / len;
    bld.addCylinderBetween(
      { x: b.x + ox, y: b.y, z: b.z + oz },
      { x: b.x + ox * 0.6 + dx * reach, y: b.y + dy * reach, z: b.z + oz * 0.6 + dz * reach },
      endRadius * 0.38,
      4,
      { endRadius: 0.006 },
    );
  }
}

/**
 * A fighting top knocked askew on its trestle: built level, a wedge of its platform and rail
 * broken away, then tilted about the masthead (its own geometry, merged with the rest).
 */
function tiltedTop(
  m: MastSpec,
  radius: number,
  seg: number,
  tilt: P3,
  wedge: [number, number],
): BufferGeometry {
  const t = new MeshBuilder();
  addFightingTop(t, m, m.lowerTop, radius, seg);
  const geometry = t.build();
  dropTriangles(geometry, (x, _y, z) => {
    const a = Math.atan2(z - m.z, x);
    return a > wedge[0] && a < wedge[1] && Math.hypot(x, z - m.z) > radius * 0.35;
  });
  const pivot = new Vector3(0, m.lowerTop, m.z);
  geometry.applyMatrix4(
    new Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new Matrix4().makeRotationFromEuler(new Euler(tilt.x, tilt.y, tilt.z)))
      .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)),
  );
  return geometry;
}

function mast(bld: MeshBuilder, m: MastSpec, top: number, seg: number): void {
  bld.setRegion(1);
  bld.setColor(0x4b2b1b);
  const base = deckHeightAt(m.z);
  bld.addCylinderBetween(
    { x: 0, y: base - 0.86, z: m.z },
    { x: 0, y: m.lowerTop + 0.18, z: m.z },
    m.radius,
    seg,
    { endRadius: m.radius * 0.76 },
  );
  bld.setRegion(4);
  bld.setColor(0x17110d);
  for (const y of [base + 1.2, m.lowerTop - 0.55])
    bld.addCylinderBetween(
      { x: 0, y: y - 0.045, z: m.z },
      { x: 0, y: y + 0.045, z: m.z },
      m.radius * 1.04,
      seg,
    );
  if (top > m.lowerTop)
    brokenSpar(
      bld,
      { x: 0, y: m.lowerTop - 0.38, z: m.z },
      { x: 0, y: top, z: m.z },
      m.radius * 0.62,
      m.radius * 0.5,
      seg,
    );
}

/** The two standing masts, the mizzen's stump, the snapped bowsprit, and what's left of the yards. */
function rig(b: MeshBuilder, parts: Parts, pieces: BufferGeometry[]): void {
  const seg = parts.seg;
  mast(b, FORE, FORE_BREAK, seg);
  mast(b, MAIN, MAIN_BREAK, seg);
  // Both tops knocked askew, each with a piece of its platform gone.
  pieces.push(tiltedTop(FORE, 1.2, seg, { x: 0.3, y: 0, z: -0.16 }, [0.4, 1.5]));
  pieces.push(tiltedTop(MAIN, 1.35, seg, { x: -0.12, y: 0.2, z: 0.28 }, [-2.6, -1.4]));
  brokenSpar(
    b,
    { x: 0, y: deckHeightAt(MIZZEN.z) - 0.5, z: MIZZEN.z },
    { x: 0, y: MIZZEN_BREAK, z: MIZZEN.z },
    MIZZEN.radius,
    MIZZEN.radius * 0.92,
    seg,
    4,
  );
  // The mizzen's upper part, fallen across the quarterdeck and over her low side into the sea.
  brokenSpar(
    b,
    { x: 0.9, y: deckHeightAt(-6.2) + 0.5, z: -6.2 },
    { x: -6.6, y: -0.6, z: -10.4 },
    MIZZEN.radius * 0.85,
    MIZZEN.radius * 0.7,
    seg,
  );
  brokenSpar(b, { x: 0, y: 2.35, z: 10.72 }, BOWSPRIT_END, 0.2, 0.15, seg);
  // The main yard hangs cockbilled from its slings, its starboard arm snapped short.
  const my = 7.35;
  brokenSpar(
    b,
    { x: 5.8, y: my + 1.25, z: MAIN.z + 1.0 },
    { x: -3.7, y: my - 0.95, z: MAIN.z - 0.6 },
    0.15,
    0.12,
    seg,
  );
  // The fore yard came down: half of it lies across the forecastle and over the starboard rail.
  brokenSpar(
    b,
    { x: 2.0, y: deckHeightAt(8.6) + 0.42, z: 9.4 },
    { x: -4.2, y: sheerHeightAt(6.2) + 0.1, z: 6.0 },
    0.15,
    0.12,
    seg,
  );
  // The fore topmast snapped just above the top: it hangs in its own rigging, the broken end down
  // on the starboard rail of the forecastle.
  brokenSpar(
    b,
    { x: 0.35, y: FORE.lowerTop + 1.1, z: FORE.z + 0.5 },
    { x: -3.1, y: sheerHeightAt(7.8) + 0.25, z: 7.8 },
    FORE.radius * 0.5,
    FORE.radius * 0.42,
    seg,
  );
  // The bowsprit's outer half, snapped off at the stem, hangs from its stays into the sea.
  const d = wreckDown({ x: 0, y: 0, z: 0 });
  const tip = {
    x: BOWSPRIT_END.x + d.x * 3.6 + 0.6,
    y: BOWSPRIT_END.y + d.y * 3.6,
    z: BOWSPRIT_END.z + d.z * 3.6 + 2.4,
  };
  brokenSpar(b, tip, { x: 0.25, y: BOWSPRIT_END.y - 0.15, z: BOWSPRIT_END.z + 0.35 }, 0.11, 0.15, seg);
}

/** Rope as a sagging (or hanging) tube: a parabola dropped along world-down, so it hangs true. */
class Ropes {
  readonly b = new MeshBuilder({ cylinderCaps: false });
  private readonly down = wreckDown({ x: 0, y: 0, z: 0 });
  constructor(
    private readonly sides: number,
    private readonly steps: number,
  ) {
    this.b.setRegion(4);
    this.b.setColor(0x231a12);
  }

  span(a: P3, c: P3, sag: number, radius = 0.035): void {
    let prev = a;
    for (let i = 1; i <= this.steps; i++) {
      const t = i / this.steps;
      const s = 4 * t * (1 - t) * sag;
      const p = {
        x: a.x + (c.x - a.x) * t + this.down.x * s,
        y: a.y + (c.y - a.y) * t + this.down.y * s,
        z: a.z + (c.z - a.z) * t + this.down.z * s,
      };
      this.b.addCylinderBetween(prev, p, radius, this.sides);
      prev = p;
    }
  }

  /** A loose end hanging `length` metres from `a`, with a lazy kink. */
  hang(a: P3, length: number, radius = 0.03): void {
    const d = this.down;
    const steps = Math.max(3, Math.round(this.steps / 2));
    let prev = a;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const kink = Math.sin(t * Math.PI) * 0.35;
      const p = {
        x: a.x + d.x * length * t + kink * 0.6,
        y: a.y + d.y * length * t,
        z: a.z + d.z * length * t + kink * 0.4,
      };
      this.b.addCylinderBetween(prev, p, radius, this.sides);
      prev = p;
    }
  }
}

function rigging(parts: Parts): BufferGeometry {
  const r = new Ropes(parts.rope.sides, parts.rope.steps);
  const lite = parts.hull === 'lite';
  // Between the mastheads, the way the reference's wreck reads from the shore: slack, sagging.
  r.span({ x: 0, y: MAIN_BREAK - 0.3, z: MAIN.z }, { x: 0, y: FORE_BREAK - 0.4, z: FORE.z }, 2.2, 0.045);
  r.span({ x: 0, y: MAIN.lowerTop + 0.3, z: MAIN.z }, { x: 0, y: FORE.lowerTop + 0.3, z: FORE.z }, 1.4, 0.04);
  // The forestay, parted from the jibboom, now sags to the snapped bowsprit's end.
  r.span({ x: 0, y: FORE_BREAK - 0.6, z: FORE.z }, BOWSPRIT_END, 2.8, 0.045);
  // What's left of the shrouds: one a side on each mast, slack (and slacker on the low side).
  for (const m of [FORE, MAIN]) {
    const top = m.id === 'main' ? 1.3 : 1.15;
    for (const side of [1, -1] as const) {
      if (lite && side < 0 && m.id === 'fore') continue;
      const z = m.z + 0.3 * side;
      const y = sheerHeightAt(z) + 0.15;
      r.span(
        { x: side * top * 0.95, y: m.lowerTop, z: m.z },
        { x: side * (halfBeamAt(z, y) + 0.1), y, z },
        side > 0 ? 0.6 : 1.6,
      );
    }
  }
  // Loose ends hanging off her low side, the long ones trailing in the sea.
  r.hang({ x: -1.1, y: FORE.lowerTop, z: FORE.z }, 11.5);
  r.hang({ x: -0.6, y: MAIN_BREAK - 0.6, z: MAIN.z }, 15.5);
  r.hang({ x: -3.7, y: 6.4, z: MAIN.z - 0.6 }, 6.4);
  r.hang(BOWSPRIT_END, 4.6);
  if (!lite) r.hang({ x: 5.6, y: 8.5, z: MAIN.z + 0.95 }, 4.6);
  return r.b.build();
}

/**
 * Rags of the main course still bent to the yard's high arm, and a scrap at the foretop: shredded
 * tatters of their own lengths, hanging plumb with a little belly.
 */
function rags(b: MeshBuilder, parts: Parts): void {
  b.setRegion(5);
  b.setColor(0x14120f);
  const d = wreckDown({ x: 0, y: 0, z: 0 });
  const rand = mulberry32(0x5eed);
  const rows = parts.hull === 'lite' ? 2 : 4;
  const tatters = (
    x0: number,
    x1: number,
    yAt: (x: number) => number,
    zAt: (x: number) => number,
    drop: number,
    count: number,
  ) => {
    for (let k = 0; k < count; k++) {
      const xa = x0 + ((x1 - x0) * (k + rand() * 0.25)) / count;
      const xb = xa + ((x1 - x0) / count) * (0.55 + rand() * 0.4);
      const len = drop * (0.35 + rand() * 0.65);
      const sway = (rand() - 0.5) * 0.5;
      const row: number[] = [];
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        // Narrowing to a torn point, swinging a little off plumb.
        const pinch = v * v * 0.45;
        for (const x of [xa + (xb - xa) * pinch, xb - (xb - xa) * pinch]) {
          const l = len * v;
          row.push(
            b.addVertex(
              x + d.x * l + sway * v,
              yAt(x) + d.y * l,
              zAt(x) + d.z * l + Math.sin(v * Math.PI) * 0.18,
            ),
          );
        }
      }
      for (let j = 0; j < rows; j++) {
        const a = row[j * 2]!,
          c = row[j * 2 + 1]!,
          e = row[j * 2 + 2]!,
          f = row[j * 2 + 3]!;
        b.indices.push(a, c, f, a, f, e);
      }
    }
  };
  // Along the cockbilled main yard (see rig): y and z at x.
  const yardY = (x: number) => 7.35 - 0.95 + ((x + 3.7) / 9.5) * 2.2 - 0.22;
  const yardZ = (x: number) => MAIN.z - 0.6 + ((x + 3.7) / 9.5) * 1.6 - 0.12;
  tatters(1.4, 4.6, yardY, yardZ, 3.0, parts.hull === 'lite' ? 2 : 4);
  tatters(
    -0.5,
    0.9,
    () => FORE.lowerTop - 0.05,
    () => FORE.z + 0.9,
    1.6,
    2,
  );
}

/**
 * Each hole's dark hold and the frames standing bare across it, plank ends snapped off into the
 * opening (pale raw wood, bent out where the sea pushed them), the broken bulwarks' stanchion stubs
 * and dangling cap rails, the open hatch's dark well, and loose planks on deck.
 */
function damageDetail(b: MeshBuilder, parts: Parts, holes: readonly Hole[]): void {
  const rand = mulberry32(0x57a7e);
  for (const h of holes) {
    const sx = h.side;
    b.setRegion(4);
    b.setColor(0x000000);
    b.addBox(sx * halfBeamAt(h.z, h.y) * 0.3, h.y, h.z, 0.05, Math.max(0.6, h.ry * 2.6), h.rz * 2.6);
    // The frames, bare across the opening, every half metre or so.
    b.setRegion(1);
    b.setColor(0x3a2c22);
    const frames = Math.max(1, Math.round((h.rz * 2) / 0.55));
    for (let k = 0; k < frames; k++) {
      const z = h.z + h.rz * (-0.85 + (1.7 * (k + 0.5)) / frames);
      const top = h.y + Math.max(0.3, h.ry * 1.1),
        bottom = h.y - Math.max(0.3, h.ry * 1.1);
      b.addCylinderBetween(
        { x: sx * (halfBeamAt(z, bottom) - 0.16), y: bottom, z },
        { x: sx * (halfBeamAt(z, top) - 0.16), y: top, z },
        0.08,
        4,
      );
    }
    if (h.slit) continue;
    b.setColor(0xd9b98e);
    for (let y = h.y - h.ry * 0.92; y < h.y + h.ry * 0.95; y += 0.23) {
      const span = h.rz * Math.sqrt(Math.max(0, 1 - ((y - h.y) / h.ry) ** 2));
      for (const end of [-1, 1]) {
        if (rand() < 0.2) continue;
        const z0 = h.z + end * span * 1.02;
        const len = 0.2 + rand() * 0.6;
        const z1 = z0 - end * len;
        const out = 0.04 + rand() * 0.22;
        const x0 = sx * (halfBeamAt(z0, y) + 0.015),
          x1 = sx * (halfBeamAt(z1, y) + out);
        const sag = rand() * 0.12;
        // A plank end: a thin slat, its broken end ragged (one corner longer than the other).
        b.addQuad(
          { x: x0, y: y - 0.1, z: z0 },
          { x: x1, y: y - 0.1 - sag, z: z1 + end * rand() * 0.15 },
          { x: x1, y: y + 0.1 - sag, z: z1 },
          { x: x0, y: y + 0.1, z: z0 },
        );
      }
    }
  }
  // Stumps of the bulwark stanchions all along the broken stretches, and a few cap-rail ends
  // torn loose and hanging down her side.
  b.setRegion(1);
  b.setColor(0xb08a62);
  const step = parts.hull === 'lite' ? 2.4 : 1.2;
  for (const side of [1, -1] as const) {
    for (let z = -10.6; z < 10.4; z += step) {
      const y = deckHeightAt(z);
      const x = side * (halfBeamAt(z, y + 0.3) - 0.12);
      if (!inRailGap(x * 1.05, y + 0.6, z)) continue;
      b.addCylinderBetween({ x, y, z }, { x, y: y + 0.25 + 0.4 * sinHash(z, x, 3), z }, 0.055, 4, {
        endRadius: 0.015,
      });
    }
    for (const z of side > 0 ? [-9.5, -1.0, 6.2] : [-4.5, 2.0]) {
      const sy = sheerHeightAt(z);
      const hb = halfBeamAt(z, sy);
      b.setColor(0x6a5240);
      b.addCylinderBetween(
        { x: side * hb, y: sy + 0.05, z },
        { x: side * (hb + 0.3), y: sy - 1.4, z: z + 1.0 },
        0.07,
        4,
      );
      b.setColor(0xb08a62);
    }
  }
  if (parts.deck) {
    b.setRegion(4);
    b.setColor(0x000000);
    const hz = (HATCH.z0 + HATCH.z1) / 2;
    b.addBox(0, deckHeightAt(hz) - 0.9, hz, HATCH.x * 2.2, 0.05, HATCH.z1 - HATCH.z0 + 0.3);
  }
  // Loose planks and a spar end washed about the deck.
  b.setRegion(1);
  b.setColor(0x9a7a5c);
  for (const [x0, z0, x1, z1] of [
    [-1.6, -3.4, 0.4, -2.2],
    [0.9, -0.6, -0.8, 1.4],
    [-2.1, 5.6, -0.6, 7.2],
    [1.4, -9.6, -0.2, -8.4],
  ] as const) {
    const y0 = deckHeightAt(z0) + 0.06,
      y1 = deckHeightAt(z1) + 0.12;
    b.addBeamBetween({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, 0.24, 0.05);
  }
}

/** Her atlas's rows (v, bottom up) and how heights map into them. */
const ATLAS = {
  w: 256,
  h: 1024,
  /** Rust swatch for her ironwork. */
  rust: 0.015,
  /** The waterline band: under the water, weed, hanging weed and barnacles, the tide stain. */
  under: 0.06,
  weed: 0.15,
  crust: 0.27,
  stain: 0.34,
  bandTop: 0.4,
  /** v = waterline + perMetre × height above the sea, within the band. */
  waterline: 0.19,
  perMetre: 0.12,
  /** Weathered grey timber without seams (spars, deck, fittings). */
  plain: 0.5,
  /** Her hull planking: strakes run along u, v from her own (ship-local) height. */
  planks: 0.6,
  plankTop: 0.99,
} as const;
/** Above this height (m, with the wander), timber leaves the waterline band for plain or planks. */
const BAND_TOP_M = (ATLAS.stain + 0.02 - ATLAS.waterline) / ATLAS.perMetre;
/** Ship-local heights her planking spans (keel to rail), mapped onto the plank rows. */
const PLANK_Y0 = -2.7,
  PLANK_Y1 = 5.3;

/**
 * Her "label": the ship material draws its name-board region (7) from a ship's own label texture,
 * so the wreck's carries her whole weathered look instead (same shader, its own texture). A small
 * generated atlas, no asset: u runs along the grain (repeating); v bottom-up is a rust swatch, then
 * by height above the sea dark growth, a green-brown weed band with barnacle crust and a tide
 * stain, then seamless weathered grey for spars and deck, then sun-bleached grey hull planking with
 * seams, butt joints, darker patches and faint traces of the raiders' slate paint.
 */
function wreckAtlas(): ShipLabel {
  const { w, h } = ATLAS;
  const data = new Uint8Array(w * h * 4);
  const rand = mulberry32(0xd71f7);
  const butts = Array.from({ length: 64 }, () => [rand(), rand(), rand()]);
  // Wrap-safe along u: whole-period sines.
  const wave = (u: number, k: number, ph: number) => Math.sin((u * k + ph) * Math.PI * 2);
  // Clumped noise (blocks of a few texels), so barnacles and blotches read as patches, not salt.
  const clump = (i: number, j: number, size: number, salt: number) =>
    sinHash(Math.floor(i / size) % Math.floor(w / size), Math.floor(j / size), salt);
  const plankStrake = (ATLAS.plankTop - ATLAS.planks) / ((PLANK_Y1 - PLANK_Y0) / 0.25);
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const grain = 0.5 + 0.3 * wave(u, 7, v * 13) * wave(u, 3, v * 5.1) + 0.2 * wave(u, 19, v * 31);
      let r: number, g: number, b: number;
      if (v < 0.03) {
        const t = 0.7 + 0.3 * clump(i, j, 3, 4) + 0.15 * wave(u, 5, 0);
        r = 120 * t;
        g = 62 * t;
        b = 30 * t;
      } else if (v < ATLAS.weed) {
        const k = 0.75 + 0.3 * clump(i, j, 4, 5);
        r = 16 * k;
        g = 30 * k;
        b = 20 * k;
      } else if (v < ATLAS.crust) {
        // Weed hangs in strands (varying along u); barnacles crust in clumps.
        const t = (v - ATLAS.weed) / (ATLAS.crust - ATLAS.weed);
        const strand = 0.6 + 0.2 * wave(u, 13, 0.2) + 0.2 * wave(u, 29, 0.7);
        r = (58 + 46 * t) * strand;
        g = (96 + 22 * t) * strand;
        b = (30 + 14 * t) * strand;
        // Barnacle crust: clumps, thicker low down, grey-white rather than paper white.
        const barnacle = clump(i, j, 4, 7) * 0.7 + clump(i, j, 2, 8) * 0.3;
        if (barnacle > 0.8 + 0.12 * t) {
          const shade = 0.75 + 0.25 * sinHash(i, j, 8);
          r = 132 * shade;
          g = 128 * shade;
          b = 112 * shade;
        }
      } else if (v < ATLAS.bandTop) {
        const t = (v - ATLAS.crust) / (ATLAS.bandTop - ATLAS.crust);
        const k = 0.8 + 0.3 * grain;
        r = (76 + 64 * t) * k;
        g = (70 + 58 * t) * k;
        b = (52 + 54 * t) * k;
      } else if (v < ATLAS.planks) {
        const k = 0.72 + 0.4 * grain;
        r = 142 * k;
        g = 132 * k;
        b = 114 * k;
      } else {
        const sv = (v - ATLAS.planks) / plankStrake;
        const strake = Math.floor(sv);
        const f = sv - strake;
        const seam = f < 0.12 ? 0.5 : f > 0.9 ? 0.85 : 1;
        const bj = butts[strake % butts.length]!;
        let butt = 1;
        for (const x of bj) if (Math.abs(u - x) < 0.0045) butt = 0.55;
        const tone = 0.82 + 0.26 * sinHash(strake, 1, 9);
        const patch = clump(i, j, 16, 11) * 0.5 + 0.5 * (0.5 + 0.5 * wave(u, 2, strake * 0.37));
        const dark = patch < 0.3 ? 0.62 : patch < 0.38 ? 0.8 : 1;
        const k = (0.74 + 0.36 * grain) * seam * butt * tone * dark;
        r = 158 * k;
        g = 146 * k;
        b = 124 * k;
        if (patch > 0.9) {
          r = r * 0.55 + 52 * 0.45;
          g = g * 0.55 + 66 * 0.45;
          b = b * 0.55 + 78 * 0.45;
        }
      }
      const o = (j * w + i) * 4;
      data[o] = Math.max(0, Math.min(255, r));
      data[o + 1] = Math.max(0, Math.min(255, g));
      data[o + 2] = Math.max(0, Math.min(255, b));
      data[o + 3] = 255;
    }
  }
  const texture = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, canvas: null, name: '', release: () => {} };
}

const wp = { x: 0, y: 0, z: 0 };

/** Rust run down her planking (0…1) from each gunport's hinges and from the chain plates. */
function rustAt(x: number, y: number, z: number): number {
  if (Math.abs(x) < 1.5) return 0;
  let r = 0;
  for (const pz of PORT_Z)
    for (const off of [-0.32, 0.3]) {
      const dz = Math.abs(z - pz - off);
      if (dz > 0.17 || y > 1.15 || y < -0.3) continue;
      r = Math.max(r, (1 - dz / 0.17) * smoothstep(-0.3, 1.0, y));
    }
  for (const m of [FORE, MAIN, MIZZEN])
    for (const off of [-0.7, 0, 0.7]) {
      const z0 = m.z + off;
      const dz = Math.abs(z - z0);
      const top = sheerHeightAt(z0) - 0.35;
      if (dz > 0.17 || y > top || y < top - 1.9) continue;
      r = Math.max(r, (1 - dz / 0.17) * (1 - (top - y) / 1.9));
    }
  return r;
}

const ROPE = [0x23 / 255, 0x1a / 255, 0x12 / 255] as const;

/**
 * Ages the merged wreck (no new shader): every timber and iron part moves to the ship material's
 * label region (7), which samples her atlas (wreckAtlas). Timber's v comes from its height above
 * the sea (so the weed band, the barnacles and the tide stain sit at the real waterline, ragged)
 * and its u runs along the grain; ironwork samples the rust swatch. Vertex colour then darkens
 * blotches and runs orange-brown rust streaks down her sides from the gunport hinges and chain
 * plates. Ropes, the holes' dark backing and the rags keep their own looks.
 */
function weather(geometry: BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  const col = geometry.getAttribute('color') as BufferAttribute;
  const reg = geometry.getAttribute('shipRegion') as BufferAttribute;
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i),
      ly = pos.getY(i),
      lz = pos.getZ(i);
    const region = Math.round(reg.getX(i));
    const r0 = col.getX(i),
      g0 = col.getY(i),
      b0 = col.getZ(i);
    if (region === 5) continue;
    if (region === 4) {
      const black = r0 + g0 + b0 < 0.1;
      const rope = Math.abs(r0 - ROPE[0]) + Math.abs(g0 - ROPE[1]) + Math.abs(b0 - ROPE[2]) < 0.01;
      if (black || rope) continue;
      // The black boot-top along her waterline is planking, not iron: it weathers with the hull.
      const bootTop = ly < 0.3 && Math.abs(lx) > waterlineHalfBeamAt(lz) - 0.05;
      if (!bootTop) {
        reg.setX(i, 7);
        uv.setXY(i, lz * 0.37 + ly * 0.29 + lx * 0.23, ATLAS.rust);
        col.setXYZ(i, 0.8, 0.8, 0.8);
        continue;
      }
    }
    wreckToWorld(lx, ly, lz, wp);
    const wander = 0.22 * Math.sin(wp.x * 1.3 + wp.z * 0.8) + 0.12 * Math.sin(wp.z * 2.7 - wp.x * 0.6);
    const above = wp.y + wander;
    let v: number;
    if (above < BAND_TOP_M) v = Math.max(0.035, ATLAS.waterline + ATLAS.perMetre * above);
    else if (region === 0)
      v =
        ATLAS.planks +
        (ATLAS.plankTop - ATLAS.planks) * Math.min(1, Math.max(0, (ly - PLANK_Y0) / (PLANK_Y1 - PLANK_Y0)));
    else v = ATLAS.plain;
    reg.setX(i, 7);
    uv.setXY(i, (lz + lx * 0.35 + (region === 0 ? 0 : ly * 0.6)) * 0.085, v);
    // Darker for timber authored dark (the frames in the holes, the cap-rail ends), lighter bleach
    // on her high side, and rust runs down her planking.
    const authored = (r0 + g0 + b0) / 3;
    let k = authored < 0.2 ? 0.45 : 0.92 + 0.12 * sinHash(wp.x * 0.31, wp.z * 0.27, 5);
    if (above > BAND_TOP_M && lx > 0) k = Math.min(1, k * 1.06);
    let r = k,
      g = k,
      b = k;
    const rust = above > 0.6 ? rustAt(lx, ly, lz) : 0;
    if (rust > 0) {
      r = r + (1 - r) * rust;
      g = g * (1 - 0.5 * rust);
      b = b * (1 - rust);
    }
    col.setXYZ(i, r, g, b);
  }
  col.needsUpdate = true;
  reg.needsUpdate = true;
  uv.needsUpdate = true;
}

/** The wreck's world placement as a matrix (her local frame is the ship's). */
function wreckMatrix(out: Matrix4): Matrix4 {
  return out.compose(
    new Vector3(W.x, W.y, W.z),
    new Quaternion().setFromEuler(new Euler(W.pitch, W.heading, W.heel, 'YXZ')),
    new Vector3(1, 1, 1),
  );
}

/**
 * Where the sea meets her hull, as a closed loop in plan (world x, z), for the coast foam's wash
 * ribbon: the outermost point where her hull's triangles cross sea level, in each of 56 bearings
 * round her middle.
 */
export function wreckWaterline(): { x: number; z: number }[] {
  const hull = createHullGeometry('medium');
  const p = hull.getAttribute('position');
  const index = hull.getIndex()!;
  const bins = 56;
  const best: ({ x: number; z: number; d: number } | null)[] = new Array(bins).fill(null);
  const a = { x: 0, y: 0, z: 0 },
    b = { x: 0, y: 0, z: 0 };
  const centre = wreckToWorld(0, 0, 0, { x: 0, y: 0, z: 0 });
  const edge = (i: number, j: number) => {
    wreckToWorld(p.getX(i), p.getY(i), p.getZ(i), a);
    wreckToWorld(p.getX(j), p.getY(j), p.getZ(j), b);
    if (a.y > 0 === b.y > 0) return;
    const t = a.y / (a.y - b.y);
    const x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t;
    const ang = Math.atan2(z - centre.z, x - centre.x);
    const k = Math.min(bins - 1, Math.floor(((ang + Math.PI) / (Math.PI * 2)) * bins));
    const d = Math.hypot(x - centre.x, z - centre.z);
    if (!best[k] || d > best[k]!.d) best[k] = { x, z, d };
  };
  for (let i = 0; i + 2 < index.count; i += 3) {
    const i0 = index.getX(i),
      i1 = index.getX(i + 1),
      i2 = index.getX(i + 2);
    edge(i0, i1);
    edge(i1, i2);
    edge(i2, i0);
  }
  hull.dispose();
  return best.filter((v): v is { x: number; z: number; d: number } => !!v).map(({ x, z }) => ({ x, z }));
}

/** Builds the wreck for a tier (one mesh, the ship's material) with its obstacles and blockers. */
export function createWreck(tier: Tier): WreckSystem {
  const steps = createWreckSteps(tier);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * `createWreck`, yielding between its parts (the hull, the deck, the trim, the rig, the merge, the
 * weathering and the atlas): built at once, she held a frame for ~70 ms while the cabin played.
 */
export function* createWreckSteps(tier: Tier): Generator<void, WreckSystem, void> {
  const parts = partsFor(tier);
  const hull = createHullGeometry(parts.hull);
  const hullPositions = (hull.getAttribute('position').array as Float32Array).slice();
  const holes = parts.hull === 'lite' ? HOLES.filter((h) => !h.slit) : HOLES;
  const damaged = damagedBy(holes);
  yield;
  dropTriangles(hull, damaged);
  const pieces: BufferGeometry[] = [hull];
  const extra = new MeshBuilder();
  yield;
  if (parts.deck) {
    const deck = createDeckGeometry(parts.deck);
    dropTriangles(deck, (x, y, z) => inRailGap(x, y, z) || inHatch(x, y, z));
    pieces.push(deck);
  } else plainDeck(extra);
  yield;
  if (parts.trim) {
    const trim = createTrimGeometry(parts.trim);
    dropTriangles(trim, damaged);
    pieces.push(trim);
  }
  if (parts.gold) pieces.push(createSternGoldGeometry());
  yield;
  rig(extra, parts, pieces);
  rags(extra, parts);
  damageDetail(extra, parts, holes);
  yield;
  pieces.push(extra.build(), rigging(parts));
  yield;

  const matrix = wreckMatrix(new Matrix4());

  const geometry = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!geometry) throw new Error('wreck: parts did not merge');
  yield;
  weather(geometry);
  geometry.computeBoundingSphere();
  yield;

  const label = wreckAtlas();
  const material = makeShipMaterial(label, uniform(1), uniform(0), uniform(0));
  const mesh = new Mesh(geometry, material);
  mesh.name = 'anchorage-wreck';
  mesh.matrixAutoUpdate = false;
  matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.matrix.copy(matrix);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const cameraBlockers: CameraBlockerBox[] = [];
  meshCameraBlockers(hullPositions, matrix, cameraBlockers, 3, -0.5);
  const perch = (x: number, y: number, z: number) => {
    wreckToWorld(x, y, z, wp);
    return new Vector3(wp.x, wp.y, wp.z);
  };
  const index = geometry.getIndex();
  return {
    mesh,
    shipObstacles: wreckShipObstacles(),
    cameraBlockers,
    perches: [
      perch(0, FORE_BREAK + 0.05, FORE.z),
      perch(0, MAIN_BREAK + 0.05, MAIN.z),
      perch(0, BOWSPRIT_END.y + 0.17, BOWSPRIT_END.z - 0.3),
    ],
    triangleCount: index ? index.count / 3 : 0,
    dispose() {
      geometry.dispose();
      material.dispose();
      label.texture.dispose();
    },
  };
}
