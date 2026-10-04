import {
  BackSide,
  ClampToEdgeWrapping,
  DataTexture,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  If,
  acos,
  atan,
  clamp,
  fract,
  max,
  min,
  mix,
  normalize,
  positionLocal,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { sunState, type SunState } from '../sun';
import { Sky as TidewaterSky } from './Sky';

/** The parts of Tidewater's Sky (Sky.ts) the baked dome draws at night. */
interface NightSkyPort {
  starIntensity: Node<'float'> & { value: number };
  moonDir: { value: Vector3 };
  stars(dir: Node<'vec3'>): Node<'vec3'>;
  moon(dir: Node<'vec3'>): Node<'vec3'>;
  moonSky(dir: Node<'vec3'>): Node<'vec3'>;
}

/**
 * The sky on WebGL2, Low, Lite and Medium: pictures of the WebGPU High sky (Tidewater's atmosphere
 * and volumetric clouds), baked by tools/sky/bake-sky.mjs into above-horizon equirect panoramas at a
 * few sun heights (SKY_KEYS). The dome blends the two keys either side of today's sun, so every tier
 * and backend shows the same sky for two texture fetches a pixel. The bakes hold the sky's own
 * colours (no tone mapping), so the runtime grade applies once, as it does to the live sky. At night
 * the dome draws the live sky's own stars, moon and moonlit glow (Sky.ts).
 *
 * Every key is baked from one page, with the clouds held still and the sun turned to one azimuth
 * (bakeAzimuthDeg), so all keys hold the same clouds and blend without ghosts.
 *
 * Layout (must match tools/sky/reproject.py): u = azimuth atan2(z, x) / 2π, v = zenith angle /
 * (π/2 + 2°), with row 0 at the zenith. Below the horizon the bake repeats the horizon row.
 */
interface BakedSky {
  mesh: Mesh<SphereGeometry, MeshBasicNodeMaterial>;
  update(state: SunState): void;
  /** Loads the keys these hours need and puts them on the GPU, so later changes don't hitch. */
  prefetch(hours: readonly number[]): Promise<void>;
  invalidate(): void;
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

const V_SPAN = Math.PI / 2 + (2 * Math.PI) / 180;
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

// Keys are shared by every dome (the title's and the islands') and kept once loaded.
const keyTextures: (Promise<Texture> | null)[] = SKY_KEYS.map(() => null);
const loadedKeys: (Texture | null)[] = SKY_KEYS.map(() => null);
let bitmapLoader: ImageBitmapLoader | null = null;

function loadKey(i: number): Promise<Texture> {
  const cached = keyTextures[i];
  if (cached) return cached;
  bitmapLoader ??= new ImageBitmapLoader().setOptions({
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
  });
  const loader = bitmapLoader;
  const url = `${import.meta.env.BASE_URL}sky/tidewater-${SKY_KEYS[i]!.name}.webp`;
  // Decoded off the main thread (ImageBitmap), so a key arriving mid-play doesn't stall a frame.
  const p = loader.loadAsync(url).then((bitmap: ImageBitmap) => {
    const t = new Texture(bitmap);
    t.name = `baked-sky-${SKY_KEYS[i]!.name}`;
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
  p.catch(() => (keyTextures[i] = null));
  keyTextures[i] = p;
  return p;
}

export function createBakedTidewaterSky(radius: number, renderer: WebGPURenderer): BakedSky {
  // Turns the panorama so its baked sun sits where today's sun is (islands and Settings set the azimuth).
  const turn = uniform(0);
  // Dims the day sky toward the night as the sun goes down. A trace stays, so clouds read as faint
  // moonlit shapes, as they do on the live sky.
  const day = uniform(1);
  const nightTint = vec3(0.5, 0.6, 0.85).mul(0.018);

  // Two key slots, blended by `blend`; a flat placeholder sky until the first key arrives.
  const placeholder = new DataTexture(new Uint8Array([105, 160, 225, 255]), 1, 1);
  placeholder.colorSpace = SRGBColorSpace;
  placeholder.needsUpdate = true;
  const keyA = texture(placeholder);
  const keyB = texture(placeholder);
  const blend = uniform(0);
  const mat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, depthTest: false, fog: false });
  // The live sky's own stars, moon and moonlit glow (Sky.ts), over the baked day sky.
  const sunDir = uniform(new Vector3(0, 1, 0));
  const bakedSky = (d: Node<'vec3'>) => {
    const u = fract(atan(d.z, d.x).sub(turn).div(TAU).add(1));
    const v = clamp(acos(clamp(d.y, -1, 1)).div(V_SPAN), 0, 1);
    // flipY is off, so v = 0 is the top row (the zenith).
    const uv = vec2(u, v);
    const sky = mix(keyA.sample(uv).rgb, keyB.sample(uv).rgb, blend);
    return mix(sky.mul(nightTint), sky, day);
  };
  const nightSky = new TidewaterSky({
    sunDir,
    skyLuminance: (dir: Node<'vec3'>) => bakedSky(dir),
  }) as unknown as NightSkyPort;
  mat.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const sky = bakedSky(dir).toVar();
    // Cloud cover from the bake: clouds are near-grey, clear sky is blue. Clouds hide the stars.
    const lo = min(sky.r, min(sky.g, sky.b));
    const hi = max(sky.r, max(sky.g, sky.b), 1e-5);
    const clear = smoothstep(0.8, 0.6, lo.div(hi));
    const night = vec3(0).toVar();
    If(nightSky.starIntensity.greaterThan(0.001), () => {
      night.assign(nightSky.moonSky(dir).add(nightSky.stars(dir).mul(clear)));
    });
    return sky.add(night).add(nightSky.moon(dir).mul(clear.mul(0.7).add(0.3)));
  })();

  const want = { lo: -1, hi: -1, t: 0 };
  const toGpu = (t: Texture) => renderer.initTexture(t);
  /** Puts the wanted keys in the slots; until one has loaded, the other (or the placeholder) stands in. */
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
      if (!loadedKeys[i]) void loadKey(i).then((t) => (toGpu(t), applyKeys()));
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
  const prefetch = async (hours: readonly number[]) => {
    const textures = await Promise.all(keysFor(hours).map(loadKey));
    textures.forEach(toGpu);
    applyKeys();
  };
  const mesh = new Mesh(new SphereGeometry(radius, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return {
    mesh,
    prefetch,
    update(state) {
      need(state.sun[1]);
      applyKeys();
      turn.value = azimuth(state.sun) - BAKED_SUN_AZIMUTH;
      day.value = 1 - state.night;
      sunDir.value.set(state.sun[0], state.sun[1], state.sun[2]);
      nightSky.moonDir.value.set(state.moon[0], state.moon[1], state.moon[2]);
      nightSky.starIntensity.value = state.night;
    },
    invalidate() {},
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      placeholder.dispose();
    },
  };
}
