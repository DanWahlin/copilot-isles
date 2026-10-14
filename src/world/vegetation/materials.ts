// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegMaterials.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegNodes.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/materials/LODFade.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegMaterials.js@fd6cae6
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegNodes.js@fd6cae6
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/LeafTextures.js@fd6cae6
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  LinearFilter,
  MeshStandardNodeMaterial,
  RedFormat,
  Texture,
  Vector3,
  Vector4,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  cameraViewMatrix,
  clamp,
  color,
  cos,
  dot,
  float,
  floor,
  fwidth,
  fract,
  greaterThan,
  materialColor,
  max,
  min,
  mix,
  normalLocal,
  normalWorld,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  screenCoordinate,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { world } from '../uniforms';
import { terrainNoiseTexture } from '../terrain/noise-texture';
import { gustNode } from '../wind-nodes';
import { trackedPosition } from '../../engine/motion-vectors';
import type { HeightGrid } from './types';

// three's TSL fluent node typings do not cover the mixed scalar/vector graph assembled here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

export function createHeightDataTexture(grid: HeightGrid): DataTexture {
  const textureData = grid.heights.slice();
  const data = new DataTexture(textureData, grid.nx, grid.nz, RedFormat, FloatType);
  data.magFilter = LinearFilter;
  data.minFilter = LinearFilter;
  data.wrapS = ClampToEdgeWrapping;
  data.wrapT = ClampToEdgeWrapping;
  data.needsUpdate = true;
  data.name = 'vegetation-height-grid';
  return data;
}

function interleavedGradientNoise(): AnyNode {
  return Fn(() => {
    const p = screenCoordinate as AnyNode;
    const seed = (positionLocal as AnyNode).x.mul(0.013).add((positionLocal as AnyNode).z.mul(0.019));
    const inner = fract(p.x.mul(0.06711056).add(p.y.mul(0.00583715)).add(seed));
    return fract(inner.mul(52.9829189));
  })();
}

function lodMask(): AnyNode {
  const fade = attribute('fade', 'float') as AnyNode;
  return greaterThan(fade, interleavedGradientNoise());
}

const hash12 = Fn(([p]: [AnyNode]) => {
  const p3 = (fract((vec3 as AnyNode)(p.x, p.y, p.x).mul(0.1031)) as AnyNode).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}) as unknown as (p: AnyNode) => AnyNode;

/**
 * Tidewater coconut-palm material: procedural ringed bark, leaflet cutouts, coconuts,
 * backlit frond glow and the same world wind field used by the rest of the cove.
 */
export function createPalmMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: 0.42,
    roughness: 0.68,
    metalness: 0,
    vertexColors: true,
  });
  material.name = 'tidewater-palm';
  const part = attribute('aMat', 'vec4') as AnyNode;
  const partId = part.x;
  const veg = attribute('aVeg', 'vec4') as AnyNode;
  const tint = attribute('tint', 'vec3') as AnyNode;
  const shade = attribute('shade', 'float') as AnyNode;
  const frond = veg.y.greaterThan(float(0.001)).or(veg.z.greaterThan(float(0.001))) as AnyNode;
  const stem = frond.not() as AnyNode;
  const coconut = partId.greaterThan(float(4.5)) as AnyNode;
  const st = uv() as AnyNode;
  const age = part.y;
  const leafletLength = max(part.z, float(0.001));
  const frondSeed = part.w;
  const trunkY = max((positionGeometry as AnyNode).y, float(0));

  const ringPhase = trunkY
    .mul(mix(float(6.2), float(8.2), hash12((vec2 as AnyNode)(frondSeed.mul(37.1), 1.7))))
    .add(pow(max(veg.x, float(0)), float(2.2)).mul(22))
    .add(sin(st.x.mul(12.566).add(trunkY.mul(1.1))).mul(0.7));
  const ring = abs(fract(ringPhase).sub(0.5)).smoothstep(float(0.46), float(0.5));
  const fissure = abs(sin(st.x.mul(144).add(trunkY.mul(1.6)).add(frondSeed.mul(50))));
  const weather = hash12((vec2 as AnyNode)(floor(trunkY.mul(0.55)), floor(st.x.mul(18)).add(frondSeed)));
  const barkBase = mix(color(0x7b705e), color(0xb8b09d), weather.mul(0.58).add(veg.x.mul(0.16))) as AnyNode;
  const bark = barkBase
    .mul(float(1).sub(ring.mul(0.34)))
    .mul(float(1).sub(smoothstep(float(0.95), float(1.0), fissure).mul(0.22)))
    .mul(mix(float(0.7), float(1), smoothstep(float(0.08), float(0.45), trunkY)));
  const warmBark = mix(bark, color(0x8a6442), float(0.35)) as AnyNode;

  const perLeaf = hash12((vec2 as AnyNode)(floor(st.x.mul(58)), frondSeed.mul(13.1)));
  const palmGreen = mix(color(0x4e7220), color(0x6c8c2a), weather) as AnyNode;
  const leafTip = mix(palmGreen, color(0x37561a), smoothstep(float(0.35), float(1), st.y).mul(0.6));
  const leafBase = mix(leafTip, color(0x93a844), smoothstep(float(0.18), float(0), st.y).mul(0.5));
  const young = mix(leafBase, color(0x9db24a), smoothstep(float(0.2), float(0), age).mul(0.35));
  const dry = smoothstep(float(0.6), float(0.95), age);
  const leaflet = (mix(young, mix(color(0x8a7148), color(0x6b5434), perLeaf), dry) as AnyNode)
    .mul(perLeaf.mul(0.25).add(0.88))
    .mul(tint.mul(0.18).add(0.88));
  const rachisColor = mix(color(0xa29652), color(0x7d6a40), dry) as AnyNode;
  const rachisColorMix = select(st.y.mul(leafletLength).lessThan(float(0.028)), rachisColor, leaflet);
  const nutColor = mix(
    mix(color(0x68762a), color(0x9c8a34), smoothstep(float(0.3), float(0.7), age)),
    color(0x5c4122),
    smoothstep(float(0.82), float(0.95), age),
  ) as AnyNode;

  material.colorNode = select(
    coconut,
    nutColor,
    select(stem, warmBark, rachisColorMix.mul(shade.mul(0.18).add(0.88))),
  ) as AnyNode;

  const x = st.x.mul(58);
  const k = floor(x);
  const r1 = hash12((vec2 as AnyNode)(k, frondSeed.mul(91.7)));
  const r2 = hash12((vec2 as AnyNode)(k.mul(1.37).add(3.1), frondSeed.mul(17.3)));
  const fx = abs(fract(x).sub(0.5).sub(r1.sub(0.5).mul(0.3)));
  const tEnd = mix(float(0.7), float(1), r2).mul(select(r1.lessThan(float(0.05)), float(0.4), float(1)));
  const tt = st.y.div(tEnd);
  const hw = pow(max(float(1).sub(tt), float(0)), float(0.55))
    .mul(0.23)
    .mul(smoothstep(float(0), float(0.12), tt).mul(0.45).add(0.55));
  const hwEdge = max(
    hw,
    min(fwidth(st.x).mul(58 * 0.6), float(0.5)).mul(select(tt.lessThan(float(1)), float(1), float(0))),
  );
  const leafMask = fx
    .lessThan(hwEdge)
    .and(tt.lessThan(float(1)))
    .and(st.x.greaterThan(float(0.06)));
  const rachisMask = st.y.mul(leafletLength).lessThan(float(0.028));
  const alphaMask = select(frond, leafMask.or(rachisMask), stem.or(coconut)) as AnyNode;
  material.maskNode = alphaMask.and(lodMask()) as AnyNode;

  const back = smoothstep(float(-0.35), float(0.82), (normalWorld as AnyNode).dot(world.sunDir).negate());
  const viewForward = smoothstep(
    float(0),
    float(1),
    world.sunDir.dot((cameraPosition as AnyNode).sub(positionWorld).normalize().negate()),
  );
  const leafGlow = (material.colorNode as AnyNode).mul(back).mul(viewForward.mul(0.7).add(0.3)).mul(0.4);
  material.emissiveNode = select(
    frond,
    leafGlow,
    select(stem, warmBark.mul(0.42), color(0x000000)),
  ) as AnyNode;
  material.roughnessNode = select(stem, float(0.92), select(coconut, float(0.62), float(0.6))) as AnyNode;
  (material as MeshStandardNodeMaterial & { specularIntensity?: number }).specularIntensity = 0.7;

  const windDamp = float(1).sub(world.reducedMotion.mul(0.82));
  const gust = gustNode(
    (vec2 as AnyNode)((positionLocal as AnyNode).x, (positionLocal as AnyNode).z),
  ) as AnyNode;
  const heightGate = smoothstep(float(0.3), float(11.5), trunkY);
  const stemBend = veg.x.mul(veg.x).mul(world.windSpeed).mul(0.018).mul(gust).mul(windDamp);
  const frondBend = veg.y.mul(veg.y).mul(world.windSpeed).mul(0.045).mul(gust).mul(windDamp);
  const flutter = sin(
    world.time
      .mul(veg.w.mul(5).add(11))
      .add(veg.w.mul(60))
      .add(veg.y.mul(9))
      .add((positionGeometry as AnyNode).x),
  )
    .mul(veg.z)
    .mul(world.windSpeed.mul(0.012).add(0.01))
    .mul(windDamp);
  const sideFlutter = (normalLocal as AnyNode).mul(flutter);
  const stream = (vec3 as AnyNode)(
    world.windDir.x.mul(select(frond, frondBend, stemBend).mul(heightGate)),
    select(frond, frondBend.mul(-0.16).add(flutter.mul(0.35)), float(0)),
    world.windDir.y.mul(select(frond, frondBend, stemBend).mul(heightGate)),
  );
  material.positionNode = trackedPosition(
    (positionLocal as AnyNode).add(stream).add(select(frond, sideFlutter, vec3(0, 0, 0))),
  );
  return material;
}

export function createVegetationMaterial(
  source: {
    /** Authored albedo; when set it's used as-is (fronds get a subtle per-instance tint). */
    map?: Texture | null;
    color?: Color;
    alphaTest?: number;
    name?: string;
    /** A great tree's bark on the stone part (Thousand-Bough's banyan): set by a uniform, one shader. */
    bark?: boolean;
  } = {},
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: source.alphaTest ?? 0.42,
    roughness: 0.82,
    metalness: 0,
    color: source.color ?? new Color(0xffffff),
    vertexColors: true,
  });
  material.name = source.name ?? 'vegetation';
  const part = attribute('vegPart', 'float') as AnyNode;
  const shade = attribute('shade', 'float') as AnyNode;
  const tint = attribute('tint', 'vec3') as AnyNode;
  const vertexColor = attribute('color', 'vec3') as AnyNode;
  const sourceColor = (materialColor as AnyNode).rgb.mul(vertexColor.mul(0.35).add(0.75));
  const isLeaf = greaterThan(part, float(0.5));
  const isFruit = greaterThan(part, float(1.5)).and(part.lessThan(float(2.5))) as AnyNode;
  const isDead = greaterThan(part, float(2.5)).and(part.lessThan(float(3.5))) as AnyNode;
  const isRock = greaterThan(part, float(3.5)).and(part.lessThan(float(4.5))) as AnyNode;
  // A leaf card (part 5): a spray of pointed leaves cut out of a round card, each leaf its own tone.
  // Two offset grids of rotated lens shapes, so the sprays don't read as a grid.
  const isCard = greaterThan(part, float(4.5)) as AnyNode;
  const cardUv = uv() as AnyNode;
  const cardLeaf = (scale: number, offset: number) => {
    const q = cardUv.mul(scale).add(offset);
    const cell = floor(q);
    const h = hash12(cell.add(offset * 7.3)) as AnyNode;
    const a = h.mul(6.2832);
    const f = (fract(q) as AnyNode)
      .sub(0.5)
      .add((vec2 as AnyNode)(h.sub(0.5), fract(h.mul(13.7)).sub(0.5)).mul(0.22));
    const ca = cos(a);
    const sa = sin(a);
    const along = f.x.mul(ca).sub(f.y.mul(sa)).div(0.5);
    const across = abs(f.x.mul(sa).add(f.y.mul(ca)));
    const inside = across
      .lessThan(float(0.22).mul(float(1).sub(along.mul(along))))
      .and(abs(along).lessThan(float(1))) as AnyNode;
    return { inside, h };
  };
  const leafA = cardLeaf(4, 0);
  const leafB = cardLeaf(4, 0.5);
  const inLeaf = leafA.inside.or(leafB.inside) as AnyNode;
  const leafHash = select(leafA.inside, leafA.h, leafB.h) as AnyNode;
  const cardLeaves = inLeaf.and(
    (fract(cardUv) as AnyNode).sub(0.5).length().lessThan(float(0.49)),
  ) as AnyNode;
  const leafDeep = color(0x2b5622);
  const leafSun = color(0x72862e);
  const bark = sourceColor.mul(mix(color(0xa08f74), color(0xd2ac79), shade.mul(0.36)));
  const fruit = sourceColor.mul(mix(color(0x4a351d), color(0x8b6a37), shade.mul(0.5).add(0.28)));
  const dead = sourceColor.mul(mix(color(0x8a6334), color(0xd3ad67), shade));
  const plainRock = sourceColor.mul(mix(color(0x8a8d86), color(0xc5bea7), shade.mul(0.4)));
  // A great tree's bark: warm grey-brown in broad patches, dark crevices running up the grain (a
  // triplanar sample of the shared noise, stretched along the height), moss on the upper sides. A
  // uniform picks it, so every vegetation material keeps the same shader.
  const barkOn = uniform(source.bark ? 1 : 0);
  const barkNoise = terrainNoiseTexture();
  const wp = positionWorld as AnyNode;
  // The geometry's own normal (the shared normalWorld var mustn't be first read inside a part's
  // select(), see below; the banyan isn't rotated, so local is world here).
  const nl = normalLocal as AnyNode;
  const an = nl.abs();
  const grainX = texture(barkNoise, vec2(wp.z.mul(0.9), wp.y.mul(0.06))) as AnyNode;
  const grainZ = texture(barkNoise, vec2(wp.x.mul(0.9), wp.y.mul(0.06))) as AnyNode;
  const grainY = texture(barkNoise, vec2(wp.x.mul(0.09), wp.z.mul(0.09))) as AnyNode;
  const aw = an.x.add(an.y).add(an.z).max(0.001);
  const grain = grainX.r.mul(an.x).add(grainZ.r.mul(an.z)).add(grainY.g.mul(an.y)).div(aw);
  const patch = grainX.b.mul(an.x).add(grainZ.b.mul(an.z)).add(grainY.a.mul(an.y)).div(aw);
  const crevice = smoothstep(float(0.42), float(0.72), grain);
  const barkTone = mix(color(0x5a4636), color(0xb0a48a), patch.mul(0.7).add(shade.mul(0.3)))
    .mul(vertexColor.mul(0.5).add(0.6))
    .mul(float(1).sub(crevice.mul(0.62)));
  const barkMoss = smoothstep(float(0.38), float(0.72), nl.y.add(patch.sub(0.5).mul(0.7)));
  const mossTone = mix(color(0x3d5a2a), color(0x6f9440), grainY.r);
  const rock = mix(plainRock, mix(barkTone, mossTone, barkMoss.mul(0.85)), barkOn);
  const leafAo = smoothstep(float(0.18), float(1.0), shade);
  const leafColor = mix(leafDeep, leafSun, leafAo) as AnyNode;
  // A great tree's leaf masses (bark on) carry the cards' leaves as a pattern, dark between them,
  // easing to its mean where the leaves shrink to a few pixels.
  const massTone = mix(
    select(inLeaf, leafHash.mul(0.3).add(0.92), float(0.6)),
    float(0.84),
    smoothstep(float(0.35), float(1), fwidth(cardUv.x).add(fwidth(cardUv.y)).mul(4)),
  );
  const isMass = isLeaf.and(part.lessThan(float(1.5)));
  const cardTone = select(
    isCard,
    leafHash.mul(0.36).add(0.8),
    select(isMass, mix(float(1), massTone, barkOn), float(1)),
  ) as AnyNode;
  const leaf = (mix(sourceColor, leafColor, float(0.68)) as AnyNode)
    .mul(tint.mul(0.14).add(0.72))
    .mul(cardTone);
  const trunkRings = abs(
    sin((positionGeometry as AnyNode).y.mul(9.4).add((positionLocal as AnyNode).x.mul(1.7))),
  ).smoothstep(float(0.78), float(0.99));
  const ringShade = float(1).sub(trunkRings.mul(0.18));

  // Sun-through-leaf glow on backlit fronds only, capped at 15% of albedo; wood and rock stay lit.
  // Normal-dependent terms must be evaluated unconditionally: TSL assigns the shared `normalWorld`
  // var at first use, so reading it inside a leaf-only select() left non-leaf fragments with a zero
  // normal (unlit, sky-grey trunks).
  const translucency = smoothstep(
    float(-0.35),
    float(0.82),
    (normalWorld as AnyNode).dot(world.sunDir).negate(),
  )
    .mul(smoothstep(float(0.02), float(0.24), world.sunDir.value.y))
    .mul(0.15);
  const leafWeight = select(isLeaf, float(1), float(0)) as AnyNode;
  let albedo: AnyNode;
  if (source.map) {
    material.userData.disposeTextures = [source.map];
    const texel = (texture(source.map, uv()) as AnyNode).rgb;
    // The authored frond swatch is a lime green that reads neon in full tropical sun; grade it
    // toward a deeper palm green and let the per-instance tint add grove variety.
    const frond = texel.mul(vec3(0.5, 0.47, 0.72)).mul(tint.mul(0.3).add(0.85));
    const trunkTexel = texel.mul(ringShade).mul(color(0xd2b48a));
    albedo = select(isLeaf, frond, trunkTexel);
  } else {
    albedo = select(
      isRock,
      rock,
      select(isDead, dead.mul(ringShade), select(isFruit, fruit, select(isLeaf, leaf, bark.mul(ringShade)))),
    );
  }
  material.colorNode = albedo;
  material.emissiveNode = albedo.mul(translucency).mul(leafWeight) as AnyNode;
  material.roughnessNode = select(isRock, float(0.86), select(isLeaf, float(0.6), float(0.9))) as AnyNode;
  material.maskNode = lodMask().and(isCard.not().or(cardLeaves));

  const windDamp = float(1).sub(world.reducedMotion.mul(0.82));
  const heightGate = smoothstep(float(0.4), float(7.5), (positionGeometry as AnyNode).y);
  const gust = gustNode(
    (vec2 as AnyNode)((positionLocal as AnyNode).x, (positionLocal as AnyNode).z),
  ) as AnyNode;
  const phase = (positionLocal as AnyNode).x
    .mul(0.41)
    .add((positionLocal as AnyNode).z.mul(0.27))
    .add(world.time.mul(2.7));
  // A great tree (bark on) holds its wood still, and its leaves sway about where they hang: `vegPart`'s
  // fraction is 0 where a clump meets its twig (or a vine its limb) and 0.4 at its far edge.
  const hang = fract(part).mul(2.5).min(float(1));
  const hangAmp = select(isLeaf.and(isRock.not()), hang.mul(0.2).mul(windDamp), float(0));
  const rustle = sin(
    world.time
      .mul(6.1)
      .add((positionLocal as AnyNode).x.mul(2.3))
      .add((positionLocal as AnyNode).z.mul(1.9)),
  )
    .mul(hangAmp)
    .mul(0.25);
  const flutter = sin(phase)
    .mul(mix(select(isLeaf, float(0.13), float(0.028)), hangAmp, barkOn))
    .add(rustle.mul(barkOn));
  const bend = world.windSpeed.mul(0.018).mul(gust).mul(heightGate).mul(windDamp);
  const sway = (vec3 as AnyNode)(
    world.windDir.x.mul(bend.add(flutter)),
    flutter.mul(0.3),
    world.windDir.y.mul(bend),
  );
  const woodyWeight = select(isLeaf, float(0), float(1)) as AnyNode;
  const curveGate = smoothstep(float(0.45), float(8.5), (positionGeometry as AnyNode).y).mul(woodyWeight);
  const trunkCurve = (vec3 as AnyNode)(
    sin((positionGeometry as AnyNode).y.mul(0.5).add((positionLocal as AnyNode).z.mul(0.12))).mul(0.09),
    0,
    sin((positionGeometry as AnyNode).y.mul(0.36).add((positionLocal as AnyNode).x.mul(0.09))).mul(0.045),
  ).mul(curveGate);
  material.positionNode = trackedPosition((positionLocal as AnyNode).add(sway).add(trunkCurve));
  return material;
}

/**
 * How far grass reaches (metres, already tier-scaled): full density out to `full`, thinning to
 * `keep` of it by `far`, and shrinking away over the last stretch before `far`.
 */
export interface GrassReach {
  full: number;
  far: number;
  keep: number;
}

export function createGrassMaterial(
  heightTexture: DataTexture,
  grid: HeightGrid,
  reach: GrassReach,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: 0,
    roughness: 0.82,
    metalness: 0,
  });
  const tint = attribute('tint', 'vec3') as AnyNode;
  // Per clump: x is its thinning rank (below zero is never thinned), y its exclusion-edge weight.
  const clumpShape = attribute('grassShape', 'vec2') as AnyNode;
  const reachU = uniform(new Vector3(reach.full, reach.far, reach.keep)) as AnyNode;
  const shade = attribute('shade', 'float') as AnyNode;
  const part = attribute('vegPart', 'float') as AnyNode;
  const params = uniform(
    new Vector4(grid.minX, grid.minZ, (grid.nx - 1) * grid.cell, (grid.nz - 1) * grid.cell),
  );
  const worldXZ = (vec2 as AnyNode)((positionLocal as AnyNode).x, (positionLocal as AnyNode).z);
  const hUv = clamp(
    worldXZ.sub(params.xy).div(params.zw),
    (vec2 as AnyNode)(0.002),
    (vec2 as AnyNode)(0.998),
  );
  const terrainY = (texture(heightTexture, hUv) as AnyNode).r;
  const blade = (positionGeometry as AnyNode).y;
  // Distance fades are worked out here from the camera, not written per frame, and only at the far
  // edge of the reach: clumps near the player are always full height, so nothing sprouts beside you.
  const toCamera = (vec3 as AnyNode)(worldXZ.x, terrainY, worldXZ.y).distance(cameraPosition);
  const outer = float(1).sub(smoothstep(reachU.y.mul(0.84), reachU.y, toCamera));
  const keep = float(1).sub(smoothstep(reachU.x, reachU.y, toCamera).mul(float(1).sub(reachU.z)));
  const thin = clamp(keep.sub(clumpShape.x).div(0.12), float(0), float(1));
  const sizeFade = clumpShape.y.mul(outer).mul(thin);
  const bladeGate = smoothstep(float(0.02), float(1.0), blade).mul(sizeFade);
  const gust = gustNode(worldXZ) as AnyNode;
  const motion = float(1).sub(world.reducedMotion.mul(0.9));
  const phase = world.time
    .mul(3.8)
    .add((positionLocal as AnyNode).x.mul(0.6))
    .add((positionLocal as AnyNode).z.mul(0.35));
  const wave = sin(phase).mul(0.06).add(gust.mul(0.045));
  const sway = (vec3 as AnyNode)(world.windDir.x.mul(wave), 0, world.windDir.y.mul(wave))
    .mul(bladeGate)
    .mul(motion);
  const sheen = smoothstep(float(0.05), float(0.75), (normalWorld as AnyNode).dot(world.sunDir).abs()).mul(
    0.12,
  );

  material.positionNode = trackedPosition(
    (vec3 as AnyNode)(worldXZ.x.add(sway.x), terrainY.add(blade.mul(sizeFade)), worldXZ.y.add(sway.z)),
  );
  const root = tint.mul(0.52);
  const tip = mix(tint.mul(float(1.08).add(sheen.mul(0.04))), color(0xb5c95a), float(0.42)) as AnyNode;
  const grassColor = (mix(root, tip, smoothstep(float(0.04), float(1.0), shade)) as AnyNode).mul(
    color(0xfff02a),
  );
  const seedColor = mix(
    color(0x756331),
    color(0xc9b77a),
    smoothstep(float(0.0), float(1.0), shade),
  ) as AnyNode;
  const isSeed = greaterThan(part, float(1.5));
  const maskMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('grassMask');
  material.colorNode = maskMode ? color(0xff00ff) : (select(isSeed, seedColor, grassColor) as AnyNode);
  material.emissiveNode = maskMode ? color(0xff00ff) : (color(0x6f6d24).mul(sheen.mul(0.006)) as AnyNode);
  return material;
}

/**
 * A leaf card whose authored colour is wrong for the island (the common bush's leaves are painted red):
 * the map keeps its leaf shapes (alpha) and shading (red channel), recoloured into a sunny bush green.
 * No per-instance attributes, so the impostor bake can draw it as is.
 */
export function createRecoloredLeafMaterial(map: Texture, name: string): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    name,
    side: DoubleSide,
    roughness: 0.82,
    metalness: 0,
    alphaTest: 0.5,
    vertexColors: true,
  });
  const texel = texture(map, uv()) as AnyNode;
  const shade = smoothstep(0.3, 1.0, texel.r);
  material.colorNode = vec4(mix(color(0x2f6420), color(0x8bbb48), shade) as AnyNode, texel.a) as AnyNode;
  material.userData.disposeTextures = [map];
  return material;
}

export function createImpostorMaterial(atlas: Texture): MeshStandardNodeMaterial {
  atlas.wrapS = ClampToEdgeWrapping;
  atlas.wrapT = ClampToEdgeWrapping;
  atlas.magFilter = LinearFilter;
  atlas.minFilter = LinearFilter;
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0 });
  material.name = 'vegetation-impostor';
  const tint = attribute('tint', 'vec3') as AnyNode;
  const fade = attribute('fade', 'float') as AnyNode;
  const tile = attribute('atlasUv', 'vec4') as AnyNode;
  // Render-target tiles come back vertically flipped relative to the card's UVs.
  const cardUv = (vec2 as AnyNode)((uv() as AnyNode).x, float(1).sub((uv() as AnyNode).y));
  const sample = texture(atlas, tile.xy.add(cardUv.mul(tile.zw))) as AnyNode;
  // The atlas holds albedo; light the card like a canopy (mostly up, a little toward the viewer)
  // so distant trees follow the scene's sun and time of day.
  const upView = (vec3(0, 1, 0) as AnyNode).transformDirection(cameraViewMatrix);
  material.normalNode = upView
    .mul(0.8)
    .add(vec3(0, 0, 0.45))
    .normalize() as AnyNode;
  material.colorNode = sample.rgb.mul(tint.mul(0.16).add(0.84)) as AnyNode;
  material.maskNode = greaterThan(sample.a.mul(fade), interleavedGradientNoise().mul(0.8).add(0.1));
  return material;
}
