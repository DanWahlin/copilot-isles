import { InstancedBufferAttribute, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import { color, float, instancedDynamicBufferAttribute, mix, sin, smoothstep, uv } from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import { world } from '../uniforms';

// TSL fluent typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * The fog bank raiders sail out of (battle-plan.md §3): a low wall of big soft puffs on an arc round
 * the spawn bearing. Ships inside it are veiled by it, so their sails "rise" out of the fog as they close.
 * One instanced sprite draw. It forms, holds while the raiders get under way, then thins away.
 */
export class FogBank {
  readonly mesh: Sprite;
  private readonly posAttr: InstancedBufferAttribute;
  /** size, alpha, seed. */
  private readonly dataAttr: InstancedBufferAttribute;
  private readonly bx: Float32Array;
  private readonly bz: Float32Array;
  private readonly by: Float32Array;
  private readonly size0: Float32Array;
  private readonly seed: Float32Array;
  private readonly count: number;
  private formedAt = -1e9;
  private thinAt = 1e9;
  private driftX = 0;
  private driftZ = 0;
  /** Where the bank is centred (for the camera and the lookout). */
  readonly centre = { x: 0, z: 0 };

  constructor(tier: TierSettings) {
    this.count = tier.tier === 'lite' ? 14 : tier.tier === 'low' ? 20 : 30;
    const n = this.count;
    this.bx = new Float32Array(n);
    this.bz = new Float32Array(n);
    this.by = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.posAttr = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.dataAttr = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.mesh = new Sprite(createFogMaterial(this.posAttr, this.dataAttr));
    this.mesh.name = 'battle-fog';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /**
   * Forms a bank in front of `range` m from (ox, oz), centred on `bearing` (radians, heading convention) and
   * `span` radians wide. `rand` places the puffs.
   */
  form(
    ox: number,
    oz: number,
    bearing: number,
    range: number,
    span: number,
    t: number,
    rand: () => number,
  ): void {
    this.centre.x = ox + Math.sin(bearing) * range;
    this.centre.z = oz + Math.cos(bearing) * range;
    for (let i = 0; i < this.count; i++) {
      const u = i / (this.count - 1) - 0.5;
      const a = bearing + u * span + (rand() - 0.5) * 0.08;
      // Two rows: a dense front wall and a taller, looser back. Every puff stays nearer than `range`
      // (the ships hidden in it), or a hull would block the puffs behind it and show as a dark outline.
      const back = i % 3 === 0;
      const r = range - (back ? 6 : 22) - rand() * 12;
      this.bx[i] = ox + Math.sin(a) * r;
      this.bz[i] = oz + Math.cos(a) * r;
      this.size0[i] = (back ? 70 : 52) + rand() * 26;
      // Low enough that each puff's foot is under the sea, so the bank is thickest at hull height.
      this.by[i] = this.size0[i]! * (back ? 0.2 : 0.14);
      this.seed[i] = rand();
    }
    this.formedAt = t;
    this.thinAt = 1e9;
    this.driftX = this.driftZ = 0;
    this.mesh.visible = true;
  }

  /** Starts the bank thinning away (over ~10 s). */
  thin(t: number): void {
    if (this.thinAt > t) this.thinAt = t;
  }

  clear(): void {
    this.formedAt = -1e9;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** 0…1: how thick the bank is now. */
  density(t: number): number {
    const grow = smooth01((t - this.formedAt) / 2.5);
    const fade = 1 - smooth01((t - this.thinAt) / 10);
    return grow * fade;
  }

  update(dt: number, t: number, windX: number, windZ: number): void {
    const d = this.density(t);
    if (d <= 0.001) {
      this.mesh.count = 0;
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.driftX += windX * 0.12 * dt;
    this.driftZ += windZ * 0.12 * dt;
    const pos = this.posAttr.array as Float32Array;
    const data = this.dataAttr.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i]!;
      const roll = Math.sin(t * 0.13 + s * 20) * 2.5;
      pos[i * 3] = this.bx[i]! + this.driftX + roll;
      pos[i * 3 + 1] = this.by[i]! * (0.85 + 0.15 * d);
      pos[i * 3 + 2] = this.bz[i]! + this.driftZ;
      data[i * 3] = this.size0[i]! * (0.8 + 0.2 * d) * (1 + 0.04 * Math.sin(t * 0.2 + s * 9));
      data[i * 3 + 1] = d;
      data[i * 3 + 2] = s;
    }
    this.mesh.count = this.count;
    this.posAttr.needsUpdate = true;
    this.dataAttr.needsUpdate = true;
  }
}

function smooth01(x: number): number {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

function createFogMaterial(
  posAttr: InstancedBufferAttribute,
  dataAttr: InstancedBufferAttribute,
): SpriteNodeMaterial {
  const mat = new SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const pos = instancedDynamicBufferAttribute(posAttr, 'vec3') as AnyNode;
  const data = instancedDynamicBufferAttribute(dataAttr, 'vec3') as AnyNode;
  const seed = data.z;
  mat.positionNode = pos;
  mat.scaleNode = data.x;
  const p = (uv() as AnyNode).sub(0.5).mul(2);
  const r = p.length();
  const lumps = sin(p.x.mul(4.1).add(seed.mul(23)))
    .mul(sin(p.y.mul(3.3).sub(seed.mul(11))))
    .mul(0.12);
  // A dense core with a soft rim: where puffs overlap, the bank is close to opaque.
  const body = smoothstep(float(1.0).add(lumps), float(0.5), r);
  // Feather only the very bottom (it's under the water line) so a hull inside the bank stays hidden.
  const foot = smoothstep(float(-0.98), float(-0.7), p.y);
  mat.opacityNode = body.mul(foot).mul(data.y).mul(0.96);
  // A sea fog reads as a pale wall on the horizon: whiter than the haze, sunlit on top, grey-blue below.
  const top = smoothstep(float(-0.6), float(0.9), p.y);
  const pale = mix(world.hazeColor, color(0xf2f4f7), 0.6);
  const haze = mix(pale.mul(0.8), pale.mul(1.04).add(world.sunColor.mul(0.14)), top);
  mat.colorNode = mix(haze, color(0x8b98a6).mul(0.6), world.night.mul(0.7));
  return mat;
}
