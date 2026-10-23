import { uniform } from 'three/tsl';
import { world } from '../uniforms';
import { seaState, type SeaParams } from './sea-state';
import { ALL_WAVES } from './waves';

/**
 * The GPU side of the sea state (sea-state.ts): every number a sea shader reads from it is a uniform
 * here, made once, so a change of state, or its ease, rebuilds no shader (PLAN §15.4). `syncSea`
 * copies the live sea in once a frame; the CPU wave field reads the same numbers.
 */
export const seaUniforms = {
  /** Live amplitude (m) of each Gerstner component, longest first. */
  amp: ALL_WAVES.map((w) => uniform(w.a)),
  /** Live steepness × amplitude (Q·a, m): the horizontal displacement. */
  qa: ALL_WAVES.map((w) => uniform(w.q * w.a)),
  /** Live unresolved slope energy (specular AA), ½(Q·a)². */
  slopeVariance: ALL_WAVES.map((w) => uniform(w.slopeVariance)),
  /** Whitecaps start this far up the crest (height over the summed amplitude). */
  capFrom: uniform(0.62),
  /** Whitecap strength from the wind. */
  capWind: uniform(0.5),
  /** Wind-blown foam streaks, 0-1. */
  spindrift: uniform(0),
  /** × the coast surf ribbon. */
  surf: uniform(1),
};

let syncedVersion = -1;
let lastT = Number.NaN;
/** The drift's offset (m): `windDrift = wind × t + offset` stays continuous when the wind changes. */
let driftOffsetX = 0;
let driftOffsetZ = 0;
let driftWindX = Number.NaN;
let driftWindZ = Number.NaN;

function copyParams(p: SeaParams): void {
  for (let i = 0; i < ALL_WAVES.length; i++) {
    const w = ALL_WAVES[i]!;
    const a = w.a * p.amp[i]!;
    const q = w.q * p.steep[i]!;
    seaUniforms.amp[i]!.value = a;
    seaUniforms.qa[i]!.value = q * a;
    seaUniforms.slopeVariance[i]!.value = 0.5 * (q * a) ** 2;
  }
  seaUniforms.capFrom.value = p.capFrom;
  seaUniforms.capWind.value = p.capWind;
  seaUniforms.spindrift.value = p.spindrift;
  seaUniforms.surf.value = p.surf;
  world.windSpeed.value = p.swayWind;
  world.gust.value = p.gust;
}

/**
 * Advances the sea state to world time `t` and copies it to the uniforms (every ocean calls this once
 * a frame before the ship and life sample the sea; a second call in the same frame changes nothing).
 */
export function syncSea(t: number): void {
  seaState.update(t);
  if (seaState.version !== syncedVersion) {
    syncedVersion = seaState.version;
    copyParams(seaState.live);
  }
  if (t === lastT) return;
  lastT = t;
  const dir = world.windDir.value;
  const len = Math.hypot(dir.x, dir.y) || 1;
  const wx = (dir.x / len) * world.windSpeed.value;
  const wz = (dir.y / len) * world.windSpeed.value;
  if (wx !== driftWindX || wz !== driftWindZ) {
    if (Number.isFinite(driftWindX)) {
      driftOffsetX += (driftWindX - wx) * t;
      driftOffsetZ += (driftWindZ - wz) * t;
    }
    driftWindX = wx;
    driftWindZ = wz;
  }
  world.windDrift.value.set(wx * t + driftOffsetX, wz * t + driftOffsetZ);
}
