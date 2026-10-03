// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/core/Globals.js@fd6cae6
import { Color, Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { world } from '../../uniforms';

export const G = {
  time: world.time,
  dt: uniform(1 / 60).setName('gDt'),
  seaLevel: uniform(0).setName('gSeaLevel'),
  sunDir: world.keyDir,
  sunColor: world.sunColor,
  skyIrradiance: uniform(new Color(0.3, 0.4, 0.6)).setName('gSkyIrr'),
  horizonColor: world.hazeColor,
  waterAbsorption: uniform(new Vector3(0.42, 0.075, 0.035)).setName('gWaterAbs'),
  waterScattering: uniform(new Vector3(0.012, 0.018, 0.024)).setName('gWaterScat'),
  cameraUnderwater: uniform(0).setName('gCamUnder'),
  cameraWaterHeight: uniform(0).setName('gCamWaterH'),
  exposure: uniform(1).setName('gExposure'),
  windDir: world.windDir,
  windSpeed: world.windSpeed,
  night: world.night,
};

export function syncTidewaterGlobals(dt: number): void {
  G.dt.value = Math.max(0, dt);
  G.skyIrradiance.value.copy(world.skyColor.value).multiplyScalar(0.55 + 0.25 * (1 - world.night.value));
}
