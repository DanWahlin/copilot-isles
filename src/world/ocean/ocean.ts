// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/ocean/WaterMaterial.js@fd6cae6
// Adapted from NAGI © 2026 NAGI contributors, MIT, src/ocean.js@16c552b
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
  positionPrevious,
  positionView,
  positionWorld,
  pow,
  reflect,
  saturate,
  screenUV,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
  viewportSharedTexture,
} from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import { COVE } from '../layout';
import { foamLight, world } from '../uniforms';
import type { HarborMirrorInput } from './harbor-mirror';
import { shipOcean } from './ship-interaction';
import { MatchedDepth } from './depth-copy';
import { createPolarGrid, type PolarGridOptions } from './polar-grid';
import { createRippleTexture } from './ripple-texture';
import { WATER_DEPTH_BOUNDS, waterDepthTexture } from './water-depth-texture';
import { FADE_DISTANCE, WaveField, wavesForTier } from './waves';
import { seaState } from './sea-state';
import { seaUniforms, syncSea } from './sea-uniforms';
import { writesMotionVectors } from '../../engine/motion-vectors';

export interface OceanOptions {
  tier: TierSettings;
  /** PMREM environment (a stable texture object; see sky-system). */
  env: Texture;
  mirror?: HarborMirrorInput;
  /** Use the cove/Meridian analytic seabed map for clear shallow-water colour. */
  terrainDepth?: boolean;
}

export interface Ocean {
  mesh: Mesh;
  /** CPU sampler matching the rendered surface (buoyancy, splashes, wading). */
  field: WaveField;
  /** Follow the camera and move the wave fade focus with it. */
  update(camera: Camera, time?: number): void;
  dispose(): void;
}

/** Tidewater tropical water optics (per metre), tuned for clear Caribbean shallows. */
const ABSORB = vec3(0.42, 0.075, 0.035);
const WATER_SCATTER = vec3(0.012, 0.018, 0.024);
const SHALLOW_TURQUOISE = vec3(0.08, 0.86, 0.78);
const LAGOON_TEAL = vec3(0.0, 0.74, 0.7);
const SAPPHIRE = vec3(0.005, 0.07, 0.18);
const NAVY = vec3(0.002, 0.025, 0.075);
const CREST_SCATTER = vec3(0.12, 0.55, 0.45);
const FOAM_PATTERN_MEAN = 0.32;

/**
 * The ocean's polar grid per tier. Lite's rings widen faster and it has fewer spokes (about 21k
 * triangles instead of Low's 56k, PLAN §12.1); its three long waves still resolve (the shortest,
 * 13.5 m, has about four vertices a wave out to 40 m, where the grid's filtering fades it anyway).
 */
export function oceanGrid(tier: TierSettings): PolarGridOptions {
  const radius = 18000;
  if (tier.tier === 'lite') return { dr0: 0.7, growth: 1.08, radius, segments: 104 };
  if (tier.tier === 'low') return { dr0: 0.7, growth: 1.05, radius, segments: 192 };
  if (tier.tier === 'medium') return { dr0: 0.5, growth: 1.035, radius, segments: 288 };
  return { dr0: 0.35, growth: 1.035, radius, segments: 384 };
}

/**
 * The Phase 0a ocean (PLAN §6 Water system, S4): analytic Gerstner surface on a camera-centred polar
 * grid, per-pixel normals with procedural ripples, PMREM sky reflection with Fresnel, GGX sun/moon
 * glints, screen-space refraction with Beer-Lambert absorption, crest scattering, and whitecap and
 * contact foam. Low/Lite follow the D1 cuts (3 waves, no distortion, 1 foam band).
 */
export function createOcean({
  tier,
  env,
  mirror,
  terrainDepth: useTerrainDepth = false,
}: OceanOptions): Ocean {
  const waves = wavesForTier(tier.waves);
  const field = new WaveField(waves);
  const geo = createPolarGrid(oceanGrid(tier));
  const ripple = createRippleTexture(256);
  const floorTex = useTerrainDepth ? waterDepthTexture() : null;
  // The colour graph is built once per pass that draws the sea; each build's depth node is this ocean's.
  const depthCopies = new MatchedDepth();
  // The sea state's live amplitudes (uniforms): a change of state builds no new shader.
  const A = seaUniforms.amp;
  const QA = seaUniforms.qa;
  let sumA: Node<'float'> = float(0);
  for (let i = 0; i < waves.length; i++) sumA = sumA.add(A[i]!);
  const previousWaveTime = uniform(0);
  let lastWaveTime = Number.NaN;

  const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  mat.blending = NoBlending;
  // Its motion vectors are right (positionPrevious below), so TRAA keeps them though it's see-through.
  writesMotionVectors(mat);

  // --- Vertex: Gerstner displacement of the rest grid (exactly what WaveField inverts on the CPU).
  const rest = positionLocal.xz.add(modelPosition.xz);
  const spanAttr = attribute('aSpan', 'float');
  const focusDist = rest.sub(world.focus).length();
  const fade = exp(focusDist.negate().div(FADE_DISTANCE));
  const waveOffset = (time: Node<'float'>) => {
    let ox: Node<'float'> = float(0),
      oy: Node<'float'> = float(0),
      oz: Node<'float'> = float(0);
    waves.forEach((W, i) => {
      const th = dot(rest, vec2(W.dx, W.dz)).mul(W.k).sub(time.mul(W.w)).add(W.ph);
      const c = cos(th);
      const wavelength = (Math.PI * 2) / W.k;
      const lod = smoothstep(0.55, 1.35, float(wavelength).div(max(spanAttr, 0.001)));
      ox = ox.add(c.mul(QA[i]!.mul(W.dx)).mul(lod));
      oz = oz.add(c.mul(QA[i]!.mul(W.dz)).mul(lod));
      oy = oy.add(sin(th).mul(A[i]!).mul(lod));
    });
    return vec3(ox, oy, oz);
  };
  const offset = waveOffset(world.time);
  const previousOffset = waveOffset(previousWaveTime);
  mat.positionNode = Fn(() => {
    positionPrevious.assign(positionLocal.add(previousOffset.mul(fade)));
    return positionLocal.add(offset.mul(fade));
  })();
  const vRest = varying(rest, 'vRest');
  const vFade = varying(fade, 'vFade');
  const vH = varying(offset.y.mul(fade), 'vH');
  const vSpan = varying(spanAttr, 'vSpan');
  let terrainDepthNode: Node<'float'> = float(58);
  if (floorTex) {
    const floorUvRaw = rest
      .sub(vec2(WATER_DEPTH_BOUNDS.minX, WATER_DEPTH_BOUNDS.minZ))
      .div(
        vec2(
          WATER_DEPTH_BOUNDS.maxX - WATER_DEPTH_BOUNDS.minX,
          WATER_DEPTH_BOUNDS.maxZ - WATER_DEPTH_BOUNDS.minZ,
        ),
      );
    const floorUv = clamp(floorUvRaw, vec2(0.002), vec2(0.998));
    const floorOk = floorUvRaw.x
      .greaterThanEqual(0)
      .and(floorUvRaw.x.lessThanEqual(1))
      .and(floorUvRaw.y.greaterThanEqual(0))
      .and(floorUvRaw.y.lessThanEqual(1));
    const floorY = select(floorOk, texture(floorTex, floorUv).r, float(-58));
    terrainDepthNode = max(offset.y.mul(fade).sub(floorY), 0);
  }
  const vTerrainDepth = varying(terrainDepthNode, 'vTerrainDepth');

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
    const waveFootprint = max(vSpan, fwidth(p).length());
    waves.forEach((W, i) => {
      const th = dot(p, vec2(W.dx, W.dz)).mul(W.k).sub(t.mul(W.w)).add(W.ph);
      const c = cos(th);
      const wavelength = (Math.PI * 2) / W.k;
      const lod = smoothstep(0.55, 1.35, float(wavelength).div(max(waveFootprint, 0.001)));
      sx = sx.add(c.mul(A[i]!.mul(W.dx * W.k)).mul(lod));
      sz = sz.add(c.mul(A[i]!.mul(W.dz * W.k)).mul(lod));
      sy = sy.add(sin(th).mul(QA[i]!.mul(W.k)).mul(lod));
    });
    // Procedural ripples: two tiles, rotated against each other, drifting with the wind (its
    // integral, `windDrift`: wind × time raced whenever the sea state changed the wind's speed).
    const drift = world.windDrift;
    const ca = 0.62,
      sa = 0.78;
    const uv1 = p.div(8.5).add(drift.mul(0.006));
    const pr = vec2(p.x.mul(ca).sub(p.y.mul(sa)), p.x.mul(sa).add(p.y.mul(ca)));
    const uv2 = pr.div(3.3).add(drift.mul(0.011));
    const r1 = texture(ripple, uv1);
    const r2 = texture(ripple, uv2);
    const s1 = r1.xy.mul(2).sub(1);
    const s2raw = r2.xy.mul(2).sub(1);
    const s2 = vec2(s2raw.x.mul(ca).add(s2raw.y.mul(sa)), s2raw.x.mul(sa).negate().add(s2raw.y.mul(ca)));
    const windK = clamp(world.windSpeed.div(6.5), 0.3, 2.0);
    const nearRipple = float(1).add(float(0.24).mul(float(1).sub(smoothstep(8, 58, dist))));
    const rippleFootprint = max(fwidth(uv1).length(), fwidth(uv2).length());
    const rippleFilter = smoothstep(0.018, 0.07, rippleFootprint);
    const rippleDistanceFilter = smoothstep(110, 240, dist);
    const rippleCull = max(rippleFilter.mul(0.92), rippleDistanceFilter);
    const ripK = windK
      .mul(exp(dist.negate().div(700)))
      .mul(smoothstep(6.0, 1.2, vSpan).mul(0.35).add(0.65))
      .mul(nearRipple);
    const rip = s1.mul(0.17).add(s2.mul(0.1)).mul(ripK).mul(float(1).sub(rippleCull));
    const N = normalize(
      vec3(sx.mul(vFade).add(rip.x).negate(), float(1).sub(sy.mul(vFade)), sz.mul(vFade).add(rip.y).negate()),
    );

    // Specular AA: roughen where the normal varies faster than a pixel, with distance, and
    // where grid spacing can no longer resolve the short Gerstner slopes.
    const nVar = fwidth(N).length();
    let slopeVariance: Node<'float'> = float(0);
    waves.forEach((W, i) => {
      const wavelength = (Math.PI * 2) / W.k;
      const lod = smoothstep(0.55, 1.35, float(wavelength).div(max(waveFootprint, 0.001)));
      slopeVariance = slopeVariance.add(seaUniforms.slopeVariance[i]!.mul(float(1).sub(lod.mul(lod))));
    });
    const waveRough = sqrt(float(1).add(slopeVariance)).sub(1).mul(0.8);
    const spectralVar = smoothstep(0.018, 0.09, rippleFootprint).mul(ripK).mul(0.04);
    const rough = clamp(
      float(0.018).add(spectralVar.mul(0.8)).add(waveRough).add(nVar.mul(0.8)).add(dist.div(30000)),
      0.03,
      0.5,
    );

    const NdV = max(dot(N, V), 0.0);
    const F = float(0.02).add(float(0.98).mul(pow(float(1).sub(NdV), 5)));
    const Rr = reflect(V.negate(), N);
    const R = normalize(vec3(Rr.x, max(Rr.y, 0.015), Rr.z));
    const refl = pmremTexture(env, R, rough.mul(1.5));
    let reflRgb: Node<'vec3'> = refl.rgb;
    if (mirror) {
      const harborDist = p.sub(vec2(COVE.harbor.center.x, COVE.harbor.center.z)).length();
      const harborMask = float(1)
        .sub(smoothstep(COVE.harbor.radius * 0.78, COVE.harbor.radius, harborDist))
        .mul(mirror.active);
      // The matrix already maps to 0-1 (HarborMirror's bias); three flips v for a render target on WebGPU.
      const mirrorClip = mirror.matrix.mul(vec4(positionWorld.x, positionWorld.y, positionWorld.z, 1));
      const mirrorNdc = mirrorClip.xy.div(mirrorClip.w);
      const mirrorUv = vec2(mirrorNdc.x, float(1).sub(mirrorNdc.y)).add(N.xz.mul(0.008).mul(harborMask));
      const uvOk = mirrorUv.x
        .greaterThanEqual(0)
        .and(mirrorUv.x.lessThanEqual(1))
        .and(mirrorUv.y.greaterThanEqual(0))
        .and(mirrorUv.y.lessThanEqual(1))
        .select(float(1), float(0));
      reflRgb = mix(reflRgb, texture(mirror.texture, mirrorUv).rgb, harborMask.mul(uvOk).mul(0.6));
    }

    // GGX key-light highlight (sun by day, a moon path at night).
    const H = normalize(L.add(V));
    const NdH = max(dot(N, H), 0.0);
    const a2 = rough.mul(rough).mul(rough.mul(rough));
    const dd = NdH.mul(NdH).mul(a2.sub(1)).add(1);
    const D = a2.div(dd.mul(dd).mul(Math.PI));
    const NdL = max(dot(N, L), 0.0);
    const spec = world.sunColor.mul(D.mul(NdL).mul(0.25).mul(F.add(0.02))).mul(smoothstep(-0.03, 0.05, L.y));

    // Baked analytic seabed depth: keeps Lite/Low vivid even when screen-space refraction is off.
    const deepWaterMask = smoothstep(10, 30, vTerrainDepth);
    const deepTerrainStabilize = deepWaterMask.mul(smoothstep(130, 260, dist));
    const terrainDepth = mix(vTerrainDepth, float(58), deepTerrainStabilize);

    // Refraction: depth-aware screen offset, rejecting samples that land on things above the water.
    const ambient = world.skyColor.mul(0.55).add(world.sunColor.mul(max(world.sunDir.y, 0).mul(0.22)));
    const fragZ = positionView.z;
    const depthTex = depthCopies.node();
    const ratioAt = (uv: Node<'vec2'>) =>
      perspectiveDepthToViewZ(depthTex.sample(uv).x, cameraNear, cameraFar).div(fragZ);
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
    const pathLen = clamp(terrainDepth.div(max(V.y, 0.28)), 0, 400);
    const sceneY = cameraPosition.y.add(positionWorld.y.sub(cameraPosition.y).mul(ratio));
    const screenDepth = max(positionWorld.y.sub(sceneY), 0);
    const vDepth = terrainDepth;
    const sigT = ABSORB.add(WATER_SCATTER);
    const T = exp(sigT.mul(pathLen).negate());
    const shallowK = smoothstep(1.2, 3.1, terrainDepth);
    const deepK = smoothstep(8, 42, terrainDepth);
    const waterPalette = mix(
      mix(SHALLOW_TURQUOISE, LAGOON_TEAL, shallowK),
      mix(SAPPHIRE, NAVY, deepK),
      smoothstep(2.6, 7.2, terrainDepth),
    );
    const inScatter = waterPalette
      .mul(
        ambient
          .mul(0.62)
          .add(world.sunColor.mul(NdL.mul(0.1)))
          // a base light in the water: daylight's, dimming to moonlight's at night
          .add(mix(float(0.34), float(0.05), world.night)),
      )
      .mul(vec3(1).sub(T))
      .mul(mix(float(0.46), float(0.58), smoothstep(16, 84, dist)))
      .add(WATER_SCATTER.mul(world.sunColor).mul(float(1).sub(exp(pathLen.mul(-0.045)))));
    const under = sceneCol.mul(T).add(inScatter);

    // Crest scattering: light through wave tops when looking toward the key light.
    const crest = saturate(vH.div(sumA).mul(0.6).add(0.4));
    const backLightDir = normalize(L.add(N.mul(0.4))).negate();
    const backLight = pow(saturate(dot(V, backLightDir)), 2.0);
    const crestTransport = crest.mul(crest).mul(float(0.12).add(backLight.mul(0.6)));
    const sss = CREST_SCATTER.mul(world.sunColor)
      .mul(crestTransport)
      .mul(0.09)
      .mul(float(1).add(NdL.mul(0.18)))
      .mul(float(1).sub(world.night.mul(0.8)));

    // Foam: sparse wind whitecaps, plus contact/shore bands from the water thickness.
    const f1 = texture(ripple, p.div(5.2).add(drift.mul(0.004))).z;
    const f2 = texture(ripple, pr.div(2.1).sub(drift.mul(0.003))).z;
    const patternRaw = f1.mul(0.65).add(f2.mul(0.5));
    const foamFootprint = max(
      fwidth(p.div(5.2).add(drift.mul(0.004))).length(),
      fwidth(pr.div(2.1).sub(drift.mul(0.003))).length(),
    );
    const foamFilter = smoothstep(0.035, 0.16, foamFootprint);
    const pattern = mix(patternRaw, float(FOAM_PATTERN_MEAN), foamFilter);
    // Whitecaps: the sea state sets where on the crest they start (Breeze 0.62) and how the wind
    // drives them (Breeze's is today's smoothstep(4, 11, wind) × 0.7 + 0.3, worked out on the CPU).
    const capFrom = seaUniforms.capFrom;
    const whitecap = smoothstep(capFrom, capFrom.add(0.38), vH.div(sumA).add(pattern.sub(0.55).mul(0.4)))
      .mul(seaUniforms.capWind)
      .mul(exp(dist.negate().div(900)));
    // Spindrift (Fresh and Gale): foam blown off the crests in long streaks along the wind, the
    // contour lines of the ripple height stretched downwind, in patches, filtered out where a streak
    // is finer than a pixel. Nothing in a Breeze or a Calm (× 0).
    const windN = world.windDir;
    const alongWind = dot(p, windN).sub(dot(drift, windN).mul(0.35));
    const acrossWind = dot(p, vec2(windN.y.negate(), windN.x));
    const streakUv = vec2(alongWind.div(55), acrossWind.div(4.5));
    const streakUv2 = vec2(alongWind.div(31), acrossWind.div(2.6)).add(0.37);
    const streakFilter = float(1).sub(smoothstep(0.012, 0.05, fwidth(streakUv2).length()));
    const lineA = smoothstep(0.075, 0.0, texture(ripple, streakUv).w.sub(0.5).abs());
    const lineB = smoothstep(0.055, 0.0, texture(ripple, streakUv2).w.sub(0.5).abs()).mul(0.7);
    const patches = smoothstep(0.38, 0.72, texture(ripple, p.div(96).add(drift.mul(0.0015))).w);
    const streak = max(lineA, lineB)
      .mul(patches)
      .mul(smoothstep(0.12, 0.5, pattern))
      .mul(streakFilter)
      .mul(smoothstep(-0.45, 0.4, vH.div(sumA)))
      .mul(seaUniforms.spindrift)
      .mul(exp(dist.negate().div(650)));
    let shore = smoothstep(0.55, 0.0, vDepth).mul(smoothstep(0.1, 0.6, pattern.add(0.35)));
    // Contact foam where the sea meets rock, hulls and piles: broken lace that gathers only where a crest
    // runs in, not a solid white rim tracing every waterline.
    shore = max(
      shore,
      smoothstep(0.3, 0.0, screenDepth).mul(smoothstep(0.55, 0.88, pattern.add(crest.mul(0.5)))),
    );
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
    // Ship interaction: analytic cut-out, waterline ring, bow foam, Kelvin arms, and a small CPU trail.
    const ship = shipOcean.pose;
    const active = shipOcean.dims.w;
    const toShip = p.sub(ship.xy);
    const ch = cos(ship.z);
    const sh = sin(ship.z);
    const lx = toShip.x.mul(ch).sub(toShip.y.mul(sh));
    const lz = toShip.x.mul(sh).add(toShip.y.mul(ch));
    const zT = clamp(lz.add(12).div(24), 0, 1);
    const midFullness = pow(max(sin(zT.mul(Math.PI)), 0), 0.42);
    const bowFade = float(1).sub(smoothstep(0.78, 0.995, zT));
    const sternFull = mix(float(0.58), float(1), smoothstep(0.02, 0.2, zT));
    const halfBeam = float(3.3).mul(max(float(0.08), midFullness.mul(bowFade).mul(sternFull)));
    const inLength = lz.greaterThan(-11.9).and(lz.lessThan(11.65));
    const insideHull = active
      .greaterThan(0.5)
      .and(inLength)
      .and(lx.abs().lessThan(halfBeam.mul(0.92)));
    insideHull.discard();

    const speedK = smoothstep(0.25, 5.8, ship.w).mul(active);
    const sideDist = lx.abs().sub(halfBeam.mul(1.02)).abs();
    const endFade = smoothstep(-11.9, -10.8, lz).mul(float(1).sub(smoothstep(10.15, 11.7, lz)));
    const laceNoise = smoothstep(0.46, 0.92, pattern.add(sin(lz.mul(5.7).add(t.mul(1.8))).mul(0.12)));
    const hullRing = smoothstep(0.11, 0.0, sideDist).mul(endFade).mul(laceNoise).mul(active).mul(0.22);

    const bowLeft = smoothstep(1.35, 0.0, vec2(lx.sub(0.85), lz.sub(10.55)).length());
    const bowRight = smoothstep(1.35, 0.0, vec2(lx.add(0.85), lz.sub(10.55)).length());
    const bowSide = smoothstep(0.72, 0.0, sideDist)
      .mul(smoothstep(7.0, 10.3, lz))
      .mul(float(1).sub(smoothstep(10.8, 12.0, lz)));
    const bowFoam = max(max(bowLeft, bowRight), bowSide)
      .mul(speedK)
      .mul(smoothstep(0.42, 0.82, pattern.add(0.15)))
      .mul(1.15);

    const sternAft = max(lz.add(12.0).negate(), 0);
    const kelvinArm = lx.abs().sub(sternAft.mul(0.354)).abs();
    const armWidth = float(0.42).add(sternAft.mul(0.012));
    const wakeBreakup = smoothstep(
      0.38,
      0.88,
      pattern.add(sin(sternAft.mul(0.8).add(lx.mul(2.7))).mul(0.18)),
    );
    const wakeArms = smoothstep(armWidth, 0.0, kelvinArm)
      .mul(smoothstep(1.4, 9.0, sternAft))
      .mul(exp(sternAft.negate().div(58)))
      .mul(speedK)
      .mul(wakeBreakup)
      .mul(1.15);
    const washBreakup = smoothstep(0.2, 0.72, pattern.add(sin(lx.mul(3.9).add(sternAft.mul(0.9))).mul(0.2)));
    const sternWash = smoothstep(2.5, 0.0, lx.abs())
      .mul(smoothstep(0.4, 4.5, sternAft))
      .mul(exp(sternAft.negate().div(18)))
      .mul(speedK)
      .mul(washBreakup)
      .mul(1.1);
    let trailFoam: Node<'float'> = float(0);
    for (const sample of shipOcean.trail) {
      const blob = smoothstep(3.4, 0.0, p.distance(sample.xy)).mul(sample.w).mul(wakeBreakup);
      trailFoam = max(trailFoam, blob);
    }
    // Bow spray (Fresh and Gale): white water thrown round her bow as she drives into a sea; its
    // strength comes from the CPU (bow slams × the sea state's spray, 0 in a Breeze).
    const bowSpray = smoothstep(4.6, 0.0, vec2(lx.mul(0.8), lz.sub(10.9)).length())
      .mul(smoothstep(0.25, 0.7, pattern.add(0.18)))
      .mul(shipOcean.spray)
      .mul(active);
    const shipFoam = saturate(
      max(max(max(hullRing, bowFoam), bowSpray), max(max(wakeArms, sternWash), trailFoam.mul(0.42))),
    );

    const foam = saturate(
      max(max(max(whitecap.mul(smoothstep(0.2, 0.75, pattern)), shore), shipFoam), streak.mul(0.42)),
    );
    const baseFoamCol = vec3(0.98, 0.99, 1.0).mul(
      ambient
        .mul(0.14)
        .add(world.sunColor.mul(NdL.mul(0.12).add(0.04)))
        .add(0.9),
    );
    const foamCol = mix(baseFoamCol, vec3(1.0, 1.0, 0.98), shipFoam.mul(0.92)).mul(foamLight);

    const waveShade = float(0.84).add(crest.mul(0.16)).add(pow(NdL, 2).mul(0.08));
    const body = under.mul(waveShade).add(sss.mul(float(1).sub(F)));
    let col = mix(body, reflRgb, saturate(F.mul(1.35))).add(spec);
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
  // Its look is its own (no other mesh shares it), so it keeps its shadow-free shader: as a skipped
  // receiver it carried the shadow lookup for nothing, and changing the flag later built it again.
  mesh.userData.sunShadowNever = true;

  return {
    mesh,
    field,
    update(camera, time = world.time.value) {
      syncSea(time);
      field.setSea(seaState.live, seaState.version);
      if (!Number.isFinite(lastWaveTime)) lastWaveTime = time;
      previousWaveTime.value = lastWaveTime;
      lastWaveTime = time;
      mesh.position.set(camera.position.x, 0, camera.position.z);
      field.setFocus(camera.position.x, camera.position.z);
      world.focus.value.set(camera.position.x, camera.position.z);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      ripple.dispose();
      depthCopies.dispose();
    },
  };
}
