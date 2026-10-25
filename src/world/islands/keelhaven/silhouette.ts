import type { Group } from 'three/webgpu';
import type { Tier } from '../../contracts';
import { HOUSE_STOREY_HEIGHT } from '../../village/house-builder';
import { smoothstep } from '../../../util/math';
import { sunState } from '../../sky/sun';
import {
  createIslandSilhouetteAsync,
  mixHex,
  type SilhouetteBlock,
  type SilhouetteMasks,
  type SilhouetteTower,
} from '../silhouette';
import { keelhavenHeightDry } from './height';
import { KEELHAVEN as K, toFrame, toWorld } from './layout';
import { GATE_LIGHT, townHouseLook, townHouses } from './town';
import { KEELHAVEN_WRECKS } from './wrecks';
import { DOCKS, PADS } from './works';

/** The island's sky (layout.ts `KEELHAVEN.sky`, bright late morning). */
export const KEELHAVEN_SILHOUETTE_SKY = K.sky;

/** The town's paint at a distance: toward weathered stone (the real walls' shading and dirt). */
const WEATHERED = 0xa89a84;

const F = { u: 0, v: 0 };
const E = 6;

/** The cove frame's axes in the world, and its u axis as a yaw (three's, as `BoxCollider.rot`). */
const K_AXIS = (() => {
  const o = toWorld(0, 0);
  const pu = toWorld(1, 0);
  const pv = toWorld(0, 1);
  const ux = pu.x - o.x;
  const uz = pu.z - o.z;
  return { ux, uz, vx: pv.x - o.x, vz: pv.z - o.z, yaw: Math.atan2(-uz, ux) };
})();

/**
 * Keelhaven's cover, cheap enough for a far grid (the bake's masks cost 130 µs a sample): the cove's
 * beach, the dark sea-cliff band round the outer coast (steep, low, out of the cove), and green
 * everywhere else. No sheer faces as rock: Na Pali's walls stay green to their crests.
 */
function masks(x: number, z: number): SilhouetteMasks {
  const h = keelhavenHeightDry(x, z);
  const sx = keelhavenHeightDry(x + E, z) - h;
  const sz = keelhavenHeightDry(x, z + E) - h;
  const slope = Math.hypot(sx, sz) / E;
  toFrame(x, z, F);
  const inCove = smoothstep(-260, -200, F.u) * (1 - smoothstep(90, 120, Math.abs(F.v)));
  const sand =
    inCove * smoothstep(-2, -0.6, h) * (1 - smoothstep(3, 4.4, h)) * (1 - smoothstep(0.2, 0.4, slope));
  const cliff =
    (1 - inCove) * smoothstep(0.35, 0.7, slope) * (1 - smoothstep(20, 32, h)) * smoothstep(-6, -2, h);
  return { sand, grass: smoothstep(0.5, 3, h) * (1 - cliff), rock: 0, cliff };
}

/**
 * The town and the yard as blocks (each house from the town's own data in its own wall and roof
 * colours), the hull in Dock 2, the basin's stone, the Gate Light in its white and red bands with a
 * bright lantern, the sheerlegs, and the reef's wrecks as dark low blocks.
 */
function masses(tier: Tier): { blocks: SilhouetteBlock[]; towers: SilhouetteTower[] } {
  const blocks: SilhouetteBlock[] = [];
  const sparse = tier === 'lite' || tier === 'low';
  for (const h of townHouses()) {
    if (sparse && h.back) continue;
    const look = townHouseLook(h);
    const p = toWorld(h.u, h.v);
    const base = keelhavenHeightDry(p.x, p.z) + 0.2;
    const dx = h.face.u * K_AXIS.ux + h.face.v * K_AXIS.vx;
    const dz = h.face.u * K_AXIS.uz + h.face.v * K_AXIS.vz;
    blocks.push({
      x: p.x,
      z: p.z,
      hx: h.w / 2 + 0.3,
      hz: h.d / 2 + 0.3,
      rot: Math.atan2(-dx, -dz),
      y0: base - 0.5,
      y1: base + h.storeys * HOUSE_STOREY_HEIGHT,
      color: mixHex(look.wall, WEATHERED, 0.3),
      roof: mixHex(look.roof, 0x7a6a5a, 0.25),
      roofRise: (Math.min(h.w, h.d) / 2 + 0.3) * Math.tan(look.pitch),
    });
  }
  // The yard: the basin's and docks' stone, the sheds' rust-brown roofs in a band, the hull in Dock 2.
  const yard = PADS.yard;
  const yc = toWorld((yard.u0 + yard.u1) / 2, (yard.v0 + yard.v1) / 2);
  blocks.push({
    x: yc.x,
    z: yc.z,
    hx: (yard.u1 - yard.u0) / 2,
    hz: (yard.v1 - yard.v0) / 2,
    rot: K_AXIS.yaw,
    y0: yard.y - 1,
    y1: yard.y + 0.4,
    color: 0xb8a888,
  });
  const hull = toWorld((DOCKS.u0 + DOCKS.u1) / 2, DOCKS.v[1]);
  blocks.push({
    x: hull.x,
    z: hull.z,
    hx: 14,
    hz: 3.6,
    rot: K_AXIS.yaw,
    y0: yard.y,
    y1: yard.y + 7,
    color: 0x4a3a30,
  });
  for (const d of KEELHAVEN_WRECKS)
    blocks.push({
      x: d.pose.x,
      z: d.pose.z,
      hx: 3.2,
      hz: d.broken ? 7 : 13,
      rot: d.pose.heading,
      y0: -1,
      y1: 1.6 + 1.6 * Math.cos(d.pose.heel),
      color: 0x5a5048,
    });
  // The Gate Light: its bands as stacked prisms, a bright lantern, a brass cap.
  const L = toWorld(GATE_LIGHT.u, GATE_LIGHT.v);
  const y = GATE_LIGHT.y;
  const bands: [number, number, number][] = [
    [y - 1, y + 8, 0xf1ece2],
    [y + 8, y + 11.5, 0xc4382a],
    [y + 11.5, y + 16.5, 0xf1ece2],
    [y + 16.5, y + 20, 0xc4382a],
    [y + 20, y + 23.6, 0xf1ece2],
    [y + 23.6, y + 27.3, 0xc4382a],
  ];
  const r = (h: number) => 4.4 - 1.3 * ((h - y) / 27);
  const towers: SilhouetteTower[] = bands.map(([y0, y1, color]) => ({
    x: L.x,
    z: L.z,
    r0: r(Math.max(y0, y)),
    r1: r(y1),
    y0,
    y1,
    color,
  }));
  towers.push({
    x: L.x,
    z: L.z,
    r0: 2.3,
    r1: 2.3,
    y0: y + 27.3,
    y1: y + 32.4,
    color: 0xfff1c8,
    cap: { color: 0xc9a24a, height: 2 },
  });
  // The sheerlegs over the dock heads.
  const legs = toWorld(DOCKS.u0 - 4, DOCKS.v[1]);
  towers.push({ x: legs.x, z: legs.z, r0: 0.9, r1: 0.3, y0: yard.y, y1: yard.y + 30, color: 0x6a5240 });
  return { blocks, towers };
}

/** The falls as soft white strips: Ribbon Falls up the valley, and the sea falls (their curtains to the sea). */
function falls(): {
  points: [number, number][];
  ys?: number[];
  halfWidth: number;
  lift: number;
  color: number;
  soft?: number;
}[] {
  const out: ReturnType<typeof falls> = [];
  const ribbon = K.water.ribbon;
  out.push({
    points: ribbon.line.map(([u, v]) => {
      const p = toWorld(u, v);
      return [p.x, p.z] as [number, number];
    }),
    halfWidth: 3.6,
    lift: 2.5,
    color: 0xdfe8ea,
  });
  for (const f of K.water.seaFalls) {
    out.push({
      points: f.line.map(([x, z]) => [x, z] as [number, number]),
      halfWidth: f.halfWidth * 1.5 + 1.5,
      lift: 2.5,
      color: 0xdfe8ea,
    });
    if (!f.curtain) continue;
    const a = f.line[f.line.length - 2]!;
    const b = f.line[f.line.length - 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const out2: [number, number] = [b[0] + ((b[0] - a[0]) / len) * 3, b[1] + ((b[1] - a[1]) / len) * 3];
    out.push({
      points: [[b[0], b[1]], out2],
      ys: [keelhavenHeightDry(b[0], b[1]), -1],
      halfWidth: f.halfWidth * 2 + 2,
      lift: 0,
      color: 0xeef3f4,
      soft: 1,
    });
  }
  return out;
}

/**
 * Keelhaven as a far silhouette (before it streams in, and while the camera's past its show range),
 * to read like the island at its swap distance: its own ground (`keelhavenHeightDry`) in Na Pali's
 * green to the crests, the dark sea-cliff band round the outer coast, the cove's pale beach, under its
 * late-morning sun; the Old Town's houses in their own pastel paint and tin, the yard, the Gate Light
 * banded white and red on the North Head, the wrecks on the reef, and the falls as white strips. One
 * draw, in the islands' shared far graph. Built a few grid rows a breath (`ready`).
 */
export function createKeelhavenSilhouette(
  tier: Tier,
  breathe: () => Promise<void>,
): { group: Group; ready: Promise<void> } {
  const b = K.bounds;
  const sun = sunState(KEELHAVEN_SILHOUETTE_SKY.hours, KEELHAVEN_SILHOUETTE_SKY.azimuth).sun;
  return createIslandSilhouetteAsync(
    {
      name: 'keelhaven-silhouette',
      bounds: { minX: b.minX + 40, maxX: b.maxX - 40, minZ: b.minZ + 40, maxZ: b.maxZ - 40 },
      // The island is big (1.3 × 1.8 km): a coarser grid than the others' keeps it one small draw.
      cell: tier === 'lite' || tier === 'low' ? 18 : 12,
      height: keelhavenHeightDry,
      masks,
      land: 0x6e9650,
      rock: 0x6a7a44,
      cliff: 0x3a3430,
      sand: 0xe0d2ae,
      // The walls' painted canopy: darker green in drifts.
      moss: (x, z, m) =>
        m.grass *
        0.6 *
        smoothstep(0.1, 0.6, Math.sin(x * 0.031 + Math.sin(z * 0.043) * 2) * Math.sin(z * 0.027 - x * 0.011)),
      mossColor: 0x426b34,
      sheen: 0.2,
      light: {
        dir: sun,
        sun: [0.95, 0.9, 0.82],
        ambient: [0.62, 0.68, 0.76],
        ground: [0.22, 0.26, 0.3],
        wrap: 0.3,
      },
      ...masses(tier),
      ribbons: falls(),
    },
    breathe,
  );
}
