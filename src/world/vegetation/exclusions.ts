export type VegetationExclude = (x: number, z: number) => boolean;

export const EXCLUSION_SOFT_MARGIN = 1.2;

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.70710678118, 0.70710678118],
  [-0.70710678118, 0.70710678118],
  [0.70710678118, -0.70710678118],
  [-0.70710678118, -0.70710678118],
] as const;

/**
 * Returns 0 inside an excluded surface, 1 outside the soft margin, and a coarse 0-1 edge weight
 * near it. The callback is intentionally sampled only at a few deterministic offsets so callers
 * can use village/path collision tests without a distance-field dependency.
 */
export function exclusionWeight(
  exclude: VegetationExclude | undefined,
  x: number,
  z: number,
  margin = EXCLUSION_SOFT_MARGIN,
): number {
  if (!exclude) return 1;
  if (exclude(x, z)) return 0;

  const radii = [margin / 3, (margin * 2) / 3, margin] as const;
  for (const r of radii) {
    for (const [dx, dz] of DIRS) {
      if (exclude(x + dx * r, z + dz * r)) return Math.max(0, Math.min(1, r / margin));
    }
  }
  return 1;
}

export function excludedByMargin(
  exclude: VegetationExclude | undefined,
  x: number,
  z: number,
  margin = EXCLUSION_SOFT_MARGIN,
): boolean {
  return exclusionWeight(exclude, x, z, margin) < 1;
}
