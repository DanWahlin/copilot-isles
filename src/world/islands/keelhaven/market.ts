import {
  addMarketBooth,
  BOOTH_EXTENT,
  BOOTH_TOP,
  type BoothColliders,
  type BoothStyle,
} from '../../market-stall/booth';
import { cone, type Buckets } from '../../village/pieces';
import { KEELHAVEN_BOOTH } from './anchors';
import { YARD_PAINT, type ShipyardOut } from './shipyard';

/**
 * Keelhaven's Model Market (docs/specs/MODEL-MARKET.md §2): Bram's booth on the Old Town quay, west of
 * the landing, its front to the landing. The town's tarred timber and coral stone: a red-oxide tin hip
 * roof like the town's, a red-ochre and cream awning, its boards in the yard's paint.
 */
const PLACE = KEELHAVEN_BOOTH;

const STYLE: BoothStyle = {
  frame: YARD_PAINT.weathered,
  boards: [YARD_PAINT.silver, 0xb9b2a4],
  wood: 0x8a5f38,
  woodLight: YARD_PAINT.oak,
  darkWood: YARD_PAINT.tar,
  plank: [0x9a6a3e, 0x8c5f36],
  brass: 0xe9b54a,
  iron: YARD_PAINT.iron,
  awning: [YARD_PAINT.ochre, YARD_PAINT.canvas],
  counterCloth: [0x2f6f74, YARD_PAINT.canvas],
  curtain: 0x5e2f2a,
  cork: 0xb07a45,
  boardFace: [0x9fcdb8, 0x9cc3dc, 0xb3302a],
  boardFrame: [YARD_PAINT.tar, YARD_PAINT.tar, 0xe6b44c],
  shelfTints: [0x9fcdb8, 0xe8a58c, 0xefd890, 0x9cc3dc, 0xb85a3c, 0x6e8f78],
};

/** Builds Bram's booth into the town's buckets (world space), with its colliders and camera boxes. */
export function addKeelhavenMarket(buckets: Buckets, out: ShipyardOut, lite: boolean): void {
  const c: BoothColliders = { boxes: [], camera: [] };
  addMarketBooth(buckets, c, PLACE, PLACE.y, STYLE, lite, {
    roof(l) {
      // A tin hip over the booth, on the wall plate (the town's red-oxide tin).
      const e = BOOTH_EXTENT;
      cone(
        l as unknown as Buckets,
        'metal',
        (e.x0 + e.x1) / 2,
        BOOTH_TOP - 0.05,
        (e.z0 + e.z1) / 2,
        5.4,
        1.5,
        4,
        0xa8503a,
        0,
        (g) => {
          g.rotateY(Math.PI / 4);
          g.scale(1, 1, (e.z1 - e.z0 + 1.2) / (e.x1 - e.x0 + 1.2));
        },
      );
    },
  });
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
