// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/wildlife/BirdBatch.js@d32799f
import { DoubleSide, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  float,
  greaterThan,
  mix,
  positionGeometry,
  positionLocal,
  select,
  sin,
  smoothstep,
  vec3,
} from 'three/tsl';
import { world } from '../../uniforms';

// three's TSL fluent node typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

export function createBirdMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.72, metalness: 0 });
  const part = attribute('birdPart', 'float') as AnyNode;
  const shade = attribute('shade', 'float') as AnyNode;
  const side = attribute('wingSide', 'float') as AnyNode;
  const phase = attribute('flapPhase', 'float') as AnyNode;
  const amp = attribute('flapAmp', 'float') as AnyNode;
  // rgb tint; w: 1 perched (wings folded back along the body), 0 flying. Packed into one buffer
  // because WebGPU allows only 8 vertex buffers per pipeline.
  const tintFold = attribute('birdTint', 'vec4') as AnyNode;
  const tint = tintFold.xyz;
  const fold = tintFold.w;
  const isWing = greaterThan(part, float(0.5)).and(part.lessThan(float(1.5))) as AnyNode;
  const isTail = greaterThan(part, float(1.5)).and(part.lessThan(float(2.5))) as AnyNode;
  const isBill = greaterThan(part, float(2.5));

  const wingGate = smoothstep(float(0.04), float(0.55), abs((positionGeometry as AnyNode).x));
  const flap = sin(world.time.mul(4.8).add(phase)).mul(amp).mul(wingGate).mul(abs(side));
  const reduced = float(1).sub(world.reducedMotion.mul(0.85));
  const p = positionLocal as AnyNode;
  // Folded: each wing lies along the flank, its tip swept back over the tail, and a little raised.
  const span = abs(p.x).sub(0.045).max(0);
  const folded = (vec3 as AnyNode)(
    side.mul(span.mul(0.06).add(0.055)),
    p.y.add(span.mul(0.05)).add(0.01),
    p.z.sub(span.mul(0.62)).add(0.02),
  );
  const wingFold = fold.mul(abs(side));
  const rest = mix(p, folded, wingFold);
  material.positionNode = rest.add(
    (vec3 as AnyNode)(0, flap.mul(reduced).mul(0.42), flap.mul(side).mul(-0.08)).mul(float(1).sub(fold)),
  );

  const white = color(0xf1f1ea).mul(shade);
  const mantle = mix(color(0x6f7474), color(0xd7d8d0), shade.mul(0.45));
  const body = mix(white, tint, smoothstep(float(0.55), float(0.95), shade).mul(0.35));
  const wing = mix(color(0x2e3336), mantle, shade.mul(0.85));
  const tail = mix(color(0x303437), color(0xeff0e8), shade.mul(0.45));
  const bill = color(0xd08a28);
  material.colorNode = select(isBill, bill, select(isWing, wing, select(isTail, tail, body))) as AnyNode;
  material.roughnessNode = select(isWing, float(0.58), float(0.76)) as AnyNode;
  return material;
}
