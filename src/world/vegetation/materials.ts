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
  equal,
  float,
  floor,
  greaterThan,
  mix,
  mod,
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

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

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

function bayer4Node(): AnyNode {
  return Fn(() => {
    const px = mod(floor((screenCoordinate as AnyNode).x), float(4));
    const py = mod(floor((screenCoordinate as AnyNode).y), float(4));
    const idx = px.add(py.mul(4));
    let threshold: AnyNode = float((BAYER_4[0] + 0.5) / 16);
    for (let i = 1; i < BAYER_4.length; i += 1) {
      threshold = select(equal(idx, float(i)), float((BAYER_4[i] + 0.5) / 16), threshold);
    }
    return threshold;
  })();
}

function lodMask(): AnyNode {
  const fade = attribute('fade', 'float') as AnyNode;
  return greaterThan(fade, bayer4Node());
}

export function createVegetationMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: 0.5,
    roughness: 0.82,
    metalness: 0,
  });
  const part = attribute('vegPart', 'float') as AnyNode;
  const shade = attribute('shade', 'float') as AnyNode;
  const tint = attribute('tint', 'vec3') as AnyNode;
  const isLeaf = greaterThan(part, float(0.5));
  const isFruit = greaterThan(part, float(1.5));
  const leafDeep = color(0x1f4727);
  const leafSun = color(0x6b8e3e);
  const bark = mix(color(0x5b4633), color(0x8a6b45), shade.mul(0.55));
  const fruit = color(0xc89f36);
  const leaf = mix(leafDeep, leafSun, shade).mul(tint);

  const translucency = smoothstep(
    float(-0.35),
    float(0.82),
    (normalWorld as AnyNode).dot(world.sunDir).negate(),
  )
    .mul(smoothstep(float(0.02), float(0.24), world.sunDir.value.y))
    .mul(0.28);

  material.colorNode = select(isFruit, fruit, select(isLeaf, leaf, bark)) as AnyNode;
  material.emissiveNode = select(isLeaf, leaf.mul(translucency), color(0x000000)) as AnyNode;
  material.roughnessNode = select(isLeaf, float(0.72), float(0.9)) as AnyNode;
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
  const flutter = sin(phase).mul(select(isLeaf, float(0.08), float(0.025)));
  const bend = world.windSpeed.mul(0.015).mul(gust).mul(heightGate).mul(windDamp);
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
  material.colorNode = tint.mul(float(0.82).add(sheen)) as AnyNode;
  material.emissiveNode = tint.mul(sheen.mul(0.12)) as AnyNode;
  material.maskNode = greaterThan(fade, bayer4Node());
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
  const sample = texture(atlas, uv()) as AnyNode;
  const tint = attribute('tint', 'vec3') as AnyNode;
  const fade = attribute('fade', 'float') as AnyNode;
  const rim = smoothstep(float(0.15), float(0.8), (uv() as AnyNode).y).mul(0.18);
  material.colorNode = sample.rgb.mul(tint).mul(float(0.85).add(rim)) as AnyNode;
  material.maskNode = greaterThan(fade.mul(sample.a), bayer4Node());
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
