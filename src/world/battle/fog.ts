import { InstancedBufferAttribute, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  atan,
  color,
  float,
  instancedDynamicBufferAttribute,
  mix,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
} from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import { releaseInstanceAttributes } from '../../engine/instance-buffers';
import { releaseSpriteQuad, useSpriteQuad } from '../../engine/sprite-quad';
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
  /** density, size, seed (the layout gun smoke shares; see createPuffMaterial). */
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
    this.mesh = useSpriteQuad(new Sprite(createPuffMaterial(this.posAttr, this.dataAttr, true)));
    this.mesh.name = 'battle-fog';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** The battle's over: the quad and the puffs' buffers go (issue 262). Never drawn again. */
  release(): void {
    releaseSpriteQuad(this.mesh);
    releaseInstanceAttributes([this.posAttr, this.dataAttr]);
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
      data[i * 3] = d;
      data[i * 3 + 1] = this.size0[i]! * (0.8 + 0.2 * d) * (1 + 0.04 * Math.sin(t * 0.2 + s * 9));
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

/**
 * Battle puffs: the fog bank's (`fog` true) and the gun smoke's. One graph with both looks, picked by
 * a uniform, so the two sprite draws share one shader (PLAN §15.4). Per instance: `pos`, and `data`
 * = (fog: density / smoke: age, size, seed).
 */
export function createPuffMaterial(
  posAttr: InstancedBufferAttribute,
  dataAttr: InstancedBufferAttribute,
  fog: boolean,
): SpriteNodeMaterial {
  const mat = new SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const isFog = uniform(fog ? 1 : 0);
  const pos = instancedDynamicBufferAttribute(posAttr, 'vec3') as AnyNode;
  const data = instancedDynamicBufferAttribute(dataAttr, 'vec3') as AnyNode;
  const seed = data.z;
  mat.positionNode = pos;
  mat.scaleNode = data.y;
  mat.rotationNode = seed.mul(6.283).mul(float(1).sub(isFog));
  const p = (uv() as AnyNode).sub(0.5).mul(2);
  const r = p.length();

  // The fog bank: a dense core with a soft rim (where puffs overlap it's close to opaque), the very
  // bottom feathered (it's under the water line) so a hull inside the bank stays hidden.
  const lumps = sin(p.x.mul(4.1).add(seed.mul(23)))
    .mul(sin(p.y.mul(3.3).sub(seed.mul(11))))
    .mul(0.12);
  const fogBody = smoothstep(float(1.0).add(lumps), float(0.5), r);
  const foot = smoothstep(float(-0.98), float(-0.7), p.y);
  const fogOpacity = fogBody.mul(foot).mul(data.x).mul(0.96);
  // A sea fog reads as a pale wall on the horizon: whiter than the haze, sunlit on top, grey-blue below.
  const top = smoothstep(float(-0.6), float(0.9), p.y);
  const pale = mix(world.hazeColor, color(0xf2f4f7), 0.6);
  const haze = mix(pale.mul(0.8), pale.mul(1.04).add(world.sunColor.mul(0.14)), top);
  const fogColor = mix(haze, color(0x8b98a6).mul(0.6), world.night.mul(0.7));

  // Gun smoke: a cauliflower edge (a few lobes plus finer noise, so a puff never reads as a disc).
  // The first instant of each puff glows (the muzzle flash; dimmer and steady under reduced motion).
  const age = data.x;
  const ang = atan(p.y, p.x);
  const lobes = sin(ang.mul(5).add(seed.mul(31)))
    .mul(0.09)
    .add(sin(ang.mul(9).sub(seed.mul(17))).mul(0.05));
  const smokeBody = smoothstep(float(0.95).add(lobes), float(0.25), r);
  const grain = sin(p.x.mul(11).add(seed.mul(13)))
    .mul(sin(p.y.mul(9).sub(seed.mul(7))))
    .mul(0.12)
    .add(0.88);
  const smokeOpacity = smokeBody
    .mul(grain)
    .mul(pow(float(1).sub(age.min(1)), float(1.5)))
    .mul(0.55);
  const shade = smoothstep(float(-0.9), float(0.8), p.y.negate());
  const smokeShade = mix(color(0x9d978e), color(0xf2ece2), shade).mul(float(1).sub(world.night.mul(0.6)));
  const flash = smoothstep(float(0.05), float(0), age).mul(float(1).sub(world.reducedMotion.mul(0.7)));
  const smokeColor = mix(smokeShade, color(0xffc070).mul(3), flash.mul(smoothstep(float(0.8), float(0), r)));

  mat.opacityNode = mix(smokeOpacity, fogOpacity, isFog);
  mat.colorNode = mix(smokeColor, fogColor, isFog);
  return mat;
}
