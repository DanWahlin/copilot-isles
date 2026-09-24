import { Mesh, MeshBasicNodeMaterial, NoBlending, type Camera, type Node, type Texture } from 'three/webgpu';
import {
  Fn,
  attribute,
  cameraFar,
  cameraNear,
  cameraPosition,
  clamp,
  cos,
  dot,
  exp,
  float,
  fwidth,
  max,
  mix,
  modelPosition,
  normalize,
  perspectiveDepthToViewZ,
  pmremTexture,
  positionLocal,
  positionView,
  positionWorld,
  pow,
  reflect,
  saturate,
  screenUV,
  select,
  sin,
  smoothstep,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
  viewportDepthTexture,
  viewportSharedTexture,
} from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import { world } from '../uniforms';
import { createPolarGrid } from './polar-grid';
import { createRippleTexture } from './ripple-texture';
import { FADE_DISTANCE, WaveField, wavesForTier } from './waves';

export interface OceanOptions {
  tier: TierSettings;
  /** PMREM environment (a stable texture object; see sky-system). */
  env: Texture;
}

export interface Ocean {
  mesh: Mesh;
  /** CPU sampler matching the rendered surface (buoyancy, splashes, wading). */
  field: WaveField;
  /** Follow the camera and move the wave fade focus with it. */
  update(camera: Camera): void;
  dispose(): void;
}

/** Tropical water optics (per metre). Red is absorbed fastest, which gives lagoons their turquoise. */
const ABSORB = vec3(0.46, 0.085, 0.055);
const DEEP = vec3(0.004, 0.055, 0.085);
const SCATTER = vec3(0.05, 0.42, 0.4);

/**
 * The Phase 0a ocean (PLAN §6 Water system, S4): analytic Gerstner surface on a camera-centred polar
 * grid, per-pixel normals with procedural ripples, PMREM sky reflection with Fresnel, GGX sun/moon
 * glints, screen-space refraction with Beer-Lambert absorption, crest scattering, and whitecap and
 * contact foam. Low/Lite follow the D1 cuts (3 waves, no distortion, 1 foam band).
 */
export function createOcean({ tier, env }: OceanOptions): Ocean {
  const waves = wavesForTier(tier.waves);
  const field = new WaveField(waves);
  const low = tier.tier === 'lite' || tier.tier === 'low';
  const geo = createPolarGrid({
    dr0: low ? 0.7 : tier.tier === 'medium' ? 0.5 : 0.35,
    growth: low ? 1.05 : 1.035,
    radius: 18000,
    segments: low ? 192 : tier.tier === 'medium' ? 288 : 384,
  });
  const ripple = createRippleTexture(256);
  const sumA = waves.reduce((s, w) => s + w.a, 0);

  const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: true, fog: false });
  mat.blending = NoBlending;

  // --- Vertex: Gerstner displacement of the rest grid (exactly what WaveField inverts on the CPU).
  const rest = positionLocal.xz.add(modelPosition.xz);
  const fade = exp(rest.sub(world.focus).length().negate().div(FADE_DISTANCE));
  let ox: Node<'float'> = float(0),
    oy: Node<'float'> = float(0),
    oz: Node<'float'> = float(0);
  for (const W of waves) {
    const th = dot(rest, vec2(W.dx, W.dz)).mul(W.k).sub(world.time.mul(W.w)).add(W.ph);
    const c = cos(th);
    ox = ox.add(c.mul(W.q * W.a * W.dx));
    oz = oz.add(c.mul(W.q * W.a * W.dz));
    oy = oy.add(sin(th).mul(W.a));
  }
  mat.positionNode = positionLocal.add(vec3(ox, oy, oz).mul(fade));
  const vRest = varying(rest, 'vRest');
  const vFade = varying(fade, 'vFade');
  const vH = varying(oy.mul(fade), 'vH');
  const vSpan = varying(attribute('aSpan', 'float'), 'vSpan');

  mat.colorNode = Fn(() => {
    const p = vRest;
    const t = world.time;
    const toCam = cameraPosition.sub(positionWorld);
    const dist = toCam.length();
    const V = toCam.div(max(dist, 1e-3));
    const L = world.keyDir;

    // Gerstner normal at the rest point (GPU Gems form), faded like the displacement.
    let sx: Node<'float'> = float(0),
      sy: Node<'float'> = float(0),
      sz: Node<'float'> = float(0);
    for (const W of waves) {
      const th = dot(p, vec2(W.dx, W.dz)).mul(W.k).sub(t.mul(W.w)).add(W.ph);
      const c = cos(th);
      sx = sx.add(c.mul(W.dx * W.k * W.a));
      sz = sz.add(c.mul(W.dz * W.k * W.a));
      sy = sy.add(sin(th).mul(W.q * W.k * W.a));
    }
    // Procedural ripples: two tiles, rotated against each other, drifting with the wind.
    const wind = world.windDir.mul(world.windSpeed);
    const ca = 0.62,
      sa = 0.78;
    const uv1 = p.div(8.5).add(wind.mul(t).mul(0.006));
    const pr = vec2(p.x.mul(ca).sub(p.y.mul(sa)), p.x.mul(sa).add(p.y.mul(ca)));
    const uv2 = pr.div(3.3).add(wind.mul(t).mul(0.011));
    const r1 = texture(ripple, uv1);
    const r2 = texture(ripple, uv2);
    const s1 = r1.xy.mul(2).sub(1);
    const s2raw = r2.xy.mul(2).sub(1);
    const s2 = vec2(s2raw.x.mul(ca).add(s2raw.y.mul(sa)), s2raw.x.mul(sa).negate().add(s2raw.y.mul(ca)));
    const windK = clamp(world.windSpeed.div(6.5), 0.3, 2.0);
    const ripK = windK.mul(exp(dist.negate().div(700))).mul(smoothstep(6.0, 1.2, vSpan).mul(0.35).add(0.65));
    const rip = s1.mul(0.16).add(s2.mul(0.09)).mul(ripK);
    const N = normalize(
      vec3(sx.mul(vFade).add(rip.x).negate(), float(1).sub(sy.mul(vFade)), sz.mul(vFade).add(rip.y).negate()),
    );

    // Specular AA: roughen where the normal varies faster than a pixel, and with distance.
    const nVar = fwidth(N).length();
    const rough = clamp(float(0.03).add(nVar.mul(0.6)).add(dist.div(30000)), 0.03, 0.4);

    const NdV = max(dot(N, V), 0.0);
    const F = float(0.02).add(float(0.98).mul(pow(float(1).sub(NdV), 5)));
    const Rr = reflect(V.negate(), N);
    const R = normalize(vec3(Rr.x, max(Rr.y, 0.015), Rr.z));
    const refl = pmremTexture(env, R, rough.mul(1.5));

    // GGX key-light highlight (sun by day, a moon path at night).
    const H = normalize(L.add(V));
    const NdH = max(dot(N, H), 0.0);
    const a2 = rough.mul(rough).mul(rough.mul(rough));
    const dd = NdH.mul(NdH).mul(a2.sub(1)).add(1);
    const D = a2.div(dd.mul(dd).mul(Math.PI));
    const NdL = max(dot(N, L), 0.0);
    const spec = world.sunColor.mul(D.mul(NdL).mul(0.25).mul(F.add(0.02))).mul(smoothstep(-0.03, 0.05, L.y));

    // Refraction: depth-aware screen offset, rejecting samples that land on things above the water.
    const ambient = world.skyColor.mul(0.55).add(world.sunColor.mul(max(world.sunDir.y, 0).mul(0.22)));
    const fragZ = positionView.z;
    const ratioAt = (uv: Node<'vec2'>) =>
      perspectiveDepthToViewZ(viewportDepthTexture(uv).x, cameraNear, cameraFar).div(fragZ);
    const uv0 = screenUV;
    const ratio0 = ratioAt(uv0);
    let uvF: Node<'vec2'> = uv0;
    let ratio: Node<'float'> = ratio0;
    if (tier.refractionDistortion) {
      const depth0 = dist.mul(max(ratio0.sub(1), 0)).mul(V.y.abs().add(0.2));
      const uvD = uv0.add(
        N.xz
          .mul(0.045)
          .mul(saturate(depth0.div(2.5)))
          .div(dist.mul(0.02).add(1)),
      );
      const ratioD = ratioAt(uvD);
      const ok = ratioD.greaterThanEqual(1.0);
      uvF = select(ok, uvD, uv0);
      ratio = select(ok, ratioD, ratio0);
    }
    const sceneCol = viewportSharedTexture(uvF).rgb;
    const pathLen = dist.mul(max(ratio.sub(1), 0));
    const sceneY = cameraPosition.y.add(positionWorld.y.sub(cameraPosition.y).mul(ratio));
    const vDepth = max(positionWorld.y.sub(sceneY), 0);
    const T = exp(ABSORB.mul(pathLen).negate());
    const under = sceneCol.mul(T).add(DEEP.mul(ambient).mul(vec3(1).sub(T)));

    // Crest scattering: light through wave tops when looking toward the key light.
    const crest = saturate(vH.div(sumA).mul(0.6).add(0.4));
    const towardL = pow(saturate(dot(V.negate(), L)), 4.0);
    const sss = SCATTER.mul(world.sunColor)
      .mul(towardL.mul(0.6).add(0.08))
      .mul(crest.mul(crest))
      .mul(0.14)
      .mul(float(1).sub(world.night.mul(0.8)));

    // Foam: sparse wind whitecaps, plus contact/shore bands from the water thickness.
    const f1 = texture(ripple, p.div(5.2).add(wind.mul(t).mul(0.004))).z;
    const f2 = texture(ripple, pr.div(2.1).sub(wind.mul(t).mul(0.003))).z;
    const pattern = f1.mul(0.65).add(f2.mul(0.5));
    const capK = smoothstep(4.0, 11.0, world.windSpeed).mul(0.7).add(0.3);
    const whitecap = smoothstep(0.62, 1.0, vH.div(sumA).add(pattern.sub(0.55).mul(0.4)))
      .mul(capK)
      .mul(exp(dist.negate().div(900)));
    let shore = smoothstep(0.55, 0.0, vDepth).mul(smoothstep(0.1, 0.6, pattern.add(0.35)));
    if (tier.foamOctaves >= 2) {
      const band = sin(vDepth.mul(4.2).sub(t.mul(1.1)).add(pattern.mul(2.0)))
        .mul(0.5)
        .add(0.5);
      shore = max(
        shore,
        smoothstep(0.72, 0.95, band)
          .mul(smoothstep(2.2, 0.4, vDepth))
          .mul(smoothstep(0.25, 0.7, pattern)),
      );
    }
    if (tier.foamOctaves >= 3) {
      const band2 = sin(vDepth.mul(2.3).sub(t.mul(0.7)).add(pattern.mul(3.0)))
        .mul(0.5)
        .add(0.5);
      shore = max(
        shore,
        smoothstep(0.8, 0.97, band2)
          .mul(smoothstep(3.5, 1.2, vDepth))
          .mul(smoothstep(0.35, 0.8, pattern))
          .mul(0.7),
      );
    }
    const foam = saturate(max(whitecap.mul(smoothstep(0.2, 0.75, pattern)), shore));
    const foamCol = vec3(0.92, 0.95, 0.96).mul(
      ambient.mul(0.9).add(world.sunColor.mul(NdL.mul(0.32).add(0.08))),
    );

    const body = under.add(sss.mul(float(1).sub(F)));
    let col = mix(body, refl.rgb, F).add(spec);
    col = mix(col, foamCol, foam.mul(0.9));

    // Far-field: blend to the environment's horizon so the sea meets the sky without a seam.
    const horizon = pmremTexture(env, normalize(vec3(V.x.negate(), 0.02, V.z.negate())), float(0.35)).rgb;
    col = mix(col, horizon, smoothstep(1800, 16000, dist).mul(0.85));
    return vec4(col, 1.0);
  })();

  const mesh = new Mesh(geo, mat);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.receiveShadow = false;

  return {
    mesh,
    field,
    update(camera) {
      mesh.position.set(camera.position.x, 0, camera.position.z);
      field.setFocus(camera.position.x, camera.position.z);
      world.focus.value.set(camera.position.x, camera.position.z);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      ripple.dispose();
    },
  };
}
