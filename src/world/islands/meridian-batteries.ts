import type { BatteryDeck, ShoreBattery } from '../village/shore-battery';
import { CANNON } from '../village/shore-cannon';
import { MERIDIAN } from './meridian';

/**
 * Port Meridian's shore batteries (Dan: cannons at strategic spots). The harbour mouth opens to the
 * south-east between the mole's lighthouse and the head of the east arm: a pair of guns on each
 * covers the approach and crosses its fire over the mouth. Above them the citadel's south rampart
 * commands the whole harbour: three guns on a raised stone terreplein behind the curtain wall, their
 * barrels run out through embrasures cut in the parapet between the merlons.
 */

/**
 * The citadel's curtain wall (meridian-town's `addCurtainWall`: an ellipse round the citadel pad of
 * radii 0.78 and 0.68 × 39 m, 1.55 m thick, 3.15 m over the courtyard at 40 m).
 */
export const CITADEL_WALL = {
  x: MERIDIAN.pads.citadel.x,
  z: MERIDIAN.pads.citadel.z,
  rx: 39 * 0.78,
  rz: 39 * 0.68,
  thickness: 1.55,
  floor: MERIDIAN.pads.citadel.height,
  top: MERIDIAN.pads.citadel.height + 3.15,
} as const;

/**
 * The rampart's planks: a gunner's height under the wall top, so the parapet covers the crew. Each
 * barrel runs out through an embrasure: a 1.1 m throat on the inner face splaying to a 2 m mouth on
 * the outer one, its sill sloping down toward the sea under the barrel.
 */
const RAMPART_TOP = CITADEL_WALL.floor + 1.85;
const EMBRASURE = { throat: 0.55, mouth: 1.0, sillIn: 2.2, sillOut: 1.9 } as const;
const RAMPART_DEPTH = 3.6;
const RAMPART_WIDTH = 3.4;

/** A point on the wall's centre line at angle `a` (degrees, from +x toward +z) and its outward normal. */
function wallAt(a: number): { x: number; z: number; nx: number; nz: number } {
  const t = (a * Math.PI) / 180;
  const { x, z, rx, rz } = CITADEL_WALL;
  const gx = Math.cos(t) / rx;
  const gz = Math.sin(t) / rz;
  const len = Math.hypot(gx, gz);
  return { x: x + rx * Math.cos(t), z: z + rz * Math.sin(t), nx: gx / len, nz: gz / len };
}

/** `inset` metres in from the wall's centre line at angle `a`. */
function inside(a: number, inset: number): { x: number; z: number } {
  const w = wallAt(a);
  return { x: w.x - w.nx * inset, z: w.z - w.nz * inset };
}

function outward(a: number): number {
  const w = wallAt(a);
  return Math.atan2(w.nx, w.nz);
}

/** The guns stand in the middle of the crenels (the merlons are every 18°, from 0°). */
const CITADEL_GUNS = [99, 117, 135] as const;

/**
 * An embrasure in the curtain wall: its centre on the wall's ellipse (radians), the half-widths of
 * its throat (inner face) and mouth (outer face) as angles, and its sill's heights over the courtyard
 * at each face.
 */
export interface Embrasure {
  angle: number;
  halfIn: number;
  halfOut: number;
  sillIn: number;
  sillOut: number;
}

const WALL_RADIUS = (CITADEL_WALL.rx + CITADEL_WALL.rz) / 2;

/** The citadel wall's embrasures, one in front of each rampart gun (meridian-town cuts them). */
export const CITADEL_EMBRASURES: readonly Embrasure[] = CITADEL_GUNS.map((a) => ({
  angle: (a * Math.PI) / 180,
  halfIn: EMBRASURE.throat / WALL_RADIUS,
  halfOut: EMBRASURE.mouth / WALL_RADIUS,
  sillIn: EMBRASURE.sillIn,
  sillOut: EMBRASURE.sillOut,
}));

function rampartDecks(): BatteryDeck[] {
  const decks: BatteryDeck[] = CITADEL_GUNS.map((a) => ({
    ...inside(a, CITADEL_WALL.thickness / 2 + 0.05 + RAMPART_DEPTH / 2),
    heading: outward(a),
    width: RAMPART_WIDTH,
    depth: RAMPART_DEPTH,
    top: RAMPART_TOP,
    kind: 'stone',
    base: CITADEL_WALL.floor - 0.1,
    parapet: true,
  }));
  // The rampart walk between the gun platforms, its planks a hair lower where they overlap.
  for (let i = 0; i < CITADEL_GUNS.length - 1; i++) {
    const a = decks[i]!,
      b = decks[i + 1]!;
    decks.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      heading: outward((CITADEL_GUNS[i]! + CITADEL_GUNS[i + 1]!) / 2),
      width: Math.hypot(b.x - a.x, b.z - a.z) - RAMPART_WIDTH + 0.8,
      depth: RAMPART_DEPTH,
      top: RAMPART_TOP - 0.012,
      kind: 'stone',
      base: CITADEL_WALL.floor - 0.1,
      parapet: true,
    });
  }
  return decks;
}

/** Steps up from the courtyard to the rampart walk, between the first two guns. */
const STAIR_RUN = 2.0;
const STAIR_AT = (CITADEL_GUNS[0] + CITADEL_GUNS[1]) / 2;

const MOLE_LIGHT = MERIDIAN.mole.lighthouse;
/** The mole head's platform: its stone drum's top (the walk height is the mole's, under it). */
const MOLE_PLATFORM = MERIDIAN.mole.height + 0.32;
/** The east arm's paving top. */
const ARM_PAVING = MERIDIAN.harbor.quay.height + 0.08;
const PLANKED = 0.12;

function onMoleHead(heading: number, r: number): { x: number; z: number; heading: number } {
  return {
    x: MOLE_LIGHT.x + Math.sin(heading) * r,
    z: MOLE_LIGHT.z + Math.cos(heading) * r,
    heading,
  };
}

/** A timber platform under a gun on stone paving, a little longer behind it than in front. */
function platformUnder(g: { x: number; z: number; heading: number }, top: number): BatteryDeck {
  return {
    x: g.x - Math.sin(g.heading) * 0.1,
    z: g.z - Math.cos(g.heading) * 0.1,
    heading: g.heading,
    width: 2.4,
    depth: 3.2,
    top,
    kind: 'planks',
  };
}

const MOLE_GUNS = [onMoleHead(0.75, 7.6), onMoleHead(1.35, 7.6)];
const ARM = MERIDIAN.harbor.eastArm;
const ARM_GUNS = [
  { x: ARM.x0 + 5.0, z: ARM.z1 - 4.2, heading: -0.6 },
  { x: ARM.x0 + 11.0, z: ARM.z1 - 4.2, heading: -0.25 },
];

export const MERIDIAN_BATTERIES: readonly ShoreBattery[] = [
  {
    id: 'citadel-rampart',
    // Each carriage's front 5 cm off the wall, its muzzle run out past the embrasure's throat.
    guns: CITADEL_GUNS.map((a) => ({
      ...inside(a, CITADEL_WALL.thickness / 2 + 0.05 + CANNON.carriageZ1),
      heading: outward(a),
    })),
    decks: rampartDecks(),
    stairs: [
      {
        ...inside(STAIR_AT, CITADEL_WALL.thickness / 2 + 0.05 + RAMPART_DEPTH + STAIR_RUN - 0.3),
        heading: outward(STAIR_AT),
        width: 1.8,
        run: STAIR_RUN,
        bottom: CITADEL_WALL.floor,
        top: RAMPART_TOP,
      },
    ],
    props: [
      ...CITADEL_GUNS.map((a) => {
        const p = inside(a, CITADEL_WALL.thickness / 2 + 0.05 + 2.3);
        const h = outward(a);
        return { kind: 'shot' as const, x: p.x + Math.cos(h) * 1.15, z: p.z - Math.sin(h) * 1.15 };
      }),
      {
        kind: 'chest',
        ...inside((CITADEL_GUNS[1] + CITADEL_GUNS[2]) / 2, CITADEL_WALL.thickness / 2 + 0.05 + 2.6),
        heading: outward((CITADEL_GUNS[1] + CITADEL_GUNS[2]) / 2),
      },
    ],
  },
  {
    id: 'mole-head',
    guns: MOLE_GUNS,
    decks: MOLE_GUNS.map((g) => platformUnder(g, MOLE_PLATFORM + PLANKED)),
    props: [{ kind: 'shot', ...onMoleHead(1.05, 7.0), y: MOLE_PLATFORM }],
  },
  {
    id: 'east-arm-head',
    guns: ARM_GUNS,
    decks: ARM_GUNS.map((g) => platformUnder(g, ARM_PAVING + PLANKED)),
    props: [
      { kind: 'shot', x: ARM.x0 + 8.0, z: ARM.z1 - 5.6, y: ARM_PAVING },
      { kind: 'chest', x: ARM.x0 + 8.0, z: ARM.z1 - 7.4, heading: Math.PI / 2, y: ARM_PAVING },
    ],
  },
];
