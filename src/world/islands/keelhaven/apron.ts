import type { TerrainSkin } from '../../terrain/terrain-mesh';
import { toFrame, toWorld } from './layout';
import { wallFaceDistance, type ApronRect } from './works';

/**
 * The works' apron in the terrain's look (`worksApron`, `TerrainSkin`): a flat skin of ground a little
 * over each pad, outside the chambers' walls, so the ramp the terrain makes up from a lock's floor past
 * its walls never shows. Its walk surface is the same rectangles (shipyard.ts). No three.js here.
 */

/** How far (m) the apron lies over its pad. */
export const APRON_LIFT = 0.03;
/** Within this far (m) of a wall's outer face, the apron reads its light and masks from this far out. */
const LOOK_CLEAR = 3.5;

const F = { u: 0, v: 0 };

/**
 * Where an apron vertex reads its baked light and masks: off a wall's foot, where the bake has the
 * ground's ramp (rock and shade), it reads them from the pad `LOOK_CLEAR` m out from the wall.
 */
function look(x: number, z: number, out: { x: number; z: number }): void {
  toFrame(x, z, F);
  const { u, v } = F;
  const d = wallFaceDistance(u, v);
  if (d >= LOOK_CLEAR) return;
  const e = 0.25;
  let gu = wallFaceDistance(u + e, v) - wallFaceDistance(u - e, v);
  let gv = wallFaceDistance(u, v + e) - wallFaceDistance(u, v - e);
  const len = Math.hypot(gu, gv) || 1;
  gu /= len;
  gv /= len;
  const p = toWorld(u + gu * (LOOK_CLEAR - d), v + gv * (LOOK_CLEAR - d));
  out.x = p.x;
  out.z = p.z;
}

/** The apron's rectangles as a terrain skin. */
export function worksSkin(rects: readonly ApronRect[]): TerrainSkin {
  return {
    cell: 2,
    look,
    quads: rects.map((r) => {
      const a = toWorld(r.u0, r.v0);
      const b = toWorld(r.u1, r.v0);
      const c = toWorld(r.u1, r.v1);
      const d = toWorld(r.u0, r.v1);
      return {
        corners: [
          [a.x, a.z],
          [b.x, b.z],
          [c.x, c.z],
          [d.x, d.z],
        ],
        y: r.y + APRON_LIFT,
      };
    }),
  };
}

/** Shore points with no surf: the works' walls stand in sheltered water (inside the cut, at its arms). */
export function worksFoamSkip(x: number, z: number): boolean {
  toFrame(x, z, F);
  if (F.u < -60 || F.u > 200 || F.v < -110 || F.v > -10) return false;
  return wallFaceDistance(F.u, F.v) < 3;
}
