import {
  BackSide,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  PCFShadowMap,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Node,
  type Texture,
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
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import type { TierSettings } from '../../engine/quality';
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
  /** Call once per frame. `focus` is the point shadows and the env capture centre on. */
  update(clock: DayClock, focus: Vector3, dt?: number, camera?: Camera): void;
  /** Force an environment + shadow refresh (e.g. after a time scrub). */
  invalidate(): void;
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

type CSMShadowNodeLike = Node & {
  camera: Camera | null;
  fade: boolean;
  updateFrustums(): void;
  dispose(): void;
};

/**
 * Sky, sun/moon lighting, Hillaire-style aerial haze, and the progressively refreshed environment map.
 */
/** Cloud drift speed (m/s at cloud height): about a body length a minute for a cumulus seen from the ground. */
const CLOUD_DRIFT = 2.5;
/** Sun heights where the environment turns from the live LUT sky (below) to the day sky (above). */
const ENV_LUT_FROM = 0.06;
const SKY_BELOW = (5 * Math.PI) / 180;
const ENV_DAY_FROM = 0.24;

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
  const envMaterial = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  envMaterial.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    return mix(tideSky.reflectionRadiance(dir), analytic.color(dir), envDay);
  })();
  const envMesh = new Mesh(new SphereGeometry(1000, 48, 24), envMaterial);
  envScene.add(envMesh);
  const pmrem = new PMREMGenerator(renderer);
  const envSize = tier.tier === 'lite' || tier.tier === 'low' ? 64 : 128;
  // One stable render target: materials keep the same texture object, so refreshes never recompile.
  const envRT = pmrem.fromScene(envScene, 0, 0.1, 2000, { size: envSize });
  scene.environment = envRT.texture;

  const runtimeSunShadows = tier.shadowCascades > 0;
  renderer.shadowMap.enabled = runtimeSunShadows;
  renderer.shadowMap.type = PCFShadowMap;

  const sun = new DirectionalLight(0xffffff, 3);
  sun.castShadow = runtimeSunShadows;
  let csmNode: CSMShadowNodeLike | null = null;
  if (sun.castShadow) {
    const csm = !actualWebGL && tier.shadowCascades > 0;
    const mapSize = csm ? 2048 : tier.shadowMap;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const c = sun.shadow.camera;
    c.left = -140;
    c.right = 140;
    c.top = 140;
    c.bottom = -140;
    c.near = 1;
    c.far = csm ? 520 : 900;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = csm ? 0.025 : 0.04;
    // three's PCF rotates its 5 taps by a fixed per-pixel noise; wider than ~1 texel, that noise
    // showed as a stipple on skin, sails and stone wherever the light grazes (TRAA can't average it).
    sun.shadow.radius = 1;
    sun.shadow.blurSamples = csm ? 12 : 8;
    // Low/Lite: throttled updates; High+: every frame (moving ship/characters). See issues.md.
    sun.shadow.autoUpdate = tier.dynamicShadows;
    if (csm) {
      const maxFar = tier.shadowCascades === 2 ? 180 : 400;
      const node = new CSMShadowNode(sun, {
        cascades: tier.shadowCascades,
        maxFar,
        mode: 'custom',
        lightMargin: 45,
        customSplitsCallback: (amount: number, _near: number, far: number, target: number[]) => {
          target.length = 0;
          const splits = amount === 2 ? [60, maxFar] : [10, 60, maxFar];
          for (let i = 0; i < amount; i++) target.push(Math.min(splits[i]! / far, 1));
        },
      }) as CSMShadowNodeLike;
      node.fade = true;
      (sun.shadow as typeof sun.shadow & { shadowNode?: unknown }).shadowNode = node;
      csmNode = node;
    }
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
  const lastFocus = new Vector3(1e9, 0, 0);
  let envAge = 1e9,
    frame = 0,
    forced = true;
  const tmp = new Vector3();
  const state: SunState = sunState(16.5);

  const refreshEnv = () => {
    pmrem.fromScene(envScene, 0, 0.1, 2000, { size: envSize, renderTarget: envRT });
    envAge = 0;
  };

  return {
    sun,
    hemi,
    env: envRT.texture,
    state,
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
      world.hazeColor.value.setRGB(k.haze[0], k.haze[1], k.haze[2]);
      densityU.value = k.fog;
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
      hemi.intensity = k.hemiI;
      renderer.toneMappingExposure = k.exposure;
      tideAtmo.update(dt, camera?.position.y ?? 1);
      if (tideClouds && camera) tideClouds.update(dt, camera);
      tideMesh.position.copy(focus);

      if (csmNode && csmNode.camera === camera) csmNode.updateFrustums();

      // Cached shadows (PLAN §12.4): refresh on sun moves, focus moves, or every few frames on Low.
      if (sun.castShadow && !sun.shadow.autoUpdate) {
        const moved = lastFocus.distanceToSquared(sun.target.position) > 40 * 40;
        if (forced || moved || lastSun.distanceToSquared(world.sunDir.value) > 1e-5 || frame % 4 === 0) {
          sun.shadow.needsUpdate = true;
          lastFocus.copy(sun.target.position);
        }
      }

      // Environment: refresh after a meaningful sun move, or every 3 s while time flows.
      envAge += dt;
      const sunMoved = lastSun.distanceToSquared(world.sunDir.value) > 0.004 * 0.004;
      if (forced || (sunMoved && envAge > 0.5) || (clock.speed !== 0 && envAge > 180)) {
        refreshEnv();
        lastSun.copy(world.sunDir.value);
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
    cloudShadowNode:
      tideClouds && tier.cloudShadowRes > 0
        ? (worldXZ: Node<'vec2'>) => tideClouds.shadow(worldXZ)
        : undefined,
    dispose() {
      scene.remove(tideMesh, sun, sun.target, hemi);
      if (scene.environment === envRT.texture) scene.environment = null;
      if (scene.fogNode === hazeNode) scene.fogNode = null;
      csmNode?.dispose();
      sun.dispose();
      envRT.dispose();
      pmrem.dispose();
      envMesh.geometry.dispose();
      envMaterial.dispose();
      bakedClouds?.dispose();
      tideAtmo.dispose();
      tideMesh.geometry.dispose();
      tideMaterial.dispose();
    },
  };
}
