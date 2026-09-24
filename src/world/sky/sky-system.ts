import {
  AdditiveBlending,
  BackSide,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector3,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  floor,
  fog,
  fract,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pmremTexture,
  pow,
  sin,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { TierSettings } from '../../engine/quality';
import type { DayClock } from '../../engine/day-clock';
import { world } from '../uniforms';
import { sunState, smoothstep as ss, type SunState } from './sun';

/** Lighting keyframes keyed by sun elevation (PLAN §6), blended continuously. */
interface Key {
  el: number;
  sun: [number, number, number];
  sunI: number;
  sky: [number, number, number];
  ground: [number, number, number];
  hemiI: number;
  haze: [number, number, number];
  exposure: number;
  turbidity: number;
  rayleigh: number;
  fog: number;
}

// prettier-ignore
const KEYS: Key[] = [
  { el: -0.35, sun: [0.55, 0.65, 1.0], sunI: 0.3, sky: [0.12, 0.17, 0.3], ground: [0.02, 0.03, 0.05], hemiI: 0.35, haze: [0.05, 0.08, 0.14], exposure: 1.9, turbidity: 2, rayleigh: 0.6, fog: 0.00022 },
  { el: -0.06, sun: [0.6, 0.62, 0.9], sunI: 0.25, sky: [0.3, 0.3, 0.5], ground: [0.06, 0.05, 0.06], hemiI: 0.35, haze: [0.34, 0.3, 0.38], exposure: 1.5, turbidity: 2.2, rayleigh: 1.2, fog: 0.00028 },
  { el: 0.03, sun: [1.0, 0.5, 0.24], sunI: 1.5, sky: [0.55, 0.5, 0.6], ground: [0.16, 0.1, 0.08], hemiI: 0.35, haze: [0.95, 0.66, 0.48], exposure: 1.05, turbidity: 3, rayleigh: 1.8, fog: 0.0003 },
  { el: 0.16, sun: [1.0, 0.74, 0.48], sunI: 2.4, sky: [0.55, 0.66, 0.85], ground: [0.22, 0.17, 0.12], hemiI: 0.32, haze: [0.9, 0.8, 0.7], exposure: 0.66, turbidity: 3, rayleigh: 1.6, fog: 0.00024 },
  { el: 0.45, sun: [1.0, 0.93, 0.82], sunI: 2.8, sky: [0.5, 0.68, 0.95], ground: [0.26, 0.24, 0.18], hemiI: 0.3, haze: [0.72, 0.8, 0.9], exposure: 0.55, turbidity: 2.4, rayleigh: 1.2, fog: 0.0002 },
  { el: 1.0, sun: [1.0, 0.97, 0.92], sunI: 3.0, sky: [0.46, 0.66, 0.98], ground: [0.28, 0.26, 0.2], hemiI: 0.3, haze: [0.68, 0.78, 0.9], exposure: 0.52, turbidity: 2, rayleigh: 1, fog: 0.00018 },
];

function lerpKey(el: number, out: Key): Key {
  let i = 0;
  while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const a = KEYS[i],
    b = KEYS[i + 1];
  const t = ss(a.el, b.el, el);
  const l = (x: number, y: number) => x + (y - x) * t;
  const l3 = (x: number[], y: number[], o: number[]) => {
    o[0] = l(x[0], y[0]);
    o[1] = l(x[1], y[1]);
    o[2] = l(x[2], y[2]);
  };
  out.el = el;
  l3(a.sun, b.sun, out.sun);
  l3(a.sky, b.sky, out.sky);
  l3(a.ground, b.ground, out.ground);
  l3(a.haze, b.haze, out.haze);
  out.sunI = l(a.sunI, b.sunI);
  out.hemiI = l(a.hemiI, b.hemiI);
  out.exposure = l(a.exposure, b.exposure);
  out.turbidity = l(a.turbidity, b.turbidity);
  out.rayleigh = l(a.rayleigh, b.rayleigh);
  out.fog = l(a.fog, b.fog);
  return out;
}

/**
 * Night sky on a back-side dome, additive, faded by the night factor: a moonlit gradient glow, the
 * moon halo, and (main view only) stars and the moon disc. The env capture gets the glow + halo so
 * night reflections and ambient aren't black.
 */
function makeNightDome(radius: number, full: boolean): Mesh {
  const mat = new MeshBasicNodeMaterial({
    side: BackSide,
    depthWrite: false,
    transparent: true,
    blending: AdditiveBlending,
    fog: false,
  });
  mat.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const up = max(dir.y, 0);
    const md = dot(dir, world.moonDir);
    const moonUp = smoothstep(-0.1, 0.25, world.moonDir.y);
    const glow = mix(vec3(0.055, 0.085, 0.16), vec3(0.012, 0.022, 0.055), pow(up, 0.5))
      .mul(moonUp.mul(0.6).add(0.4))
      .add(vec3(0.25, 0.3, 0.42).mul(pow(max(md, 0), 8).mul(0.35).mul(moonUp)));
    const halo = vec3(0.7, 0.78, 0.95).mul(pow(max(md, 0), 180).mul(0.3));
    let col = glow.add(halo);
    if (full) {
      // Jittered star per cell of a direction grid; brightness varies and twinkles.
      const cell = floor(dir.mul(180));
      const h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
      const h2 = fract(h.mul(91.7));
      const d = fract(dir.mul(180)).sub(0.5).length();
      const star = smoothstep(0.18, 0.0, d)
        .mul(smoothstep(0.985, 1.0, h))
        .mul(h2.mul(1.6).add(0.4));
      const twinkle = sin(world.time.mul(h2.mul(3).add(1)).add(h.mul(40)))
        .mul(0.25)
        .add(0.75);
      const above = smoothstep(-0.02, 0.12, dir.y);
      const disc = smoothstep(0.99955, 0.99975, md);
      col = col.add(
        star
          .mul(twinkle)
          .mul(above)
          .mul(vec3(0.9, 0.95, 1.0))
          .mul(1.6),
      );
      col = col.add(vec3(0.95, 0.96, 1.0).mul(disc.mul(3.0)));
    }
    return col.mul(world.night);
  })();
  const m = new Mesh(new SphereGeometry(radius, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -9;
  return m;
}

export interface SkySystem {
  sun: DirectionalLight;
  hemi: HemisphereLight;
  /** Stable PMREM sky environment (also scene.environment). */
  env: Texture;
  state: SunState;
  /** Call once per frame. `focus` is the point shadows and the env capture centre on. */
  update(clock: DayClock, focus: Vector3): void;
  /** Force an environment + shadow refresh (e.g. after a time scrub). */
  invalidate(): void;
  dispose(): void;
}

/**
 * Sky, sun/moon lighting, haze fog, and the progressively refreshed environment map.
 * Uses three's TSL SkyMesh (Preetham scattering + clouds) as the Phase 0 sky; see issues.md
 * for the Hillaire LUT upgrade.
 */
export function createSky(renderer: WebGPURenderer, scene: Scene, tier: TierSettings): SkySystem {
  const R = 4800;
  const sky = new SkyMesh();
  sky.scale.setScalar(R);
  sky.material.fog = false;
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.cloudCoverage.value = 0.38;
  sky.cloudDensity.value = 0.45;
  sky.cloudElevation.value = 0.55;
  sky.mieCoefficient.value = 0.004;
  sky.mieDirectionalG.value = 0.82;
  const nightDome = makeNightDome(R * 0.45, true);
  scene.add(sky, nightDome);

  // A separate sky-only scene for environment captures (never includes the world).
  const envScene = new Scene();
  const envSky = new SkyMesh();
  envSky.scale.setScalar(1000);
  envSky.material.fog = false;
  envSky.showSunDisc.value = 0;
  envScene.add(envSky, makeNightDome(400, false));
  envSky.cloudCoverage.value = sky.cloudCoverage.value;
  envSky.cloudDensity.value = sky.cloudDensity.value;
  envSky.cloudElevation.value = sky.cloudElevation.value;
  envSky.mieCoefficient.value = sky.mieCoefficient.value;
  envSky.mieDirectionalG.value = sky.mieDirectionalG.value;
  const pmrem = new PMREMGenerator(renderer);
  const envSize = tier.tier === 'lite' || tier.tier === 'low' ? 64 : 128;
  // One stable render target: materials keep the same texture object, so refreshes never recompile.
  const envRT = pmrem.fromScene(envScene, 0, 0.1, 2000, { size: envSize });
  scene.environment = envRT.texture;

  const sun = new DirectionalLight(0xffffff, 3);
  sun.castShadow = tier.shadowMap > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    const c = sun.shadow.camera;
    c.left = -140;
    c.right = 140;
    c.top = 140;
    c.bottom = -140;
    c.near = 10;
    c.far = 900;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    // Low/Lite: throttled updates; High+: every frame (moving ship/characters). See issues.md.
    sun.shadow.autoUpdate = tier.dynamicShadows;
  }
  const hemi = new HemisphereLight(0xffffff, 0x222222, 0.3);
  scene.add(sun, sun.target, hemi);
  // The PMREM sky is the main ambient; the hemisphere light is only a ground-bounce fill.
  scene.environmentIntensity = 0.8;

  // Height- and sun-aware haze (PLAN §6 Atmosphere), coloured by the sky itself toward the view
  // direction's horizon so distant land and sea melt into the sky (warmer toward a low sun, for free).
  const densityU = uniform(0.0002);
  const hazeNode = Fn(() => {
    const v = positionWorld.sub(cameraPosition);
    const dist = v.length();
    const dir = v.div(max(dist, 0.001));
    const h = max(positionWorld.y, 0);
    const dens = densityU.mul(exp(h.negate().div(90)));
    const f = clamp(float(1).sub(exp(dist.mul(dens).negate())), 0, 0.9);
    const horizonDir = normalize(vec3(dir.x, max(dir.y, 0).mul(0.5).add(0.03), dir.z));
    const col = pmremTexture(envRT.texture, horizonDir, float(0.45)).rgb;
    return fog(mix(world.hazeColor, col, 0.85), f);
  })();
  scene.fogNode = hazeNode;

  const k = { ...KEYS[0], sun: [0, 0, 0], sky: [0, 0, 0], ground: [0, 0, 0], haze: [0, 0, 0] } as Key;
  const lastSun = new Vector3(0, -2, 0);
  const lastFocus = new Vector3(1e9, 0, 0);
  let envAge = 1e9,
    frame = 0,
    forced = true;
  const tmp = new Vector3();
  const state: SunState = sunState(16.5);

  const refreshEnv = () => {
    envSky.sunPosition.value.copy(sky.sunPosition.value);
    envSky.turbidity.value = sky.turbidity.value;
    envSky.rayleigh.value = sky.rayleigh.value;
    pmrem.fromScene(envScene, 0, 0.1, 2000, { size: envSize, renderTarget: envRT });
    envAge = 0;
  };

  return {
    sun,
    hemi,
    env: envRT.texture,
    state,
    update(clock, focus) {
      frame++;
      const s = sunState(clock.hours, clock.azimuth);
      Object.assign(state, s);
      const key = s.key === 'sun' ? s.sun : s.moon;
      lerpKey(s.sun[1], k);

      world.sunDir.value.set(s.sun[0], s.sun[1], s.sun[2]);
      world.moonDir.value.set(s.moon[0], s.moon[1], s.moon[2]);
      world.keyDir.value.set(key[0], key[1], key[2]);
      world.night.value = s.night;
      const moonI = 0.35 * s.night;
      const I = s.key === 'sun' ? k.sunI * ss(-0.07, 0.02, s.sun[1]) + moonI : moonI;
      world.sunColor.value.setRGB(k.sun[0] * I, k.sun[1] * I, k.sun[2] * I);
      world.skyColor.value.setRGB(k.sky[0], k.sky[1], k.sky[2]);
      world.hazeColor.value.setRGB(k.haze[0], k.haze[1], k.haze[2]);
      densityU.value = k.fog;

      sky.sunPosition.value.set(s.sun[0], s.sun[1], s.sun[2]).multiplyScalar(R);
      sky.turbidity.value = k.turbidity;
      sky.rayleigh.value = k.rayleigh;
      sky.position.copy(focus);
      nightDome.position.copy(focus);

      sun.color.setRGB(k.sun[0], k.sun[1], k.sun[2]);
      sun.intensity = I;
      tmp.set(key[0], key[1], key[2]).multiplyScalar(400);
      // Snap the shadow focus to a grid so the cached map doesn't shimmer as the camera moves.
      const sx = Math.round(focus.x / 8) * 8,
        sz = Math.round(focus.z / 8) * 8;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + tmp.x, Math.max(tmp.y, 20), sz + tmp.z);
      sun.target.updateMatrixWorld();
      hemi.color.setRGB(k.sky[0], k.sky[1], k.sky[2]);
      hemi.groundColor.setRGB(k.ground[0], k.ground[1], k.ground[2]);
      hemi.intensity = k.hemiI;
      renderer.toneMappingExposure = k.exposure;

      // Cached shadows (PLAN §12.4): refresh on sun moves, focus moves, or every few frames on Low.
      if (sun.castShadow && !sun.shadow.autoUpdate) {
        const moved = lastFocus.distanceToSquared(sun.target.position) > 40 * 40;
        if (forced || moved || lastSun.distanceToSquared(world.sunDir.value) > 1e-5 || frame % 4 === 0) {
          sun.shadow.needsUpdate = true;
          lastFocus.copy(sun.target.position);
        }
      }

      // Environment: refresh after a meaningful sun move, or every 3 s while time flows.
      envAge += 1 / 60;
      const sunMoved = lastSun.distanceToSquared(world.sunDir.value) > 0.004 * 0.004;
      if (forced || (sunMoved && envAge > 0.5) || (clock.speed !== 0 && envAge > 180)) {
        refreshEnv();
        lastSun.copy(world.sunDir.value);
      }
      forced = false;
    },
    invalidate() {
      forced = true;
    },
    dispose() {
      scene.remove(sky, nightDome, sun, sun.target, hemi);
      if (scene.environment === envRT.texture) scene.environment = null;
      if (scene.fogNode === hazeNode) scene.fogNode = null;
      sun.dispose();
      envRT.dispose();
      pmrem.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      nightDome.geometry.dispose();
      (nightDome.material as MeshBasicNodeMaterial).dispose();
    },
  };
}
