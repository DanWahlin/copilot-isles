import {
  BackSide,
  CubeUVReflectionMapping,
  DirectionalLight,
  HemisphereLight,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicNodeMaterial,
  PCFShadowMap,
  PMREMGenerator,
  RenderTarget,
  RGBAFormat,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Node,
  type Object3D,
  Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  clamp,
  exp,
  float,
  fog,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pmremTexture,
  uniform,
  vec3,
} from 'three/tsl';
import { sunShadowReach, type TierSettings } from '../../engine/quality';
import type { DayClock } from '../../engine/day-clock';
import type { Backend } from '../contracts';
import { world } from '../uniforms';
import { smoothstep as ss } from '../../util/math';
import { sunState, type SunState } from './sun';
import { createAnalyticSky } from './atmosphere';
import { Atmosphere as TidewaterAtmosphere } from './clouds/Atmosphere';
import { createBakedClouds, type BakedClouds } from './clouds/BakedPanorama';
import { Clouds as TidewaterClouds } from './clouds/Clouds';
import { Sky as TidewaterSky } from './clouds/Sky';
import { syncTidewaterGlobals } from './clouds/Globals';
import { disposeLightShadow, disposeRenderTarget } from '../../util/dispose-three';
import { SHADOW_MASK } from '../shadow-casters';
import { CachedSunShadowNode, type SunShadowMap } from './cached-sun-shadow';
import { staticCoverage } from './shadow-cache';

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
  fog: number;
}

interface TidewaterCloudsPort {
  resolutionScale: number;
  viewSlotsPerFrame: number;
  viewQuality: {
    maxSteps: number;
    ds0: number;
    dsMax: number;
    lightSteps: number[];
    lightDetail: number;
  };
  panoQuality: { maxSteps: number };
  update(dt: number, camera: Camera): void;
  compileAsync(): Promise<void>;
  invalidate(): void;
  shadow(worldXZ: Node<'vec2'>): Node<'float'>;
  disableShadow(): void;
  dispose(): void;
}

interface TidewaterSkyPort {
  reflectionRadiance(dir: Node<'vec3'>): Node<'vec3'>;
  clouds: TidewaterCloudsPort | BakedClouds | null;
  bakeLayer: { value: number };
  starIntensity: { value: number };
  moonDir: { value: Vector3 };
  backgroundNode(): Node<'vec4'>;
}

// prettier-ignore
const KEYS: Key[] = [
  { el: -0.35, sun: [0.55, 0.65, 1.0], sunI: 0.45, sky: [0.08, 0.13, 0.28], ground: [0.02, 0.03, 0.05], hemiI: 0.38, haze: [0.05, 0.08, 0.14], exposure: 1.05, fog: 0.000035 },
  { el: -0.06, sun: [0.62, 0.66, 1.0], sunI: 0.4, sky: [0.18, 0.28, 0.52], ground: [0.05, 0.05, 0.07], hemiI: 0.4, haze: [0.28, 0.3, 0.42], exposure: 0.92, fog: 0.00004 },
  { el: 0.03, sun: [1.0, 0.47, 0.2], sunI: 2.8, sky: [0.27, 0.46, 0.78], ground: [0.18, 0.12, 0.09], hemiI: 0.42, haze: [0.86, 0.58, 0.38], exposure: 0.68, fog: 0.00005 },
  { el: 0.16, sun: [1.0, 0.66, 0.34], sunI: 4.6, sky: [0.25, 0.48, 0.88], ground: [0.26, 0.18, 0.12], hemiI: 0.44, haze: [0.46, 0.57, 0.78], exposure: 0.58, fog: 0.00003 },
  { el: 0.45, sun: [1.0, 0.9, 0.72], sunI: 4.2, sky: [0.2, 0.42, 0.9], ground: [0.3, 0.26, 0.2], hemiI: 0.4, haze: [0.34, 0.52, 0.86], exposure: 0.55, fog: 0.000026 },
  { el: 1.0, sun: [1.0, 0.97, 0.9], sunI: 4.0, sky: [0.18, 0.38, 0.86], ground: [0.32, 0.29, 0.22], hemiI: 0.38, haze: [0.32, 0.5, 0.84], exposure: 0.54, fog: 0.000024 },
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
  out.fog = l(a.fog, b.fog);
  return out;
}

export interface SkySystem {
  sun: DirectionalLight;
  hemi: HemisphereLight;
  /** Stable PMREM sky environment (also scene.environment). */
  env: Texture;
  state: SunState;
  /** TSL cloud-shadow transmittance for terrain materials (1 = clear). */
  cloudShadowNode?(worldXZ: Node<'vec2'>): Node<'float'>;
  /**
   * The island's mood (spec ISLAND-02 §2.4): `fogScale` multiplies the keyframe's haze density and
   * `hazeTint` its colour, `fill` the sky light's strength and `exposure` the frame's. Identity
   * (1, [1, 1, 1], 1, 1) on Anchorage and Meridian; set each frame by the island nearby.
   */
  readonly mood: { fogScale: number; hazeTint: [number, number, number]; fill: number; exposure: number };
  /** Call once per frame. `focus` is the point shadows and the env capture centre on. */
  update(clock: DayClock, focus: Vector3, dt?: number, camera?: Camera): void;
  /** Force an environment + shadow refresh (e.g. after a time scrub). */
  invalidate(): void;
  /**
   * Starts a warm-up of `roots`: classifies their shadow casters now (before the warm-up moves them
   * to its staging layer) and redraws the static shadow map every frame until the returned function
   * is called, so every caster's shadow pipeline is built during the warm-up.
   */
  shadowWarm(roots: Object3D | readonly Object3D[]): () => void;
  /**
   * Loads what the sky needs at these hours and puts it on the GPU (the baked keys on WebGL2, Low,
   * Lite and Medium), so time changes later in play don't hitch. Resolves at once on the live sky.
   */
  prefetch(hours: readonly number[]): Promise<void>;
  /** For tools/sky/bake-sky.mjs: 0 draws the sky, 1 the cloud layer's light, 2 its transmittance. */
  bakeLayer(layer: 0 | 1 | 2): void;
  dispose(): void;
}

interface SkyOptions {
  title?: boolean;
}

/**
 * Sky, sun/moon lighting, Hillaire-style aerial haze, and the progressively refreshed environment map.
 */
/** Cloud drift speed (m/s at cloud height): about a body length a minute for a cumulus seen from the ground. */
const CLOUD_DRIFT = 2.5;
/** Sun heights where the environment turns from the live LUT sky (below) to the day sky (above). */
const ENV_LUT_FROM = 0.06;
const SKY_BELOW = (5 * Math.PI) / 180;
const ENV_DAY_FROM = 0.24;
const pmremByRenderer = new WeakMap<WebGPURenderer, PMREMGenerator>();

function pmremFor(renderer: WebGPURenderer): PMREMGenerator {
  let generator = pmremByRenderer.get(renderer);
  if (!generator) {
    generator = new PMREMGenerator(renderer);
    pmremByRenderer.set(renderer, generator);
  }
  return generator;
}

function createPmremTarget(size: number): RenderTarget {
  const target = new RenderTarget(3 * Math.max(size, 16 * 7), 4 * size, {
    magFilter: LinearFilter,
    minFilter: LinearFilter,
    generateMipmaps: false,
    type: HalfFloatType,
    format: RGBAFormat,
    colorSpace: LinearSRGBColorSpace,
    depthBuffer: false,
  });
  target.texture.mapping = CubeUVReflectionMapping;
  target.texture.name = 'PMREM.cubeUv';
  (target.texture as Texture & { isPMREMTexture?: boolean }).isPMREMTexture = true;
  target.scissorTest = true;
  return target;
}

function applyCloudDebugParams(clouds: TidewaterCloudsPort): void {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams(window.location.search);
  const wind = q.get('cloudWind');
  if (wind !== null) {
    const value = Number(wind);
    if (Number.isFinite(value) && value >= 0) {
      (clouds as unknown as { wind: { value: Vector2 } }).wind.value.setLength(value);
    }
  }
  const scale = q.get('cloudResolution');
  if (scale !== null) {
    const value = Number(scale);
    if (Number.isFinite(value) && value > 0) clouds.resolutionScale = value;
  }
  const slots = q.get('cloudSlots');
  if (slots !== null) {
    const value = Number(slots);
    if (Number.isFinite(value) && value >= 1) clouds.viewSlotsPerFrame = Math.floor(value);
  }
}

export function createSky(
  renderer: WebGPURenderer,
  scene: Scene,
  tier: TierSettings,
  backend: Backend = 'webgpu',
  options: SkyOptions = {},
): SkySystem {
  const R = 4800;
  const backendName =
    (renderer.backend as { constructor?: { name?: string } } | undefined)?.constructor?.name ?? '';
  const actualWebGL =
    backend === 'webgl2' ||
    (renderer.backend as { isWebGLBackend?: boolean } | undefined)?.isWebGLBackend === true ||
    /webgl/i.test(backendName);
  // One sky on every tier and backend: Tidewater's atmosphere LUTs (compute on WebGPU, fragment
  // passes on WebGL2), sun, moon and stars. The clouds ray-march live on WebGPU High and Ultra, and
  // are a baked layer of those clouds everywhere else.
  const liveClouds = !actualWebGL && tier.clouds === 'volumetric';
  const tideAtmo = new TidewaterAtmosphere(renderer, { compute: !actualWebGL, irradiance: liveClouds });
  const tideSky = new TidewaterSky(tideAtmo) as unknown as TidewaterSkyPort;
  const tideClouds = liveClouds
    ? (new TidewaterClouds(renderer, tideAtmo) as unknown as TidewaterCloudsPort)
    : null;
  const bakedClouds = liveClouds ? null : createBakedClouds(renderer);
  tideSky.starIntensity.value = 0;
  if (tideClouds) {
    if (tier.tier === 'medium') {
      tideClouds.resolutionScale = 0.5;
      tideClouds.viewQuality.maxSteps = 128;
      tideClouds.viewQuality.ds0 = 32;
      tideClouds.viewQuality.dsMax = 160;
      tideClouds.viewQuality.lightSteps = [30, 120, 450, 1000];
      tideClouds.viewQuality.lightDetail = 1;
      tideClouds.panoQuality.maxSteps = 40;
    }
    if (tier.tier === 'high' || tier.tier === 'ultra') {
      tideClouds.viewSlotsPerFrame = options.title ? 6 : 4;
      if (options.title) tideClouds.resolutionScale = Math.max(tideClouds.resolutionScale, 1.1);
    }
    // A slow, lazy drift (Tidewater's default is 12 m/s): the sky should feel calm, not wind-blown.
    (tideClouds as unknown as { wind: { value: Vector2 } }).wind.value.setLength(CLOUD_DRIFT);
    // Fair-weather sky: scattered cumulus on clear blue, with only a trace of the high cirrus veil.
    const cirrusQ =
      typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cirrus') : null;
    (tideClouds as unknown as { cirrus: { value: number } }).cirrus.value =
      cirrusQ !== null ? Number(cirrusQ) : 0.12;
    applyCloudDebugParams(tideClouds);
    // Only the terrain samples the cloud shadow (cloudShadowNode below): without it, don't trace it.
    if (options.title || !(tier.cloudShadowRes > 0)) tideClouds.disableShadow();
  }
  tideSky.clouds = tideClouds ?? bakedClouds;
  const tideMaterial = new MeshBasicNodeMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  tideMaterial.colorNode = tideSky.backgroundNode().rgb;
  // Only the upper half (and 5° below the horizon, for the sea's far edge from a height): the sea
  // covers the rest, so a full sphere ran the sky shader for half the screen for nothing.
  const tideMesh = new Mesh(
    new SphereGeometry(R, 64, 18, 0, Math.PI * 2, 0, Math.PI / 2 + SKY_BELOW),
    tideMaterial,
  );
  tideMesh.frustumCulled = false;
  tideMesh.renderOrder = -10;
  scene.add(tideMesh);

  // A separate sky-only scene for environment captures (never includes the world).
  const envScene = new Scene();
  // The environment (reflections, ambient light, haze colour): by day the analytic sky the approved
  // looks are tuned on (bluer than the real sky near the horizon, so the sea stays saturated); from
  // late golden hour through night the visible LUT sky itself (sunset glow, moonlit dark, clouds), so
  // the sea reflects the sky you see.
  const analytic = createAnalyticSky();
  const envDay = uniform(1);
  const envNode = Fn(() => {
    const dir = normalize(positionLocal);
    return mix(tideSky.reflectionRadiance(dir), analytic.color(dir), envDay);
  })();
  // The capture's sky is the scene's background (three's skybox), not a sphere in the scene: with no
  // background, PMREM first clears with a box of its own, one more shader for nothing (PLAN §15.4).
  // (`background` only needs to be set and not a colour for PMREM to skip its box; the node wins.)
  envScene.backgroundNode = envNode;
  envScene.background = new Texture();
  const pmrem = pmremFor(renderer);
  const envSize = tier.tier === 'lite' || tier.tier === 'low' ? 64 : 128;
  // One stable render target: materials keep the same texture object, so refreshes never recompile.
  const envRT = createPmremTarget(envSize);
  pmrem.fromScene(envScene, 0, 0.1, 2000, { size: envSize, renderTarget: envRT });
  scene.environment = envRT.texture;

  const runtimeSunShadows = tier.shadowCascades > 0;
  renderer.shadowMap.enabled = runtimeSunShadows;
  renderer.shadowMap.type = PCFShadowMap;

  const sun = new DirectionalLight(0xffffff, 3);
  sun.castShadow = runtimeSunShadows;
  // The sun's shadows (PLAN §12.1, §12.4): a cached static map that's redrawn only when the focus
  // moves past 50 m, the sun turns, or a static caster changes, plus a small every-frame map for
  // moving things. Caster rules (which meshes cast, and into which map) live in shadow-casters.ts.
  let sunShadowNode: CachedSunShadowNode | null = null;
  if (sun.castShadow) {
    sun.shadow.bias = -0.0004;
    // three's PCF rotates its 5 taps by a fixed per-pixel noise; wider than ~1 texel, that noise
    // showed as a stipple on skin, sails and stone wherever the light grazes (TRAA can't average it).
    sun.shadow.radius = 1;
    sun.shadow.blurSamples = 8;
    // How far past the focus static shadows reach; the map covers that plus the refresh threshold.
    const reach = sunShadowReach(tier);
    const staticMap: SunShadowMap = {
      size: tier.shadowMap || 1024,
      half: staticCoverage(reach),
      biasMeters: 0.25,
      normalBias: 0.03,
      mask: SHADOW_MASK.static,
    };
    const moverMap: SunShadowMap | null = tier.shadowMoverMap
      ? { size: tier.shadowMoverMap, half: 40, biasMeters: 0.2, normalBias: 0.025, mask: SHADOW_MASK.mover }
      : null;
    sunShadowNode = new CachedSunShadowNode(sun, staticMap, moverMap);
    (sun.shadow as typeof sun.shadow & { shadowNode?: unknown }).shadowNode = sunShadowNode;
  }
  const hemi = new HemisphereLight(0xffffff, 0x222222, 0.3);
  scene.add(sun, sun.target, hemi);
  // The PMREM sky is the main ambient; the hemisphere light is only a ground-bounce fill.
  scene.environmentIntensity = 1.35;

  // Height- and sun-aware haze (PLAN §6 Atmosphere), coloured by the sky itself toward the view
  // direction's horizon so distant land and sea melt into the sky (warmer toward a low sun, for free).
  const densityU = uniform(0.0002);
  const hazeNode = Fn(() => {
    const v = positionWorld.sub(cameraPosition);
    const dist = v.length();
    const dir = v.div(max(dist, 0.001));
    const h = max(positionWorld.y, 0);
    const dens = densityU.mul(exp(h.negate().div(260)));
    const farDist = max(dist.sub(260), 0);
    const f = clamp(float(1).sub(exp(farDist.mul(dens).negate())), 0, 0.42);
    const horizonDir = normalize(vec3(dir.x, max(dir.y, 0).mul(0.5).add(0.03), dir.z));
    const col = pmremTexture(envRT.texture, horizonDir, float(0.45)).rgb;
    return fog(mix(world.hazeColor, col, 0.55), f);
  })();
  scene.fogNode = hazeNode;

  const k = { ...KEYS[0], sun: [0, 0, 0], sky: [0, 0, 0], ground: [0, 0, 0], haze: [0, 0, 0] } as Key;
  const lastSun = new Vector3(0, -2, 0);
  let envAge = 1e9,
    frame = 0,
    forced = true;
  const tmp = new Vector3();
  const state: SunState = sunState(16.5);

  // The title's sun stands still, so its environment is captured on the first frames only: a few
  // frames after a capture, the capture's shaders (6 programs) are freed for the title's budget
  // (PLAN §15.4, ≤ 40). A later capture would build them again.
  let releaseEnvIn = 0;
  const refreshEnv = () => {
    pmrem.fromScene(envScene, 0, 0.1, 2000, { size: envSize, renderTarget: envRT });
    envAge = 0;
    if (options.title) releaseEnvIn = 3;
  };

  const mood: SkySystem['mood'] = { fogScale: 1, hazeTint: [1, 1, 1], fill: 1, exposure: 1 };
  return {
    sun,
    hemi,
    env: envRT.texture,
    state,
    mood,
    update(clock, focus, dt = 1 / 60, camera) {
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
      const tint = mood.hazeTint;
      world.hazeColor.value.setRGB(k.haze[0] * tint[0], k.haze[1] * tint[1], k.haze[2] * tint[2]);
      densityU.value = k.fog * mood.fogScale;
      syncTidewaterGlobals(dt, tideAtmo as unknown as Parameters<typeof syncTidewaterGlobals>[1]);
      (tideAtmo as unknown as { sunDir: { value: Vector3 } }).sunDir.value.set(s.sun[0], s.sun[1], s.sun[2]);
      tideSky.starIntensity.value = s.night;
      tideSky.moonDir.value.copy(world.moonDir.value);
      bakedClouds?.update(s, dt);

      analytic.haze.rayleigh.value.setRGB(k.sky[0] * 0.7, k.sky[1] * 0.9, Math.min(1.15, k.sky[2] * 1.25));
      analytic.haze.mie.value.setRGB(k.haze[0], k.haze[1], k.haze[2]);
      analytic.haze.groundBounce.value.setRGB(k.ground[0], k.ground[1], k.ground[2]);
      envDay.value = ss(ENV_LUT_FROM, ENV_DAY_FROM, s.sun[1]);

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
      // The mood's fill lifts the sky light in the shade (a jungle under a canopy), its exposure the frame.
      // Half the fill and a little of the exposure by day, all of both once the sun is down (dusk and
      // night stay readable).
      const dark = ss(0.12, -0.08, s.sun[1]);
      hemi.intensity = k.hemiI * (1 + (mood.fill - 1) * (0.5 + 0.5 * dark));
      renderer.toneMappingExposure = k.exposure * (1 + (mood.exposure - 1) * (0.15 + 0.85 * dark));
      tideAtmo.update(dt, camera?.position.y ?? 1);
      if (tideClouds && camera) tideClouds.update(dt, camera);
      tideMesh.position.copy(focus);

      if (sunShadowNode) {
        sunShadowNode.focus.copy(focus);
        // Classify new casters and watch static ones twice a second (a change redraws the static map).
        if (frame % 30 === 1) sunShadowNode.sweepCasters(scene);
        if (forced) sunShadowNode.invalidate();
      }

      // Environment: refresh after a meaningful sun move, or every 3 s while time flows. Not while
      // the atmosphere's kernels still build (its tables aren't drawn yet): a forced refresh waits.
      envAge += dt;
      if (tideAtmo.compiling) return;
      const sunMoved = lastSun.distanceToSquared(world.sunDir.value) > 0.004 * 0.004;
      if (forced || (sunMoved && envAge > 0.5) || (clock.speed !== 0 && envAge > 180)) {
        refreshEnv();
        lastSun.copy(world.sunDir.value);
      } else if (releaseEnvIn > 0 && --releaseEnvIn === 0) {
        pmrem.dispose();
        envNode.dispose();
      }
      forced = false;
    },
    bakeLayer(layer) {
      tideSky.bakeLayer.value = layer;
    },
    // The baked layers for those hours, or the live clouds' kernels (built off-thread, so their first
    // frame doesn't stall).
    prefetch: (hours) =>
      Promise.all([
        bakedClouds?.prefetch(hours).catch(() => {}) ?? tideClouds?.compileAsync().catch(() => {}),
        (tideAtmo as unknown as { compileAsync(): Promise<unknown> }).compileAsync().catch(() => {}),
      ]).then(() => undefined),
    invalidate() {
      forced = true;
      tideAtmo.invalidate();
      tideClouds?.invalidate();
    },
    shadowWarm(roots) {
      const node = sunShadowNode;
      if (!node) return () => {};
      for (const root of Array.isArray(roots) ? roots : [roots]) node.sweep.run(root as Object3D);
      node.warming++;
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        node.warming--;
        node.invalidate();
      };
    },
    cloudShadowNode:
      tideClouds && tier.cloudShadowRes > 0
        ? (worldXZ: Node<'vec2'>) => tideClouds.shadow(worldXZ)
        : undefined,
    dispose() {
      scene.remove(tideMesh, sun, sun.target, hemi);
      if (scene.environment === envRT.texture) scene.environment = null;
      if (scene.fogNode === hazeNode) scene.fogNode = null;
      for (const shadow of sunShadowNode?.shadows ?? []) disposeLightShadow(shadow);
      sunShadowNode?.dispose();
      disposeLightShadow(sun.shadow);
      sun.dispose();
      disposeRenderTarget(envRT);
      envNode.dispose();
      bakedClouds?.dispose();
      tideClouds?.dispose();
      tideAtmo.dispose();
      tideMesh.geometry.dispose();
      tideMaterial.dispose();
    },
  };
}
