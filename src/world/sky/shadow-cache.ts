/**
 * Refresh rules for the cached static sun shadow map (PLAN §12.4). The static world renders into its
 * own map only when the focus moves past a threshold, the sun turns, or a static caster changes;
 * moving things go in a small map that renders every frame (see cached-sun-shadow.ts).
 */

export interface ShadowCacheRules {
  /** The static map's centre snaps to this world grid (m), so refreshes are rare and repeatable. */
  grid: number;
  /** Refresh once the focus is this far (m, in XZ) from the static map's centre. */
  threshold: number;
  /** Refresh once the sun has turned this far (radians) from the direction the map was drawn with. */
  sunAngle: number;
}

export const SHADOW_CACHE: Readonly<ShadowCacheRules> = {
  grid: 25,
  threshold: 50,
  sunAngle: (0.25 * Math.PI) / 180,
};

/** Why the static map needs a refresh this frame. */
export type StaticRefresh = 'none' | 'first' | 'forced' | 'focus' | 'sun' | 'scene';

/** The state the static map was last drawn with (mutated in place, so the hot loop doesn't allocate). */
export class StaticShadowState {
  valid = false;
  cx = 0;
  cz = 0;
  sunX = 0;
  sunY = 1;
  sunZ = 0;
}

export function snapToGrid(v: number, grid: number): number {
  return Math.round(v / grid) * grid + 0; // + 0: no -0
}

/**
 * Decides whether the static map needs a refresh. `sun*` is the unit direction toward the sun;
 * `sceneChanged` is true when a static caster appeared, hid or moved (the caster sweep). The caller
 * then calls `commitStaticRefresh` with the same values once it draws.
 */
export function staticRefreshReason(
  state: StaticShadowState,
  focusX: number,
  focusZ: number,
  sunX: number,
  sunY: number,
  sunZ: number,
  sceneChanged: boolean,
  forced: boolean,
  rules: Readonly<ShadowCacheRules> = SHADOW_CACHE,
): StaticRefresh {
  if (!state.valid) return 'first';
  if (forced) return 'forced';
  const dx = focusX - state.cx,
    dz = focusZ - state.cz;
  if (dx * dx + dz * dz > rules.threshold * rules.threshold) return 'focus';
  const dot = sunX * state.sunX + sunY * state.sunY + sunZ * state.sunZ;
  if (dot < Math.cos(rules.sunAngle)) return 'sun';
  if (sceneChanged) return 'scene';
  return 'none';
}

/** Records a refresh: the centre snaps to the grid nearest the focus, and the sun direction is kept. */
export function commitStaticRefresh(
  state: StaticShadowState,
  focusX: number,
  focusZ: number,
  sunX: number,
  sunY: number,
  sunZ: number,
  rules: Readonly<ShadowCacheRules> = SHADOW_CACHE,
): void {
  state.valid = true;
  state.cx = snapToGrid(focusX, rules.grid);
  state.cz = snapToGrid(focusZ, rules.grid);
  state.sunX = sunX;
  state.sunY = sunY;
  state.sunZ = sunZ;
}

/**
 * The half-size (m) a static map must cover so shadows reach `reach` metres past the focus in every
 * direction until the next refresh (the focus can drift up to the threshold from the centre).
 */
export function staticCoverage(reach: number, rules: Readonly<ShadowCacheRules> = SHADOW_CACHE): number {
  return rules.threshold + reach;
}
