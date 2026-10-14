import {
  ClampToEdgeWrapping,
  DataTexture,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  acos,
  atan,
  clamp,
  float,
  fract,
  max,
  mix,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { sunState, type SunState } from '../sun';
import { world } from '../../uniforms';

/**
 * The clouds on WebGL2, Low, Lite and Medium: the WebGPU High clouds (Tidewater's volumetric clouds and
 * their aerial perspective), baked by tools/sky/bake-sky.mjs into above-horizon equirect layers at a
 * few sun heights (SKY_KEYS). Each texel holds the clouds' light (rgb, the sky's own colours with no
 * tone mapping) and their transmittance (alpha), so Sky.ts composites them over the live atmosphere,
 * sun, moon and stars exactly as it does the live clouds: sky * alpha + light. The layer blends the two
 * keys either side of today's sun for two texture fetches a pixel. At night the baked light fades and
 * the clouds turn to dim moonlit shapes that hide the stars.
 *
 * Every key is baked from one page, with the clouds held still and the sun turned to one azimuth
 * (bakeAzimuthDeg), so all keys hold the same clouds and blend without ghosts.
 *
 * Layout (must match tools/sky/reproject.py): u = azimuth atan2(z, x) / 2π, v = zenith angle /
 * (π/2 + 2°), with row 0 at the zenith. Below the horizon the bake repeats the horizon row.
 */
export interface BakedClouds {
  /** Tells Sky.ts the aerial perspective is in the bake. */
  readonly baked: true;
  /** vec4(light, transmittance) along a direction (Sky.ts's cloud contract). */
  sampleView(dir: Node<'vec3'>): Node<'vec4'>;
  sample(dir: Node<'vec3'>): Node<'vec4'>;
  /** `dt` (s) drives the drift; reduced motion holds it still. */
  update(state: SunState, dt: number): void;
  /** Loads the keys these hours need and puts them on the GPU, so later changes don't hitch. */
  prefetch(hours: readonly number[]): Promise<void>;
  dispose(): void;
}

/**
 * The baked keys, in order of sun height. Golden is Port Meridian's sky (17:21) and afternoon is
 * Anchorage Cay's (16:12), so both islands show a key exactly; the title (17:06) blends the two.
 */
export const SKY_KEYS = [
  { name: 'dusk', hours: 18.05 },
  { name: 'dawn', hours: 6.3 },
  { name: 'golden', hours: 17.35 },
  { name: 'afternoon', hours: 16.2 },
  { name: 'noon', hours: 12 },
] as const;

/**
 * The keys store the clouds' light over a flat sky of this colour (linear), light + transmittance ×
 * CLOUD_PEDESTAL, so faint cirrus rides on a sky-bright base and compresses like a sky picture
 * (tools/sky/reproject.py). The layer takes it off again.
 */
export const CLOUD_PEDESTAL = [0.1, 0.25, 0.6] as const;

const V_SPAN = Math.PI / 2 + (2 * Math.PI) / 180;
/**
 * The baked layer drifts along the wind as a slow sway in the cloud plane (it has no clouds beyond
 * its bake to bring in): overhead clouds move most and the horizon's barely, as on the live sky. A
 * DRIFT_M sway over DRIFT_PERIOD_S peaks at about 2.5 m/s (sky-system.ts CLOUD_DRIFT).
 */
const DRIFT_M = 400;
const DRIFT_PERIOD_S = 1000;
/** Height of the baked cloud plane (m): the cumulus base is about 800 m, the tops about 2 km. */
const CLOUD_PLANE_M = 1500;
const TAU = Math.PI * 2;

const azimuth = (d: readonly number[]) => Math.atan2(d[2]!, d[0]!);
/** Every key is baked with the sun at this azimuth (the afternoon key's, at azimuth setting 0). */
const BAKED_SUN_AZIMUTH = azimuth(sunState(16.2).sun);
const KEY_ELEVATION = SKY_KEYS.map((k) => sunState(k.hours).sun[1]);

/** The sun-azimuth setting (degrees) that puts the sun at the baked azimuth at `hours`. */
export function bakeAzimuthDeg(hours: number): number {
  const d = BAKED_SUN_AZIMUTH - azimuth(sunState(hours).sun);
  return (Math.atan2(Math.sin(d), Math.cos(d)) * 180) / Math.PI;
}

/** The two keys either side of a sun elevation, and how far toward the upper one it is. */
export function keyBlend(elevation: number): { lo: number; hi: number; t: number } {
  const n = KEY_ELEVATION.length;
  if (elevation <= KEY_ELEVATION[0]!) return { lo: 0, hi: 0, t: 0 };
  if (elevation >= KEY_ELEVATION[n - 1]!) return { lo: n - 1, hi: n - 1, t: 0 };
  let i = 0;
  while (elevation > KEY_ELEVATION[i + 1]!) i++;
  const t = (elevation - KEY_ELEVATION[i]!) / (KEY_ELEVATION[i + 1]! - KEY_ELEVATION[i]!);
  return { lo: i, hi: i + 1, t };
}

// Keys are shared by every dome (the title's and the islands') and kept once loaded. Their GPU copies
// go with the last dome that used them (a voyage's dawn and dusk keys stayed on the GPU at the title,
// issue 248); the decoded image stays, so a later dome uploads it again without a fetch.
const keyTextures: (Promise<Texture> | null)[] = SKY_KEYS.map(() => null);
const loadedKeys: (Texture | null)[] = SKY_KEYS.map(() => null);
const keyDomes: number[] = SKY_KEYS.map(() => 0);
let bitmapLoader: ImageBitmapLoader | null = null;

function loadKey(i: number): Promise<Texture> {
  const cached = keyTextures[i];
  if (cached) return cached;
  bitmapLoader ??= new ImageBitmapLoader().setOptions({
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
  });
  const loader = bitmapLoader;
  const url = `${import.meta.env.BASE_URL}sky/clouds-${SKY_KEYS[i]!.name}.webp`;
  // Decoded off the main thread (ImageBitmap), so a key arriving mid-play doesn't stall a frame.
  const p = loader.loadAsync(url).then((bitmap: ImageBitmap) => {
    const t = new Texture(bitmap);
    t.name = `baked-clouds-${SKY_KEYS[i]!.name}`;
    t.colorSpace = SRGBColorSpace;
    t.flipY = false;
    t.wrapS = RepeatWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    loadedKeys[i] = t;
    return t;
  });
  // A failed load can be tried again later (the clouds stay clear meanwhile).
  p.catch(() => (keyTextures[i] = null));
  keyTextures[i] = p;
  return p;
}

export function createBakedClouds(renderer: WebGPURenderer): BakedClouds {
  // Turns the layer so its baked sun sits where today's sun is (islands and Settings set the azimuth).
  const turn = uniform(0);
  const night = uniform(0);
  // cloud-plane shift over the plane height (x, z)
  const drift = uniform(new Vector2());
  let driftPhase = 0;
  // Two key slots, blended by `blend`; clear sky (just the pedestal, full transmittance) until a key
  // arrives.
  const placeholder = new DataTexture(new Uint8Array([89, 137, 203, 255]), 1, 1);
  placeholder.colorSpace = SRGBColorSpace;
  placeholder.needsUpdate = true;
  const keyA = texture(placeholder);
  const keyB = texture(placeholder);
  const blend = uniform(0);
  // Moonlit cloud: a dim blue-grey, like the live clouds under the moon.
  const moonlit = vec3(0.018, 0.022, 0.032);
  const pedestal = vec3(...CLOUD_PEDESTAL);

  const sampleView = (dir: Node<'vec3'>) => {
    // the drift, as a shift of the cloud plane: zero at the horizon, largest overhead
    const d = vec3(dir.x.sub(drift.x.mul(dir.y)), dir.y, dir.z.sub(drift.y.mul(dir.y)));
    const u = fract(atan(d.z, d.x).sub(turn).div(TAU).add(1));
    const v = clamp(acos(clamp(d.y.div(d.length()), -1, 1)).div(V_SPAN), 0, 1);
    // flipY is off, so v = 0 is the top row (the zenith).
    const uv = vec2(u, v);
    const c = mix(keyA.sample(uv), keyB.sample(uv), blend);
    const cover = float(1).sub(c.a);
    const day = max(c.rgb.sub(pedestal.mul(c.a)), 0);
    const light = mix(day, moonlit.mul(cover), night);
    // The bake can't see below the horizon: no clouds there.
    const above = smoothstep(-0.03, 0.0, dir.y);
    return vec4(light.mul(above), mix(float(1), c.a, above));
  };

  const want = { lo: -1, hi: -1, t: 0 };
  const onGpu = new Set<number>();
  let disposed = false;
  const toGpu = (i: number) => {
    const t = loadedKeys[i];
    // A load can land after the dome's gone.
    if (!t || disposed) return;
    if (!onGpu.has(i)) {
      onGpu.add(i);
      keyDomes[i]!++;
    }
    renderer.initTexture(t);
  };
  /** Puts the wanted keys in the slots; until one has loaded, the other (or clear sky) stands in. */
  const applyKeys = () => {
    const a = loadedKeys[want.lo] ?? null;
    const b = loadedKeys[want.hi] ?? null;
    keyA.value = a ?? b ?? placeholder;
    keyB.value = b ?? a ?? placeholder;
    blend.value = a && b ? want.t : 0;
  };
  const need = (elevation: number) => {
    const k = keyBlend(elevation);
    want.t = k.t;
    if (k.lo === want.lo && k.hi === want.hi) return;
    want.lo = k.lo;
    want.hi = k.hi;
    for (const i of k.t > 0 ? [k.lo, k.hi] : [k.lo]) {
      if (loadedKeys[i]) toGpu(i);
      else
        loadKey(i)
          .then(() => (toGpu(i), applyKeys()))
          .catch(() => {});
    }
  };
  const keysFor = (hours: readonly number[]) => {
    const keys = new Set<number>();
    for (const h of hours) {
      const k = keyBlend(sunState(h).sun[1]);
      keys.add(k.lo);
      if (k.t > 0) keys.add(k.hi);
    }
    return [...keys];
  };

  return {
    baked: true,
    sampleView,
    sample: sampleView,
    async prefetch(hours) {
      const keys = keysFor(hours);
      await Promise.all(keys.map(loadKey));
      keys.forEach(toGpu);
      applyKeys();
    },
    update(state, dt) {
      if (world.reducedMotion.value < 0.5) driftPhase = (driftPhase + (dt * TAU) / DRIFT_PERIOD_S) % TAU;
      const sway = (Math.sin(driftPhase) * DRIFT_M) / CLOUD_PLANE_M;
      const w = world.windDir.value;
      const wl = Math.hypot(w.x, w.y) || 1;
      drift.value.set((w.x / wl) * sway, (w.y / wl) * sway);
      need(state.sun[1]);
      applyKeys();
      turn.value = azimuth(state.sun) - BAKED_SUN_AZIMUTH;
      night.value = state.night;
    },
    dispose() {
      disposed = true;
      placeholder.dispose();
      for (const i of onGpu) if (--keyDomes[i]! === 0) loadedKeys[i]?.dispose();
      onGpu.clear();
    },
  };
}
