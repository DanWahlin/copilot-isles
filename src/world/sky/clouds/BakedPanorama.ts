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
  type Texture,
} from 'three/webgpu';
import {
  Fn,
  acos,
  atan,
  clamp,
  dot,
  float,
  fract,
  fwidth,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { sunState, type SunState } from '../sun';
import { world } from '../../uniforms';

/**
 * The sky on WebGL2, Low and Lite: a picture of the WebGPU High sky (Tidewater's atmosphere and
 * volumetric clouds), baked by tools/sky/bake-sky.mjs into an above-horizon equirect panorama. It's
 * sampled on a dome, so every tier and backend shows the same sky for one texture fetch a pixel. The
 * bake holds the sky's own colours (no tone mapping), so the runtime grade applies once, as it does
 * to the live sky.
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
  // Dims the day sky toward the night dome as the sun goes down.
  const day = uniform(1);
  const nightTint = vec3(0.008, 0.02, 0.06);

  let tex: Texture | null = null;
  const placeholder = uniform(vec3(0.24, 0.45, 0.8));
  const mat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, depthTest: false, fog: false });
  const build = (t: Texture | null) =>
    Fn(() => {
      const dir = normalize(positionLocal);
      const u = fract(atan(dir.z, dir.x).sub(turn).div(TAU).add(1));
      const v = clamp(acos(clamp(dir.y, -1, 1)).div(V_SPAN), 0, 1);
      // flipY is off, so v = 0 is the top row (the zenith).
      const sky = t ? texture(t, vec2(u, v)).rgb : placeholder;
      const md = dot(dir, normalize(world.moonDir));
      const r = acos(clamp(md, -1, 1)).div(0.0077);
      const edge = max(fwidth(r).mul(1.35), 0.025);
      const mask = smoothstep(float(1).add(edge), float(1).sub(edge), r);
      const mu = sqrt(max(float(1).sub(r.mul(r)), 0));
      const limb = mix(0.62, 1.0, pow(mu, 0.42));
      const maria = smoothstep(
        0.48,
        0.92,
        sin(dir.x.mul(180).add(dir.z.mul(61)))
          .mul(sin(dir.y.mul(145).sub(dir.z.mul(97))))
          .mul(0.5)
          .add(0.5),
      ).mul(0.18);
      const moon = sky
        .mul(0.18)
        .add(vec3(0.72, 0.78, 0.88).mul(0.035))
        .mul(limb.mul(float(1).sub(maria.mul(mu))))
        .mul(mask)
        .mul(float(1).sub(world.night))
        .mul(0.36)
        .mul(smoothstep(-0.02, 0.02, dir.y));
      return mix(nightTint, sky, day).add(moon);
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
    },
    invalidate() {},
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      tex?.dispose();
    },
  };
}
