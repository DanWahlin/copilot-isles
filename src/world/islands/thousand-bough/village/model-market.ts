import {
  addMarketBooth,
  BOOTH_EXTENT,
  BOOTH_TOP,
  type BoothColliders,
  type BoothStyle,
} from '../../../market-stall/booth';
import type { StallPlace } from '../../../market-stall/layout';
import { walkBox } from '../../../market-stall/parts';
import { addPottedPlant } from '../../../meridian-town/plaza-plants';
import { THOUSAND_BOUGH as TB } from '../layout';
import { PAINT, cone, type Buckets } from './pieces';
import type { StructureOut } from './structure';

/**
 * Thousand-Bough's Model Market (docs/specs/MODEL-MARKET.md §2): Lani's booth in Bough Landing's
 * south-east corner, its back to the rail and its front to the deck, beside you as you step off the
 * Root Wharf. The tree village's weathered teak and thatch: a reed-thatched hip roof like the boathouse's,
 * a leaf-green and cream awning, and a potted palm.
 */
const PLACE: StallPlace & { y: number } = TB.anchors.modelMarket;

const STYLE: BoothStyle = {
  frame: PAINT.weathered,
  boards: [PAINT.teakDark, 0xa06f42],
  wood: 0x8a5f38,
  woodLight: PAINT.teakDark,
  darkWood: 0x4a3322,
  plank: [0x9a6a3e, 0x8c5f36],
  brass: 0xe9b54a,
  iron: PAINT.iron,
  awning: [0x3e7a3a, 0xece2c6],
  counterCloth: [PAINT.teal, PAINT.cream],
  curtain: 0x2f6b4d,
  cork: 0xb07a45,
  boardFace: [0x8fae74, 0x3e7fc6, 0xb3302a],
  boardFrame: [0x5b3a20, 0x5b3a20, 0xe6b44c],
  shelfTints: [PAINT.teal, PAINT.green, PAINT.heliconia, 0xe6b94a, PAINT.orchid, 0x8fb34a],
};

/** Builds Lani's booth into the village's buckets (world space), with its colliders and camera boxes. */
export function addThousandBoughMarket(buckets: Buckets, out: StructureOut, lite: boolean): void {
  const c: BoothColliders = { boxes: [], camera: [] };
  addMarketBooth(buckets, c, PLACE, PLACE.y, STYLE, lite, {
    roof(l) {
      // A thatched hip over the booth (the boathouse's cone, four-sided), on the wall plate.
      const e = BOOTH_EXTENT;
      cone(
        l,
        'thatch',
        (e.x0 + e.x1) / 2,
        BOOTH_TOP - 0.05,
        (e.z0 + e.z1) / 2,
        5.5,
        1.9,
        4,
        PAINT.thatch,
        0,
        (g) => {
          g.rotateY(Math.PI / 4);
          g.scale(1, 1, (e.z1 - e.z0 + 1.2) / (e.x1 - e.x0 + 1.2));
        },
      );
    },
    dress(l, at, cl) {
      // A potted palm by its side on the deck (its other side is the rail).
      addPottedPlant(l, 4.15, 0, -1.0, 0.9, 'fan', lite ? 'lite' : 'full', 47);
      cl.boxes.push(walkBox(at(4.15, -1.0, 0.4, 0.4, 0, 0.6), 0.6));
    },
  });
  // The village's colliders are world-space boxes with a top: the walker stops at the walls.
  for (const b of c.boxes)
    out.colliders.push({
      x: b.x,
      z: b.z,
      hx: b.hx,
      hz: b.hz,
      rot: b.rot ?? 0,
      y0: PLACE.y - 0.5,
      y1: PLACE.y + (b.height ?? 2),
      height: b.height,
    });
  out.cameraBoxes.push(
    ...c.camera.map((b) => ({
      x: b.x,
      z: b.z,
      hx: b.hx,
      hz: b.hz,
      rot: b.rot ?? 0,
      y0: b.y0 ?? PLACE.y,
      y1: b.y1 ?? PLACE.y + 4,
    })),
  );
}
