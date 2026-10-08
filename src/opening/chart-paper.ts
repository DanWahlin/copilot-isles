import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three/webgpu';
import {
  abs,
  cameraPosition,
  color,
  cos,
  dot,
  faceDirection,
  float,
  fract,
  frontFacing,
  max,
  min,
  mix,
  mx_noise_float,
  mx_noise_vec3,
  normalize,
  positionGeometry,
  positionWorld,
  pow,
  reflect,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  transformNormalToView,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { ALL_WAVES } from '../world/ocean/waves';
import { STERN_WINDOWS } from './cabin';
import { CARTOUCHE, CHART_D, CHART_W } from './chart-map';
import type { ChartArt } from './chart-art';

/**
 * The Captain's Chart as a sheet of parchment (TSL): it rolls and unrolls (a spiral of real paper
 * thickness, so the roll shrinks as it opens), its ends lift and relax as it settles, and its inked
 * sea turns to rippling water from the centre outward. One draw, one pipeline.
 */
export interface ChartPaper {
  mesh: Mesh;
  /** 0 rolled → 1 flat. */
  unroll: { value: number };
  /** The ends' lift as it settles (−1…1). */
  settle: { value: number };
  /** The water's reach from the centre (0 → 1 covers the sheet). */
  water: { value: number };
  time: { value: number };
  dispose(): void;
}

const W = CHART_W;
const D = CHART_D;
/** Paper thickness in the roll (a little thick, so the layers read) and the roll's core radius. */
const THICK = 0.0016;
const CORE = 0.011;
const K = THICK / (2 * Math.PI);
/** The mini sea: world metres → chart metres, how much taller the waves stand, and their pace. */
const SEA_SCALE = 1 / 300;
const SEA_LIFT = 1.3;
const SEA_SPEED = 1.6;
/** The cartouche's place on the sheet (paper metres); the parchment border widens round it. */
/**
 * Only the swells the chart can show: like the ocean's own LOD, waves shorter than the sheet can
 * resolve (here under ~1.2 cm of chart) are dropped rather than left to alias into noise.
 */
const CHART_WAVES = ALL_WAVES.filter((w) => ((2 * Math.PI) / w.k) * SEA_SCALE >= 0.012);
const AMP_SUM = CHART_WAVES.reduce((sum, w) => sum + w.a, 0);
const CART = { x: (CARTOUCHE.u - 0.5) * W, z: (CARTOUCHE.v - 0.5) * D };
/** The parchment border's width, and how far the swash runs in and out across it (metres). */
const BORDER = 0.036;
const SWASH = 0.009;
/** Radians per second of the swash cycle (about 4.5 s per surge). */
const SWASH_RATE = 1.4;

/** The rolled chart's outer radius when `unroll` of it is flat (the contact line stays at y = 0). */
export function rollRadius(unroll: number): number {
  return Math.sqrt(CORE * CORE + ((1 - unroll) * W * THICK) / Math.PI);
}

export function createChartPaper(art: ChartArt): ChartPaper {
  // Dense enough for the swell to move the surface (and for the roll's curl).
  const geo = new PlaneGeometry(W, D, 260, 182);
  geo.rotateX(-Math.PI / 2);
  const inkTex = new CanvasTexture(art.ink);
  inkTex.name = 'opening-chart-ink';
  inkTex.colorSpace = SRGBColorSpace;
  inkTex.anisotropy = 8;
  const maskTex = new CanvasTexture(art.mask);
  maskTex.name = 'opening-chart-mask';
  maskTex.minFilter = LinearFilter;
  maskTex.generateMipmaps = false;

  const unroll = uniform(0);
  const settle = uniform(0);
  const water = uniform(0);
  const time = uniform(0);

  // ---- the mini sea: the real ocean's Gerstner waves (ALL_WAVES, the same table the ocean
  // builds from), at 1:SEA_SCALE across the chart, taller than true scale so the swell reads ----
  const t = time;
  const gerstner = (q: Node<'vec2'>) => {
    const pw = q.div(SEA_SCALE);
    let ox: Node<'float'> = float(0);
    let oy: Node<'float'> = float(0);
    let oz: Node<'float'> = float(0);
    let sx: Node<'float'> = float(0);
    let sy: Node<'float'> = float(0);
    let sz: Node<'float'> = float(0);
    for (const Wv of CHART_WAVES) {
      const th = dot(pw, vec2(Wv.dx, Wv.dz))
        .mul(Wv.k)
        .sub(t.mul(Wv.w * SEA_SPEED))
        .add(Wv.ph);
      const c = cos(th);
      const sn = sin(th);
      ox = ox.add(c.mul(Wv.q * Wv.a * Wv.dx));
      oz = oz.add(c.mul(Wv.q * Wv.a * Wv.dz));
      oy = oy.add(sn.mul(Wv.a));
      sx = sx.add(c.mul(Wv.dx * Wv.k * Wv.a));
      sz = sz.add(c.mul(Wv.dz * Wv.k * Wv.a));
      sy = sy.add(sn.mul(Wv.q * Wv.k * Wv.a));
    }
    return {
      offset: vec3(ox.mul(SEA_SCALE), oy.mul(SEA_SCALE * SEA_LIFT), oz.mul(SEA_SCALE)),
      // Gerstner normal (GPU Gems form); the lift steepens the slopes by the same factor.
      normal: normalize(vec3(sx.mul(SEA_LIFT).negate(), float(1).sub(sy), sz.mul(SEA_LIFT).negate())),
      height: oy,
    };
  };

  // Where the water lies: inside a border of parchment whose edge ebbs and flows like swash on a
  // beach (each surge runs in quickly and drains back slowly, in sets that travel along the edge),
  // and clear of the cartouche. It first spreads out from the centre on an uneven front.
  const seaShape = (q: Node<'vec2'>, landAmount: Node<'float'>) => {
    const toSheetEdge = min(
      min(q.x.add(W / 2), float(W / 2).sub(q.x)),
      min(q.y.add(D / 2), float(D / 2).sub(q.y)),
    );
    // The cartouche: a rounded box the water laps round (its distance joins the sheet edge's).
    const c = abs(q.sub(vec2(CART.x, CART.z))).sub(vec2(CARTOUCHE.halfW, CARTOUCHE.halfD));
    const toCart = max(c, vec2(0, 0))
      .length()
      .add(min(max(c.x, c.y), 0))
      .sub(0.012);
    const toDry = min(toSheetEdge, toCart.add(BORDER));
    // Along-the-edge position, so the swash sets travel round the sheet.
    const alongEdge = q.x.mul(5.1).add(q.y.mul(7.3));
    const shape = mx_noise_float(vec3(q.mul(6), 0.7))
      .mul(0.5)
      .add(0.5);
    const phase = t.mul(SWASH_RATE).add(alongEdge).add(shape.mul(2.2));
    const surge = sin(phase).add(sin(phase.mul(2)).mul(0.35));
    const reachOut = mx_noise_float(vec3(q.mul(11), t.mul(0.08))).mul(0.004);
    const border = float(BORDER).add(shape.mul(0.012)).sub(surge.mul(SWASH)).add(reachOut);
    // How far up the paper the swash ever gets here (the damp line).
    const highWater = float(BORDER)
      .add(shape.mul(0.012))
      .sub(SWASH * 1.35);
    // Positive while the edge is running in (the lace is brightest on the surge).
    const surging = cos(phase)
      .add(cos(phase.mul(2)).mul(0.7))
      .mul(0.5);
    const inside = smoothstep(border.sub(0.0015), border.add(0.0015), toDry);
    const front = mx_noise_float(vec3(q.mul(4.2), 3.1)).mul(0.09);
    const reach = water.mul(1.15);
    const d = q
      .length()
      .div(Math.hypot(W, D) / 2)
      .add(front);
    const spread = float(1).sub(smoothstep(reach.sub(0.06), reach, d));
    // Shallow over the paper near its edge (calm, see-through), deepening toward open water.
    const shore = smoothstep(border, border.add(0.03), toDry);
    return {
      wet: spread.mul(inside).mul(float(1).sub(landAmount)),
      spread,
      inside,
      border,
      highWater,
      surging,
      toDry,
      shore,
      d,
      reach,
    };
  };

  // ---- the roll (vertex), plus the swell once the sheet is flat ----
  const flat = unroll.mul(W);
  const px = positionGeometry.x;
  const along = max(px.add(W / 2).sub(flat), 0);
  const rOut = sqrt(
    float(CORE * CORE).add(
      float(W)
        .sub(flat)
        .mul(THICK / Math.PI),
    ),
  );
  const theta = rOut.sub(sqrt(max(rOut.mul(rOut).sub(along.mul(2 * K)), 0))).div(K);
  const r = rOut.sub(theta.mul(K));
  const edge = pow(abs(px).div(W / 2), 5);
  const flatNow = smoothstep(0.98, 1, unroll);
  const lift = settle.mul(0.022).mul(edge).mul(flatNow);
  const rolledX = min(px, flat.sub(W / 2)).add(r.mul(sin(theta)));
  const rolledY = rOut.sub(r.mul(cos(theta))).add(lift);
  const vq = vec2(positionGeometry.x, positionGeometry.z);
  const vMask = texture(maskTex, uv()).level(float(0));
  const vSea = seaShape(vq, vMask.r);
  const vWave = gerstner(vq);
  // Calm in the shallows and at the water's edge; the waves stand up as the water arrives.
  const swell = vSea.wet
    .mul(vSea.shore)
    .mul(flatNow)
    .mul(float(1).sub(vMask.g.mul(0.6)));
  // The water stands on the paper by its full wave height, so the troughs never dip below the sheet.
  const disp = vWave.offset.add(vec3(0, AMP_SUM * SEA_SCALE * SEA_LIFT, 0)).mul(swell);
  // The printed side faces into the roll; its normal turns with the curl.
  const curlNormal = varying(vec3(sin(theta).negate(), cos(theta), 0), 'v_chartNormal');

  // ---- the sheet (fragment) ----
  const st = uv();
  const ink = texture(inkTex, st);
  const mask = texture(maskTex, st);
  const land = mask.r;
  const shallow = mask.g;
  const fog = mask.b;
  const p = st.sub(0.5).mul(vec2(W, -D));
  const grain = mx_noise_float(vec3(st.mul(vec2(48, 34)), 0.3))
    .mul(0.5)
    .add(0.5);
  const blotch = mx_noise_float(vec3(st.mul(vec2(5, 3.5)), 1.7))
    .mul(0.5)
    .add(0.5);
  const toEdge = min(min(st.x, float(1).sub(st.x)), min(st.y, float(1).sub(st.y)));
  const paper = mix(
    color(0xb48a4e),
    mix(color(0xe9d6a6), color(0xf3e6c2), grain.mul(0.6)),
    smoothstep(0, 0.07, toEdge),
  )
    .mul(mix(0.86, 1.0, blotch))
    .toVar();

  const sea = seaShape(p, land);
  const wet = sea.wet.toVar();
  const wave = gerstner(p);
  // The spreading front: a bright foamy lip while the water's still arriving.
  const arriving = smoothstep(0.0, 0.05, water).mul(float(1).sub(smoothstep(0.95, 1, water)));
  const lip = smoothstep(sea.reach.sub(0.08), sea.reach.sub(0.03), sea.d)
    .mul(float(1).sub(smoothstep(sea.reach.sub(0.03), sea.reach, sea.d)))
    .mul(sea.inside)
    .mul(float(1).sub(land))
    .mul(arriving);
  // Where the water has reached the edge (the spreading front has got there).
  const arrived = sea.spread.mul(float(1).sub(land));
  // Lace of foam along the swash's edge: broken up, brightest as each surge runs in.
  const lace = mx_noise_float(vec3(p.mul(140), t.mul(0.9)))
    .mul(0.5)
    .add(0.5);
  const edgeBand = smoothstep(sea.border.sub(0.0015), sea.border.add(0.001), sea.toDry).mul(
    float(1).sub(smoothstep(sea.border.add(0.001), sea.border.add(0.006), sea.toDry)),
  );
  const edgeFoam = edgeBand
    .mul(smoothstep(0.25, 0.75, lace))
    .mul(sea.surging.mul(0.35).add(0.65))
    .mul(arrived);
  // Paper the swash has just drained off stays damp (darker, with a sheen) up to the high-water line.
  const damp = smoothstep(sea.highWater.sub(0.002), sea.highWater.add(0.003), sea.toDry)
    .mul(float(1).sub(sea.inside))
    .mul(smoothstep(sea.highWater, sea.border, sea.toDry).mul(0.5).add(0.5))
    .mul(arrived);

  // Crests a touch lighter (light through the thin water at the top of each swell), and only the
  // steepest few break into a little broken foam.
  const crest = smoothstep(-0.1, 0.5, wave.height);
  const deep = mix(color(0x0d4f7a), color(0x1f7fae), crest);
  const shoal = mix(color(0x29b3ad), color(0x5fd8c9), crest.mul(0.7));
  const foamBreak = mx_noise_float(vec3(p.mul(70), t.mul(0.5)))
    .mul(0.5)
    .add(0.5);
  const whitecap = smoothstep(0.52, 0.62, wave.height)
    .mul(smoothstep(0.55, 0.8, foamBreak))
    .mul(0.35);
  const open = mix(deep, shoal, smoothstep(0.1, 0.8, shallow)).add(vec3(0.9, 0.95, 0.97).mul(whitecap));
  // Over the shallow edge you see the parchment through clear, sunlit water.
  const throughWater = paper.mul(vec3(0.58, 0.8, 0.8));
  const seaColor = mix(throughWater, open, sea.shore.mul(0.85).add(0.15)).toVar();
  // Names and coastlines stay legible under the water; the sea's hatching and rhumbs dissolve.
  const inkLum = dot(ink.rgb, vec3(0.3, 0.59, 0.11));
  const keep = float(1).sub(smoothstep(0.03, 0.09, inkLum));
  const inkAmount = ink.a.mul(mix(float(1), mix(float(0.12), float(0.8), keep), wet));
  const dampPaper = paper.mul(mix(vec3(1), vec3(0.74, 0.7, 0.62), damp));
  // The water carries its own colour (emissive, below), so the cabin's warm light can't turn it
  // brown; its diffuse is a faint share so the lamps and shadows still model it.
  const underInk = mix(ink.rgb, vec3(0.04, 0.12, 0.2), wet);
  const surface = mix(mix(dampPaper, seaColor.mul(0.22), wet), underInk, inkAmount)
    .add(vec3(0.95, 0.93, 0.86).mul(lip.mul(0.55)))
    .add(vec3(0.97, 0.96, 0.9).mul(edgeFoam.mul(0.75)));
  const fogFlow = mx_noise_float(vec3(st.mul(vec2(9, 6)).add(vec2(t.mul(0.04), 0)), t.mul(0.05)))
    .mul(0.5)
    .add(0.5);
  // A faint mist round the islands still to come (their paper clouds stand over them).
  const fogAmount = smoothstep(0.3, 0.95, fog.add(fogFlow.sub(0.5).mul(0.6)))
    .mul(0.14)
    .mul(float(1).sub(wet.mul(0.75)));
  const fogged = mix(surface, color(0xefece4), fogAmount);
  const back = paper.mul(0.82);

  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0 });
  mat.userData.disposeTextures = [inkTex, maskTex];
  mat.positionNode = vec3(rolledX, rolledY, positionGeometry.z).add(disp);
  mat.colorNode = select(frontFacing, fogged, back);
  mat.roughnessNode = select(
    frontFacing,
    mix(mix(float(0.88), float(0.55), damp), float(0.5), wet),
    float(0.92),
  );
  // The living water glows faintly, as if lit from within (it's magic, and the cabin is dim), and
  // catches the golden window light at a low angle (a warm sheen toward the far side).
  const toEye = normalize(cameraPosition.sub(positionWorld));
  const sheen = pow(float(1).sub(abs(toEye.y)), 3).mul(sea.shore);
  // Small, quick ripples over the swell (two scrolling noise layers, no lattice): they break the
  // reflections up into glints.
  const r1 = mx_noise_vec3(vec3(p.mul(140).add(vec2(t.mul(0.9), t.mul(0.4))), t.mul(0.6)));
  const r2 = mx_noise_vec3(vec3(p.mul(260).sub(vec2(t.mul(0.5), t.mul(1.1))), t.mul(0.9).add(5)));
  const ripple = r1.mul(0.07).add(r2.mul(0.035)).mul(sea.shore.mul(0.7).add(0.3));
  const waveN = normalize(wave.normal.add(vec3(ripple.x, 0, ripple.z)));
  // The reflection: the cabin's bright stern windows (traced analytically: the reflected ray meets
  // the stern wall's plane), framed by their mullions; elsewhere the dim warm room. Fresnel-weighted.
  const V = normalize(positionWorld.sub(cameraPosition));
  const N = normalize(mix(vec3(0, 1, 0), waveN, flatNow));
  const R = reflect(V, N);
  const reach = float(STERN_WINDOWS.z).sub(positionWorld.z).div(min(R.z, -0.001));
  const hit = positionWorld.add(R.mul(reach));
  const pitch = STERN_WINDOWS.xs[2] - STERN_WINDOWS.xs[1];
  const cx = abs(fract(hit.x.add(pitch / 2).div(pitch)).sub(0.5)).mul(pitch);
  const inPane = float(1)
    .sub(smoothstep(STERN_WINDOWS.w / 2 - 0.02, STERN_WINDOWS.w / 2, cx))
    .mul(float(1).sub(smoothstep(1.3, 1.34, abs(hit.x))))
    .mul(smoothstep(STERN_WINDOWS.y0, STERN_WINDOWS.y0 + 0.02, hit.y))
    .mul(float(1).sub(smoothstep(STERN_WINDOWS.y1 - 0.02, STERN_WINDOWS.y1, hit.y)))
    .mul(smoothstep(0.012, 0.02, cx))
    .mul(smoothstep(0.012, 0.02, abs(hit.y.sub((STERN_WINDOWS.y0 + STERN_WINDOWS.y1) / 2))))
    .mul(smoothstep(-0.02, -0.08, R.z));
  const skyGlow = mix(
    color(0xffb867),
    color(0xfff1d6),
    smoothstep(STERN_WINDOWS.y0, STERN_WINDOWS.y1, hit.y),
  );
  const room = color(0x2a1a10).mul(0.35);
  const cosV = max(dot(V.negate(), N), 0);
  const fresnel = float(0.06).add(pow(float(1).sub(cosV), 4).mul(0.94));
  const reflection = mix(room, skyGlow.mul(2.2), inPane).mul(fresnel);
  mat.emissiveNode = select(
    frontFacing,
    seaColor
      .mul(0.82)
      .add(color(0xffc27a).mul(sheen.mul(0.2)))
      .add(reflection)
      .mul(wet),
    vec3(0),
  );
  const seaN = mix(vec3(0, 1, 0), waveN, wet.mul(flatNow));
  const n = normalize(curlNormal.add(seaN.sub(vec3(0, 1, 0))));
  mat.normalNode = transformNormalToView(n).normalize().mul(faceDirection);

  const mesh = new Mesh(geo, mat);
  mesh.name = 'captains chart';
  mesh.frustumCulled = false;
  return {
    mesh,
    unroll,
    settle,
    water,
    time,
    dispose() {
      geo.dispose();
      mat.dispose();
      inkTex.dispose();
      maskTex.dispose();
    },
  };
}
