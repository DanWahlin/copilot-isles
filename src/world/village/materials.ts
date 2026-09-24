import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { abs, attribute, color, float, fract, mix, positionWorld, sin, smoothstep } from 'three/tsl';
import { world } from '../uniforms';

// three's fluent TSL node typings do not cover every scalar/vector mix used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

function tint(): AnyNode {
  return attribute('color', 'vec3') as AnyNode;
}

function lowWorldDirt(strength = 1): AnyNode {
  const villageBase = float(1).sub(smoothstep(float(3.35), float(5.8), (positionWorld as AnyNode).y));
  const quayBase = float(1).sub(smoothstep(float(0.2), float(2.15), (positionWorld as AnyNode).y));
  return villageBase.max(quayBase).mul(strength * 0.58);
}

export function createStoneMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.97, metalness: 0, vertexColors: true });
  const p = positionWorld as AnyNode;
  const jointX = abs(sin(p.x.mul(18.5).add(p.z.mul(0.7)))).smoothstep(float(0.91), float(0.996));
  const jointZ = abs(sin(p.z.mul(17.5).add(p.x.mul(0.6)))).smoothstep(float(0.91), float(0.996));
  const jointY = abs(sin(p.y.mul(10.5).add(p.x.mul(0.35)))).smoothstep(float(0.94), float(0.998));
  const stoneHash = sin(p.x.mul(8.17).add(p.z.mul(9.41)).add(p.y.mul(3.3)))
    .mul(0.5)
    .add(0.5);
  const mortar = jointX.max(jointZ).max(jointY.mul(0.55)).mul(0.58);
  const algae = float(1)
    .sub(smoothstep(float(-0.08), float(1.25), p.y))
    .mul(0.28);
  const base = tint()
    .mul(float(0.9).add(stoneHash.mul(0.18)))
    .mul(float(1).sub(mortar.mul(0.18)));
  material.colorNode = mix(base.mul(color(0xfff0cc)), color(0x756b53), algae.mul(0.12)).mul(
    float(1).sub(lowWorldDirt(0.04)),
  );
  material.roughnessNode = float(0.96).add(algae.mul(0.02));
  material.aoNode = float(1).sub(lowWorldDirt(0.08));
  return material;
}

export function createPlasterMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.86, metalness: 0, vertexColors: true });
  const p = positionWorld as AnyNode;
  const wash = sin(p.x.mul(2.1).add(p.z.mul(1.7)).add(p.y.mul(5.6)))
    .mul(0.5)
    .add(0.5);
  const peel = sin(p.x.mul(7.7).add(p.z.mul(4.2)).add(p.y.mul(2.9)))
    .mul(0.5)
    .add(0.5)
    .smoothstep(float(0.76), float(0.96));
  const grime = lowWorldDirt(0.38);
  const sunBleach = fract(p.x.mul(0.037).add(p.z.mul(0.043)))
    .smoothstep(float(0.36), float(0.92))
    .mul(0.16);
  material.colorNode = tint()
    .mul(float(0.92).add(wash.mul(0.12)).add(sunBleach))
    .sub(color(0x5d4934).mul(peel.mul(0.11).add(grime.mul(0.55))));
  material.roughnessNode = float(0.84).add(peel.mul(0.08));
  material.aoNode = float(1).sub(grime.mul(0.55));
  return material;
}

export function createRoofTileMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0, vertexColors: true });
  const p = positionWorld as AnyNode;
  const rows = abs(sin(p.z.mul(7.6).add(p.x.mul(0.45)))).smoothstep(float(0.82), float(0.995));
  const tileBreakup = sin(p.x.mul(5.6).add(p.z.mul(9.4)).add(p.y.mul(1.3)))
    .mul(0.5)
    .add(0.5);
  const moss = float(1)
    .sub(smoothstep(float(4.2), float(9.8), p.y))
    .mul(
      sin(p.x.mul(0.9).add(p.z.mul(1.1)))
        .mul(0.5)
        .add(0.5)
        .smoothstep(float(0.72), float(0.95)),
    );
  material.colorNode = tint()
    .mul(float(0.78).add(tileBreakup.mul(0.28)))
    .mul(float(1).sub(rows.mul(0.15)))
    .add(color(0x2f5a32).mul(moss.mul(0.16)));
  material.roughnessNode = float(0.78).add(rows.mul(0.08));
  return material;
}

export function createThatchMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.94, metalness: 0, vertexColors: true });
  const p = positionWorld as AnyNode;
  const straw = sin(p.x.mul(18).add(p.z.mul(10.5)))
    .mul(0.5)
    .add(0.5);
  const bands = abs(sin(p.z.mul(3.2).add(p.y.mul(0.4)))).smoothstep(float(0.9), float(1));
  material.colorNode = tint()
    .mul(float(0.78).add(straw.mul(0.28)))
    .mul(float(1).sub(bands.mul(0.12)));
  material.roughnessNode = float(0.95);
  return material;
}

export function createWoodMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    roughness: 0.76,
    metalness: 0,
    vertexColors: true,
    side: DoubleSide,
  });
  const p = positionWorld as AnyNode;
  const grain = sin(p.x.mul(13.0).add(p.z.mul(6.4)).add(p.y.mul(3.1)))
    .mul(0.5)
    .add(0.5);
  const planks = abs(sin(p.x.mul(2.6).add(p.z.mul(2.2)))).smoothstep(float(0.93), float(0.995));
  const wet = float(1).sub(smoothstep(float(-0.12), float(1.35), p.y));
  material.colorNode = tint()
    .mul(float(0.86).add(grain.mul(0.18)))
    .mul(float(1).sub(planks.mul(0.09)))
    .add(color(0x254130).mul(wet.mul(0.18)));
  material.roughnessNode = float(0.78).sub(wet.mul(0.08));
  material.aoNode = float(1).sub(lowWorldDirt(0.08));
  return material;
}

export function createClothMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
    side: DoubleSide,
  });
  const p = positionWorld as AnyNode;
  const weave = sin(p.x.mul(24))
    .mul(sin(p.z.mul(21)))
    .mul(0.5)
    .add(0.5);
  material.colorNode = tint().mul(float(0.78).add(weave.mul(0.22)));
  material.roughnessNode = float(0.93);
  return material;
}

export function createMetalMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.48, metalness: 0.74, vertexColors: true });
  const p = positionWorld as AnyNode;
  const tarnish = sin(p.x.mul(8.1).add(p.z.mul(5.3)))
    .mul(0.5)
    .add(0.5);
  material.colorNode = tint().mul(float(0.7).add(tarnish.mul(0.18)));
  material.roughnessNode = float(0.46).add(tarnish.mul(0.16));
  return material;
}

export function createRopeMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0, vertexColors: true });
  const p = positionWorld as AnyNode;
  const twist = abs(sin(p.x.mul(20).add(p.z.mul(20)).add(p.y.mul(16)))).mul(0.22);
  material.colorNode = tint().mul(float(0.78).add(twist));
  material.roughnessNode = float(0.94);
  return material;
}

export function createGlowMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, opacity: 0.95, vertexColors: true });
  const flicker = sin(world.time.mul(5.0).add((positionWorld as AnyNode).x.mul(0.77)))
    .mul(0.08)
    .add(0.92);
  const night = world.night.mul(flicker);
  material.colorNode = mix(tint().mul(0.18), color(0xffb35c), night) as AnyNode;
  return material;
}

export function createHaloMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.colorNode = color(0xffb66a).mul(world.night.mul(0.8)) as AnyNode;
  return material;
}
