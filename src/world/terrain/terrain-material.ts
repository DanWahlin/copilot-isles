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
  const closeUvA = vec2(
    positionWorld.x.mul(0.86).add(positionWorld.z.mul(0.31)),
    positionWorld.z.mul(0.86).sub(positionWorld.x.mul(0.31)),
  );
  const closeUvB = vec2(
    positionWorld.x.mul(-1.12).add(positionWorld.z.mul(0.43)),
    positionWorld.z.mul(1.12).add(positionWorld.x.mul(0.43)),
  );
  const grassCloseA = textureNode(grassTexture, closeUvA) as AnyNode;
  const grassCloseB = textureNode(grassTexture, closeUvB) as AnyNode;
  const pathClose = textureNode(pathTexture, closeUvA.mul(1.08)) as AnyNode;
  const rockClose = textureNode(rockTexture, closeUvB.mul(0.92)) as AnyNode;

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
  const sandGrain = sin(positionWorld.x.mul(1.9).add(positionWorld.z.mul(2.35)))
    .mul(sin(positionWorld.x.mul(-2.65).add(positionWorld.z.mul(1.15))))
    .mul(0.5)
    .add(0.5);
  const grassFineA = sin(positionWorld.x.mul(1.35).add(sin(positionWorld.z.mul(0.92)).mul(1.1)))
    .mul(0.5)
    .add(0.5);
  const grassFineB = sin(positionWorld.x.mul(-1.9).add(positionWorld.z.mul(1.62)))
    .mul(cos(positionWorld.x.mul(0.74).sub(positionWorld.z.mul(1.28))))
    .mul(0.5)
    .add(0.5);

  const sandDetail = pathTexel.rgb.dot(vec3(0.3, 0.48, 0.22));
  const grassCloseLum = grassCloseA.rgb
    .mul(0.55)
    .add(grassCloseB.rgb.mul(0.45))
    .dot(vec3(0.25, 0.58, 0.17));
  const pathCloseLum = pathClose.rgb.dot(vec3(0.3, 0.48, 0.22));
  const rockCloseLum = rockClose.rgb.dot(vec3(0.32, 0.43, 0.25));
  const grassDetail = grassFineA.mul(0.42).add(grassFineB.mul(0.34)).add(broadNoise.mul(0.24));
  const rockDetail = rockTexel.dot(vec3(0.32, 0.43, 0.25));
  const drySand = mix(
    color(0xdcb875),
    color(0xf4dca4),
    broadNoise.mul(0.36).add(sandDetail.mul(0.13)).add(sandGrain.mul(0.13)),
  );
  const wetSand = mix(
    color(0xb28150),
    color(0xd1ad75),
    fineNoise.mul(0.24).add(sandDetail.mul(0.08)).add(sandGrain.mul(0.1)),
  );
  const submergedSand = mix(
    color(0x9ed0bd),
    color(0xe1c78d),
    rippleNoise.mul(0.42).add(sandDetail.mul(0.18)),
  );
  const grassBase = mix(color(0x2d6934), color(0x79ad4d), broadNoise.mul(0.5).add(grassDetail.mul(0.28)));
  const grass = grassBase
    .mul(float(0.9).add(grassFineA.mul(0.1)).add(grassFineB.mul(0.05)))
    .add(color(0xd0e08e).mul(pow(saturate(grassFineB.sub(0.62).mul(2.5)), 2.0).mul(0.055)));
  const dirt = mix(color(0x68462a), color(0xa97945), fineNoise.mul(0.48).add(sandDetail.mul(0.16)));
  const rock = mix(color(0x5b5b55), color(0xa0937a), broadNoise.mul(0.24).add(rockDetail.mul(0.42)));
  const limestone = mix(color(0x5d5549), color(0x9b8965), broadNoise.mul(0.22).add(rockDetail.mul(0.38)));
  const seabed = mix(color(0x608c82), color(0xb8a676), rippleNoise.mul(0.28).add(sandDetail.mul(0.22)));
  const reefRock = mix(color(0x4f5f56), color(0x8b8468), fineNoise.mul(0.35).add(rockDetail.mul(0.32)));

  const sandMask = masks.x;
  const grassMask = masks.y;
  const rockMask = masks.z;
  const cliffMask = masks.w;
  const waterline = float(1).sub(smoothstep(0.015, 0.28, abs(y)));
  const wetSandBand = smoothstep(-0.12, 0.08, y)
    .mul(float(1).sub(smoothstep(0.28, 0.82, y)))
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

  const steepSlope = smoothstep(0.68, 0.46, normalWorld.y);
  const cliffInfluence = saturate(cliffMask.add(steepSlope.mul(0.72)));
  const steepFace = steepSlope.mul(saturate(cliffMask.add(rockMask)));
  const strataPhase = fract(y.div(7.8).add(sin(positionWorld.x.mul(0.025)).mul(0.035)));
  const strataWidth = strataPhase.fwidth().mul(1.5).add(0.009);
  const strata = float(1).sub(
    smoothstep(float(0.05).sub(strataWidth), float(0.05).add(strataWidth), strataPhase),
  );
  const ledges = float(1).sub(
    smoothstep(float(0.18).sub(strataWidth), float(0.18).add(strataWidth), strataPhase),
  );
  const fineStrataPhase = fract(
    y
      .div(2.35)
      .add(sin(positionWorld.z.mul(0.055)).mul(0.05))
      .add(sin(positionWorld.x.mul(0.041)).mul(0.03)),
  );
  const fineStrataWidth = fineStrataPhase.fwidth().mul(1.7).add(0.012);
  const fineStrata = float(1).sub(
    smoothstep(float(0.1).sub(fineStrataWidth), float(0.1).add(fineStrataWidth), fineStrataPhase),
  );
  const creviceSeed = sin(positionWorld.x.mul(0.083).add(positionWorld.z.mul(0.069)))
    .mul(sin(y.mul(0.18).add(positionWorld.z.mul(0.035))))
    .mul(0.5)
    .add(0.5);
  const crevices = pow(saturate(creviceSeed.sub(0.58).mul(2.6)), 2.6)
    .mul(cliffMask)
    .mul(smoothstep(5, 31, y));
  const jointPhase = sin(positionWorld.z.mul(0.11).add(sin(positionWorld.x.mul(0.04)).mul(2.5)));
  const joints = pow(saturate(abs(jointPhase).mul(-1).add(0.18).mul(5.8)), 2.0)
    .mul(cliffMask)
    .mul(smoothstep(8, 28, y));
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
  let base = mix(drySand, wetSand, wetSandBand.mul(0.58));
  base = mix(base, color(0xe8cf9a), waterline.mul(sandMask).mul(0.16));
  base = mix(base, submergedSand, shallowUnderwater.mul(sandMask).mul(0.78));
  base = mix(base, grass, grassMask);
  base = mix(base, dirt, dirtPatch);
  base = mix(base, rock, rockMask);
  const cliffBase = mix(limestone, rockTexel.mul(vec3(1.22, 1.12, 0.92)), steepFace.mul(0.68));
  const cliffColor = cliffBase
    .mul(float(0.6).add(strata.mul(0.25)).add(fineStrata.mul(0.13)).add(ledges.mul(0.12)))
    .mul(float(1).sub(crevices.mul(0.34)))
    .mul(float(1).sub(joints.mul(0.42)))
    .mul(float(1).sub(cavity.mul(0.34)))
    .mul(float(1).sub(notch.mul(0.48)))
    .mul(float(1).sub(algaeBase.mul(0.52)))
    .mul(float(1).sub(waterline.mul(0.05)))
    .mul(float(1).sub(cave.mul(0.72)));
  base = mix(base, cliffColor, cliffInfluence);
  base = mix(base, reefRock, underwater.mul(rockMask.add(cliffMask).mul(0.7)));
  base = mix(base, seabed, underwater.mul(0.72));
  base = mix(base, color(0x315545), seagrassPatch.mul(0.36));
  const detailDistance = cameraPosition.sub(positionWorld).length();
  const closeDetail = float(1).sub(smoothstep(25, 82, detailDistance));
  const detailHeight = grassCloseLum
    .mul(grassMask)
    .add(pathCloseLum.mul(sandMask))
    .add(rockCloseLum.mul(rockMask.add(cliffMask)));
  const microShade = float(0.84)
    .add(detailHeight.mul(0.18))
    .sub(pow(saturate(float(0.36).sub(detailHeight).mul(2.6)), 2.0).mul(0.06));
  const closeGrass = mix(
    color(0x315d31),
    color(0x8faa5b),
    grassCloseLum.mul(0.38).add(grassFineA.mul(0.5)),
  ).mul(float(0.94).add(grassFineB.mul(0.08)));
  const closeEarth = mix(color(0x6d5937), color(0xc6ad79), pathCloseLum);
  const closeRock = mix(color(0x5d594f), color(0xa79b81), rockCloseLum);
  let closeLayer = mix(closeEarth, closeGrass, grassMask);
  closeLayer = mix(closeLayer, closeRock, saturate(rockMask.add(cliffMask)));
  closeLayer = mix(closeLayer, closeEarth, sandMask.mul(0.82));
  const pebble = pow(saturate(pathCloseLum.sub(0.58).mul(2.4)), 3.0)
    .mul(closeDetail)
    .mul(sandMask.add(grassMask).mul(0.1));
  const wornSoil = pow(saturate(fineNoise.sub(0.5).mul(1.85)), 2.0)
    .mul(grassMask)
    .mul(closeDetail);
  const grassClumps = pow(saturate(grassFineA.mul(0.58).add(grassFineB.mul(0.42)).sub(0.48).mul(2.2)), 2.0)
    .mul(grassMask)
    .mul(closeDetail);
  const soilFlecks = pow(saturate(float(0.46).sub(pathCloseLum).mul(2.8)), 2.0)
    .mul(grassMask.add(sandMask).mul(0.5))
    .mul(closeDetail);
  base = mix(base, base.mul(microShade).mul(0.58).add(closeLayer.mul(0.42)), closeDetail.mul(0.42));
  base = mix(base, color(0x274824), grassClumps.mul(0.18));
  base = mix(base, closeEarth, wornSoil.mul(0.32).add(soilFlecks.mul(0.16)));
  base = mix(base, color(0x3f382b), pebble);

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
  let base = mix(color(0x5c5548), color(0xae9b78), triNoise.mul(0.3).add(texLum.mul(0.38)));
  base = base.mul(float(0.84).add(strata.mul(0.13))).mul(float(1).sub(joints.mul(0.28)));
  base = mix(base, color(0x3e5640), algae.mul(0.24));
  material.colorNode = base;
  material.roughnessNode = float(0.93);
  material.aoNode = float(0.86);
  return material;
}
