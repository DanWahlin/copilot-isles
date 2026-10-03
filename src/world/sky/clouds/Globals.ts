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
  horizonColor: uniform(new Color(0.6, 0.7, 0.85)).setName('gHorizon'),
  waterAbsorption: uniform(new Vector3(0.42, 0.075, 0.035)).setName('gWaterAbs'),
  waterScattering: uniform(new Vector3(0.012, 0.018, 0.024)).setName('gWaterScat'),
  cameraUnderwater: uniform(0).setName('gCamUnder'),
  cameraWaterHeight: uniform(0).setName('gCamWaterH'),
  exposure: uniform(1).setName('gExposure'),
  windDir: world.windDir,
  windSpeed: world.windSpeed,
  night: world.night,
};

/** What the ported atmosphere reads back from the GPU about four times a second. */
interface AtmosphereReadback {
  skyIrradiance?: readonly number[];
  horizon?: readonly number[];
}

/**
 * Per-frame globals for the Tidewater sky and clouds. Like Tidewater's applyAtmosphereReadback()
 * (App.js), the clouds' ambient light and horizon colour come from the atmosphere's own irradiance
 * readback, so shaded cloud sides get the sky's real light. Until the first readback lands (or on
 * paths without the atmosphere), they fall back to the keyed sky colour.
 */
export function syncTidewaterGlobals(dt: number, atmo?: AtmosphereReadback | null): void {
  G.dt.value = Math.max(0, dt);
  const irr = atmo?.skyIrradiance;
  if (irr) {
    const nightAmb = 0.012 * world.night.value;
    G.skyIrradiance.value.setRGB(irr[0]! + nightAmb * 0.6, irr[1]! + nightAmb * 0.7, irr[2]! + nightAmb);
  } else {
    G.skyIrradiance.value.copy(world.skyColor.value).multiplyScalar(0.55 + 0.25 * (1 - world.night.value));
  }
  const h = atmo?.horizon;
  if (h) G.horizonColor.value.setRGB(h[0]!, h[1]!, h[2]!);
  else G.horizonColor.value.copy(world.hazeColor.value);
}
