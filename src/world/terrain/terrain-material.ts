import { DoubleSide, MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  color,
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
  vec2,
  vec3,
} from 'three/tsl';
import { world } from '../uniforms';

export const uSunBlend = uniform(1);

export interface TerrainMaterialOptions {
  cloudShadowNode?: Node<'float'> | null;
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

  const drySand = color(0xd9bd82);
  const wetSand = color(0x8f7651);
  const grass = color(0x4f7b3b);
  const dirt = color(0x6f5538);
  const rock = color(0x8e8d7e);
  const limestone = color(0xc7bea6);
  const seabed = color(0x6f9d94);

  const sandMask = masks.x;
  const grassMask = masks.y;
  const rockMask = masks.z;
  const cliffMask = masks.w;
  const waterline = float(1).sub(smoothstep(0.08, 1.15, abs(y)));
  const wetSandBand = smoothstep(-0.35, 0.75, y)
    .mul(float(1).sub(smoothstep(1.0, 2.2, y)))
    .mul(sandMask);
  const underwater = smoothstep(-0.15, -12.0, y.negate());

  const strataPhase = fract(y.div(9).add(sin(positionWorld.z.mul(0.045)).mul(0.035)));
  const strataWidth = strataPhase.fwidth().mul(1.8).add(0.012);
  const strata = float(1).sub(
    smoothstep(float(0.055).sub(strataWidth), float(0.055).add(strataWidth), strataPhase),
  );
  const streakSeed = sin(positionWorld.z.mul(0.42).add(sin(positionWorld.x.mul(0.11)).mul(2.1)))
    .mul(0.5)
    .add(0.5);
  const streaks = pow(saturate(streakSeed.sub(0.56).mul(2.4)), 3)
    .mul(cliffMask)
    .mul(smoothstep(5, 31, y));
  const notch = smoothstep(1.25, 1.45, y)
    .mul(float(1).sub(smoothstep(2.05, 2.35, y)))
    .mul(cliffMask);
  const cave = float(1)
    .sub(smoothstep(0.0, 1.0, vec2(positionWorld.x.sub(198).div(11), positionWorld.z.add(5).div(7)).length()))
    .mul(smoothstep(-1.2, 5.0, y))
    .mul(float(1).sub(smoothstep(8, 15, y)));

  let base = mix(drySand, wetSand, wetSandBand.add(waterline.mul(sandMask).mul(0.45)));
  base = mix(base, grass, grassMask);
  base = mix(base, dirt, grassMask.mul(rockMask).mul(0.55));
  base = mix(base, rock, rockMask);
  const cliffColor = limestone
    .mul(float(0.86).add(strata.mul(0.2)))
    .mul(float(1).sub(streaks.mul(0.35)))
    .mul(float(1).sub(notch.mul(0.4)))
    .mul(float(1).sub(waterline.mul(0.28)))
    .mul(float(1).sub(cave.mul(0.72)));
  base = mix(base, cliffColor, cliffMask);
  base = mix(base, seabed, underwater.mul(0.72));

  const sunVis = mix(light.y, light.z, uSunBlend);
  const cloud = options.cloudShadowNode ?? float(1);
  const bakedLight = saturate(light.x.mul(0.64).add(sunVis.mul(cloud).mul(0.36))).mul(
    float(1).sub(world.night.mul(0.42)),
  );
  material.colorNode = base.mul(float(0.42).add(bakedLight.mul(0.72)));
  material.roughnessNode = saturate(
    float(0.86).sub(wetSandBand.mul(0.35)).sub(waterline.mul(0.18)).add(cliffMask.mul(0.05)),
  );
  material.aoNode = light.x;

  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const fresnelRim = pow(float(1).sub(saturate(dot(normalWorld, viewDir))), 2.2);
  const backlit = smoothstep(0.05, 0.62, dot(normalWorld, world.sunDir).negate());
  const rim = light.w.mul(backlit).mul(fresnelRim).mul(float(1).sub(world.night));
  material.emissiveNode = vec3(world.sunColor.r, world.sunColor.g, world.sunColor.b).mul(rim.mul(0.55));
  return material;
}
