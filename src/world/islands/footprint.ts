/**
 * An island's outline as its land's reach along evenly spaced bearings from its centre (bearing k at
 * `k / n` of a turn from +x toward +z). The swap between an island and its silhouette goes by how far
 * you are from its shore, not its centre: Port Meridian's ridge runs ~500 m north-east of its centre
 * and ~200 m south, so a swap at one centre distance came ~250 m off its north-east cliffs.
 */
export interface IslandFootprint {
  x: number;
  z: number;
  /** Land's reach (m) along each bearing. */
  radii: readonly number[];
}

/** The mean of a footprint's radii (m). */
function meanRadius(f: IslandFootprint): number {
  let s = 0;
  for (const r of f.radii) s += r;
  return s / f.radii.length;
}

const means = new WeakMap<IslandFootprint, number>();

/**
 * The distance from (x, z) to the island's centre as if its shore were round (its mean radius) on
 * every bearing: off the island, its mean radius plus the distance to its outline (a polygon through
 * each bearing's reach, so a cove between two headlands doesn't count); on it, in proportion to its
 * reach on that bearing. Equal values are equally far off the shore, so ranges written as centre
 * distances (show, load, unload) keep their meaning on the island's average side. No allocation.
 */
export function footprintDistance(f: IslandFootprint, x: number, z: number): number {
  const dx = x - f.x;
  const dz = z - f.z;
  const n = f.radii.length;
  let mean = means.get(f);
  if (mean === undefined) {
    mean = meanRadius(f);
    means.set(f, mean);
  }
  let a = (Math.atan2(dz, dx) / (Math.PI * 2)) * n;
  if (a < 0) a += n;
  const i = Math.floor(a);
  const t = a - i;
  const reach = f.radii[i % n]! * (1 - t) + f.radii[(i + 1) % n]! * t;
  const d = Math.hypot(dx, dz);
  if (d <= reach) return reach > 0 ? (d / reach) * mean : mean;
  let best = Infinity;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const ax = Math.cos(a0) * f.radii[k]!,
      az = Math.sin(a0) * f.radii[k]!;
    const bx = Math.cos(a1) * f.radii[(k + 1) % n]!,
      bz = Math.sin(a1) * f.radii[(k + 1) % n]!;
    const ex = bx - ax,
      ez = bz - az;
    const l2 = ex * ex + ez * ez;
    const u = l2 > 0 ? Math.min(1, Math.max(0, ((dx - ax) * ex + (dz - az) * ez) / l2)) : 0;
    const q = Math.hypot(dx - ax - ex * u, dz - az - ez * u);
    if (q < best) best = q;
  }
  return mean + best;
}

/** Measures a footprint from an island's height: the farthest ground over `above` m on each bearing. */
export function measureFootprint(
  height: (x: number, z: number) => number,
  x: number,
  z: number,
  bearings = 32,
  maxRadius = 700,
  step = 4,
  above = 0.5,
): IslandFootprint {
  const radii: number[] = [];
  for (let k = 0; k < bearings; k++) {
    const a = (k / bearings) * Math.PI * 2;
    let reach = 0;
    for (let r = 0; r <= maxRadius; r += step)
      if (height(x + Math.cos(a) * r, z + Math.sin(a) * r) > above) reach = r;
    radii.push(reach);
  }
  return { x, z, radii };
}
