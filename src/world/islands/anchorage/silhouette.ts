import type { Group } from 'three/webgpu';
import type { HeightField } from '../../contracts';
import { COVE } from '../../layout';
import { createIslandSilhouette } from '../silhouette';
import { LIGHTHOUSE } from './lighthouse-stair';

/** A building's footprint (its collider). */
export interface SilhouetteBox {
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  height?: number;
  y0?: number;
  y1?: number;
}

/**
 * Anchorage as a far silhouette (while it's dormant: you're at another island): its baked ground on
 * a coarse grid in its green, rock and sand, its buildings as plaster blocks from their footprints,
 * and the point lighthouse and the sea stack as prisms (they're what reads on the horizon).
 */
export function createAnchorageSilhouette(o: {
  heightField: HeightField;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  buildings: readonly SilhouetteBox[];
}): Group {
  const L = COVE.lighthouse;
  const S = COVE.seaStack;
  const ground = (x: number, z: number) => o.heightField.heightAt(x, z);
  const lighthouseBase = ground(L.x, L.z);
  return createIslandSilhouette({
    name: 'anchorage-silhouette',
    bounds: o.bounds,
    cell: 10,
    height: ground,
    land: 0x4f7a3c,
    rock: 0xa9a59a,
    sand: 0xcdbf95,
    // The lighthouse's own walls are its prism, not blocks.
    blocks: o.buildings
      .filter((b) => Math.hypot(b.x - L.x, b.z - L.z) > L.radius + 2)
      .map((b) => ({ ...b, color: 0xd9c9a8 })),
    towers: [
      {
        x: L.x,
        z: L.z,
        r0: LIGHTHOUSE.rBottom,
        r1: LIGHTHOUSE.rTop,
        y0: lighthouseBase - 0.5,
        y1: lighthouseBase + LIGHTHOUSE.plinth + LIGHTHOUSE.height + 3,
        color: 0xe8e2d2,
      },
      { x: S.x, z: S.z, r0: S.radius * 0.67, r1: S.radius * 0.95, y0: -2, y1: S.height, color: 0x9a958a },
    ],
  });
}
