import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { abs, attribute, color, float, mix, positionLocal, pow, select, sin, smoothstep, uv, vec3 } from 'three/tsl';
import { world } from '../../uniforms';

// TSL fluent typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
const vec3Node = vec3 as unknown as (...args: AnyNode[]) => AnyNode;

export function createDolphinMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.56, metalness: 0, color: 0xffffff });
  const phase = attribute('leapPhase', 'float') as AnyNode;
  const amp = attribute('leapAmp', 'float') as AnyNode;
  const bend = sin(
    world.time
      .mul(6.0)
      .add(phase)
      .add((positionLocal as AnyNode).z.mul(7.0)),
  )
    .mul(amp)
    .mul(smoothstep(float(-0.2), float(-0.9), (positionLocal as AnyNode).z))
    .mul(float(1).sub(world.reducedMotion));
  material.positionNode = (positionLocal as AnyNode).add(vec3Node(bend.mul(0.05), bend.abs().mul(0.025), 0));
  const belly = smoothstep(float(-0.07), float(-0.2), (positionLocal as AnyNode).y);
  material.colorNode = mix(color(0x234657), color(0xd4d5c9), belly.mul(0.85));
  material.roughnessNode = float(0.62);
  return material;
}

export function createFlyingFishMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    side: DoubleSide,
    roughness: 0.5,
    metalness: 0,
    color: 0xffffff,
  });
  const part = attribute('leapPart', 'float') as AnyNode;
  const phase = attribute('leapPhase', 'float') as AnyNode;
  const amp = attribute('leapAmp', 'float') as AnyNode;
  const wing = smoothstep(float(0.5), float(1.5), part).mul(
    float(1).sub(smoothstep(float(1.5), float(2.5), part)),
  );
  const shimmer = sin(
    world.time
      .mul(18)
      .add(phase)
      .add((positionLocal as AnyNode).x.mul(7)),
  )
    .mul(0.5)
    .add(0.5);
  const flap = sin(world.time.mul(20).add(phase)).mul(amp).mul(wing).mul(float(1).sub(world.reducedMotion));
  material.positionNode = (positionLocal as AnyNode).add(
    vec3Node(0, flap.mul(abs((positionLocal as AnyNode).x)).mul(0.14), 0),
  );
  const body = mix(
    color(0x5c8e9d),
    color(0xe8f4ea),
    smoothstep(float(-0.02), float(-0.08), (positionLocal as AnyNode).y),
  );
  const fin = mix(color(0x79c9d9), color(0xf3fff9), shimmer.mul(0.65));
  material.colorNode = mix(body, fin, wing.mul(0.82));
  material.roughnessNode = mix(float(0.55), float(0.28), wing.mul(shimmer));
  return material;
}

export function createSplashMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    color: 0xffffff,
  });
  material.blending = AdditiveBlending;
  const alpha = attribute('splashAlpha', 'float') as AnyNode;
  const part = attribute('leapPart', 'float') as AnyNode;
  const coord = uv() as AnyNode;
  const d = coord.sub(0.5).length();
  const ring = smoothstep(float(0.34), float(0.24), d).mul(smoothstep(float(0.05), float(0.18), d));
  const spray = smoothstep(float(0.5), float(1.5), part).mul(0.55);
  const a = select(part.greaterThan(0.5), spray, ring);
  material.opacityNode = a.mul(alpha).mul(float(1).sub(world.night.mul(0.55)));
  material.colorNode = color(0xe9fbff).mul(pow(a.max(0.02), 0.35).add(0.45));
  return material;
}
