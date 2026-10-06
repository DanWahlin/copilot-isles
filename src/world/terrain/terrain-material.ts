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
  bumpMap,
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
  texture as textureNode,
  vec2,
  vec3,
} from 'three/tsl';
import { packs } from '../../engine/packs';
import { world } from '../uniforms';
import type { Tier } from '../contracts';
import { COVE } from '../layout';
import { VILLAGE_GROUND } from './cove-height';
import { terrainNoiseTexture } from './noise-texture';

const uSunBlend = uniform(1);

// TSL's fluent typings don't cover every mixed scalar/vector graph used by this material.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const textureCache = new Map<string, Texture>();

/** Shared, cached terrain texture (one GPU copy per file). */
export function terrainTexture(file: string): Texture {
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

function triplanarColor(
  texture: Texture,
  scale: number,
  p: AnyNode = positionWorld,
  normal: AnyNode = normalWorld,
): AnyNode {
  const n = normal.abs() as AnyNode;
  const wx = textureNode(texture, vec2(p.z, p.y).mul(scale)) as AnyNode;
  const wy = textureNode(texture, vec2(p.x, p.z).mul(scale)) as AnyNode;
  const wz = textureNode(texture, vec2(p.x, p.y).mul(scale)) as AnyNode;
  const sum = n.x.add(n.y).add(n.z).max(0.001);
  return wx.rgb.mul(n.x).add(wy.rgb.mul(n.y)).add(wz.rgb.mul(n.z)).div(sum);
}

function segmentMaskNode(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  inner: number,
  outer: number,
  world: AnyNode = positionWorld,
): AnyNode {
  const p = vec2(world.x, world.z);
  const a = vec2(ax, az);
  const ba = vec2(bx - ax, bz - az);
  const pa = p.sub(a);
  const t = saturate(pa.dot(ba).div((bx - ax) * (bx - ax) + (bz - az) * (bz - az)));
  return float(1).sub(smoothstep(inner, outer, pa.sub(ba.mul(t)).length()));
}

/** The village's lived-in ground (cove-height `villageGroundWeight`): its sand is worn earth. */
function villageGroundNode(y: AnyNode, p: AnyNode = positionWorld): AnyNode {
  const g = VILLAGE_GROUND;
  const r = vec2(p.x.sub(g.x).div(g.rx), p.z.sub(g.z).div(g.rz)).length();
  return float(1)
    .sub(smoothstep(g.edge, 1, r))
    .mul(smoothstep(g.y0, g.y1, y));
}

export interface TerrainMaterialOptions {
  cloudShadowNode?: Node<'float'> | null;
  tier?: Tier;
  /** The ground's world position, when the mesh isn't drawn there (default: `positionWorld`). */
  worldPosition?: Node<'vec3'>;
  /** The ground's world normal, when the mesh's own is exaggerated (default: `normalWorld`). */
  worldNormal?: Node<'vec3'>;
  /** Drawn small and seen from afar (the opening's chart): far detail only, no close bump. */
  miniature?: boolean;
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
  // Where the ground really is in the world, and which way it faces (the chart's miniature passes
  // its true world position and normal, so it's shaded exactly like the island it stands for).
  const P = (options.worldPosition ?? positionWorld) as AnyNode;
  const N = (options.worldNormal ?? normalWorld) as AnyNode;
  const masks = attribute('terrainMask', 'vec4');
  const light = attribute('terrainLight', 'vec4');
  const y = P.y;
  const detail = options.tier === 'lite' ? 0 : options.tier === 'low' ? 1 : 2;
  const rockTexture = terrainTexture('rocks.webp');
  const pathTexture = terrainTexture('path-rocks.webp');
  const noiseTexture = terrainNoiseTexture();
  const flatUv = vec2(P.x, P.z);
  // Drawn small, the rock texture's minified pattern reads as a hatch, so the miniature takes its mean.
  const rockTexel = options.miniature ? vec3(0.084, 0.104, 0.067) : triplanarColor(rockTexture, 0.045, P, N);
  const pathTexel = textureNode(pathTexture, flatUv.mul(0.036)) as AnyNode;
  const closeUvA = vec2(P.x.mul(0.54).add(P.z.mul(0.2)), P.z.mul(0.54).sub(P.x.mul(0.2)));
  const closeUvB = vec2(P.x.mul(-0.43).add(P.z.mul(0.78)), P.z.mul(0.43).add(P.x.mul(0.78)));
  const pathClose = textureNode(pathTexture, closeUvA.mul(1.16)) as AnyNode;
  const rockClose = textureNode(rockTexture, closeUvB.mul(1.02)) as AnyNode;
  const noiseLowUv = vec2(P.x.mul(0.00878).sub(P.z.mul(0.00662)), P.x.mul(0.00662).add(P.z.mul(0.00878)));
  const noiseMidUv = vec2(P.x.mul(0.02052).sub(P.z.mul(0.05956)), P.x.mul(0.05956).add(P.z.mul(0.02052)));
  const noiseFineUv = vec2(P.x.mul(0.2773).sub(P.z.mul(0.0848)), P.x.mul(0.0848).add(P.z.mul(0.2773)));
  const noiseLow = textureNode(noiseTexture, noiseLowUv) as AnyNode;
  const noiseMid = textureNode(noiseTexture, noiseMidUv) as AnyNode;
  const noiseFine = textureNode(noiseTexture, noiseFineUv) as AnyNode;
  const broadNoise = noiseLow.r.mul(0.56).add(noiseLow.g.mul(0.24)).add(noiseMid.b.mul(0.2));
  const fineNoise = noiseMid.g.mul(0.48).add(noiseFine.r.mul(0.34)).add(noiseLow.b.mul(0.18));
  const rippleNoise = noiseMid.b.mul(0.66).add(noiseFine.g.mul(0.34));
  const sandGrain = noiseFine.b.mul(0.62).add(noiseFine.a.mul(0.38));
  const grassFineA = noiseFine.r.mul(0.52).add(noiseMid.a.mul(0.48));
  const grassFineB = noiseFine.g.mul(0.5).add(noiseFine.b.mul(0.3)).add(noiseMid.r.mul(0.2));
  const meadowMacroA = noiseLow.g.mul(0.7).add(noiseMid.r.mul(0.3));
  const meadowMacroB = noiseLow.a.mul(0.62).add(noiseMid.b.mul(0.38));
  const meadowMacro = meadowMacroA.mul(0.58).add(meadowMacroB.mul(0.42));
  const grassBladeA = noiseFine.r;
  const grassBladeB = noiseFine.g;
  const grassBladeC = noiseFine.a;

  const pathDetail = pathTexel.rgb.dot(vec3(0.3, 0.48, 0.22));
  const sandDetail = sandGrain.mul(0.54).add(rippleNoise.mul(0.28)).add(broadNoise.mul(0.18));
  const grassCloseLum = saturate(
    grassBladeA.mul(0.34).add(grassBladeB.mul(0.29)).add(grassBladeC.mul(0.2)).add(meadowMacro.mul(0.17)),
  );
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
  const lushGrass = grassBase
    .mul(float(0.9).add(grassFineA.mul(0.1)).add(grassFineB.mul(0.05)))
    .add(color(0xd0e08e).mul(pow(saturate(grassFineB.sub(0.62).mul(2.5)), 2.0).mul(0.055)));
  // The chart's miniature shows Port Meridian's mountain past its terrain's box, so it keeps the dry
  // ground out to the island's far shore.
  const dryEast = options.miniature ? 1400 : 1240;
  const drySouth = options.miniature ? -1260 : -1080;
  const meridianDryMask = smoothstep(470, 620, P.x)
    .mul(float(1).sub(smoothstep(dryEast - 30, dryEast, P.x)))
    .mul(smoothstep(drySouth - 50, drySouth, P.z))
    .mul(float(1).sub(smoothstep(-620, -570, P.z)));
  const dryGrass = mix(color(0x7f6530), color(0xd4a653), broadNoise.mul(0.5).add(grassDetail.mul(0.22))).add(
    color(0xefcf79).mul(pow(saturate(grassFineB.sub(0.66).mul(2.2)), 2.0).mul(0.1)),
  );
  const grass = mix(lushGrass, dryGrass, meridianDryMask);
  const dirt = mix(color(0x68462a), color(0xa97945), fineNoise.mul(0.48).add(sandDetail.mul(0.16)));
  const rock = mix(color(0x5b5b55), color(0xa0937a), broadNoise.mul(0.24).add(rockDetail.mul(0.42)));
  const limestone = mix(color(0x5d5549), color(0x9b8965), broadNoise.mul(0.22).add(rockDetail.mul(0.38)));
  const seabed = mix(color(0x608c82), color(0xb8a676), rippleNoise.mul(0.28).add(sandDetail.mul(0.22)));
  const reefRock = mix(color(0x4f5f56), color(0x8b8468), fineNoise.mul(0.35).add(rockDetail.mul(0.32)));

  const sandMask = masks.x;
  const grassMask = masks.y;
  const rockMask = masks.z;
  const cliffMask = masks.w;
  const villageGround = villageGroundNode(y, P);
  const shaderPathMask = saturate(
    segmentMaskNode(COVE.village.center.x, COVE.village.center.z, -18, -10, 2.4, 7.2, P)
      .add(segmentMaskNode(-18, -10, -28, 103, 2.8, 8.6, P))
      .add(segmentMaskNode(-112, -64, COVE.village.center.x, COVE.village.center.z, 2.2, 6.5, P)),
  )
    .mul(smoothstep(1.0, 6.5, y))
    .max(villageGround);
  const pathSandMask = sandMask.mul(shaderPathMask);
  const beachSandMask = saturate(sandMask.sub(pathSandMask));
  const waterline = float(1).sub(smoothstep(0.015, 0.28, abs(y)));
  const wetSandBand = smoothstep(-0.12, 0.08, y)
    .mul(float(1).sub(smoothstep(0.28, 0.82, y)))
    .mul(beachSandMask);
  const swashBand = smoothstep(-0.16, 0.18, y)
    .mul(float(1).sub(smoothstep(1.15, 2.25, y)))
    .mul(beachSandMask);
  const ripplePhase = P.x.mul(0.92).add(P.z.mul(0.16)).add(noiseLow.r.mul(2.4)).add(noiseMid.g.mul(0.8));
  const fineRipplePhase = P.x.mul(1.86).sub(P.z.mul(0.28)).add(noiseFine.g.mul(1.8));
  const rippleRidge = abs(sin(ripplePhase)).smoothstep(float(0.72), float(0.99));
  const fineRippleRidge = abs(sin(fineRipplePhase)).smoothstep(float(0.82), float(0.997));
  // Thin procedural lines (ripples, fractures) shimmer when the ground's drawn small, so the miniature
  // gets their average instead.
  const beachRipples = options.miniature
    ? swashBand.mul(0.12)
    : rippleRidge.mul(0.52).add(fineRippleRidge.mul(0.28)).mul(swashBand);
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

  // The east headland and its inland slope: one smooth grassy hill, without the island's height bands
  // and strata (on a big even slope they read as farm terraces).
  const headlandHill = smoothstep(COVE.headland.x0 - 50, COVE.headland.x0 - 15, P.x)
    .mul(smoothstep(COVE.headland.z0 - 40, COVE.headland.z0 - 10, P.z))
    .mul(float(1).sub(smoothstep(COVE.headland.z1 + 10, COVE.headland.z1 + 40, P.z)));
  const steepSlope = smoothstep(0.68, 0.46, N.y);
  // On that hill only the near-sheer faces (under the cliff mesh) take the cliff colouring.
  const cliffInfluence = saturate(cliffMask.add(steepSlope.mul(0.72))).mul(
    float(1).sub(headlandHill.mul(smoothstep(0.42, 0.55, N.y))),
  );
  const steepFace = steepSlope.mul(saturate(cliffMask.add(rockMask)));
  const strataPhase = fract(y.div(7.8).add(noiseLow.b.sub(0.5).mul(0.6)));
  const strataWidth = strataPhase.fwidth().mul(1.5).add(0.009);
  // The strata are a few pixels apart on the miniature (they alias), so it takes their averages.
  const strata = options.miniature
    ? float(0.05)
    : float(1).sub(smoothstep(float(0.05).sub(strataWidth), float(0.05).add(strataWidth), strataPhase));
  const ledges = options.miniature
    ? float(0.18)
    : float(1).sub(smoothstep(float(0.18).sub(strataWidth), float(0.18).add(strataWidth), strataPhase));
  const fineStrataPhase = fract(
    y.div(2.35).add(noiseMid.r.sub(0.5).mul(0.38)).add(noiseFine.b.sub(0.5).mul(0.08)),
  );
  const fineStrataWidth = fineStrataPhase.fwidth().mul(1.7).add(0.012);
  const fineStrata = options.miniature
    ? float(0.1)
    : float(1).sub(
        smoothstep(float(0.1).sub(fineStrataWidth), float(0.1).add(fineStrataWidth), fineStrataPhase),
      );
  const creviceSeed = noiseMid.b.mul(0.58).add(noiseFine.r.mul(0.28)).add(noiseLow.a.mul(0.14));
  const crevices = pow(saturate(creviceSeed.sub(0.58).mul(2.6)), 2.6)
    .mul(cliffMask)
    .mul(smoothstep(5, 31, y));
  const joints = pow(saturate(noiseFine.a.sub(0.66).mul(3.6)), 2.0)
    .mul(cliffMask)
    .mul(smoothstep(8, 28, y));
  const cavity = float(1).sub(light.x).mul(cliffMask);
  const notch = smoothstep(1.25, 1.45, y)
    .mul(float(1).sub(smoothstep(2.05, 2.35, y)))
    .mul(cliffMask);
  const cave = float(1)
    .sub(smoothstep(0.0, 1.0, vec2(P.x.sub(198).div(11), P.z.add(5).div(7)).length()))
    .mul(smoothstep(-1.2, 5.0, y))
    .mul(float(1).sub(smoothstep(8, 15, y)));

  const algaeBase = smoothstep(-0.25, 0.3, y)
    .mul(float(1).sub(smoothstep(2.9, 4.4, y)))
    .mul(cliffMask.add(rockMask).mul(0.65));
  let base = mix(drySand, wetSand, wetSandBand.mul(0.58));
  const pathBase = mix(color(0x715b3b), color(0xc7b17e), pathDetail);
  base = mix(base, pathBase, pathSandMask.mul(0.84));
  base = mix(base, color(0xe8cf9a), waterline.mul(beachSandMask).mul(0.16));
  base = mix(base, submergedSand, shallowUnderwater.mul(beachSandMask).mul(0.78));
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
  const meridianBluffMask = smoothstep(722, 752, P.x)
    .mul(float(1).sub(smoothstep(884, 914, P.x)))
    .mul(smoothstep(-864, -846, P.z))
    .mul(float(1).sub(smoothstep(-704, -686, P.z)))
    .mul(smoothstep(4, 16, y));
  const bluffFractureA = abs(sin(P.x.mul(0.34).add(P.z.mul(0.47)).add(noiseLow.r.mul(3.2)))).smoothstep(
    float(0.955),
    float(0.998),
  );
  const bluffFractureB = abs(sin(P.x.mul(0.72).sub(P.z.mul(0.22)).add(noiseMid.b.mul(4.1)))).smoothstep(
    float(0.972),
    float(0.999),
  );
  const bluffFractures = (options.miniature ? float(0.04) : bluffFractureA.max(bluffFractureB.mul(0.75)))
    .mul(meridianBluffMask)
    .mul(smoothstep(6, 38, y));
  const bluffScrub = pow(
    saturate(noiseLow.g.mul(0.4).add(noiseMid.a.mul(0.38)).add(noiseFine.g.mul(0.22)).sub(0.78).mul(4.2)),
    2.0,
  )
    .mul(meridianBluffMask)
    .mul(smoothstep(8, 34, y))
    .mul(float(1).sub(bluffFractures.mul(0.8)));
  const meridianBluffCliff = mix(
    color(0x755f43),
    rockTexel.mul(vec3(1.42, 1.25, 0.86)),
    broadNoise.mul(0.48).add(fineNoise.mul(0.28)).add(noiseLow.a.mul(0.18)),
  )
    .mul(float(0.86).add(noiseMid.g.mul(0.18)).add(noiseFine.b.mul(0.08)))
    .mul(float(1).sub(crevices.mul(0.28)))
    .mul(float(1).sub(joints.mul(0.34)))
    .mul(float(1).sub(bluffFractures.mul(0.48)));
  base = mix(base, mix(cliffColor, meridianBluffCliff, meridianBluffMask), cliffInfluence);
  base = mix(base, reefRock, underwater.mul(rockMask.add(cliffMask).mul(0.7)));
  base = mix(base, seabed, underwater.mul(0.72));
  base = mix(base, color(0x315545), seagrassPatch.mul(0.36));
  // Seen from the air (the chart's miniature), only the far layers show.
  const detailDistance = options.miniature ? float(400) : cameraPosition.sub(positionWorld).length();
  const closeDetail = float(1).sub(smoothstep(22, 86, detailDistance));
  const midDetail = float(1).sub(smoothstep(75, 155, detailDistance));
  const lowGroundDetail = closeDetail
    .mul(smoothstep(-0.4, 1.8, y))
    .mul(float(1).sub(smoothstep(5.5, 9.5, y)))
    .mul(smoothstep(0.58, 0.95, N.y));
  const closeMeadowDetail = closeDetail.mul(
    saturate(sandMask.add(grassMask.mul(smoothstep(0.28, 0.92, N.y))).add(lowGroundDetail.mul(0.92))),
  );
  const sandHeightDetail = sandGrain
    .mul(0.5)
    .add(rippleNoise.mul(0.22))
    .add(noiseMid.a.mul(0.1))
    .add(beachRipples.mul(0.52));
  const detailHeight = grassCloseLum
    .mul(grassMask)
    .add(pathCloseLum.mul(pathSandMask))
    .add(sandHeightDetail.mul(beachSandMask))
    .add(rockCloseLum.mul(rockMask.add(cliffMask)));
  const microShade = float(0.72)
    .add(detailHeight.mul(0.46))
    .sub(pow(saturate(float(0.42).sub(detailHeight).mul(2.9)), 2.0).mul(0.18));
  const cloverPatch = pow(
    saturate(grassBladeB.mul(0.46).add(grassFineA.mul(0.34)).add(meadowMacroA.mul(0.2)).sub(0.55).mul(2.7)),
    2.1,
  );
  const dryPatch = pow(saturate(meadowMacroB.sub(0.52).mul(2.2)), 2.1);
  const deepPatch = pow(saturate(float(0.5).sub(meadowMacroA).mul(2.4)), 2.0);
  let closeGrass = mix(color(0x1f4823), color(0xb4d36a), grassCloseLum);
  closeGrass = mix(closeGrass, color(0xd0bd74), dryPatch.mul(0.36));
  closeGrass = mix(closeGrass, color(0x183f23), deepPatch.mul(0.34));
  closeGrass = mix(closeGrass, color(0x68c45d), cloverPatch.mul(0.3));
  closeGrass = closeGrass.mul(float(0.82).add(meadowMacro.mul(0.34)).add(grassBladeC.mul(0.08)));
  const closeDryGrass = mix(color(0x6d6b32), color(0xc3a862), grassCloseLum).mul(
    float(0.9).add(meadowMacro.mul(0.22)),
  );
  closeGrass = mix(closeGrass, closeDryGrass, meridianDryMask);
  const closeEarth = mix(color(0x6d5937), color(0xc6ad79), pathCloseLum);
  const closeDrySand = mix(color(0xdcb06e), color(0xf4d79d), sandDetail);
  const closeWetSand = mix(color(0xa97845), color(0xd0a973), sandGrain.mul(0.46).add(rippleNoise.mul(0.34)));
  const closeSand = mix(
    closeDrySand,
    closeWetSand,
    saturate(wetSandBand.mul(1.2).add(waterline.mul(0.18))),
  ).mul(float(0.94).add(sandGrain.mul(0.12)).add(noiseFine.g.mul(0.04)));
  const closeRock = mix(color(0x5d594f), color(0xa79b81), rockCloseLum);
  const rockBandColor = mix(
    color(0x4c4b43),
    color(0xb0a57e),
    noiseLow.a.mul(0.38).add(noiseMid.r.mul(0.42)).add(fineStrata.mul(0.2)),
  );
  const beachGrassFringe = saturate(sandMask.mul(grassMask).mul(smoothstep(0.35, 5.6, y))).mul(closeDetail);
  const fringeNoise = saturate(noiseFine.g.mul(0.46).add(noiseMid.a.mul(0.34)).add(noiseLow.g.mul(0.2)));
  const sandFinger = pow(saturate(float(0.48).sub(fringeNoise).mul(2.8)), 1.35).mul(beachGrassFringe);
  const grassFinger = pow(saturate(fringeNoise.sub(0.38).mul(2.2)), 1.2).mul(beachGrassFringe);
  const bardCampSand = float(1)
    .sub(smoothstep(4.2, 9.0, (vec2 as AnyNode)(P.x.add(18).mul(1.05), P.z.sub(86.2).mul(0.82)).length()))
    .mul(smoothstep(0.05, 2.8, y));
  const rootGreen = mix(color(0x5d7432), color(0x7d9a45), noiseLow.g.mul(0.62).add(noiseMid.g.mul(0.38)));
  let closeLayer = mix(closeEarth, closeGrass, grassMask);
  closeLayer = mix(closeLayer, closeRock, saturate(rockMask.add(cliffMask)));
  closeLayer = mix(closeLayer, closeEarth, pathSandMask.mul(0.82));
  closeLayer = mix(closeLayer, closeSand, beachSandMask.mul(0.9));
  const pebble = pow(saturate(pathCloseLum.sub(0.54).mul(2.8)), 3.0)
    .mul(closeMeadowDetail)
    .mul(pathSandMask.add(grassMask).mul(0.2));
  const shellFlecks = pow(saturate(sandGrain.sub(0.74).mul(3.4)), 3.0)
    .mul(beachSandMask)
    .mul(closeDetail);
  const sandPepper = pow(saturate(float(0.38).sub(noiseFine.a).mul(3.2)), 2.4)
    .mul(beachSandMask)
    .mul(closeDetail);
  const wornSoil = pow(saturate(fineNoise.mul(0.55).add(meadowMacroB.mul(0.45)).sub(0.5).mul(2.0)), 2.0)
    .mul(grassMask)
    .mul(closeMeadowDetail);
  const grassClumps = pow(saturate(grassFineA.mul(0.58).add(grassFineB.mul(0.42)).sub(0.48).mul(2.2)), 2.0)
    .mul(grassMask)
    .mul(closeMeadowDetail);
  const soilFlecks = pow(saturate(float(0.46).sub(pathCloseLum).mul(2.8)), 2.0)
    .mul(grassMask.add(pathSandMask).mul(0.5))
    .mul(closeMeadowDetail);
  const slopeOutcrop = steepSlope
    .mul(smoothstep(3, 28, y))
    .mul(
      saturate(noiseMid.b.mul(0.5).add(noiseLow.a.mul(0.36)).add(fineStrata.mul(0.22)).sub(0.48).mul(2.1)),
    );
  const slopeGrass = smoothstep(0.38, 0.82, N.y)
    .mul(smoothstep(5, 30, y))
    .mul(midDetail)
    .mul(grassMask.add(rockMask.mul(0.35)));
  const slopeScree = pow(saturate(noiseFine.b.mul(0.6).add(pathCloseLum.mul(0.28)).sub(0.5).mul(2.2)), 2.0)
    .mul(steepSlope)
    .mul(midDetail)
    .mul(float(1).sub(smoothstep(9, 22, y)));
  base = mix(base, base.mul(microShade).mul(0.24).add(closeLayer.mul(0.9)), closeMeadowDetail.mul(0.92));
  base = mix(base, color(0x123719), grassClumps.mul(0.56));
  base = mix(base, color(0xd0ca73), dryPatch.mul(grassMask).mul(closeMeadowDetail).mul(0.32));
  base = mix(base, color(0xbad878), cloverPatch.mul(grassMask).mul(closeMeadowDetail).mul(0.32));
  base = mix(base, closeEarth, wornSoil.mul(0.56).add(soilFlecks.mul(0.34)));
  base = mix(base, closeSand, sandFinger.mul(0.62));
  base = mix(base, rootGreen, grassFinger.mul(0.5));
  base = mix(base, color(0xe7d39b), bardCampSand.mul(0.86));
  base = mix(base, color(0xf4daa4), beachRipples.mul(0.13));
  base = mix(
    base,
    color(0x8e623b),
    swashBand.mul(float(1).sub(rippleRidge).mul(0.05)).mul(closeDetail.mul(0.7).add(0.18)),
  );
  base = mix(base, color(0x3f382b), pebble);
  base = mix(base, color(0xf8e0aa), shellFlecks.mul(0.16));
  base = mix(base, color(0xad8050), sandPepper.mul(0.13));
  const meadowFleckDark = pow(
    saturate(
      float(0.62)
        .sub(noiseFine.r.mul(0.58).add(noiseMid.a.mul(0.42)))
        .mul(1.85),
    ),
    1.15,
  ).mul(closeMeadowDetail);
  const meadowFleckLight = pow(
    saturate(noiseFine.g.mul(0.58).add(noiseLow.g.mul(0.42)).sub(0.38).mul(1.9)),
    1.15,
  ).mul(closeMeadowDetail);
  const lowClump = pow(
    saturate(noiseFine.r.mul(0.48).add(noiseFine.g.mul(0.28)).add(noiseMid.a.mul(0.24)).sub(0.44).mul(2.2)),
    1.25,
  ).mul(lowGroundDetail);
  const lowDryTip = pow(
    saturate(noiseFine.b.mul(0.42).add(noiseLow.r.mul(0.35)).add(noiseMid.g.mul(0.23)).sub(0.5).mul(2.1)),
    1.35,
  ).mul(lowGroundDetail);
  // Worn village ground: warm trodden soil where the lawn is worn (sand inside the village ground),
  // its edge broken by fine noise so the grass frays into it. The meadow flecks stay on the grass.
  const villageEarth = smoothstep(0.26, 0.66, sandMask.add(fineNoise.sub(0.5).mul(0.42))).mul(villageGround);
  const fleckKeep = float(1).sub(villageEarth);
  base = mix(base, color(0x123518), meadowFleckDark.mul(0.58).mul(fleckKeep));
  base = mix(base, color(0xc7e076), meadowFleckLight.mul(0.5).mul(fleckKeep));
  base = mix(base, color(0x102f16), lowClump.mul(0.58).mul(fleckKeep));
  base = mix(base, color(0xd6cf7a), lowDryTip.mul(0.42).mul(fleckKeep));
  if (detail >= 1) {
    // Village lawns: a fine turf (clumps a hand or two across, light tips and dark roots) and a
    // dry, trodden fringe where the lawn meets the worn earth.
    const turfUv = vec2(P.x.mul(1.13).add(P.z.mul(0.41)), P.z.mul(1.13).sub(P.x.mul(0.41)));
    const turfTexel = textureNode(noiseTexture, turfUv) as AnyNode;
    // The fine noise (a 3.4 m period against the turf's 0.88 m) keeps the turf from tiling in a grid.
    const turf = saturate(turfTexel.r.sub(turfTexel.b).mul(4.5).add(noiseFine.a.sub(0.5).mul(2.6)).add(0.5));
    // Faded out by 26 m: farther off, the 0.9 m turf aliases into a grid.
    const turfNear = float(1).sub(smoothstep(8, 26, detailDistance));
    const lawn = villageGround.mul(grassMask).mul(fleckKeep).mul(turfNear);
    const lawnColor = mix(color(0x23431a), color(0xa9c44c), turf).mul(float(0.85).add(meadowMacro.mul(0.3)));
    base = mix(base, lawnColor, lawn.mul(0.66));
    const daisies = smoothstep(0.7, 0.73, turfTexel.g.mul(0.7).add(fineNoise.mul(0.3)))
      .mul(lawn)
      .mul(closeDetail);
    base = mix(base, color(0xeee8bf), daisies.mul(0.4));
    const trodden = smoothstep(0.08, 0.4, sandMask.add(fineNoise.sub(0.5).mul(0.3)))
      .mul(villageGround)
      .mul(fleckKeep);
    base = mix(base, color(0xa39a58), trodden.mul(0.45));
  }
  const villageSoil = mix(color(0x4a2f1c), color(0x92683c), pathCloseLum.mul(0.55).add(fineNoise.mul(0.45)));
  base = mix(base, villageSoil, villageEarth.mul(0.9));
  base = mix(base, closeGrass, slopeGrass.mul(0.36));
  base = mix(
    base,
    rockBandColor.mul(float(0.72).add(strata.mul(0.36)).add(fineStrata.mul(0.22))),
    slopeOutcrop.mul(0.42).add(slopeScree.mul(0.28)).mul(float(1).sub(headlandHill)),
  );
  const hillSlope = smoothstep(1.0, 0.82, N.y)
    .mul(smoothstep(2.5, 38, y))
    .mul(midDetail)
    .mul(float(1).sub(headlandHill));
  const hillBand = fract(y.div(6.4).add(noiseLow.b.sub(0.5).mul(0.54)).add(noiseMid.r.sub(0.5).mul(0.16)));
  const hillDark = pow(saturate(float(0.6).sub(hillBand).mul(2.0)), 1.2).mul(hillSlope);
  const hillLight = pow(saturate(hillBand.sub(0.43).mul(1.8)), 1.2).mul(hillSlope);
  const hillMottle = saturate(
    noiseLow.g.mul(0.45).add(noiseMid.a.mul(0.4)).add(noiseMid.r.mul(0.22)).sub(0.42),
  ).mul(hillSlope);
  base = mix(base, color(0x25311f), hillDark.mul(0.8));
  base = mix(base, color(0xc5b47e), hillLight.mul(0.68));
  base = mix(base, rockBandColor, hillMottle.mul(0.56));
  const hillFootMeadow = smoothstep(1.0, 4.5, y)
    .mul(float(1).sub(smoothstep(18, 34, y)))
    .mul(smoothstep(0.5, 0.94, N.y))
    .mul(saturate(grassMask.add(rockMask.mul(0.24))));
  base = mix(base, rootGreen, hillFootMeadow.mul(midDetail).mul(0.42));
  const hilltopMeadow = smoothstep(7, 12, y)
    .mul(float(1).sub(smoothstep(34, 46, y)))
    .mul(smoothstep(0.46, 0.94, N.y))
    .mul(saturate(grassMask.add(rockMask.mul(0.38)).add(sandMask.mul(0.18))));
  const hilltopGreen = mix(color(0x6a6a31), color(0xb19955), noiseLow.g.mul(0.58).add(noiseMid.g.mul(0.42)));
  // The east headland is green grass with a few dirt patches, not the island's dry golden hilltops.
  const headlandScrub = headlandHill
    .mul(smoothstep(3, 8, y))
    .mul(float(1).sub(cliffMask))
    .mul(float(1).sub(sandMask));
  base = mix(base, hilltopGreen, hilltopMeadow.mul(midDetail).mul(float(1).sub(headlandScrub.mul(0.85))));
  const dirtSpots = smoothstep(
    0.57,
    0.65,
    noiseLow.r.mul(0.55).add(noiseMid.b.mul(0.3)).add(noiseFine.g.mul(0.15)),
  );
  const scrubTone = mix(
    mix(color(0x35562a), color(0x5f8038), noiseLow.g.mul(0.6).add(noiseMid.a.mul(0.4))),
    mix(color(0x7a5532), color(0x9a7448), noiseFine.r),
    dirtSpots.mul(0.9),
  );
  base = mix(base, scrubTone, headlandScrub.mul(0.8));
  base = mix(base, color(0x55633a), bluffScrub.mul(0.42));
  const sunnyHeadland = smoothstep(6, 18, y)
    .mul(float(1).sub(smoothstep(52, 88, detailDistance)))
    .mul(saturate(grassMask.mul(0.9).add(rockMask.mul(0.45))))
    .mul(smoothstep(0.28, 0.88, N.y));
  const warmHeadland = mix(color(0x5c7136), color(0xa29569), noiseLow.a.mul(0.46).add(noiseMid.r.mul(0.54)));
  base = mix(base, warmHeadland, sunnyHeadland.mul(0.24));
  base = mix(base, meridianBluffCliff, meridianBluffMask);

  const sunVis = mix(light.y, light.z, uSunBlend);
  const cloud = options.cloudShadowNode ?? float(1);
  const bakedLight = saturate(light.x.mul(0.64).add(sunVis.mul(cloud).mul(0.36))).mul(
    float(1).sub(world.night.mul(0.42)),
  );
  const bluffLight = float(0.72).add(broadNoise.mul(0.12)).add(fineNoise.mul(0.08));
  const terrainLight = mix(bakedLight, bluffLight, meridianBluffMask.mul(0.96));
  const causticLayerA = sin(P.x.mul(0.18).add(P.z.mul(0.26)).add(world.time.mul(1.35)))
    .mul(sin(P.x.mul(-0.23).add(P.z.mul(0.16)).sub(world.time.mul(1.1))))
    .mul(0.5)
    .add(0.5);
  const causticLayerB =
    detail >= 2
      ? sin(P.x.mul(0.33).sub(P.z.mul(0.29)).add(world.time.mul(0.75)))
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
    .mul(float(0.62).add(terrainLight.mul(0.58)))
    .add(vec3(0.65, 0.95, 1.0).mul(caustics.mul(0.08)));
  material.roughnessNode = saturate(
    float(0.84)
      .sub(wetSandBand.mul(0.34))
      .sub(waterline.mul(0.16))
      .sub(underwater.mul(0.08))
      .add(cliffMask.mul(0.12)),
  );
  material.aoNode = light.x;
  const bumpStrength = closeDetail
    .mul(grassMask.mul(0.22).add(pathSandMask.mul(0.13)).add(beachSandMask.mul(0.09)))
    .mul(float(1).sub(underwater.mul(0.85)));
  if (!options.miniature) material.normalNode = bumpMap(detailHeight, bumpStrength);

  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const fresnelRim = pow(float(1).sub(saturate(dot(normalWorld, viewDir))), 2.2);
  const backlit = smoothstep(0.05, 0.62, dot(normalWorld, world.sunDir).negate());
  const rim = light.w
    .mul(backlit)
    .mul(fresnelRim)
    .mul(float(1).sub(world.night))
    .mul(float(1).sub(cliffMask.mul(0.75)))
    // The headland's shoulders all stand over a big drop; only a faint glow there, or its whole top goes gold.
    .mul(float(1).sub(headlandScrub.mul(0.85)));
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
  const noiseTexture = terrainNoiseTexture();
  const rockTexel = triplanarColor(terrainTexture('rocks.webp'), 0.055);
  const n = normalWorld.abs();
  const rockNoiseA = textureNode(
    noiseTexture,
    vec2(
      positionWorld.x.mul(0.051).sub(positionWorld.z.mul(0.034)),
      positionWorld.x.mul(0.034).add(positionWorld.z.mul(0.051)),
    ),
  ) as AnyNode;
  const rockNoiseB = textureNode(
    noiseTexture,
    vec2(
      positionWorld.z.mul(0.12).sub(positionWorld.y.mul(0.041)),
      positionWorld.z.mul(0.041).add(positionWorld.y.mul(0.12)),
    ),
  ) as AnyNode;
  const horizontal = rockNoiseA.r.mul(0.58).add(rockNoiseA.g.mul(0.42));
  const verticalX = rockNoiseB.g.mul(0.62).add(rockNoiseB.b.mul(0.38));
  const verticalZ = rockNoiseB.a.mul(0.58).add(rockNoiseA.b.mul(0.42));
  const triNoise = horizontal
    .mul(n.y)
    .add(verticalX.mul(n.x))
    .add(verticalZ.mul(n.z))
    .div(n.x.add(n.y).add(n.z).max(0.001));
  const strataPhase = fract(y.div(7.8).add(rockNoiseA.a.sub(0.5).mul(0.08)));
  const strata = float(1).sub(
    smoothstep(
      float(0.045).sub(strataPhase.fwidth().mul(1.5)),
      float(0.045).add(strataPhase.fwidth().mul(1.5)),
      strataPhase,
    ),
  );
  const joints = pow(saturate(rockNoiseB.r.sub(0.64).mul(3.2)), 2.0);
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
