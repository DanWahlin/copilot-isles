// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/sky/Atmosphere.js@fd6cae6
import { Color, type Node } from 'three/webgpu';
import { clamp, dot, exp, float, max, mix, normalize, pow, smoothstep, uniform, vec3 } from 'three/tsl';
import { world } from '../uniforms';

export interface AnalyticSky {
  /** Sky colour along a unit direction (no sun disc, no clouds). */
  color(dir: Node<'vec3'>): Node<'vec3'>;
  haze: {
    rayleigh: { value: Color };
    mie: { value: Color };
    groundBounce: { value: Color };
  };
}

/**
 * A cheap analytic sky (Hillaire-style constants folded into one TSL function), kept for the day
 * environment: its bluer reflections and ambient are what the approved day looks are tuned on. From
 * late golden hour through night the environment is the live LUT sky instead (sky-system.ts).
 */
export function createAnalyticSky(): AnalyticSky {
  const rayleighU = uniform(new Color(0.1, 0.34, 0.96));
  const mieU = uniform(new Color(1.0, 0.68, 0.42));
  const bounceU = uniform(new Color(0.18, 0.14, 0.1));
  const color = (dir: Node<'vec3'>) => {
    const sun = normalize(world.sunDir);
    const mu = dot(dir, sun);
    const sunUp = smoothstep(-0.08, 0.08, sun.y);
    const up = clamp(dir.y.mul(0.5).add(0.5), 0, 1);
    const viewUp = max(dir.y, -0.08).add(0.11);
    const opticalDepth = float(1).div(max(viewUp, 0.035));
    const rayleighPhase = mu.mul(mu).add(1).mul(0.75);
    const mieForward = pow(max(mu, 0), 70)
      .mul(1.2)
      .add(pow(max(mu, 0), 12).mul(0.12));
    const horizon = exp(dir.y.abs().mul(-7));
    const transmittance = exp(vec3(-0.07, -0.03, -0.012).mul(opticalDepth).mul(sunUp.mul(0.3).add(0.1)));
    const skyGradient = mix(vec3(0.74, 0.92, 1.1), rayleighU.mul(1.45), pow(up, 0.56))
      .mul(transmittance.mul(0.22).add(0.78))
      .mul(sunUp.mul(0.75).add(0.24));
    const zenith = skyGradient.mul(rayleighPhase.mul(0.12).add(0.88));
    const lowSun = mieU.mul(mieForward.mul(0.3).add(horizon.mul(0.14))).mul(sunUp);
    const ground = bounceU.mul(float(1).sub(up).mul(0.5));
    const col = zenith.mul(up.mul(0.72).add(0.18)).add(lowSun).add(ground);
    return mix(col, vec3(0.01, 0.018, 0.04), world.night.mul(0.88));
  };
  return { color, haze: { rayleigh: rayleighU, mie: mieU, groundBounce: bounceU } };
}
