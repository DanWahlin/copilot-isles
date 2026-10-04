import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteNodeMaterial,
  Vector3,
} from 'three/webgpu';
import {
  atan,
  color,
  float,
  instancedDynamicBufferAttribute,
  mix,
  pow,
  sin,
  smoothstep,
  uv,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TierSettings } from '../../engine/quality';
import type { WaveSampler } from '../contracts';
import { createSplashGeometry } from '../life/leaps/geometry';
import { createSplashMaterial } from '../life/leaps/material';
import { world } from '../uniforms';

// TSL fluent typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** Pool sizes per tier (docs/specs/BATTLES.md §9). */
export interface FxBudget {
  balls: number;
  splashes: number;
  smoke: number;
  splinters: number;
  stores: number;
  boats: number;
}

export function fxBudget(tier: TierSettings): FxBudget {
  switch (tier.tier) {
    case 'lite':
      return { balls: 32, splashes: 24, smoke: 0, splinters: 0, stores: 12, boats: 2 };
    case 'low':
      return { balls: 40, splashes: 32, smoke: 36, splinters: 32, stores: 16, boats: 3 };
    case 'medium':
      return { balls: 64, splashes: 48, smoke: 72, splinters: 64, stores: 24, boats: 4 };
    default:
      return { balls: 64, splashes: 64, smoke: 72, splinters: 96, stores: 24, boats: 4 };
  }
}

const GRAVITY = 9.81;
const BALL_RADIUS = 0.2;
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler(0, 0, 0, 'YXZ');
const tmpP = new Vector3();
const tmpS = new Vector3();

function pooled(mesh: InstancedMesh, name: string): InstancedMesh {
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

/** Cannonballs in flight: struct-of-arrays, no objects per ball. */
export class BallPool {
  readonly mesh: InstancedMesh;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  /** Index of the combatant that fired it (−1 = free). */
  readonly owner: Int16Array;
  readonly damage: Float32Array;
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.x = new Float32Array(size);
    this.y = new Float32Array(size);
    this.z = new Float32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
    this.vz = new Float32Array(size);
    this.age = new Float32Array(size);
    this.owner = new Int16Array(size).fill(-1);
    this.damage = new Float32Array(size);
    const mat = new MeshStandardNodeMaterial({ color: 0x1b1a19, roughness: 0.42, metalness: 0.65 });
    this.mesh = pooled(new InstancedMesh(new SphereGeometry(BALL_RADIUS, 10, 6), mat, size), 'battle-balls');
  }

  spawn(
    owner: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    damage: number,
  ): number {
    for (let i = 0; i < this.size; i++) {
      if (this.owner[i] !== -1) continue;
      this.owner[i] = owner;
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      this.age[i] = 0;
      this.damage[i] = damage;
      return i;
    }
    return -1;
  }

  free(i: number): void {
    this.owner[i] = -1;
  }

  /** Moves every ball one sub-step (semi-implicit Euler, the same as the gunners' sums assume). */
  step(h: number): void {
    for (let i = 0; i < this.size; i++) {
      if (this.owner[i] === -1) continue;
      this.vy[i] -= GRAVITY * h;
      this.x[i] += this.vx[i]! * h;
      this.y[i] += this.vy[i]! * h;
      this.z[i] += this.vz[i]! * h;
      this.age[i] += h;
    }
  }

  sync(): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      if (this.owner[i] === -1) continue;
      tmpM.makeTranslation(this.x[i]!, this.y[i]!, this.z[i]!);
      this.mesh.setMatrixAt(n++, tmpM);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.owner.fill(-1);
    this.mesh.count = 0;
  }
}

/** Splashes: the Leaps crown and plume (src/world/life/leaps), in a battle-owned ring buffer. */
export class SplashPool {
  readonly mesh: InstancedMesh;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly start: Float32Array;
  private readonly duration: Float32Array;
  private readonly scale: Float32Array;
  private readonly seed: Float32Array;
  private readonly kind: Float32Array;
  private readonly ageAttr: InstancedBufferAttribute;
  private readonly seedAttr: InstancedBufferAttribute;
  private readonly kindAttr: InstancedBufferAttribute;
  private next = 0;
  readonly size: number;

  constructor(size: number) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.start = new Float32Array(n).fill(-1e9);
    this.duration = new Float32Array(n).fill(1);
    this.scale = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.kind = new Float32Array(n);
    const geometry = createSplashGeometry();
    this.ageAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
    this.seedAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
    this.kindAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
    geometry.setAttribute('splashAge', this.ageAttr);
    geometry.setAttribute('splashSeed', this.seedAttr);
    geometry.setAttribute('splashKind', this.kindAttr);
    this.mesh = pooled(new InstancedMesh(geometry, createSplashMaterial(), n), 'battle-splashes');
  }

  /** `kind` 1 adds the tall plume (a ball going in); 0 is a low crown (a near miss skipping). */
  spawn(x: number, y: number, z: number, t: number, scale: number, kind: number, seed: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.size;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.start[i] = t;
    this.duration[i] = kind ? 1.9 : 1.4;
    this.scale[i] = scale;
    this.seed[i] = seed;
    this.kind[i] = kind;
  }

  sync(t: number): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      const age = (t - this.start[i]!) / this.duration[i]!;
      if (age < 0 || age > 1) continue;
      const s = this.scale[i]!;
      tmpE.set(0, this.seed[i]! * Math.PI * 2, 0, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(this.x[i]!, this.y[i]!, this.z[i]!), tmpQ, tmpS.set(s, s * 1.25, s));
      this.mesh.setMatrixAt(n, tmpM);
      this.ageAttr.setX(n, age);
      this.seedAttr.setX(n, this.seed[i]!);
      this.kindAttr.setX(n, this.kind[i]!);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
    this.seedAttr.needsUpdate = true;
    this.kindAttr.needsUpdate = true;
  }

  clear(): void {
    this.start.fill(-1e9);
    this.mesh.count = 0;
  }
}

/**
 * Gun smoke: soft, camera-facing puffs that billow out of the muzzle, slow, drift downwind and thin
 * away. One instanced sprite draw. The first instant of each puff glows (the muzzle flash; dimmer and
 * steady under reduced motion).
 */
export class SmokePool {
  readonly mesh: Sprite;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly start: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly posAttr: InstancedBufferAttribute;
  /** age, size, seed per drawn puff. */
  private readonly dataAttr: InstancedBufferAttribute;
  private next = 0;
  readonly size: number;

  constructor(size: number) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.start = new Float32Array(n).fill(-1e9);
    this.life = new Float32Array(n).fill(1);
    this.size0 = new Float32Array(n);
    this.posAttr = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.dataAttr = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.mesh = new Sprite(createSmokeMaterial(this.posAttr, this.dataAttr));
    this.mesh.name = 'battle-smoke';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    t: number,
    life: number,
    size: number,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % this.size;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.start[i] = t;
    this.life[i] = life;
    this.size0[i] = size;
  }

  update(dt: number, t: number, windX: number, windZ: number): void {
    const drag = Math.exp(-2.6 * dt);
    const pos = this.posAttr.array as Float32Array;
    const data = this.dataAttr.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      const age = (t - this.start[i]!) / this.life[i]!;
      if (age < 0 || age > 1) continue;
      this.vx[i] = this.vx[i]! * drag + windX * 0.35 * (1 - drag);
      this.vy[i] = this.vy[i]! * drag + 0.5 * (1 - drag);
      this.vz[i] = this.vz[i]! * drag + windZ * 0.35 * (1 - drag);
      this.x[i] += this.vx[i]! * dt;
      this.y[i] += this.vy[i]! * dt;
      this.z[i] += this.vz[i]! * dt;
      pos[n * 3] = this.x[i]!;
      pos[n * 3 + 1] = this.y[i]!;
      pos[n * 3 + 2] = this.z[i]!;
      data[n * 3] = age;
      data[n * 3 + 1] = this.size0[i]! * (0.9 + 3.2 * Math.sqrt(age));
      data[n * 3 + 2] = (i * 0.618) % 1;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.posAttr.needsUpdate = true;
    this.dataAttr.needsUpdate = true;
  }

  clear(): void {
    this.start.fill(-1e9);
    this.mesh.count = 0;
  }
}

function createSmokeMaterial(
  posAttr: InstancedBufferAttribute,
  dataAttr: InstancedBufferAttribute,
): SpriteNodeMaterial {
  const mat = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const pos = instancedDynamicBufferAttribute(posAttr, 'vec3') as AnyNode;
  const data = instancedDynamicBufferAttribute(dataAttr, 'vec3') as AnyNode;
  const age = data.x;
  const seed = data.z;
  mat.positionNode = pos;
  mat.scaleNode = data.y;
  mat.rotationNode = seed.mul(6.283);
  const c = (uv() as AnyNode).sub(0.5).mul(2);
  const r = c.length();
  // A cauliflower edge: a few lobes plus finer noise, so a puff never reads as a disc.
  const ang = atan(c.y, c.x);
  const lobes = sin(ang.mul(5).add(seed.mul(31)))
    .mul(0.09)
    .add(sin(ang.mul(9).sub(seed.mul(17))).mul(0.05));
  const body = smoothstep(float(0.95).add(lobes), float(0.25), r);
  const grain = sin(c.x.mul(11).add(seed.mul(13)))
    .mul(sin(c.y.mul(9).sub(seed.mul(7))))
    .mul(0.12)
    .add(0.88);
  mat.opacityNode = body
    .mul(grain)
    .mul(pow(float(1).sub(age), float(1.5)))
    .mul(0.55);
  const shade = smoothstep(float(-0.9), float(0.8), c.y.negate());
  const smokeColor = mix(color(0x9d978e), color(0xf2ece2), shade).mul(float(1).sub(world.night.mul(0.6)));
  const flash = smoothstep(float(0.05), float(0), age).mul(float(1).sub(world.reducedMotion.mul(0.7)));
  mat.colorNode = mix(smokeColor, color(0xffc070).mul(3), flash.mul(smoothstep(float(0.8), float(0), r)));
  return mat;
}

/** Wood splinters thrown from a hit: tumbling chips on ballistic paths that drop into the sea. */
export class SplinterPool {
  readonly mesh: InstancedMesh;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly spin: Float32Array;
  private readonly live: Uint8Array;
  private next = 0;
  readonly size: number;

  constructor(size: number) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.live = new Uint8Array(n);
    const mat = new MeshStandardNodeMaterial({ color: 0x8a6440, roughness: 0.9, metalness: 0 });
    this.mesh = pooled(new InstancedMesh(new BoxGeometry(0.07, 0.04, 0.38), mat, n), 'battle-splinters');
  }

  burst(x: number, y: number, z: number, nx: number, nz: number, count: number, rand: () => number): void {
    if (this.size <= 1) return;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.size;
      const s = 4 + rand() * 6;
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.vx[i] = nx * s + (rand() - 0.5) * 5;
      this.vy[i] = 3 + rand() * 6;
      this.vz[i] = nz * s + (rand() - 0.5) * 5;
      this.spin[i] = (rand() - 0.5) * 30;
      this.live[i] = 1;
    }
  }

  update(dt: number, t: number, waves: WaveSampler): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      if (!this.live[i]) continue;
      this.vy[i] -= GRAVITY * dt;
      this.x[i] += this.vx[i]! * dt;
      this.y[i] += this.vy[i]! * dt;
      this.z[i] += this.vz[i]! * dt;
      if (this.y[i]! < waves.heightAt(this.x[i]!, this.z[i]!, t) - 0.3) {
        this.live[i] = 0;
        continue;
      }
      const a = t * this.spin[i]!;
      tmpE.set(a, a * 0.7 + i, a * 0.3, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(this.x[i]!, this.y[i]!, this.z[i]!), tmpQ, tmpS.set(1, 1, 1));
      this.mesh.setMatrixAt(n++, tmpM);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.live.fill(0);
    this.mesh.count = 0;
  }
}

/** Ship's stores left by a wreck: barrels that bob on the swell until you sail through them. */
export class StorePool {
  readonly mesh: InstancedMesh;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly kind: Uint8Array;
  readonly expires: Float32Array;
  /** 0 free, 1 afloat. */
  readonly live: Uint8Array;
  readonly size: number;

  constructor(size: number) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.expires = new Float32Array(n);
    this.live = new Uint8Array(n);
    this.mesh = pooled(
      new InstancedMesh(createBarrelGeometry(), createVertexColorMaterial(), n),
      'battle-stores',
    );
  }

  spawn(x: number, z: number, kind: number, expires: number): void {
    for (let i = 0; i < this.size; i++) {
      if (this.live[i]) continue;
      this.x[i] = x;
      this.z[i] = z;
      this.kind[i] = kind;
      this.expires[i] = expires;
      this.live[i] = 1;
      return;
    }
  }

  update(t: number, waves: WaveSampler): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      if (!this.live[i]) continue;
      if (t > this.expires[i]!) {
        this.live[i] = 0;
        continue;
      }
      const y = waves.heightAt(this.x[i]!, this.z[i]!, t);
      // Sinks out of sight over its last two seconds.
      const sink = Math.max(0, 2 - (this.expires[i]! - t)) * 0.45;
      tmpE.set(Math.PI / 2 + Math.sin(t * 1.3 + i) * 0.25, i * 1.7, Math.sin(t * 0.9 + i * 2) * 0.2, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      const s = this.kind[i] ? 1.15 : 1;
      tmpM.compose(tmpP.set(this.x[i]!, y + 0.05 - sink, this.z[i]!), tmpQ, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(n++, tmpM);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.live.fill(0);
    this.mesh.count = 0;
  }
}

/** A struck raider's crew rowing for the fog: little boats with a stroke rhythm. */
export class BoatPool {
  readonly mesh: InstancedMesh;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
  readonly start: Float32Array;
  readonly live: Uint8Array;
  readonly size: number;

  constructor(size: number) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.start = new Float32Array(n);
    this.live = new Uint8Array(n);
    this.mesh = pooled(
      new InstancedMesh(createRowboatGeometry(), createVertexColorMaterial(), n),
      'battle-boats',
    );
  }

  spawn(x: number, z: number, heading: number, t: number): void {
    for (let i = 0; i < this.size; i++) {
      if (this.live[i]) continue;
      this.x[i] = x;
      this.z[i] = z;
      this.heading[i] = heading;
      this.start[i] = t;
      this.live[i] = 1;
      return;
    }
  }

  update(dt: number, t: number, waves: WaveSampler): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      if (!this.live[i]) continue;
      const age = t - this.start[i]!;
      if (age > 40) {
        this.live[i] = 0;
        continue;
      }
      // A stroke every 1.6 s: a surge, then a glide.
      const stroke = (age % 1.6) / 1.6;
      const speed = 0.6 + 1.8 * Math.exp(-stroke * 5);
      const h = this.heading[i]!;
      this.x[i] += Math.sin(h) * speed * dt;
      this.z[i] += Math.cos(h) * speed * dt;
      const y = waves.heightAt(this.x[i]!, this.z[i]!, t);
      tmpE.set(Math.sin(t * 1.7 + i) * 0.06 - (1 - stroke) * 0.04, h, Math.sin(t * 1.3 + i) * 0.07, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(this.x[i]!, y, this.z[i]!), tmpQ, tmpS.set(1, 1, 1));
      this.mesh.setMatrixAt(n++, tmpM);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.live.fill(0);
    this.mesh.count = 0;
  }
}

function createVertexColorMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
  });
  return mat;
}

function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    data[i * 3] = c.r;
    data[i * 3 + 1] = c.g;
    data[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(data, 3));
  g.deleteAttribute('uv');
  return g;
}

/** A barrel lying on its side (its axis along local y, turned flat by the instance). */
function createBarrelGeometry(): BufferGeometry {
  const body = new CylinderGeometry(0.42, 0.42, 1.0, 12, 4);
  const pos = body.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const bulge = 1 + 0.16 * (1 - (y / 0.5) ** 2);
    pos.setX(i, pos.getX(i) * bulge);
    pos.setZ(i, pos.getZ(i) * bulge);
  }
  body.computeVertexNormals();
  const hoopA = new CylinderGeometry(0.47, 0.47, 0.07, 12, 1, true).translate(0, 0.3, 0);
  const hoopB = new CylinderGeometry(0.47, 0.47, 0.07, 12, 1, true).translate(0, -0.3, 0);
  return mergeGeometries([paint(body, 0x8b6038), paint(hoopA, 0x2c2a26), paint(hoopB, 0x2c2a26)])!;
}

/** A ship's boat: a round-bilged hull, thwarts, and three rowers. Bow toward +z. */
function createRowboatGeometry(): BufferGeometry {
  const hull = new SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.85, 0.5, 2.3);
  const rim = new CylinderGeometry(1, 1, 0.08, 14, 1, true).scale(0.86, 1, 2.32).translate(0, 0.02, 0);
  const parts = [paint(hull, 0x5b3a22), paint(rim, 0xc9b48a)];
  for (const z of [-1.0, 0, 1.0]) {
    parts.push(paint(new BoxGeometry(0.34, 0.5, 0.26).translate(0, 0.35, z), 0x2f3d4c));
    parts.push(paint(new SphereGeometry(0.13, 8, 6).translate(0, 0.72, z), 0xd2a57c));
    // Oars, splayed out to both sides.
    parts.push(paint(new BoxGeometry(2.6, 0.04, 0.07).translate(0, 0.3, z + 0.12), 0xb08a5a));
  }
  return mergeGeometries(parts)!;
}
