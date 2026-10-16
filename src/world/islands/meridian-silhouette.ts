import type { Group } from 'three/webgpu';
import type { Tier } from '../contracts';
import { HARBOUR_FRONT_ROW, TERRACE_ROWS, terraceHasBackRow, terraceRun } from '../meridian-town/terraces';
import { smoothstep } from '../../util/math';
import { sunState } from '../sky/sun';
import { MERIDIAN, meridianHeight, meridianMasks } from './meridian';
import { MERIDIAN_WATER_SPEC } from './meridian-water';
import { createIslandSilhouetteAsync, type SilhouetteBlock, type SilhouetteTower } from './silhouette';

/** The island's sky (game/islands.ts ISLANDS.meridian.sky; a test keeps them in step). */
export const MERIDIAN_SILHOUETTE_SKY = { hours: 17.35, azimuth: -45 } as const;
/** The town's paint at a distance: weathered toward stone (the real walls' shading and dirt). */
const WEATHERED = 0x9c8c74;

/** sRGB hex a toward b by t. */
function mixHex(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 255;
    const cb = (b >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

/** A storey of the town's houses (m), and its ground floor's plinth. */
const STOREY = 3.1;

/**
 * Port Meridian's town as blocks (its houses from the same terrace rows the town builds, each in its
 * own wall colour with its terracotta roof), its citadel (the curtain wall, the Hall of Records and
 * towers on the bluff), the quay, the east arm and the mole: what reads from the sea.
 */
function meridianMasses(tier: Tier): { blocks: SilhouetteBlock[]; towers: SilhouetteTower[] } {
  const blocks: SilhouetteBlock[] = [];
  for (const row of [HARBOUR_FRONT_ROW, ...TERRACE_ROWS]) {
    const runs = [terraceRun(row, false)];
    if (terraceHasBackRow(row, tier)) runs.push(terraceRun(row, true));
    for (const run of runs)
      for (const h of run.houses)
        blocks.push({
          x: h.x,
          z: h.z,
          hx: h.w / 2,
          hz: h.d / 2,
          rot: h.rotY,
          y0: row.height,
          y1: row.height + h.storeys * STOREY + 0.6,
          color: mixHex(h.tint, WEATHERED, 0.4),
          ...(h.roof === 'gable' ? { roof: mixHex(h.roofTint, 0x9a3a26, 0.4), roofRise: 3 } : {}),
        });
  }
  const stone = 0xd8bf8c;
  const c = MERIDIAN.pads.citadel;
  const cy = c.height;
  // The curtain wall's ellipse (meridian-town addCurtainWall: 0.78 and 0.68 of a 39 m radius).
  const rx = 39 * 0.78;
  const rz = 39 * 0.68;
  const segments = 14;
  for (let k = 0; k < segments; k++) {
    const a0 = (k / segments) * Math.PI * 2;
    const a1 = ((k + 1) / segments) * Math.PI * 2;
    const x0 = c.x + Math.cos(a0) * rx,
      z0 = c.z + Math.sin(a0) * rz;
    const x1 = c.x + Math.cos(a1) * rx,
      z1 = c.z + Math.sin(a1) * rz;
    blocks.push({
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      hx: Math.hypot(x1 - x0, z1 - z0) / 2 + 0.4,
      hz: 0.9,
      rot: -Math.atan2(z1 - z0, x1 - x0),
      y0: cy - 1,
      y1: cy + 3.2,
      color: stone,
    });
  }
  // The Hall of Records (meridian-town HALL_OF_RECORDS), its roof terracotta.
  blocks.push({
    x: 809.3,
    z: -778,
    hx: 8,
    hz: 6,
    rot: 0,
    y0: cy,
    y1: cy + 7.5,
    color: 0xe6cf9e,
    roof: 0xc1532f,
    roofRise: 2.6,
  });
  // Quay, east arm and mole: the harbour's low stone band.
  const { quay, eastArm } = MERIDIAN.harbor;
  for (const b of [quay, eastArm])
    blocks.push({
      x: (b.x0 + b.x1) / 2,
      z: (b.z0 + b.z1) / 2,
      hx: (b.x1 - b.x0) / 2,
      hz: (b.z1 - b.z0) / 2,
      rot: 0,
      y0: -1.5,
      y1: b.height,
      color: 0x8a7a66,
    });
  const m = MERIDIAN.mole;
  blocks.push({
    x: (m.start.x + m.end.x) / 2,
    z: (m.start.z + m.end.z) / 2,
    hx: Math.hypot(m.end.x - m.start.x, m.end.z - m.start.z) / 2,
    hz: m.width / 2,
    rot: -Math.atan2(m.end.z - m.start.z, m.end.x - m.start.x),
    y0: -1.5,
    y1: m.height,
    color: 0x8a7a66,
  });
  const towers: SilhouetteTower[] = [
    // The citadel's towers, terracotta caps.
    ...[0.55, 2.25, 3.95].map((a) => ({
      x: c.x + Math.cos(a) * rx,
      z: c.z + Math.sin(a) * rz,
      r0: 3,
      r1: 2.6,
      y0: cy - 1,
      y1: cy + 8,
      color: stone,
      cap: { color: 0xb84a2c, height: 3.5 },
    })),
    // The mole's lighthouse: white, its lantern dark.
    {
      x: m.lighthouse.x,
      z: m.lighthouse.z,
      r0: 2.4,
      r1: 1.8,
      y0: m.lighthouse.height - 0.5,
      y1: m.lighthouse.height + 12,
      color: 0xece6d6,
      cap: { color: 0x3a3d40, height: 2.2 },
    },
  ];
  return { blocks, towers };
}

/**
 * Port Meridian as a far silhouette (before it streams in, and while the camera's past its show
 * range), to read like the island at its swap distance: its own ground (`meridianHeight`, what the
 * bake samples) in its own cover (`meridianMasks`: scrub, tan rock, the bluff's brown cliffs, pale
 * beaches) under its golden-hour sun, the walled town and its terracotta roofs along the shore, the
 * citadel on the bluff, the mole's lighthouse, and the cascade's white streak down the ridge. One
 * draw, in the islands' shared far graph. Built a few grid rows a breath (`ready`).
 */
export function createMeridianSilhouette(
  tier: Tier,
  breathe: () => Promise<void>,
): { group: Group; ready: Promise<void> } {
  const b = MERIDIAN.bounds;
  const sun = sunState(MERIDIAN_SILHOUETTE_SKY.hours, MERIDIAN_SILHOUETTE_SKY.azimuth).sun;
  const cascade = MERIDIAN_WATER_SPEC.streams[0]!.points;
  return createIslandSilhouetteAsync(
    {
      name: 'meridian-silhouette',
      bounds: { minX: b.minX + 30, maxX: b.maxX - 30, minZ: b.minZ + 30, maxZ: b.maxZ - 30 },
      // Fine enough on High for the bluff's cliff and the town's terraces.
      cell: tier === 'lite' || tier === 'low' ? 12 : 8,
      height: meridianHeight,
      masks: meridianMasks,
      land: 0x6f8a45,
      rock: 0xa49e92,
      // Moss and scrub in drifts over the ridge's limestone.
      moss: (x, z, m) =>
        m.rock *
        smoothstep(0.05, 0.5, Math.sin(x * 0.045 + Math.sin(z * 0.06) * 2) * Math.sin(z * 0.04 + x * 0.013)) *
        0.85,
      mossColor: 0x5e7a3a,
      // A fringe of palms along the low grassy shore.
      forest: (x, z, ground, m) => {
        if (!m || m.grass < 0.5 || ground < 1.5 || ground > 16) return 0;
        const v = Math.sin(Math.round(x / 10) * 12.9898 + Math.round(z / 10) * 78.233) * 43758.5453;
        return v - Math.floor(v) < 0.5 ? 1 : 0;
      },
      forestColor: 0x3f6230,
      forestHeight: 6,
      cliff: 0x96806a,
      sand: 0xd9c89e,
      light: { dir: sun, sun: [0.85, 0.78, 0.68], ambient: [0.7, 0.74, 0.8], ground: [0.28, 0.33, 0.42] },
      ...meridianMasses(tier),
      ribbons: [{ points: cascade, halfWidth: 3.4, lift: 1.2, color: 0xf2f6f7 }],
    },
    breathe,
  );
}
