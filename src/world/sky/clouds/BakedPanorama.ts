import {
  BackSide,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Node,
  type Texture,
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
 * The sky on WebGL2, Low and Lite: a picture of the WebGPU High sky (Tidewater's atmosphere and
 * volumetric clouds), baked by tools/sky/bake-sky.mjs into an above-horizon equirect panorama. It's
 * sampled on a dome, so every tier and backend shows the same sky for one texture fetch a pixel. The
 * bake holds the sky's own colours (no tone mapping), so the runtime grade applies once, as it does
 * to the live sky. At night it draws the live sky's own stars, moon and moonlit glow (Sky.ts).
 *
 * Layout (must match tools/sky/reproject.py): u = azimuth atan2(z, x) / 2π, v = zenith angle /
 * (π/2 + 2°), with row 0 at the zenith. Below the horizon the bake repeats the horizon row.
 */
interface BakedSky {
  mesh: Mesh<SphereGeometry, MeshBasicNodeMaterial>;
  update(state: SunState): void;
  invalidate(): void;
  dispose(): void;
}

/** The time of day the panorama was baked at (tools/sky/bake-sky.mjs --time). */
const BAKE_HOURS = 16.33;
const V_SPAN = Math.PI / 2 + (2 * Math.PI) / 180;
const TAU = Math.PI * 2;

const azimuth = (d: readonly number[]) => Math.atan2(d[2]!, d[0]!);
const BAKED_SUN_AZIMUTH = azimuth(sunState(BAKE_HOURS).sun);

export function createBakedTidewaterSky(radius: number): BakedSky {
  // Turns the panorama so its baked sun sits where today's sun is (islands and Settings set the azimuth).
  const turn = uniform(0);
  // Dims the day sky toward the night as the sun goes down. A trace stays, so clouds read as faint
  // moonlit shapes, as they do on the live sky.
  const day = uniform(1);
  const nightTint = vec3(0.5, 0.6, 0.85).mul(0.018);

  let tex: Texture | null = null;
  const placeholder = uniform(vec3(0.24, 0.45, 0.8));
  const mat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, depthTest: false, fog: false });
  // The live sky's own stars, moon and moonlit glow (Sky.ts), over the baked day sky.
  const sunDir = uniform(new Vector3(0, 1, 0));
  let bakedSky: (dir: Node<'vec3'>) => Node<'vec3'> = () => placeholder;
  const nightSky = new TidewaterSky({
    sunDir,
    skyLuminance: (dir: Node<'vec3'>) => bakedSky(dir),
  }) as unknown as NightSkyPort;
  const build = (t: Texture | null) =>
    Fn(() => {
      const dir = normalize(positionLocal);
      bakedSky = (d) => {
        const u = fract(atan(d.z, d.x).sub(turn).div(TAU).add(1));
        const v = clamp(acos(clamp(d.y, -1, 1)).div(V_SPAN), 0, 1);
        // flipY is off, so v = 0 is the top row (the zenith).
        const sky = t ? texture(t, vec2(u, v)).rgb : placeholder;
        return mix(sky.mul(nightTint), sky, day);
      };
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
  mat.colorNode = build(null);

  new TextureLoader().load(`${import.meta.env.BASE_URL}sky/tidewater-golden.webp`, (t) => {
    t.name = 'baked-tidewater-sky';
    t.colorSpace = SRGBColorSpace;
    t.flipY = false;
    t.wrapS = RepeatWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    tex = t;
    mat.colorNode = build(t);
    mat.needsUpdate = true;
  });

  const mesh = new Mesh(new SphereGeometry(radius, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return {
    mesh,
    update(state) {
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
      tex?.dispose();
    },
  };
}
