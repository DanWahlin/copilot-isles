import { Sphere, Vector3 } from 'three/webgpu';
import { WaterStrips, type StripFlow } from '../sites/water';
import { meridianWater } from './meridian';
import type { FreshWater, WaterBasin } from './meridian-water';
import { smoothstep } from '../../util/math';
import { addNaturalFreshWater, FALLS, steepness, type NaturalWaterOptions } from './fresh-water-natural';

/** Segments round a basin's shore (the fan's rim). */
const RIM = 40;

/**
 * An island's fresh water (Port Meridian's by default) as one static mesh (one draw) in the mill
 * race's flowing-water material (same TSL graph, so no new program). With `natural` (both islands)
 * its pools and streams are natural water (`addNaturalFreshWater`) and only its falls keep the
 * falling-water look, white and fast; without it, still fans for the basins and strips down the
 * streams, with a ring of churned foam where a fall lands. Built once; only the shader's time moves it.
 */
export function createMeridianWaterMesh(
  water: FreshWater = meridianWater(),
  opts: {
    name?: string;
    maxQuads?: number;
    extra?: (strips: WaterStrips) => void;
    /** Draw the pools and the gentler streams as natural water (only the falls keep their look). */
    natural?: NaturalWaterOptions;
  } = {},
): WaterStrips {
  const strips = new WaterStrips(opts.maxQuads ?? 1200);
  strips.mesh.name = opts.name ?? 'meridian fresh water';
  strips.begin();
  const natural = opts.natural;
  if (natural) addNaturalFreshWater(strips, water, natural);
  else
    for (const b of Object.values(water.basins))
      basin(strips, water, b, 1.05, b.level, { fill: 1, speed: 0.05, kind: 1 });
  // White water where the cascade and the brook's rapids plunge in.
  for (const s of water.streams) {
    const n = s.count;
    for (let i = 0; i < n - 1; i++) {
      const x0 = s.x[i]!;
      const z0 = s.z[i]!;
      const x1 = s.x[i + 1]!;
      const z1 = s.z[i + 1]!;
      const run = Math.hypot(x1 - x0, z1 - z0) || 1;
      const drop = s.surface[i]! - s.surface[i + 1]!;
      const slope = Math.max(0, drop / run);
      const steep = steepness(slope);
      // Natural water draws all but the falls (and its pools foam under them).
      if (natural && steep <= FALLS) continue;
      // Falls spread a little wider than the channel, and run fast and foamy; the width breathes.
      const w = s.spec.halfWidth * (1 + steep * 0.12) * (0.9 + 0.1 * Math.sin(s.along[i]! * 0.19 + 1));
      const tx0 = tangent(s.x, s.z, n, i);
      const tx1 = tangent(s.x, s.z, n, i + 1);
      // Lifted a little more on steep runs, where the 2 m terrain pack can't follow the gully's bed.
      const y0 = s.surface[i]! + 0.04 + steep * 0.35;
      const y1 = s.surface[i + 1]! + 0.04 + steep * 0.35;
      strips.quad(
        [x0 - tx0[1] * w, y0, z0 + tx0[0] * w],
        [x0 + tx0[1] * w, y0, z0 - tx0[0] * w],
        [x1 - tx1[1] * w, y1, z1 + tx1[0] * w],
        [x1 + tx1[1] * w, y1, z1 - tx1[0] * w],
        s.along[i]!,
        s.along[i]! + Math.hypot(run, drop),
        {
          fill: 1,
          speed: 0.8 + steep * 2.6,
          foam: smoothstep(0.12, 0.8, slope) * 0.7,
          kind: steep > FALLS ? -1 : 0,
        },
        0,
        1,
      );
      // Where a fall lands in a basin, churned foam round the foot.
      const next = i + 2 < n ? s.surface[i + 1]! - s.surface[i + 2]! : 0;
      if (!natural && slope > 0.5 && next < 0.2 && s.spec.to !== 'sea') {
        const b = water.basins[s.spec.to]!;
        foamRing(strips, x1, z1, b.level + 0.03, s.spec.halfWidth * 2.2);
      }
    }
  }
  opts.extra?.(strips);
  strips.end();
  // Static: a real bound lets the renderer cull it (the class's buffers are sized for the maximum).
  const { minX, maxX, minZ, maxZ } = water.box;
  const geo = strips.mesh.geometry;
  geo.boundingSphere = new Sphere(
    new Vector3((minX + maxX) / 2, 80, (minZ + maxZ) / 2),
    Math.hypot(maxX - minX, maxZ - minZ, 160) / 2,
  );
  strips.mesh.frustumCulled = true;
  strips.mesh.renderOrder = 1;
  return strips;
}

function basin(
  strips: WaterStrips,
  water: FreshWater,
  b: WaterBasin,
  k: number,
  y: number,
  f: StripFlow,
): void {
  const c = [b.x, y, b.z];
  for (let i = 0; i < RIM; i++) {
    const [ax, az] = water.rimPoint(b, (i / RIM) * Math.PI * 2, k);
    const [bx, bz] = water.rimPoint(b, ((i + 1) / RIM) * Math.PI * 2, k);
    strips.quad(c, c, [ax, y, az], [bx, y, bz], 0, Math.hypot(ax - b.x, az - b.z), f, 0.5, 0.5);
  }
}

function foamRing(strips: WaterStrips, x: number, z: number, y: number, r: number): void {
  const c = [x, y, z];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    strips.quad(
      c,
      c,
      [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r],
      [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r],
      0,
      r,
      { fill: 0.85, speed: 1.6, foam: 0.9, kind: 0 },
      0.5,
      0.5,
    );
  }
}

const TAN: [number, number] = [0, 0];

/** Unit direction of travel at sample i (averaged with its neighbours, so strips join smoothly). */
function tangent(xs: Float64Array, zs: Float64Array, n: number, i: number): [number, number] {
  const a = Math.max(0, i - 1);
  const b = Math.min(n - 1, i + 1);
  const dx = xs[b]! - xs[a]!;
  const dz = zs[b]! - zs[a]!;
  const len = Math.hypot(dx, dz) || 1;
  TAN[0] = dx / len;
  TAN[1] = dz / len;
  return [TAN[0], TAN[1]];
}
