import type { Group } from 'three/webgpu';
import type { HeightField } from '../../contracts';
import { COVE } from '../../layout';
import { sunState } from '../../sky/sun';
import { coveMasks } from '../../terrain/cove-height';
import { HOUSE_STOREY_HEIGHT } from '../../village/house-builder';
import { createIslandSilhouetteAsync, mixHex, type SilhouetteBlock } from '../silhouette';
import { BUILDINGS } from './buildings';
import { LIGHTHOUSE } from './lighthouse-stair';

/** The island's sky (game/islands.ts ISLANDS.anchorage.sky; a test keeps them in step). */
export const ANCHORAGE_SILHOUETTE_SKY = { hours: 16.2, azimuth: 0 } as const;
/** The village's paint at a distance: weathered toward stone (the real walls' shading and dirt). */
const WEATHERED = 0x9c8c74;

/**
 * Anchorage as a far silhouette (past its swap distance, dormant or not: you've left it), to read
 * like the island there: its baked ground on a coarse grid in its own cover (`coveMasks`: green
 * hills, the headland's limestone cliffs, beaches) under its afternoon sun (its palms are a pixel
 * or two there, and bumps on the grid read as a jagged ridge: none), its houses as blocks in their
 * own paint (weathered toward stone) with their roofs, from the same data the village builds, the
 * quay and the pier as a low dark band, and the point lighthouse and the sea stack as prisms. One
 * draw, in the islands' shared far graph. Built a few grid rows a breath (`ready`).
 *
 * With `mirror`, it's the harbour mirror's stand-in for the island (Ultra, #31): what the harbour
 * reflects (the hills, the village front and the quay) as these big shapes in that one cheap look,
 * on a finer grid, with nothing under the water (the mirror's camera looks up from under it) and
 * no pier (its piles reflect themselves).
 */
export function createAnchorageSilhouette(o: {
  heightField: HeightField;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  breathe: () => Promise<void>;
  mirror?: boolean;
}): { group: Group; ready: Promise<void> } {
  const mirror = o.mirror === true;
  /** A block's walls start 0.5 m under its `y0`: in the mirror, at the water. */
  const above = (y0: number) => (mirror ? Math.max(0.5, y0) : y0);
  const L = COVE.lighthouse;
  const S = COVE.seaStack;
  const ground = (x: number, z: number) => o.heightField.heightAt(x, z);
  const lighthouseBase = ground(L.x, L.z);
  const sun = sunState(ANCHORAGE_SILHOUETTE_SKY.hours, ANCHORAGE_SILHOUETTE_SKY.azimuth).sun;
  const blocks: SilhouetteBlock[] = BUILDINGS.map((b) => {
    const y0 = b.quay ? COVE.quay.height : ground(b.x, b.z);
    return {
      x: b.x,
      z: b.z,
      hx: b.w / 2,
      hz: b.d / 2,
      rot: b.rot,
      y0: above(y0),
      y1: y0 + b.floors * HOUSE_STOREY_HEIGHT + 0.4,
      color: mixHex(b.colour, WEATHERED, 0.35),
      roof: mixHex(b.roofColour, 0x8a4630, 0.3),
      roofRise: Math.min(b.w, b.d) * 0.35,
    };
  });
  // The quay and the pier: the harbour's low dark band under the village.
  const q = COVE.quay;
  blocks.push({
    x: (q.x0 + q.x1) / 2,
    z: q.z + 4,
    hx: (q.x1 - q.x0) / 2,
    hz: 4,
    rot: 0,
    y0: above(-2),
    y1: q.height,
    color: 0x6e6255,
  });
  const p = COVE.pier;
  if (!mirror)
    blocks.push({
      x: p.x,
      z: (p.z0 + p.z1) / 2,
      hx: p.width / 2 + 0.5,
      hz: Math.abs(p.z1 - p.z0) / 2,
      rot: 0,
      y0: -2,
      y1: p.deck + 0.8,
      color: 0x5a4a3a,
    });
  return createIslandSilhouetteAsync(
    {
      name: mirror ? 'anchorage-mirror-stand-in' : 'anchorage-silhouette',
      bounds: o.bounds,
      cell: mirror ? 5 : 10,
      floor: mirror ? 0 : undefined,
      height: ground,
      masks: coveMasks,
      land: 0x74a046,
      rock: 0x9c9a94,
      cliff: 0xa4a6a6,
      sand: 0xd9c89e,
      sheer: 0.5,
      // Its headland's faces are the cliff mesh's limestone: grey in the afternoon, never golden.
      sheen: 0.15,
      light: { dir: sun, sun: [0.85, 0.8, 0.72], ambient: [0.7, 0.74, 0.8], ground: [0.3, 0.34, 0.42] },
      blocks,
      towers: [
        {
          x: L.x,
          z: L.z,
          r0: LIGHTHOUSE.rBottom,
          r1: LIGHTHOUSE.rTop,
          y0: lighthouseBase - 0.5,
          y1: lighthouseBase + LIGHTHOUSE.plinth + LIGHTHOUSE.height + 3,
          color: 0xe8e2d2,
          cap: { color: 0x8c3a2c, height: 2.6 },
        },
        {
          x: S.x,
          z: S.z,
          r0: S.radius * 0.67,
          r1: S.radius * 0.95,
          y0: mirror ? 0 : -2,
          y1: S.height,
          color: 0xb4b0a4,
        },
      ],
    },
    o.breathe,
  );
}
