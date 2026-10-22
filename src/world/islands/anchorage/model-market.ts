import type { VillageAnchor, VillageBoxCollider } from '../../village/kit';
import type { MaterialKey } from '../../village/kit';
import type { BufferGeometry } from 'three/webgpu';
import { box, cylinder } from '../../sites/geo';
import {
  addMarketBooth,
  BOOTH_EXTENT,
  BOOTH_LAYOUT,
  BOOTH_TOP,
  type BoothStyle,
} from '../../market-stall/booth';
import { stallToWorld, type StallPlace } from '../../market-stall/layout';
import { addStallAwning, walkBox } from '../../market-stall/parts';

/**
 * Anchorage Cay's Model Market (docs/specs/MODEL-MARKET.md §2): Desmond's booth at the quay's east end,
 * between the harbourmaster's and the storehouse, its front to the pier, so you see it as you come
 * ashore. The village's dark timber under a striped canvas canopy like the square's stall's, a
 * coral-and-cream awning over the counter, and crates of fruit by its side.
 */
export const ANCHORAGE_MARKET: StallPlace = { x: -81.4, z: -67.3, heading: -Math.PI / 2 };

const STYLE: BoothStyle = {
  frame: 0x4a2f1f,
  boards: [0x9a7048, 0x8a6440],
  wood: 0x6e4729,
  woodLight: 0x9a7048,
  darkWood: 0x3a2516,
  plank: [0x8a6440, 0x7d5a39],
  brass: 0xe9b54a,
  iron: 0x2b2d2c,
  awning: [0xd9644a, 0xf0e6cc],
  counterCloth: [0x3f8fb0, 0xeadcb4],
  curtain: 0x2f6f74,
  cork: 0xb07a45,
  boardFace: [0x8fae74, 0x3e7fc6, 0xb3302a],
  boardFrame: [0x5b3a20, 0x5b3a20, 0xe6b44c],
  shelfTints: [0x3f8fb0, 0x4d9a52, 0xd9644a, 0xe6b94a, 0x2a5f8f, 0x8fb34a],
};
/** The canopy's stripes: the square's stall's blue and sun-faded canvas. */
const CANOPY: readonly [number, number] = [0x4f9bc0, 0xe5d6ad];

/**
 * Builds the booth into the village's buckets (world space) with its colliders and camera blockers,
 * and its anchors: `modelMarket` (the stall's origin) and `marketKeeper` (Desmond behind the counter).
 */
export function addAnchorageMarket(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { boxes: VillageBoxCollider[] },
  camera: VillageBoxCollider[],
  anchors: Record<string, VillageAnchor>,
  y: number,
  lite: boolean,
): void {
  const p = ANCHORAGE_MARKET;
  const out = { boxes: [] as VillageBoxCollider[], camera: [] as VillageBoxCollider[] };
  addMarketBooth(buckets, out, p, y, STYLE, lite, {
    // The quay's lamp posts light it (and the village's ironwork is a draw's worth already).
    lanterns: false,
    roof(l) {
      // A striped canvas canopy like the square's stall's, sloping to a scalloped front: the cloth the
      // village already draws (a tiled roof would be a new draw and a new look on the island).
      const e = BOOTH_EXTENT;
      addStallAwning(
        l,
        {
          x0: e.x0 - 0.35,
          x1: e.x1 + 0.35,
          zFront: e.z1 + 0.45,
          zBack: e.z0 - 0.3,
          yFront: BOOTH_TOP + 0.18,
          yBack: BOOTH_TOP + 0.95,
        },
        { ...STYLE, awning: CANOPY },
        14,
      );
    },
    dress(l, at, c) {
      // Crates of fruit and a cask by the booth's right side (its left is the quay's edge).
      for (const [lx, lz, fruit] of [
        [4.25, -0.7, 0xe58a2b],
        [4.25, -1.55, 0x8bbf3f],
        [4.3, -1.1, 0xe9c74a],
      ] as const) {
        const top = lz === -1.1 ? 0.92 : 0.46;
        l.wood.push(box(0.62, 0.46, 0.62, { x: lx, y: top - 0.46, z: lz }, 0x8a6440, 1.8));
        l.cloth.push(box(0.52, 0.08, 0.52, { x: lx, y: top - 0.04, z: lz }, fruit, 1.8));
      }
      l.wood.push(cylinder(0.3, 0.3, 0.8, { x: 4.15, z: -2.45 }, 0x7a4c2b, lite ? 10 : 14));
      for (const hy of [0.12, 0.62])
        l.metal.push(cylinder(0.31, 0.31, 0.04, { x: 4.15, y: hy, z: -2.45 }, STYLE.iron, lite ? 10 : 14));
      c.boxes.push(
        walkBox(at(4.27, -1.12, 0.36, 0.8, 0, 0.92), 0.92),
        walkBox(at(4.15, -2.45, 0.34, 0.34, 0, 0.8), 0.8),
      );
    },
  });
  colliders.boxes.push(...out.boxes);
  camera.push(...out.camera);
  anchors.modelMarket = { x: p.x, y, z: p.z, heading: p.heading };
  const v = stallToWorld(p, BOOTH_LAYOUT.vendor.x, BOOTH_LAYOUT.vendor.z);
  anchors.marketKeeper = { x: v.x, y: y + BOOTH_LAYOUT.vendor.y, z: v.z, heading: p.heading };
}
