import type { HeightField } from '../contracts';

type Ground = Pick<HeightField, 'heightAt'>;
import { MERIDIAN } from '../islands/meridian';
import { COPING, SANDSTONE, SANDSTONE_DARK, addBox, type Buckets, type PlazaColliders } from './plaza-kit';
import { addPlantOn, addPottedPlant, type PottedKind } from './plaza-plants';
import { addIvy } from './plaza-dressing';

/**
 * The plaza's rim (the concept's upper-left): the bare banks that rose from the paving to the first
 * terrace are held by stone terrace walls with a coping, stepping down the plaza's sides, planted on
 * top, and a pair of stairs with stone cheeks climbs either side of the clock tower to a landing on
 * the terrace lane, a planted bed between them behind the tower. Pure layout (shared with the town's
 * walk and planting rules), then geometry into the town's buckets.
 */
const PLAZA_Y: number = MERIDIAN.pads.plaza.height;
const LANE_Y = 10.8;

export interface RimWall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** The terrace's level (the wall's top, under its coping). */
  top: number;
}

/** The walls' plaza-side faces, west side then east, from the stairs outward. */
export const RIM_WALLS: readonly RimWall[] = [
  { ax: 657.0, az: -825.2, bx: 649.6, bz: -821.6, top: 10.9 },
  { ax: 649.6, az: -821.6, bx: 645.2, bz: -816.6, top: 10.2 },
  { ax: 645.2, az: -816.6, bx: 642.8, bz: -810.2, top: 9.0 },
  { ax: 679.0, az: -825.2, bx: 686.4, bz: -821.6, top: 10.9 },
  { ax: 686.4, az: -821.6, bx: 690.8, bz: -816.6, top: 10.2 },
  { ax: 690.8, az: -816.6, bx: 693.2, bz: -810.2, top: 9.0 },
];

/** Trees on the walls' terraces (vegetation species), a little back from each coping. */
const RIM_TREES: readonly (readonly [
  number,
  number,
  'palmTall' | 'palmYoung' | 'banana' | 'cypress',
  number,
][])[] = [
  [
    [0.28, 1.3, 'palmTall', 0.95],
    [0.78, 1.1, 'banana', 0.75],
  ],
  [[0.5, 1.2, 'cypress', 0.9]],
  [[0.6, 1.0, 'banana', 0.7]],
  [
    [0.3, 1.1, 'banana', 0.72],
    [0.75, 1.3, 'palmYoung', 1.0],
  ],
  [[0.5, 1.2, 'cypress', 0.95]],
  [[0.45, 1.2, 'palmTall', 0.85]],
];

export const RIM_PLANTS: readonly {
  species: 'palmTall' | 'palmYoung' | 'banana' | 'cypress';
  x: number;
  y: number;
  z: number;
  scale: number;
}[] = RIM_WALLS.flatMap((wall, i) => {
  const dx = wall.bx - wall.ax;
  const dz = wall.bz - wall.az;
  const len = Math.hypot(dx, dz);
  let bx = -dz / len;
  let bz = dx / len;
  if (((wall.ax + wall.bx) * 0.5 - 668) * bx + ((wall.az + wall.bz) * 0.5 + 800) * bz < 0) {
    bx = -bx;
    bz = -bz;
  }
  return RIM_TREES[i]!.map(([t, back, species, scale]) => ({
    species,
    x: wall.ax + dx * t + bx * back,
    y: wall.top + 0.1,
    z: wall.az + dz * t + bz * back,
    scale,
  }));
});

export interface RimFlight {
  x: number;
  width: number;
  /** The bottom step's front edge, then the top step's back edge. */
  z0: number;
  z1: number;
  steps: number;
}

/** The two stairs either side of the clock tower, plaza to terrace lane. */
export const RIM_FLIGHTS: readonly RimFlight[] = [
  { x: 660.0, width: 4.8, z0: -824.6, z1: -832.6, steps: 10 },
  { x: 676.0, width: 4.8, z0: -824.6, z1: -832.6, steps: 10 },
];

/** The landing at the stairs' tops (on to the terrace lane), and the planted bed behind the tower. */
export const RIM_LANDING = { x0: 657.0, x1: 679.0, z0: -837.8, z1: -832.6 } as const;
export const RIM_BED = { x0: 663.0, x1: 673.0, z0: -832.6, z1: -829.45, top: 10.35 } as const;

const CHEEK = 0.6;

interface WallFrame {
  wall: RimWall;
  len: number;
  /** Along the face (unit), and back from it, away from the plaza (unit). */
  ux: number;
  uz: number;
  bx: number;
  bz: number;
  rot: number;
  depth: number;
  base: number;
}

function frame(wall: RimWall, heightField: Ground): WallFrame {
  const dx = wall.bx - wall.ax;
  const dz = wall.bz - wall.az;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  // The perpendicular pointing away from the plaza's middle.
  let bx = -uz;
  let bz = ux;
  const mx = (wall.ax + wall.bx) * 0.5;
  const mz = (wall.az + wall.bz) * 0.5;
  if ((mx - 668) * bx + (mz + 800) * bz < 0) {
    bx = -bx;
    bz = -bz;
  }
  // Back until the bank reaches the terrace (most of the way along), at most 7 m.
  let depth = 2;
  for (; depth < 7; depth += 0.5) {
    let high = 0;
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      const h = heightField.heightAt(wall.ax + dx * t + bx * depth, wall.az + dz * t + bz * depth);
      if (h >= wall.top - 0.35) high += 1;
    }
    if (high >= 4) break;
  }
  let base = Infinity;
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    base = Math.min(base, heightField.heightAt(wall.ax + dx * t, wall.az + dz * t));
  }
  return { wall, len, ux, uz, bx, bz, rot: Math.atan2(-uz, ux), depth, base: Math.min(base, PLAZA_Y) - 0.3 };
}

/** Each flight's step tops: even risers, raised where the bank under a step stands higher. */
function flightTops(f: RimFlight, heightField: Ground): number[] {
  const tread = (f.z0 - f.z1) / f.steps;
  const rise = (LANE_Y - PLAZA_Y) / f.steps;
  const tops: number[] = [];
  let last = PLAZA_Y;
  for (let i = 0; i < f.steps; i += 1) {
    let ground = -Infinity;
    for (const ox of [-0.5, 0, 0.5])
      for (const oz of [0, 0.5, 1]) {
        ground = Math.max(ground, heightField.heightAt(f.x + ox * f.width, f.z0 - tread * (i + oz)));
      }
    const top = Math.min(LANE_Y, Math.max(PLAZA_Y + rise * (i + 1), ground + 0.08, last + 0.12));
    tops.push(top);
    last = top;
  }
  return tops;
}

export interface PlazaRim {
  /** The walk height on the stairs and the landing, or null. */
  walkable(x: number, z: number): number | null;
}

/** The rim's walk surfaces (the stairs and their landing), from the same layout the geometry uses. */
export function plazaRimWalk(heightField: Ground): PlazaRim {
  const flights = RIM_FLIGHTS.map((f) => ({
    f,
    tops: flightTops(f, heightField),
    tread: (f.z0 - f.z1) / f.steps,
  }));
  return {
    walkable(x, z) {
      for (const { f, tops, tread } of flights) {
        if (Math.abs(x - f.x) > f.width * 0.5) continue;
        if (z > f.z0 + 0.3 || z < f.z1) continue;
        const i = Math.floor((f.z0 - z) / tread);
        return i < 0 ? PLAZA_Y : tops[Math.min(i, tops.length - 1)]!;
      }
      if (x >= RIM_LANDING.x0 && x <= RIM_LANDING.x1 && z >= RIM_LANDING.z0 && z <= RIM_LANDING.z1)
        return LANE_Y;
      return null;
    },
  };
}

const framesFor = new WeakMap<Ground, WallFrame[]>();

function frames(heightField: Ground): WallFrame[] {
  let list = framesFor.get(heightField);
  if (!list) {
    list = RIM_WALLS.map((wall) => frame(wall, heightField));
    framesFor.set(heightField, list);
  }
  return list;
}

/** True inside a rim wall's terrace, a stair or the bed (kept clear of the town's random planting). */
export function inPlazaRim(x: number, z: number, pad: number, heightField: Ground): boolean {
  if (x < 630 || x > 706 || z > -800 || z < -845) return false;
  for (const w of frames(heightField)) {
    const wall = w.wall;
    const px = x - wall.ax;
    const pz = z - wall.az;
    const along = px * w.ux + pz * w.uz;
    const back = px * w.bx + pz * w.bz;
    if (along > -pad && along < w.len + pad && back > -pad - 0.4 && back < w.depth + pad) return true;
  }
  for (const f of RIM_FLIGHTS)
    if (Math.abs(x - f.x) < f.width * 0.5 + CHEEK + pad && z < f.z0 + pad && z > f.z1 - pad) return true;
  if (x > RIM_BED.x0 - pad && x < RIM_BED.x1 + pad && z > RIM_BED.z0 - pad && z < RIM_BED.z1 + pad)
    return true;
  const l = RIM_LANDING;
  return x > l.x0 - pad && x < l.x1 + pad && z > l.z0 - pad && z < l.z1 + pad;
}

/** Builds the rim into the town's buckets, with its walls (walkers) and camera boxes. */
export function addPlazaRim(
  b: Buckets,
  colliders: PlazaColliders,
  heightField: Ground,
  detail: 'lite' | 'medium' | 'full',
): void {
  const full = detail === 'full';
  const potDetail = detail === 'lite' ? 'lite' : 'full';
  let seed = 31;
  for (const w of frames(heightField)) {
    const wall = w.wall;
    const { len, depth, base, rot } = w;
    const h = wall.top - base;
    const mid = { x: (wall.ax + wall.bx) * 0.5, z: (wall.az + wall.bz) * 0.5 };
    const centre = { x: mid.x + w.bx * depth * 0.5, z: mid.z + w.bz * depth * 0.5 };
    // The terrace block (its face is the wall), a plinth along its foot, a coping along its top.
    addBox(b, 'stone', centre.x, base, centre.z, len + 0.5, h, depth, rot, SANDSTONE);
    addBox(
      b,
      'stone',
      mid.x - w.bx * 0.1,
      base,
      mid.z - w.bz * 0.1,
      len + 0.6,
      PLAZA_Y - base + 0.45,
      0.3,
      rot,
      SANDSTONE_DARK,
    );
    addBox(
      b,
      'stone',
      mid.x - w.bx * 0.08,
      wall.top - 0.04,
      mid.z - w.bz * 0.08,
      len + 0.7,
      0.24,
      0.62,
      rot,
      COPING,
    );
    // The terrace's soil, a hand below the coping.
    addBox(
      b,
      'cloth',
      centre.x + w.bx * 0.25,
      wall.top,
      centre.z + w.bz * 0.25,
      len + 0.3,
      0.1,
      depth - 0.6,
      rot,
      0x5e4a2a,
    );
    // Pilasters (buttresses) along the face break up its length.
    if (detail !== 'lite') {
      const n = Math.max(1, Math.floor(len / 3.6));
      for (let i = 1; i < n; i += 1) {
        const t = i / n;
        const px = wall.ax + (wall.bx - wall.ax) * t - w.bx * 0.18;
        const pz = wall.az + (wall.bz - wall.az) * t - w.bz * 0.18;
        addBox(b, 'stone', px, base, pz, 0.62, wall.top - base - 0.05, 0.36, rot, SANDSTONE_DARK);
      }
    }
    // Ivy trailing down the face from the top, and the terrace's plants.
    if (full) {
      for (let i = 0; i < 2; i += 1) {
        const t = 0.25 + i * 0.45 + ((seed * 7) % 10) * 0.01;
        const ix = wall.ax + (wall.bx - wall.ax) * t - w.bx * 0.02;
        const iz = wall.az + (wall.bz - wall.az) * t - w.bz * 0.02;
        addIvy(
          b,
          ix,
          wall.top + 0.05,
          iz,
          Math.atan2(-w.bx, -w.bz),
          h * (0.4 + ((seed + i * 3) % 5) * 0.08),
          seed + i,
        );
      }
    }
    const kinds: PottedKind[] = ['leafy', 'flowers', 'shrub', 'fan', 'flowers', 'cypress'];
    const count = detail === 'lite' ? 1 : Math.max(2, Math.round(len / 2.6));
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const px = wall.ax + (wall.bx - wall.ax) * t + w.bx * 0.75;
      const pz = wall.az + (wall.bz - wall.az) * t + w.bz * 0.75;
      addPlantOn(b, px, wall.top + 0.1, pz, 1.0, kinds[(seed + i) % kinds.length]!, potDetail, seed + i);
    }
    seed += 5;
    // Walkers stay off the terrace (it's a planted bed); the camera keeps out of the block.
    colliders.boxes.push({
      x: centre.x - w.bx * 0.1,
      z: centre.z - w.bz * 0.1,
      hx: len * 0.5 + 0.25,
      hz: depth * 0.5 + 0.15,
      rot,
      height: h,
    });
    colliders.camera?.push({
      x: centre.x,
      z: centre.z,
      hx: len * 0.5 + 0.25,
      hz: depth * 0.5,
      rot,
      y0: base,
      y1: wall.top + 0.25,
    });
  }

  // The two stairs, solid steps between stone cheeks, newels with urns at the foot.
  for (const f of RIM_FLIGHTS) {
    const tops = flightTops(f, heightField);
    const tread = (f.z0 - f.z1) / f.steps;
    for (let i = 0; i < f.steps; i += 1) {
      const zc = f.z0 - tread * (i + 0.5);
      const top = tops[i]!;
      addBox(
        b,
        'stone',
        f.x,
        PLAZA_Y - 0.3,
        zc,
        f.width,
        top - 0.08 - PLAZA_Y + 0.3,
        tread,
        0,
        SANDSTONE_DARK,
      );
      addBox(b, 'paving', f.x, top - 0.08, zc + 0.04, f.width + 0.04, 0.16, tread + 0.08, 0, COPING);
    }
    for (const side of [-1, 1]) {
      const cx = f.x + side * (f.width * 0.5 + CHEEK * 0.5);
      // The cheek's top climbs with the steps: one stone a pair of steps.
      for (let i = 0; i < f.steps; i += 2) {
        const zc = f.z0 - tread * (i + 1);
        const top = tops[Math.min(i + 1, f.steps - 1)]!;
        addBox(
          b,
          'stone',
          cx,
          PLAZA_Y - 0.3,
          zc,
          CHEEK,
          top + 0.75 - PLAZA_Y + 0.3,
          tread * 2 + 0.02,
          0,
          SANDSTONE,
        );
        addBox(b, 'stone', cx, top + 0.75, zc, CHEEK + 0.14, 0.14, tread * 2 + 0.06, 0, COPING);
      }
      colliders.boxes.push({
        x: cx,
        z: (f.z0 + f.z1) * 0.5,
        hx: CHEEK * 0.5 + 0.05,
        hz: (f.z0 - f.z1) * 0.5,
        rot: 0,
        height: 4.5,
      });
      colliders.camera?.push({
        x: cx,
        z: (f.z0 + f.z1) * 0.5,
        hx: CHEEK * 0.5,
        hz: (f.z0 - f.z1) * 0.5,
        rot: 0,
        y0: PLAZA_Y - 0.3,
        y1: LANE_Y + 0.9,
      });
      // A newel at the foot, an urn of geraniums on it.
      const nz = f.z0 - 0.3;
      addBox(b, 'stone', cx, PLAZA_Y - 0.1, nz, CHEEK + 0.3, 1.25, 0.9, 0, SANDSTONE);
      addBox(b, 'stone', cx, PLAZA_Y + 1.15, nz, CHEEK + 0.44, 0.14, 1.04, 0, COPING);
      if (detail !== 'lite' || side < 0)
        addPottedPlant(b, cx, PLAZA_Y + 1.29, nz, 0.75, side < 0 ? 'flowers' : 'leafy', potDetail, seed++);
    }
    colliders.boxes.push(
      ...[-1, 1].map((side) => ({
        x: f.x + side * (f.width * 0.5 + CHEEK * 0.5),
        z: f.z0 - 0.3,
        hx: (CHEEK + 0.3) * 0.5,
        hz: 0.45,
        rot: 0,
        height: 1.4,
      })),
    );
  }

  // The landing on to the terrace lane.
  {
    const { x0, x1, z0, z1 } = RIM_LANDING;
    const ground = Math.min(
      heightField.heightAt((x0 + x1) / 2, z1),
      heightField.heightAt(x0, z1),
      heightField.heightAt(x1, z1),
    );
    addBox(
      b,
      'stone',
      (x0 + x1) / 2,
      ground - 0.3,
      (z0 + z1) / 2,
      x1 - x0,
      LANE_Y - 0.08 - ground + 0.3,
      z1 - z0,
      0,
      SANDSTONE_DARK,
    );
    addBox(
      b,
      'paving',
      (x0 + x1) / 2,
      LANE_Y - 0.08,
      (z0 + z1) / 2,
      x1 - x0 + 0.1,
      0.16,
      z1 - z0 + 0.1,
      0,
      COPING,
    );
  }

  // The bed behind the tower: a stone planter between the stairs, cypresses and leaves in it.
  {
    const { x0, x1, z0, z1, top } = RIM_BED;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    addBox(b, 'stone', cx, PLAZA_Y - 0.3, cz, x1 - x0, top - PLAZA_Y + 0.3, z1 - z0, 0, SANDSTONE);
    addBox(b, 'stone', cx, top, z1 - 0.2, x1 - x0 + 0.2, 0.2, 0.5, 0, COPING);
    addBox(b, 'cloth', cx, top, cz - 0.25, x1 - x0 - 0.3, 0.08, z1 - z0 - 0.7, 0, 0x5e4a2a);
    const plants: [number, PottedKind, number][] = [
      [-3.6, 'cypress', 1.5],
      [-1.6, 'leafy', 1.1],
      [0.4, 'flowers', 1.2],
      [2.2, 'leafy', 1.0],
      [3.8, 'cypress', 1.4],
    ];
    for (const [ox, kind, s] of detail === 'lite' ? plants.filter((p) => p[1] === 'cypress') : plants)
      addPlantOn(b, cx + ox, top + 0.08, cz - 0.3, s, kind, potDetail, seed++);
    colliders.boxes.push({
      x: cx,
      z: cz,
      hx: (x1 - x0) * 0.5,
      hz: (z1 - z0) * 0.5,
      rot: 0,
      height: top - PLAZA_Y,
    });
    colliders.camera?.push({
      x: cx,
      z: cz,
      hx: (x1 - x0) * 0.5,
      hz: (z1 - z0) * 0.5,
      rot: 0,
      y0: PLAZA_Y - 0.3,
      y1: top + 0.2,
    });
  }
}
