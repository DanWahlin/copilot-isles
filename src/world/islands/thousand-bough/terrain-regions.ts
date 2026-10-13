import { float, smoothstep, vec2 } from 'three/tsl';
import { segmentMaskNode, type TerrainRegions } from '../../terrain/terrain-regions';
import { THOUSAND_BOUGH as TB } from './layout';

// TSL's fluent typings don't cover every mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** 1 along a polyline of waypoints (half-width `inner`, easing out by `outer`). */
function polylineMask(points: readonly { x: number; z: number }[], inner: number, outer: number, P: AnyNode) {
  let mask: AnyNode = float(0);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    mask = mask.max(segmentMaskNode(a.x, a.z, b.x, b.z, inner, outer, P));
  }
  return mask;
}

/**
 * Thousand-Bough's ground: the Fern Walk and its side paths as trodden earth, the jungle valley as
 * one smooth green hill (no height bands; cliff colour only on the near-sheer faces), and the dark
 * mouth of the cave behind Great Falls. Written as numbers from the layout (no meshes imported).
 */
export const thousandBoughTerrainRegions: TerrainRegions = ({ P, y, up }) => {
  const island = smoothstep(TB.bounds.minX, TB.bounds.minX + 30, P.x)
    .mul(float(1).sub(smoothstep(TB.bounds.maxX - 30, TB.bounds.maxX, P.x)))
    .mul(smoothstep(TB.bounds.minZ, TB.bounds.minZ + 30, P.z))
    .mul(float(1).sub(smoothstep(TB.bounds.maxZ - 30, TB.bounds.maxZ, P.z)));
  const sp = TB.sidePaths;
  const paths = polylineMask(TB.fernWalk.points, TB.fernWalk.width / 2 - 0.2, TB.fernWalk.width / 2 + 1.6, P)
    .max(polylineMask(sp.mirror, 1.2, 2.8, P))
    .max(polylineMask(sp.westBeach, 1.0, 2.6, P))
    .mul(smoothstep(1.2, 3.0, y))
    .mul(island);
  // The valley inside the horseshoe: lush and even, with the bands and strata kept for the cliffs.
  const valley = float(1)
    .sub(smoothstep(0.82, 1.0, vec2(P.x.sub(2030).div(250), P.z.add(1490).div(230)).length()))
    .mul(island);
  const c = TB.cave;
  const cave = float(1)
    .sub(
      smoothstep(
        0.0,
        1.0,
        vec2(P.x.sub(c.mouth.x).div(c.width * 0.6), P.z.sub(c.mouth.z - 3).div(7)).length(),
      ),
    )
    .mul(smoothstep(c.floor - 1, c.floor + 1, y))
    .mul(float(1).sub(smoothstep(c.floor + c.height, c.floor + c.height + 3, y)));
  // Every steep face on the island is wet basalt (the horseshoe's cliffs, the sea cliffs, the falls).
  // Gentler slopes take the same look, where its moss covers them (green ridges, dark wet faces).
  const basalt = smoothstep(0.97, 0.8, up)
    .mul(smoothstep(-1, 3, y))
    .mul(island);
  return { paths, grassySlopes: valley, cave, basalt };
};
