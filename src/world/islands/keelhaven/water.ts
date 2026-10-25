import {
  createFreshWater,
  type FreshWater,
  type FreshWaterSpec,
  type StreamSpec,
  type WaterBasinSpec,
} from '../meridian-water';
import { KEELHAVEN, toWorld } from './layout';

/**
 * Keelhaven's fresh water (`KEELHAVEN.water`): Ribbon Falls down the head wall's gully into the Falls
 * Pool, the Keel River from the pool down the valley and across the town shelf and the beach to the
 * sea, and the sea falls on the outer coast, each a cascade down a hanging valley's floor from a
 * spring to its lip. Pure data and maths (no three.js), carved into the island's uncarved height, like
 * Thousand-Bough's.
 */

const W = KEELHAVEN.water;

export type KhBasin = 'ribbonSpring' | 'fallsPool' | `seaSpring${number}`;

const xz = (u: number, v: number): [number, number] => {
  const p = toWorld(u, v);
  return [p.x, p.z];
};

/** A spring on a steep wall: small, its level just under its rim's lowest point, banked steeply. */
function spring(x: number, z: number, r: number, phase: number): WaterBasinSpec {
  return { x, z, rx: r, rz: r * 0.85, rot: 0, depth: 0.4, phase, cut: 1.2, levee: 4 };
}

function spec(): FreshWaterSpec<KhBasin> {
  const basins: Record<string, WaterBasinSpec> = {};
  const rs = W.ribbon.spring;
  const [sx, sz] = xz(rs.u, rs.v);
  basins.ribbonSpring = spring(sx, sz, rs.r, 0.6);
  const fp = W.fallsPool;
  const [px, pz] = xz(fp.u, fp.v);
  basins.fallsPool = {
    x: px,
    z: pz,
    rx: fp.r,
    rz: fp.r * 0.8,
    rot: 0.4,
    depth: 1.4,
    phase: 2.1,
    cut: 0.8,
    levee: 0.6,
  };
  const streams: StreamSpec[] = [
    {
      // Ribbon Falls: a white ribbon down the head wall's gully (the carve deepens the gully).
      points: [[sx, sz], ...W.ribbon.line.map(([u, v]) => xz(u, v)), [px, pz]],
      halfWidth: W.ribbon.halfWidth,
      depth: 0.35,
      minFall: 0.03,
      from: 'ribbonSpring',
      to: 'fallsPool',
      lip: 1.5,
      levee: 3,
    },
    {
      // The Keel River: meanders down the valley, runs rapids down its step, then across the town
      // shelf (the town and the shipyard build either side of it) and the beach to the sea.
      points: [[px, pz], ...W.river.line.map(([u, v]) => xz(u, v))],
      halfWidth: W.river.halfWidth,
      depth: 0.5,
      minFall: 0.01,
      bank: 0.45,
      from: 'fallsPool',
      to: 'sea',
      course: {
        seed: 0x6ee1,
        meander: 5,
        wavelength: 52,
        minHalf: 2.2,
        maxHalf: 3.8,
        // The valley's step (about 0.45 m a metre): it runs down it in rapids, not a gorge.
        grade: 0.5,
      },
    },
  ];
  W.seaFalls.forEach((f, i) => {
    const name = `seaSpring${i}`;
    const [x, z] = f.line[0]!;
    basins[name] = spring(x, z, 3.6, 1.3 + i);
    streams.push({
      points: f.line,
      halfWidth: f.halfWidth,
      depth: 0.3,
      minFall: 0.04,
      from: name,
      to: 'sea',
      lip: 1.5,
      levee: 3,
    });
  });
  return { basins: basins as Record<KhBasin, WaterBasinSpec>, streams };
}

export const KEELHAVEN_WATER_SPEC: FreshWaterSpec<KhBasin> = spec();

export type KeelhavenWater = FreshWater<KhBasin>;

export function createKeelhavenWater(dry: (x: number, z: number) => number): KeelhavenWater {
  return createFreshWater(KEELHAVEN_WATER_SPEC, dry);
}
