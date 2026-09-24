import {
  DoubleSide,
  MeshStandardNodeMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Node,
  type Texture,
} from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  color,
  cos,
  dot,
  float,
  fract,
  mix,
  normalWorld,
  positionWorld,
  pow,
  saturate,
  sin,
  smoothstep,
  uniform,
  texture as textureNode,
  vec2,
  vec3,
} from 'three/tsl';
import { packs } from '../../engine/packs';
import { world } from '../uniforms';
import type { Tier } from '../contracts';

export const uSunBlend = uniform(1);

// TSL's fluent typings don't cover every mixed scalar/vector graph used by this material.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const textureCache = new Map<string, Texture>();

function terrainTexture(file: string): Texture {
  const cached = textureCache.get(file);
  if (cached) return cached;
  const texture = new TextureLoader().load(packs.url(`/packs/testcove/terrain-textures/${file}`));
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.name = `terrain-${file}`;
  textureCache.set(file, texture);
  return texture;
}

function triplanarColor(texture: Texture, scale: number): AnyNode {
  const n = normalWorld.abs() as AnyNode;
  const wx = textureNode(texture, vec2(positionWorld.z, positionWorld.y).mul(scale)) as AnyNode;
  const wy = textureNode(texture, vec2(positionWorld.x, positionWorld.z).mul(scale)) as AnyNode;
  const wz = textureNode(texture, vec2(positionWorld.x, positionWorld.y).mul(scale)) as AnyNode;
  const sum = n.x.add(n.y).add(n.z).max(0.001);
  return wx.rgb.mul(n.x).add(wy.rgb.mul(n.y)).add(wz.rgb.mul(n.z)).div(sum);
}

export interface TerrainMaterialOptions {
  cloudShadowNode?: Node<'float'> | null;
  tier?: Tier;
}

/**
 * Shared node material for Test Cove terrain. It uses only vertex attributes and TSL nodes so it
 * compiles on both WebGPU and the automatic WebGL2 backend.
 */
export function createTerrainMaterial(options: TerrainMaterialOptions = {}): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
  });
  const masks = attribute('terrainMask', 'vec4');
  const light = attribute('terrainLight', 'vec4');
  const y = positionWorld.y;
  const detail = options.tier === 'lite' ? 0 : options.tier === 'low' ? 1 : 2;
  const rockTexture = terrainTexture('rocks.webp');
  const pathTexture = terrainTexture('path-rocks.webp');
  const grassTexture = terrainTexture('grass.webp');
  const flatUv = vec2(positionWorld.x, positionWorld.z);
  const rockTexel = triplanarColor(rockTexture, 0.045);
  const pathTexel = textureNode(pathTexture, flatUv.mul(0.036)) as AnyNode;
  const grassTexel = textureNode(grassTexture, flatUv.mul(0.09)) as AnyNode;

  const broadNoise = sin(positionWorld.x.mul(0.038).add(sin(positionWorld.z.mul(0.031)).mul(1.9)))
    .mul(0.5)
    .add(0.5);
  const fineNoise = sin(positionWorld.x.mul(0.19).add(positionWorld.z.mul(0.27)))
    .mul(cos(positionWorld.x.mul(0.13).sub(positionWorld.z.mul(0.21))))
    .mul(0.5)
    .add(0.5);
  const rippleNoise = sin(positionWorld.x.mul(0.72).add(sin(positionWorld.z.mul(0.28)).mul(1.4)))
    .mul(0.5)
    .add(0.5);

  const sandDetail = pathTexel.rgb.dot(vec3(0.3, 0.48, 0.22));
  const grassDetail = grassTexel.rgb.dot(vec3(0.25, 0.58, 0.17));
  const rockDetail = rockTexel.dot(vec3(0.32, 0.43, 0.25));
  const drySand = mix(color(0xd8b66f), color(0xf0d394), broadNoise.mul(0.45).add(sandDetail.mul(0.22)));
  const wetSand = mix(color(0x755b39), color(0xa98555), fineNoise.mul(0.34).add(sandDetail.mul(0.24)));
  const submergedSand = mix(
    color(0x8ec2b2),
    color(0xd7c08a),
    rippleNoise.mul(0.42).add(sandDetail.mul(0.18)),
  );
  const grass = mix(color(0x315f31), color(0x77a850), broadNoise.mul(0.48).add(grassDetail.mul(0.3)));
  const dirt = mix(color(0x614529), color(0xa47a48), fineNoise.mul(0.55).add(sandDetail.mul(0.2)));
  const rock = mix(color(0x5f5d55), color(0x9a927c), broadNoise.mul(0.28).add(rockDetail.mul(0.38)));
  const limestone = mix(color(0x554d43), color(0x907956), broadNoise.mul(0.28).add(rockDetail.mul(0.32)));
  const seabed = mix(color(0x608c82), color(0xb8a676), rippleNoise.mul(0.28).add(sandDetail.mul(0.22)));
  const reefRock = mix(color(0x4f5f56), color(0x8b8468), fineNoise.mul(0.35).add(rockDetail.mul(0.32)));

  const sandMask = masks.x;
  const grassMask = masks.y;
  const rockMask = masks.z;
  const cliffMask = masks.w;
  const waterline = float(1).sub(smoothstep(0.02, 0.72, abs(y)));
  const wetSandBand = smoothstep(-0.12, 0.08, y)
    .mul(float(1).sub(smoothstep(0.58, 1.08, y)))
    .mul(sandMask);
  const underwater = smoothstep(0.04, 12.0, y.negate());
  const shallowUnderwater = smoothstep(0.02, 2.7, y.negate()).mul(
    float(1).sub(smoothstep(9.0, 20.0, y.negate())),
  );
  const dirtPatch = pow(saturate(fineNoise.sub(0.6).mul(2.1)), 2.6)
    .mul(grassMask)
    .mul(0.3);
  const seagrassPatch = pow(saturate(broadNoise.sub(0.5).mul(1.9)), 2.0)
    .mul(underwater)
    .mul(float(1).sub(smoothstep(18, 38, y.negate())));

  const strataPhase = fract(y.div(7.8).add(sin(positionWorld.x.mul(0.025)).mul(0.035)));
  const strataWidth = strataPhase.fwidth().mul(1.5).add(0.009);
  const strata = float(1).sub(
    smoothstep(float(0.05).sub(strataWidth), float(0.05).add(strataWidth), strataPhase),
  );
  const ledges = float(1).sub(
    smoothstep(float(0.18).sub(strataWidth), float(0.18).add(strataWidth), strataPhase),
  );
  const streakSeed = sin(positionWorld.z.mul(0.5).add(sin(positionWorld.x.mul(0.095)).mul(2.7)))
    .mul(0.5)
    .add(0.5);
  const streaks = pow(saturate(streakSeed.sub(0.56).mul(2.4)), 3)
    .mul(cliffMask)
    .mul(smoothstep(5, 31, y));
  const jointPhase = sin(positionWorld.z.mul(0.11).add(sin(positionWorld.x.mul(0.04)).mul(2.5)));
  const joints = pow(saturate(abs(jointPhase).mul(-1).add(0.18).mul(5.8)), 2.0).mul(cliffMask);
  const cavity = float(1).sub(light.x).mul(cliffMask);
  const notch = smoothstep(1.25, 1.45, y)
    .mul(float(1).sub(smoothstep(2.05, 2.35, y)))
    .mul(cliffMask);
  const cave = float(1)
    .sub(smoothstep(0.0, 1.0, vec2(positionWorld.x.sub(198).div(11), positionWorld.z.add(5).div(7)).length()))
    .mul(smoothstep(-1.2, 5.0, y))
    .mul(float(1).sub(smoothstep(8, 15, y)));

  const algaeBase = smoothstep(-0.25, 0.3, y)
    .mul(float(1).sub(smoothstep(2.9, 4.4, y)))
    .mul(cliffMask.add(rockMask).mul(0.65));
  let base = mix(drySand, wetSand, wetSandBand.add(waterline.mul(sandMask).mul(0.35)));
  base = mix(base, submergedSand, shallowUnderwater.mul(sandMask).mul(0.78));
  base = mix(base, grass, grassMask);
  base = mix(base, dirt, dirtPatch);
  base = mix(base, rock, rockMask);
  const cliffColor = limestone
    .mul(float(0.7).add(strata.mul(0.16)).add(ledges.mul(0.07)))
    .mul(float(1).sub(streaks.mul(0.46)))
    .mul(float(1).sub(joints.mul(0.42)))
    .mul(float(1).sub(cavity.mul(0.34)))
    .mul(float(1).sub(notch.mul(0.48)))
    .mul(float(1).sub(algaeBase.mul(0.52)))
    .mul(float(1).sub(waterline.mul(0.2)))
    .mul(float(1).sub(cave.mul(0.72)));
  base = mix(base, cliffColor, cliffMask);
  base = mix(base, reefRock, underwater.mul(rockMask.add(cliffMask).mul(0.7)));
  base = mix(base, seabed, underwater.mul(0.72));
  base = mix(base, color(0x315545), seagrassPatch.mul(0.36));

  const sunVis = mix(light.y, light.z, uSunBlend);
  const cloud = options.cloudShadowNode ?? float(1);
  const bakedLight = saturate(light.x.mul(0.64).add(sunVis.mul(cloud).mul(0.36))).mul(
    float(1).sub(world.night.mul(0.42)),
  );
  const causticLayerA = sin(
    positionWorld.x.mul(0.18).add(positionWorld.z.mul(0.26)).add(world.time.mul(1.35)),
  )
    .mul(sin(positionWorld.x.mul(-0.23).add(positionWorld.z.mul(0.16)).sub(world.time.mul(1.1))))
    .mul(0.5)
    .add(0.5);
  const causticLayerB =
    detail >= 2
      ? sin(positionWorld.x.mul(0.33).sub(positionWorld.z.mul(0.29)).add(world.time.mul(0.75)))
          .mul(0.5)
          .add(0.5)
      : float(0);
  const caustics =
    detail === 0
      ? float(0)
      : pow(saturate(causticLayerA.add(causticLayerB.mul(0.45)).sub(0.72).mul(3.1)), 2.2)
          .mul(underwater)
          .mul(float(1).sub(smoothstep(0.5, 22.0, y.negate())))
          .mul(saturate(world.sunDir.y.mul(1.8)))
          .mul(float(1).sub(world.night));
  material.colorNode = base
    .mul(float(0.62).add(bakedLight.mul(0.58)))
    .add(vec3(0.65, 0.95, 1.0).mul(caustics.mul(0.08)));
  material.roughnessNode = saturate(
    float(0.84)
      .sub(wetSandBand.mul(0.34))
      .sub(waterline.mul(0.16))
      .sub(underwater.mul(0.08))
      .add(cliffMask.mul(0.12)),
  );
  material.aoNode = light.x;

  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const fresnelRim = pow(float(1).sub(saturate(dot(normalWorld, viewDir))), 2.2);
  const backlit = smoothstep(0.05, 0.62, dot(normalWorld, world.sunDir).negate());
  const rim = light.w
    .mul(backlit)
    .mul(fresnelRim)
    .mul(float(1).sub(world.night))
    .mul(float(1).sub(cliffMask.mul(0.75)));
  material.emissiveNode = vec3(world.sunColor.r, world.sunColor.g, world.sunColor.b)
    .mul(rim.mul(0.55))
    .add(vec3(0.65, 0.95, 1.0).mul(caustics.mul(0.18)));
  return material;
}

export function createRockMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
  });
  const y = positionWorld.y;
  const rockTexel = triplanarColor(terrainTexture('rocks.webp'), 0.055);
  const n = normalWorld.abs();
  const horizontal = sin(positionWorld.x.mul(0.09).add(positionWorld.z.mul(0.13)))
    .mul(0.5)
    .add(0.5);
  const verticalX = sin(positionWorld.y.mul(0.23).add(positionWorld.z.mul(0.16)))
    .mul(0.5)
    .add(0.5);
  const verticalZ = sin(positionWorld.y.mul(0.2).sub(positionWorld.x.mul(0.14)))
    .mul(0.5)
    .add(0.5);
  const triNoise = horizontal
    .mul(n.y)
    .add(verticalX.mul(n.x))
    .add(verticalZ.mul(n.z))
    .div(n.x.add(n.y).add(n.z).max(0.001));
  const strataPhase = fract(y.div(7.8).add(sin(positionWorld.x.mul(0.03)).mul(0.04)));
  const strata = float(1).sub(
    smoothstep(
      float(0.045).sub(strataPhase.fwidth().mul(1.5)),
      float(0.045).add(strataPhase.fwidth().mul(1.5)),
      strataPhase,
    ),
  );
  const joints = pow(
    saturate(
      abs(sin(positionWorld.x.mul(0.11).add(positionWorld.z.mul(0.07))))
        .mul(-1)
        .add(0.16)
        .mul(6.0),
    ),
    2.0,
  );
  const algae = smoothstep(-0.15, 0.05, y).mul(float(1).sub(smoothstep(1.35, 1.8, y)));
  const texLum = rockTexel.dot(vec3(0.32, 0.43, 0.25));
  let base = mix(color(0x4c463b), color(0x8b7653), triNoise.mul(0.32).add(texLum.mul(0.42)));
  base = base.mul(float(0.76).add(strata.mul(0.16))).mul(float(1).sub(joints.mul(0.38)));
  base = mix(base, color(0x263c32), algae.mul(0.42));
  material.colorNode = base;
  material.roughnessNode = float(0.93);
  material.aoNode = float(0.86);
  return material;
}
