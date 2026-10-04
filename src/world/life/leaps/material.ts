import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  atan,
  attribute,
  clamp,
  color,
  dot,
  float,
  floor,
  fract,
  mix,
  positionLocal,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
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

/**
 * The splash (see createSplashGeometry). Per instance: `splashAge` 0..1 over its life, `splashSeed`
 * (shape variety) and `splashKind` (0 a dolphin breaking the surface, 1 diving back in, with a plume).
 * Sheets shoot up and collapse on a ballistic curve and break into droplets from the top down; the
 * foam spreads a little and fades last, with a ragged edge and holes, so nothing reads as a ring.
 */
export function createSplashMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    color: 0xffffff,
  });
  material.blending = AdditiveBlending;
  const age = attribute('splashAge', 'float') as AnyNode;
  const seed = attribute('splashSeed', 'float') as AnyNode;
  const kind = attribute('splashKind', 'float') as AnyNode;
  const part = attribute('leapPart', 'float') as AnyNode;
  const rand = attribute('sheetRand', 'float') as AnyNode;
  const coord = uv() as AnyNode;
  const p = positionLocal as AnyNode;

  const isFoam = part.lessThan(0.5);
  const isPlume = part.greaterThan(1.5);
  // Rise and fall: up fast, then down; each sheet on its own timing.
  const t = clamp(age.mul(rand.mul(0.5).add(1.1)), 0, 1);
  const rise = clamp(t.mul(float(1).sub(t)).mul(4.6), 0, 1);
  const plumeRise = clamp(age.mul(float(1).sub(age)).mul(5.2), 0, 1).mul(kind);
  const spread = age.mul(0.55).add(0.75);
  const foamSpread = sqrt(age).mul(0.7).add(0.55);
  const horiz = select(isFoam, foamSpread, select(isPlume, age.mul(0.4).add(1), spread));
  const lift = select(isFoam, float(1), select(isPlume, plumeRise, rise));
  material.positionNode = vec3(p.x.mul(horiz), p.y.mul(lift), p.z.mul(horiz));

  // Spray cards: soft side edges, feathered top, breaking into droplets from the top as it ages.
  const edge = smoothstep(float(0), float(0.28), coord.x).mul(smoothstep(float(1), float(0.72), coord.x));
  const top = smoothstep(float(1), float(0.6), coord.y);
  const cells = coord.mul(vec2(6, 11));
  const cell = floor(cells) as AnyNode;
  const n = fract(
    sin(dot(cell, vec2(12.9898, 78.233)).add(seed.mul(43.1)).add(rand.mul(17.3))).mul(43758.5453),
  );
  const drop = smoothstep(float(0.42), float(0.22), fract(cells).sub(0.5).length()).mul(step(float(0.38), n));
  const sheet = smoothstep(float(0.85), float(0.3), coord.y.add(age.mul(0.75)));
  const sprayFade = pow(float(1).sub(age), float(1.3));
  const spray = edge
    .mul(top)
    .mul(mix(drop, float(1), sheet))
    .mul(sprayFade)
    .mul(select(isPlume, kind.mul(0.75), float(0.85)));

  // Foam: a filled, lacy patch with a wobbling edge that opens a little as it spreads.
  const c = coord.sub(0.5).mul(2);
  const r = c.length();
  const ang = atan(c.y, c.x);
  const rim = sin(ang.mul(5).add(seed.mul(20)))
    .mul(0.11)
    .add(sin(ang.mul(11).add(seed.mul(7))).mul(0.07))
    .add(0.78);
  const patch = smoothstep(rim, rim.sub(0.22), r);
  const lace = sin(c.x.mul(23).add(seed.mul(9)))
    .mul(sin(c.y.mul(19).sub(seed.mul(5))))
    .mul(0.5)
    .add(0.5);
  const open = smoothstep(age.mul(0.45).add(0.05), age.mul(0.45).add(0.3), r.add(lace.mul(0.15)));
  const foam = patch
    .mul(mix(float(1), smoothstep(float(0.2), float(0.7), lace), 0.55))
    .mul(mix(float(1), open, age))
    .mul(pow(float(1).sub(age), float(1.6)))
    .mul(0.5);

  const a = select(isFoam, foam, spray);
  material.opacityNode = a.mul(float(1).sub(world.night.mul(0.55)));
  material.colorNode = mix(color(0xd6eef7), color(0xf2fcff), select(isFoam, float(0), float(1))).mul(
    pow(a.max(0.02), 0.35).add(0.45),
  );
  return material;
}
