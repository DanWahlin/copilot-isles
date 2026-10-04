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
  clamp,
  color,
  cos,
  dot,
  faceDirection,
  float,
  frontFacing,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  positionGeometry,
  pow,
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
import { CHART_D, CHART_W } from './chart-map';
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

/** The rolled chart's outer radius when `unroll` of it is flat (the contact line stays at y = 0). */
export function rollRadius(unroll: number): number {
  return Math.sqrt(CORE * CORE + ((1 - unroll) * W * THICK) / Math.PI);
}

export function createChartPaper(art: ChartArt): ChartPaper {
  const geo = new PlaneGeometry(W, D, 260, 6);
  geo.rotateX(-Math.PI / 2);
  const inkTex = new CanvasTexture(art.ink);
  inkTex.colorSpace = SRGBColorSpace;
  inkTex.anisotropy = 8;
  const maskTex = new CanvasTexture(art.mask);
  maskTex.minFilter = LinearFilter;
  maskTex.generateMipmaps = false;

  const unroll = uniform(0);
  const settle = uniform(0);
  const water = uniform(0);
  const time = uniform(0);

  // ---- the roll (vertex) ----
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
  const lift = settle
    .mul(0.022)
    .mul(edge)
    .mul(smoothstep(0.98, 1, unroll));
  const rolledX = min(px, flat.sub(W / 2)).add(r.mul(sin(theta)));
  const rolledY = rOut.sub(r.mul(cos(theta))).add(lift);
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

  const reach = water.mul(1.12);
  const dist = length(p).div(Math.hypot(W, D) / 2);
  const wet = float(1)
    .sub(smoothstep(reach.sub(0.07), reach, dist))
    .mul(float(1).sub(land))
    .toVar();
  const front = smoothstep(reach.sub(0.08), reach.sub(0.03), dist)
    .mul(float(1).sub(smoothstep(reach.sub(0.03), reach, dist)))
    .mul(float(1).sub(land))
    .mul(smoothstep(0.0, 0.05, water).mul(float(1).sub(smoothstep(0.95, 1, water))));

  // Small travelling waves (chart metres), with their slope for the lighting.
  const t = time;
  const k1 = vec2(61, 23);
  const k2 = vec2(-37, 71);
  const k3 = vec2(97, -54);
  const a1 = cos(dot(p, k1).sub(t.mul(1.9))).mul(0.6);
  const a2 = cos(dot(p, k2).sub(t.mul(1.5))).mul(0.45);
  const a3 = cos(dot(p, k3).sub(t.mul(2.6))).mul(0.25);
  const slope = k1.mul(a1).add(k2.mul(a2)).add(k3.mul(a3)).mul(0.002);
  const crest = sin(dot(p, k1).sub(t.mul(1.9)))
    .add(sin(dot(p, k2).sub(t.mul(1.5))))
    .mul(0.25)
    .add(0.5);

  const deep = mix(color(0x0f4c66), color(0x1b6f88), crest.mul(0.5));
  const shoal = mix(color(0x2fa6a2), color(0x63cdbf), crest.mul(0.4));
  const sea = mix(deep, shoal, smoothstep(0.08, 0.85, shallow)).toVar();
  const inkAmount = ink.a.mul(float(1).sub(wet.mul(0.82)));
  const printed = mix(paper, ink.rgb, inkAmount);
  const surface = mix(printed, sea, wet).add(vec3(0.95, 0.92, 0.82).mul(front.mul(0.55)));
  const fogFlow = mx_noise_float(vec3(st.mul(vec2(9, 6)).add(vec2(t.mul(0.04), 0)), t.mul(0.05)))
    .mul(0.5)
    .add(0.5);
  const fogged = mix(surface, color(0xe8e2d2), fog.mul(0.6).mul(mix(0.55, 1, fogFlow)));
  const back = paper.mul(0.82);

  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0 });
  mat.positionNode = vec3(rolledX, rolledY, positionGeometry.z);
  mat.colorNode = select(frontFacing, fogged, back);
  mat.roughnessNode = select(frontFacing, mix(float(0.88), float(0.2), wet), float(0.92));
  const waveN = vec3(slope.x.negate(), 1, slope.y.negate())
    .mul(wet)
    .add(vec3(0, 1, 0).mul(float(1).sub(wet)));
  const n = normalize(curlNormal.add(waveN.sub(vec3(0, 1, 0)).mul(clamp(unroll.sub(0.98).mul(50), 0, 1))));
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
