import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  dot,
  exp,
  float,
  fract,
  max,
  mix,
  positionLocal,
  select,
  sin,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import { FADE_DISTANCE, wavesForTier } from '../ocean/waves';
import { world } from '../uniforms';
import { ARC_HALF_ANGLE, MAX_RANGE, MIN_RANGE } from './gunnery';

// TSL fluent typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

export const ARC_FIRING = 0;
export const ARC_WARNING = 1;

/**
 * A battery's arc on the water, centred on the ship with the beam along local +x (mirror x for
 * starboard). `arcR` runs 0 → 1 from MIN_RANGE to MAX_RANGE and `arcA` −1 → 1 from quarter to bow.
 */
function createFanGeometry(radial = 18, angular = 22): BufferGeometry {
  const pos: number[] = [];
  const r01: number[] = [];
  const a11: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= radial; i++) {
    const u = i / radial;
    const r = MIN_RANGE + (MAX_RANGE - MIN_RANGE) * u;
    for (let j = 0; j <= angular; j++) {
      const v = j / angular;
      const a = (v * 2 - 1) * ARC_HALF_ANGLE;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      r01.push(u);
      a11.push(v * 2 - 1);
    }
  }
  const row = angular + 1;
  for (let i = 0; i < radial; i++) {
    for (let j = 0; j < angular; j++) {
      const a = i * row + j;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('arcR', new Float32BufferAttribute(r01, 1));
  g.setAttribute('arcA', new Float32BufferAttribute(a11, 1));
  g.setIndex(index);
  return g;
}

function createArcMaterial(tier: TierSettings): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  const p = positionLocal as AnyNode;
  // Ride the swell: the rest height of the same wave table the ocean and the CPU use.
  const rest = p.xz;
  const fade = exp(rest.sub(world.focus).length().negate().div(FADE_DISTANCE));
  let h: AnyNode = float(0);
  for (const W of wavesForTier(tier.waves))
    h = h.add(sin(dot(rest, vec2(W.dx, W.dz)).mul(W.k).sub(world.time.mul(W.w)).add(W.ph)).mul(W.a));
  mat.positionNode = vec3(p.x, h.mul(fade).add(0.3), p.z);

  const r = attribute('arcR', 'float') as AnyNode;
  const a = attribute('arcA', 'float') as AnyNode;
  const fill = attribute('arcFill', 'float') as AnyNode;
  const kind = attribute('arcKind', 'float') as AnyNode;
  const glow = attribute('arcGlow', 'float') as AnyNode;
  const still = float(1).sub(world.reducedMotion);

  // Thin outline: the two edges, the inner rim and a fading outer rim (widths in metres-ish, not uv).
  const side = smoothstep(float(0.975), float(0.997), abs(a));
  const inner = smoothstep(float(0.02), float(0.0), r);
  const outer = smoothstep(float(0.975), float(0.995), r).mul(0.5);
  const line = max(max(side, inner), outer);
  const farFade = smoothstep(float(1.0), float(0.5), r);

  // Firing arc: barely there until it bears, then a gold outline and a slow glow sweeping out.
  const sweep = fract(r.mul(2.2).sub(world.time.mul(0.45).mul(still)));
  const shimmer = smoothstep(float(0.0), float(0.12), sweep).mul(smoothstep(float(0.35), float(0.12), sweep));
  const firingA = line
    .mul(mix(float(0.14), float(0.65), glow))
    .add(glow.mul(0.025))
    .add(shimmer.mul(glow).mul(0.1))
    .mul(farFade);

  // Warning arc: thin red-orange chevrons pointing at you, filling outward from their side as they lay guns.
  const chevron = fract(r.mul(26).sub(abs(a).mul(2.2)).sub(world.time.mul(1.5).mul(still)));
  const stripes = smoothstep(float(0.0), float(0.08), chevron).mul(
    smoothstep(float(0.3), float(0.2), chevron),
  );
  const reached = smoothstep(fill.add(0.015), fill.sub(0.015), r);
  const band = smoothstep(float(0.8), float(0.45), abs(a));
  const front = smoothstep(fill.sub(0.06), fill, r).mul(reached);
  const warningA = line
    .mul(0.7)
    .add(stripes.mul(band).mul(0.32))
    .add(front.mul(0.35))
    .add(0.025)
    .mul(reached)
    .mul(farFade.mul(0.5).add(0.5));

  const isWarning = kind.greaterThan(0.5);
  mat.opacityNode = select(isWarning, warningA, firingA);
  mat.colorNode = select(
    isWarning,
    mix(color(0xff4d1f), color(0xffb36b), front),
    mix(color(0xd9b16a), color(0xffe2a1), glow),
  );
  return mat;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpP = new Vector3();
const tmpS = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Every arc in one draw: your two batteries and the raiders' warnings. */
export class ArcSet {
  readonly mesh: InstancedMesh;
  private readonly fill: InstancedBufferAttribute;
  private readonly kind: InstancedBufferAttribute;
  private readonly glow: InstancedBufferAttribute;
  private n = 0;
  readonly size: number;

  constructor(tier: TierSettings, size = 8) {
    this.size = size;
    const g = createFanGeometry(tier.tier === 'lite' || tier.tier === 'low' ? 10 : 18, 22);
    this.fill = new InstancedBufferAttribute(new Float32Array(size), 1);
    this.kind = new InstancedBufferAttribute(new Float32Array(size), 1);
    this.glow = new InstancedBufferAttribute(new Float32Array(size), 1);
    g.setAttribute('arcFill', this.fill);
    g.setAttribute('arcKind', this.kind);
    g.setAttribute('arcGlow', this.glow);
    this.mesh = new InstancedMesh(g, createArcMaterial(tier), size);
    this.mesh.name = 'battle-arcs';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  begin(): void {
    this.n = 0;
  }

  /** Adds one arc for the battery on `side` of a ship at (x, z) on `heading`. */
  add(x: number, z: number, heading: number, side: number, kind: number, fill: number, glow: number): void {
    if (this.n >= this.size) return;
    tmpQ.setFromAxisAngle(UP, heading);
    tmpM.compose(tmpP.set(x, 0, z), tmpQ, tmpS.set(side, 1, 1));
    this.mesh.setMatrixAt(this.n, tmpM);
    this.fill.setX(this.n, fill);
    this.kind.setX(this.n, kind);
    this.glow.setX(this.n, glow);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fill.needsUpdate = true;
    this.kind.needsUpdate = true;
    this.glow.needsUpdate = true;
  }
}
