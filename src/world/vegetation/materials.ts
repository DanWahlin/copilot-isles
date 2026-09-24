// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegMaterials.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/VegNodes.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/materials/LODFade.js@d32799f
import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  LinearFilter,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type Texture as ThreeTexture,
  NearestFilter,
  RedFormat,
  RepeatWrapping,
  Texture,
  Vector4,
} from 'three/webgpu';
import {
  Fn,
  attribute,
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
  source: { map?: ThreeTexture | null; color?: Color; alphaTest?: number; name?: string } = {},
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: source.alphaTest ?? 0.42,
    roughness: 0.82,
    metalness: 0,
    color: source.color ?? new Color(0xffffff),
    map: source.map ?? null,
    vertexColors: true,
  });
  material.name = source.name ?? 'vegetation';
  const part = attribute('vegPart', 'float') as AnyNode;
  const shade = attribute('shade', 'float') as AnyNode;
  const tint = attribute('tint', 'vec3') as AnyNode;
  const vertexColor = attribute('color', 'vec3') as AnyNode;
  const sourceTexel = source.map ? (texture(source.map, uv()) as AnyNode) : null;
  const sourceColor = (sourceTexel ? sourceTexel.rgb : (materialColor as AnyNode).rgb).mul(
    vertexColor.mul(0.35).add(0.75),
  );
  const isLeaf = greaterThan(part, float(0.5));
  const isFruit = greaterThan(part, float(1.5)).and(part.lessThan(float(2.5))) as AnyNode;
  const isDead = greaterThan(part, float(2.5)).and(part.lessThan(float(3.5))) as AnyNode;
  const isRock = greaterThan(part, float(3.5));
  const leafDeep = color(0x183b21);
  const leafSun = color(0x7da34a);
  const bark = sourceColor.mul(mix(color(0x8f6e50), color(0xd0aa79), shade.mul(0.35)));
  const fruit = sourceColor.mul(mix(color(0x79562c), color(0xffcc5e), shade.mul(0.45).add(0.55)));
  const dead = sourceColor.mul(mix(color(0x8a6334), color(0xd3ad67), shade));
  const rock = sourceColor.mul(mix(color(0x8a8d86), color(0xc5bea7), shade.mul(0.4)));
  const leafAo = smoothstep(float(0.18), float(1.0), shade);
  const leaf = sourceColor.mul(mix(leafDeep, leafSun, leafAo)).mul(tint.mul(0.32).add(0.82));

  const translucency = smoothstep(
    float(-0.35),
    float(0.82),
    (normalWorld as AnyNode).dot(world.sunDir).negate(),
  )
    .mul(smoothstep(float(0.02), float(0.24), world.sunDir.value.y))
    .mul(0.28);

  const frondSheen = smoothstep(
    float(0.15),
    float(0.95),
    (normalWorld as AnyNode).dot(world.sunDir).abs(),
  ).mul(0.18);
  if (sourceTexel) {
    material.colorNode = sourceColor.mul(tint.mul(0.22).add(0.9)) as AnyNode;
    material.opacityNode = sourceTexel.a as AnyNode;
    material.emissiveNode = sourceColor.mul(translucency.add(frondSheen.mul(0.08)).mul(0.12)) as AnyNode;
    material.roughnessNode = select(isRock, float(0.86), select(isLeaf, float(0.58), float(0.82))) as AnyNode;
    material.maskNode = lodMask();
  } else {
    material.colorNode = select(
      isRock,
      rock,
      select(isDead, dead, select(isFruit, fruit, select(isLeaf, leaf, bark))),
    ) as AnyNode;
    material.emissiveNode = select(
      isLeaf,
      leaf.mul(translucency.add(frondSheen.mul(0.08))),
      color(0x000000),
    ) as AnyNode;
    material.roughnessNode = select(
      isRock,
      float(0.86),
      select(isLeaf, float(0.62).sub(frondSheen.mul(0.18)), float(0.9)),
    ) as AnyNode;
    material.maskNode = lodMask();
  }

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

export function createGrassMaterial(heightTexture: DataTexture, grid: HeightGrid): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: 0.5,
    roughness: 0.76,
    metalness: 0,
  });
  const tint = attribute('tint', 'vec3') as AnyNode;
  const fade = attribute('fade', 'float') as AnyNode;
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
  const bladeGate = smoothstep(float(0.02), float(1.0), blade);
  const gust = gustNode(worldXZ) as AnyNode;
  const motion = float(1).sub(world.reducedMotion.mul(0.9));
  const phase = world.time
    .mul(3.8)
    .add((positionLocal as AnyNode).x.mul(0.6))
    .add((positionLocal as AnyNode).z.mul(0.35));
  const wave = sin(phase).mul(0.09).add(gust.mul(0.065));
  const sway = (vec3 as AnyNode)(world.windDir.x.mul(wave), 0, world.windDir.y.mul(wave))
    .mul(bladeGate)
    .mul(motion);
  const sheen = smoothstep(float(0.05), float(0.75), (normalWorld as AnyNode).dot(world.sunDir).abs()).mul(
    0.22,
  );

  material.positionNode = (vec3 as AnyNode)(
    worldXZ.x.add(sway.x),
    terrainY.add(blade),
    worldXZ.y.add(sway.z),
  ) as AnyNode;
  const root = tint.mul(0.34);
  const tip = tint
    .mul(float(0.84).add(sheen.mul(0.28)))
    .add(color(0x9d8e55).mul(smoothstep(float(0.62), float(1.45), blade).mul(0.055)));
  material.colorNode = mix(root, tip, smoothstep(float(0.02), float(1.25), blade)) as AnyNode;
  material.emissiveNode = tint.mul(sheen.mul(0.018)) as AnyNode;
  material.maskNode = greaterThan(fade, interleavedGradientNoise());
  return material;
}

export function createImpostorMaterial(atlas: Texture): MeshBasicNodeMaterial {
  atlas.wrapS = RepeatWrapping;
  atlas.wrapT = RepeatWrapping;
  atlas.magFilter = LinearFilter;
  atlas.minFilter = LinearFilter;
  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
    alphaTest: 0.35,
    depthWrite: true,
    transparent: false,
  });
  const tile = attribute('atlasUv', 'vec4') as AnyNode;
  const sample = texture(atlas, (uv() as AnyNode).mul(tile.zw).add(tile.xy)) as AnyNode;
  const tint = attribute('tint', 'vec3') as AnyNode;
  const fade = attribute('fade', 'float') as AnyNode;
  const rim = smoothstep(float(0.15), float(0.8), (uv() as AnyNode).y).mul(0.18);
  material.colorNode = sample.rgb.mul(tint).mul(float(0.85).add(rim)) as AnyNode;
  material.maskNode = (sample.a.greaterThan(float(0.42)) as AnyNode).and(
    greaterThan(fade, interleavedGradientNoise()),
  );
  return material;
}

export function createWindSheenMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  material.color = new Color(0xa7d9b8);
  return material;
}

export { NearestFilter };
