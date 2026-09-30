// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegMaterials.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegNodes.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/materials/LODFade.js@d32799f
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
  attribute,
  cameraPosition,
  cameraViewMatrix,
  clamp,
  color,
  float,
  fract,
  greaterThan,
  materialColor,
  mix,
  normalWorld,
  positionGeometry,
  positionLocal,
  screenCoordinate,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { world } from '../uniforms';
import { gustNode } from '../wind-nodes';
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

export function createVegetationMaterial(
  source: {
    /** Authored albedo; when set it's used as-is (fronds get a subtle per-instance tint). */
    map?: Texture | null;
    color?: Color;
    alphaTest?: number;
    name?: string;
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
  const isRock = greaterThan(part, float(3.5));
  const leafDeep = color(0x2b5622);
  const leafSun = color(0x72862e);
  const bark = sourceColor.mul(mix(color(0xa08f74), color(0xd2ac79), shade.mul(0.36)));
  const fruit = sourceColor.mul(mix(color(0x4a351d), color(0x8b6a37), shade.mul(0.5).add(0.28)));
  const dead = sourceColor.mul(mix(color(0x8a6334), color(0xd3ad67), shade));
  const rock = sourceColor.mul(mix(color(0x8a8d86), color(0xc5bea7), shade.mul(0.4)));
  const leafAo = smoothstep(float(0.18), float(1.0), shade);
  const leafColor = mix(leafDeep, leafSun, leafAo) as AnyNode;
  const leaf = (mix(sourceColor, leafColor, float(0.68)) as AnyNode).mul(tint.mul(0.14).add(0.72));

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
    const texel = (texture(source.map, uv()) as AnyNode).rgb;
    // The authored frond swatch is a lime green that reads neon in full tropical sun; grade it
    // toward a deeper palm green and let the per-instance tint add grove variety.
    const frond = texel.mul(vec3(0.5, 0.47, 0.72)).mul(tint.mul(0.3).add(0.85));
    albedo = select(isLeaf, frond, texel);
  } else {
    albedo = select(isRock, rock, select(isDead, dead, select(isFruit, fruit, select(isLeaf, leaf, bark))));
  }
  material.colorNode = albedo;
  material.emissiveNode = albedo.mul(translucency).mul(leafWeight) as AnyNode;
  material.roughnessNode = select(isRock, float(0.86), select(isLeaf, float(0.6), float(0.9))) as AnyNode;
  material.maskNode = lodMask();

  const windDamp = float(1).sub(world.reducedMotion.mul(0.82));
  const heightGate = smoothstep(float(0.4), float(7.5), (positionGeometry as AnyNode).y);
  const gust = gustNode(
    (vec2 as AnyNode)((positionLocal as AnyNode).x, (positionLocal as AnyNode).z),
  ) as AnyNode;
  const phase = (positionLocal as AnyNode).x
    .mul(0.41)
    .add((positionLocal as AnyNode).z.mul(0.27))
    .add(world.time.mul(2.7));
  const flutter = sin(phase).mul(select(isLeaf, float(0.13), float(0.028)));
  const bend = world.windSpeed.mul(0.018).mul(gust).mul(heightGate).mul(windDamp);
  const sway = (vec3 as AnyNode)(
    world.windDir.x.mul(bend.add(flutter)),
    flutter.mul(0.3),
    world.windDir.y.mul(bend),
  );
  material.positionNode = (positionLocal as AnyNode).add(sway);
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

  material.positionNode = (vec3 as AnyNode)(
    worldXZ.x.add(sway.x),
    terrainY.add(blade.mul(sizeFade)),
    worldXZ.y.add(sway.z),
  ) as AnyNode;
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
