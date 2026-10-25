import type { TerrainBakeData } from '../../src/world/terrain/bake';

const RADIUS = 7;
const SIGMA_D = 5;
const SIGMA_H = 1.4;

export interface SteepLightOptions {
  /** How far (grid cells) a point takes the mean from. Default 7 (14 m on a 2 m grid). */
  radius?: number;
  /** The spread of the distance weight (cells). Default 5. */
  sigma?: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Smooths the baked light (sky openness, both suns' visibility and the rim flag) on steep faces,
 * along the face's contours only. The bake samples the light once per 2 m grid point, and down a
 * steep face each grid column catches a slightly different bit of relief (a sun ray that just clears
 * a buttress, or just doesn't), so neighbouring columns differ sharply. The GPU then stretches those
 * values down the face's tall triangles into vertical streaks. Each steep point takes a weighted mean
 * of the points within 14 m that stand at nearly its height (a bilateral filter on height), so the
 * shading still falls off up and down the face but no longer flickers along it. Flat and gentle
 * ground keeps its own value. A fluted wall takes a smaller radius (`options`), so the flutes keep
 * their own shade.
 */
export function smoothSteepLight(data: TerrainBakeData, options: SteepLightOptions = {}): void {
  const { nx, nz, heights, normals } = data;
  const radius = options.radius ?? RADIUS;
  const sigma = options.sigma ?? SIGMA_D;
  const channels = [data.ao, data.sunMorning, data.sunGolden, data.rim];
  const raw = channels.map((c) => c.slice());
  const sums = new Float64Array(channels.length);
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const steep = smoothstep(0.8, 0.5, normals[i * 3 + 1]!);
      if (steep <= 0) continue;
      const h = heights[i]!;
      sums.fill(0);
      let total = 0;
      for (let dz = -radius; dz <= radius; dz++) {
        const jz = iz + dz;
        if (jz < 0 || jz >= nz) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const jx = ix + dx;
          if (jx < 0 || jx >= nx) continue;
          const j = jz * nx + jx;
          const dh = heights[j]! - h;
          const w = Math.exp(
            -(dx * dx + dz * dz) / (2 * sigma * sigma) - (dh * dh) / (2 * SIGMA_H * SIGMA_H),
          );
          total += w;
          for (let c = 0; c < channels.length; c++) sums[c]! += raw[c]![j]! * w;
        }
      }
      for (let c = 0; c < channels.length; c++) {
        const own = raw[c]![i]!;
        channels[c]![i] = Math.round(own + (sums[c]! / total - own) * steep);
      }
    }
}
