import type { Group } from 'three/webgpu';
import type { Tier } from '../../../contracts';
import { sunState } from '../../../sky/sun';
import { createIslandSilhouetteAsync, type SilhouetteMasks, type SilhouetteTower } from '../../silhouette';
import { thousandBoughHeightDry, thousandBoughMasks } from '../height';
import { THOUSAND_BOUGH as TB } from '../layout';

/** Grid spacing (m) of the far shape: fine enough on High for the sea cliffs' crisp top edge. */
const CELL = (tier: Tier) => (tier === 'lite' || tier === 'low' ? 10 : 7);
/** The tree line's cells (m). */
const TREE_CELL = 14;

/**
 * The great banyan as far masses (the tree's layout, `TB.tree`): its trunk, the ring canopy over the
 * cathedral, and the high crown's two lobes to the north-east (bearings 20 and 80).
 */
function banyanMasses(): SilhouetteTower[] {
  const t = TB.tree;
  const c = t.canopy;
  const green = 0x3f6a2c;
  const crown = (bearing: number): SilhouetteTower => {
    const a = (bearing * Math.PI) / 180;
    const r = (c.crown.rMin + c.crown.rMax) / 2;
    return {
      x: t.x + Math.sin(a) * r,
      z: t.z - Math.cos(a) * r,
      r0: 12,
      r1: 23,
      y0: c.crown.bottom + 6,
      y1: c.crown.top - 22,
      color: green,
      cap: { color: green, height: 14 },
    };
  };
  return [
    {
      x: t.x,
      z: t.z,
      r0: t.trunk[0]!.r,
      r1: t.trunk.at(-1)!.r,
      y0: t.deckY - 1,
      y1: c.ring.bottom + 2,
      color: 0x4a3c2e,
    },
    {
      x: t.x,
      z: t.z,
      r0: c.ring.rMax - 6,
      r1: c.ring.rMax - 10,
      y0: c.ring.bottom + 2,
      y1: c.ring.top - 4,
      color: green,
      cap: { color: green, height: 8 },
    },
    crown(c.crown.bearings[0]),
    crown(c.crown.bearings[1]),
  ];
}

/** The island's sky (game/islands.ts ISLANDS['thousand-bough'].sky; a test keeps them in step). */
export const THOUSAND_BOUGH_SILHOUETTE_SKY = { hours: 17.77, azimuth: 13.5 } as const;

/** 0-1 for a cell of the tree line: a tree on about a third of the grassy upper ground's cells. */
function treeLine(x: number, z: number, ground: number, m: SilhouetteMasks | null): number {
  if (!m || ground < 5 || m.grass < 0.45) return 0;
  const v = Math.sin(Math.round(x / TREE_CELL) * 12.9898 + Math.round(z / TREE_CELL) * 78.233) * 43758.5453;
  return v - Math.floor(v) < 0.34 ? 0.5 : 0;
}

/**
 * Thousand-Bough as a far silhouette (before it streams in, and while the camera's far from it), to
 * read like the island at its swap distance: its own dry ground in its own cover
 * (`thousandBoughMasks`: the wet basalt of its sea cliffs dark, the ridge's grass, the beaches) under
 * its low WNW sun, a tree line along the top, and the great banyan (its trunk, its ring canopy and its
 * high crown's lobes, dark green) in the ridge's saddle. One draw,
 * in the islands' shared far graph. Built a few grid rows a breath (`ready`).
 */
export function createThousandBoughSilhouette(
  tier: Tier,
  breathe: () => Promise<void>,
): {
  group: Group;
  ready: Promise<void>;
} {
  const b = TB.bounds;
  const sun = sunState(THOUSAND_BOUGH_SILHOUETTE_SKY.hours, THOUSAND_BOUGH_SILHOUETTE_SKY.azimuth).sun;
  return createIslandSilhouetteAsync(
    {
      name: 'thousand-bough-silhouette',
      bounds: { minX: b.minX + 40, maxX: b.maxX - 40, minZ: b.minZ + 40, maxZ: b.maxZ - 40 },
      cell: CELL(tier),
      height: thousandBoughHeightDry,
      masks: thousandBoughMasks,
      // Its moss keeps the gentler rock green; the sheer faces are wet basalt.
      land: 0x5c6c3e,
      rock: 0x6a6842,
      cliff: 0x7a6652,
      sand: 0xc8b48a,
      sheer: 0.9,
      forest: treeLine,
      forestColor: 0x34502c,
      forestHeight: 2,
      light: {
        dir: sun,
        sun: [0.72, 0.62, 0.5],
        ambient: [0.62, 0.66, 0.7],
        ground: [0.12, 0.13, 0.16],
        wrap: 0.6,
      },
      towers: banyanMasses(),
      // The falls as soft, narrow, blue-grey sheets (white water and mist from afar, not paper).
      ribbons: TB.water.falls.map((f) => ({
        points: [
          [f.lip.x, f.lip.z],
          [f.foot.x, f.foot.z],
        ],
        ys: [f.lip.y, f.lip.y - f.drop],
        halfWidth: Math.max(1.8, f.width * 0.42),
        lift: 0,
        color: 0xb4c4d4,
        soft: 1,
      })),
    },
    breathe,
  );
}
