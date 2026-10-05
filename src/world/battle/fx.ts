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
  abs,
  atan,
  attribute,
  color,
  cos,
  float,
  instancedDynamicBufferAttribute,
  mix,
  positionLocal,
  pow,
  select,
  sign,
  sin,
  smoothstep,
  uv,
  vec3,
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
      return { balls: 32, splashes: 24, smoke: 0, splinters: 0, stores: 16, boats: 2 };
    case 'low':
      return { balls: 40, splashes: 32, smoke: 36, splinters: 32, stores: 20, boats: 3 };
    case 'medium':
      return { balls: 64, splashes: 48, smoke: 72, splinters: 64, stores: 32, boats: 4 };
    default:
      return { balls: 64, splashes: 64, smoke: 72, splinters: 96, stores: 32, boats: 4 };
  }
}

const GRAVITY = 9.81;
const BALL_RADIUS = 0.2;
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler(0, 0, 0, 'YXZ');
const tmpP = new Vector3();
const tmpS = new Vector3();
const tmpC = new Color();

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
  /** 1 once the ball has whistled past the player's ship (so it sounds once). */
  readonly whizzed: Uint8Array;
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
    this.whizzed = new Uint8Array(size);
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
      this.whizzed[i] = 0;
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
  private readonly scale: Float32Array;
  /** 0 free, 1 flying, 2 floating (until `until`). */
  private readonly live: Uint8Array;
  private readonly until: Float32Array;
  /** Each chip's own colour (rgb); copied into its draw slot every frame. */
  private readonly rgb: Float32Array;
  private next = 0;
  readonly size: number;

  constructor(
    size: number,
    private readonly splashes: SplashPool | null = null,
  ) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.scale = new Float32Array(n);
    this.live = new Uint8Array(n);
    this.until = new Float32Array(n);
    this.rgb = new Float32Array(n * 3);
    const mat = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    this.mesh = pooled(new InstancedMesh(createChipGeometry(), mat, n), 'battle-splinters');
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
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
      this.spin[i] = (rand() - 0.5) * 24;
      this.scale[i] = 0.55 + rand() * 0.9;
      this.live[i] = 1;
      // Most chips are bare wood in a few shades; one in four still wears the hull's dark paint.
      const tone = 0.75 + rand() * 0.45;
      const painted = rand() < 0.25;
      this.rgb[i * 3] = (painted ? 0.22 : 0.6) * tone;
      this.rgb[i * 3 + 1] = (painted ? 0.2 : 0.43) * tone;
      this.rgb[i * 3 + 2] = (painted ? 0.19 : 0.27) * tone;
    }
  }

  update(dt: number, t: number, waves: WaveSampler): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      const state = this.live[i]!;
      if (!state) continue;
      let pitch: number;
      let roll: number;
      if (state === 1) {
        this.vy[i] -= GRAVITY * dt;
        this.x[i] += this.vx[i]! * dt;
        this.y[i] += this.vy[i]! * dt;
        this.z[i] += this.vz[i]! * dt;
        const sea = waves.heightAt(this.x[i]!, this.z[i]!, t);
        if (this.y[i]! < sea) {
          // It lands with a small splash and floats a while.
          this.live[i] = 2;
          this.until[i] = t + 4 + (i % 5);
          this.splashes?.spawn(this.x[i]!, sea, this.z[i]!, t, 0.35 * this.scale[i]!, 0, (i * 0.618) % 1);
        }
        const a = t * this.spin[i]!;
        pitch = a;
        roll = a * 0.3;
        tmpE.set(pitch, a * 0.7 + i, roll, 'YXZ');
      } else {
        const left = this.until[i]! - t;
        if (left <= 0) {
          this.live[i] = 0;
          continue;
        }
        // Afloat: it lies on the swell, drifts and turns slowly, then sinks over its last second.
        this.x[i] += this.vx[i]! * 0.04 * dt;
        this.z[i] += this.vz[i]! * 0.04 * dt;
        this.y[i] = waves.heightAt(this.x[i]!, this.z[i]!, t) - Math.max(0, 1 - left) * 0.3;
        tmpE.set(
          Math.sin(t * 1.4 + i) * 0.12,
          i + t * this.spin[i]! * 0.02,
          Math.sin(t * 1.1 + i) * 0.1,
          'YXZ',
        );
      }
      tmpQ.setFromEuler(tmpE);
      const sc = this.scale[i]!;
      tmpM.compose(tmpP.set(this.x[i]!, this.y[i]!, this.z[i]!), tmpQ, tmpS.set(sc, sc, sc));
      this.mesh.setMatrixAt(n, tmpM);
      // instanceColor is indexed by draw slot, so each chip's colour goes with it.
      const c = this.mesh.instanceColor!.array as Float32Array;
      c[n * 3] = this.rgb[i * 3]!;
      c[n * 3 + 1] = this.rgb[i * 3 + 1]!;
      c[n * 3 + 2] = this.rgb[i * 3 + 2]!;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  clear(): void {
    this.live.fill(0);
    this.mesh.count = 0;
  }
}

/** A splinter: a thin plank chip, wide and square at one end and torn to a point at the other. */
function createChipGeometry(): BufferGeometry {
  const g = new BoxGeometry(0.09, 0.035, 0.42, 1, 1, 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z > 0.1) {
      pos.setX(i, pos.getX(i) * 0.2 + 0.015);
      pos.setY(i, pos.getY(i) * 0.5);
    } else if (z > -0.1) pos.setX(i, pos.getX(i) * 0.75);
  }
  g.computeVertexNormals();
  return g;
}

/** Ship's stores left by a wreck: barrels that bob on the swell until you sail through them. */
/** What floats off a struck raider: kind 0 timber (repairs), 1 powder (faster reloads), 2 wreckage. */
export const STORE_TIMBER = 0;
export const STORE_POWDER = 1;
export const STORE_WRECKAGE = 2;

export class StorePool {
  readonly mesh: InstancedMesh;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly kind: Uint8Array;
  readonly expires: Float32Array;
  /** 0 free, 1 afloat. */
  readonly live: Uint8Array;
  readonly size: number;
  /** Per item: 0…1, picks its size, its angle on the water and its weathering. */
  private readonly seed: Float32Array;
  /** Per drawn item: which shape it shows (see createStoreGeometry). */
  private readonly show: InstancedBufferAttribute;

  constructor(size: number) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.expires = new Float32Array(n);
    this.live = new Uint8Array(n);
    this.seed = new Float32Array(n);
    const geometry = createStoreGeometry();
    this.show = new InstancedBufferAttribute(new Float32Array(n), 1);
    geometry.setAttribute('storeShow', this.show);
    this.mesh = pooled(new InstancedMesh(geometry, createStoreMaterial(), n), 'battle-stores');
    // Allocate the per-item tint once, here.
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
  }

  /** True for the stores you can collect (not the wreckage). */
  collectable(i: number): boolean {
    return this.live[i] === 1 && this.kind[i] !== STORE_WRECKAGE;
  }

  spawn(x: number, z: number, kind: number, expires: number): void {
    for (let i = 0; i < this.size; i++) {
      if (this.live[i]) continue;
      this.x[i] = x;
      this.z[i] = z;
      this.kind[i] = kind;
      this.expires[i] = expires;
      this.live[i] = 1;
      const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      this.seed[i] = h - Math.floor(h);
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
      const seed = this.seed[i]!;
      const kind = this.kind[i]!;
      const y = waves.heightAt(this.x[i]!, this.z[i]!, t);
      // Sinks out of sight over its last two seconds; wreckage rides lower, barrels higher.
      const sink = Math.max(0, 2 - (this.expires[i]! - t)) * 0.45;
      const ride = kind === STORE_POWDER ? 0.08 - seed * 0.12 : kind === STORE_TIMBER ? 0.02 : -0.03;
      // Each item lolls at its own rate and lies at its own angle.
      const rate = 0.7 + seed * 0.9;
      tmpE.set(
        Math.sin(t * rate + i) * 0.2 + (seed - 0.5) * 0.3,
        seed * 6.283 + i * 1.7,
        Math.sin(t * rate * 0.8 + i * 2) * 0.18,
        'YXZ',
      );
      tmpQ.setFromEuler(tmpE);
      const s = kind === STORE_WRECKAGE ? 0.7 + seed * 0.7 : 0.85 + seed * 0.3;
      tmpM.compose(tmpP.set(this.x[i]!, y + ride - sink, this.z[i]!), tmpQ, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(n, tmpM);
      const tone = 0.78 + ((seed * 7.3) % 1) * 0.32;
      this.mesh.setColorAt(n, tmpC.setRGB(tone, tone * (0.96 + seed * 0.04), tone * (0.9 + seed * 0.08)));
      this.show.setX(n, kind);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.show.needsUpdate = true;
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
  /** Per drawn boat: oar sweep (rad, + forward), blade lift, the rowers' lean, and the boat's heading. */
  private readonly row: InstancedBufferAttribute;

  constructor(size: number) {
    this.size = Math.max(1, size);
    const n = this.size;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.start = new Float32Array(n);
    this.live = new Uint8Array(n);
    const geometry = createRowboatGeometry();
    this.row = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geometry.setAttribute('boatRow', this.row);
    this.mesh = pooled(new InstancedMesh(geometry, createBoatMaterial(), n), 'battle-boats');
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
      // A stroke every 1.6 s: the pull (blades in, sweeping aft) drives a surge, then the boat glides
      // while the oars feather forward, clear of the water.
      const stroke = (age % 1.6) / 1.6;
      const speed = 0.6 + 1.8 * Math.exp(-stroke * 5);
      const h = this.heading[i]!;
      this.x[i] += Math.sin(h) * speed * dt;
      this.z[i] += Math.cos(h) * speed * dt;
      const y = waves.heightAt(this.x[i]!, this.z[i]!, t);
      tmpE.set(Math.sin(t * 1.7 + i) * 0.06 - (1 - stroke) * 0.04, h, Math.sin(t * 1.3 + i) * 0.07, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(this.x[i]!, y, this.z[i]!), tmpQ, tmpS.set(1, 1, 1));
      const pull = stroke < 0.35;
      const k = pull ? stroke / 0.35 : (stroke - 0.35) / 0.65;
      const e = k * k * (3 - 2 * k);
      this.row.setXYZW(
        n,
        pull ? 0.55 - 1.1 * e : -0.55 + 1.1 * e,
        pull ? 0 : Math.sin(k * Math.PI) * 0.22,
        pull ? e : 1 - e,
        h,
      );
      this.mesh.setMatrixAt(n++, tmpM);
    }
    this.row.needsUpdate = true;
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

/** A barrel (its axis along local y): the bulged staves and two iron hoops. */
function createBarrelParts(): BufferGeometry[] {
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
  return [paint(body, 0x8b6038), paint(hoopA, 0x2c2a26), paint(hoopB, 0x2c2a26)];
}

/**
 * Every store shape in one geometry, each tagged with its kind (`storePart`); the instance's
 * `storeShow` picks one, so all of them draw in one call. Built lying on the water (local y up).
 */
function createStoreGeometry(): BufferGeometry {
  const part = (g: BufferGeometry, id: number) => {
    const n = g.getAttribute('position').count;
    g.setAttribute('storePart', new Float32BufferAttribute(new Float32Array(n).fill(id), 1));
    return g;
  };
  const parts: BufferGeometry[] = [];
  // Timber: three planks lashed together with two rope bands, one plank a little proud of the rest.
  [-0.27, 0, 0.27].forEach((x, k) => {
    const plank = new BoxGeometry(0.25, 0.09, 1.9 - k * 0.18).translate(
      x,
      0.05 + (k === 1 ? 0.03 : 0),
      k * 0.06,
    );
    parts.push(part(paint(plank, [0xa77b4c, 0x8e6438, 0xb48a58][k]!), STORE_TIMBER));
  });
  for (const z of [-0.5, 0.55])
    parts.push(part(paint(new BoxGeometry(0.86, 0.15, 0.07).translate(0, 0.06, z), 0xcbb48a), STORE_TIMBER));
  // Powder: a barrel lying on its side.
  for (const g of createBarrelParts())
    parts.push(part(g.rotateX(Math.PI / 2).translate(0, 0.1, 0), STORE_POWDER));
  // Wreckage: a broken plank with a splintered end and a short bit of rail.
  const broken = new BoxGeometry(0.3, 0.08, 1.6);
  const pos = broken.getAttribute('position');
  for (let i = 0; i < pos.count; i++)
    if (pos.getZ(i) > 0.7)
      pos.setZ(i, pos.getZ(i) - (pos.getX(i) > 0 ? 0.35 : 0) - (pos.getY(i) > 0 ? 0.12 : 0));
  broken.computeVertexNormals();
  parts.push(part(paint(broken, 0x6e4b2c), STORE_WRECKAGE));
  parts.push(
    part(
      paint(new BoxGeometry(0.12, 0.1, 0.9).rotateY(0.5).translate(0.35, 0.02, -0.4), 0x3d2a1a),
      STORE_WRECKAGE,
    ),
  );
  return mergeGeometries(parts)!;
}

/** The store shapes collapse to a point unless the instance shows their kind. */
function createStoreMaterial(): MeshStandardNodeMaterial {
  const mat = createVertexColorMaterial();
  const p = positionLocal as AnyNode;
  const mine = abs(attribute('storePart', 'float').sub(attribute('storeShow', 'float'))).lessThan(0.5);
  mat.positionNode = select(mine, p, vec3(0, 0, 0));
  // Soaked below the water line: darker and glossier, so each piece sits in the sea, not on it.
  const raw = attribute('position', 'vec3') as AnyNode;
  const wet = smoothstep(float(0.07), float(-0.03), raw.y);
  // The vertex and instance colours multiply in after this.
  mat.colorNode = vec3(1, 1, 1).mul(float(1).sub(wet.mul(0.45)));
  mat.roughnessNode = mix(float(0.82), float(0.35), wet);
  return mat;
}

/** Shirt and cap colours for the rowers, seat by seat, so the crew doesn't look stamped out. */
const CREW_SHIRTS = [0x2f3d4c, 0x7a2e26, 0xb9ad94, 0x4d5a3a] as const;
const CREW_SKIN = [0xd2a57c, 0x9a6a46, 0xe2b896, 0x7d5236] as const;
const CREW_CAPS = [0x8c2a22, -1, 0x2b3a4a, 0x3a2a1e] as const;
/** The boat's gunwale above the water and the oarlocks on it (m). */
const GUNWALE = 0.4;
const OARLOCK_X = 0.8;

/**
 * A ship's boat: a round-bilged hull that floats with freeboard, bottom boards (so no sea shows inside
 * it), an oxblood wale, three rowers with bladed oars and a coxswain at the stern. Bow toward +z.
 */
function createRowboatGeometry(): BufferGeometry {
  const part = (g: BufferGeometry, id: number, seat = 0) => {
    const n = g.getAttribute('position').count;
    g.setAttribute('boatPart', new Float32BufferAttribute(new Float32Array(n).fill(id), 1));
    g.setAttribute('boatSeat', new Float32BufferAttribute(new Float32Array(n).fill(seat), 1));
    return g;
  };
  const hull = new SphereGeometry(1, 16, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    .scale(0.86, 0.8, 2.3)
    .translate(0, GUNWALE, 0);
  const wale = new CylinderGeometry(1, 1, 0.07, 16, 1, true)
    .scale(0.875, 1, 2.33)
    .translate(0, GUNWALE - 0.1, 0);
  const rim = new CylinderGeometry(1, 1, 0.05, 16, 1, true).scale(0.87, 1, 2.32).translate(0, GUNWALE, 0);
  const boards = new CylinderGeometry(1, 1, 0.04, 16, 1).scale(0.62, 1, 1.85).translate(0, 0.13, 0);
  const parts = [
    part(paint(hull, 0x4e3420), 0),
    part(paint(wale, 0x5a1f1a), 0),
    part(paint(rim, 0xc9b48a), 0),
    part(paint(boards, 0x7a5634), 0),
  ];
  const sitter = (z: number, k: number, bodyH: number) => {
    parts.push(part(paint(new BoxGeometry(1.5, 0.05, 0.22).translate(0, 0.3, z), 0x6b4a2c), 0));
    parts.push(
      part(paint(new BoxGeometry(0.36, bodyH, 0.26).translate(0, 0.33 + bodyH / 2, z), CREW_SHIRTS[k]!), 1),
    );
    const headY = 0.38 + bodyH + 0.1;
    parts.push(part(paint(new SphereGeometry(0.13, 8, 6).translate(0, headY, z), CREW_SKIN[k]!), 1));
    const cap = CREW_CAPS[k]!;
    if (cap >= 0)
      parts.push(
        part(
          paint(
            new SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, headY + 0.03, z),
            cap,
          ),
          1,
        ),
      );
  };
  [-0.95, 0.05, 1.05].forEach((z, k) => {
    sitter(z, k, k === 1 ? 0.5 : 0.44);
    // An oar each side, pivoting in its oarlock: the loom inboard, the shaft, and a flat blade.
    for (const side of [-1, 1]) {
      const shaft = new BoxGeometry(1.75, 0.045, 0.06).translate(
        side * (OARLOCK_X + 0.6),
        GUNWALE + 0.04,
        z + 0.1,
      );
      const blade = new BoxGeometry(0.46, 0.02, 0.17).translate(
        side * (OARLOCK_X + 1.6),
        GUNWALE + 0.04,
        z + 0.1,
      );
      parts.push(part(paint(shaft, 0xb08a5a), 2, k - 1));
      parts.push(part(paint(blade, 0x8f6c42), 2, k - 1));
    }
  });
  // The coxswain sits in the stern sheets, facing the rowers.
  sitter(-1.85, 3, 0.4);
  return mergeGeometries(parts)!;
}

/**
 * The boat's oars sweep about their oarlocks (forward, then aft through the pull, blades lifted on
 * the recovery) and the rowers lean back into each stroke, from the per-boat `boatRow` attribute.
 */
function createBoatMaterial(): MeshStandardNodeMaterial {
  const mat = createVertexColorMaterial();
  const V = vec3 as AnyNode;
  // positionLocal here already has the instance matrix applied (three runs instancing before
  // positionNode), so the oar and rower motion is worked out from the raw local position and the
  // resulting offset is turned by the boat's heading and added.
  const p = positionLocal as AnyNode;
  const raw = attribute('position', 'vec3') as AnyNode;
  const kind = attribute('boatPart', 'float') as AnyNode;
  const seat = attribute('boatSeat', 'float') as AnyNode;
  const row = attribute('boatRow', 'vec4') as AnyNode;
  const isOar = kind.greaterThan(1.5);
  const isRower = kind.greaterThan(0.5).and(kind.lessThan(1.5));
  const reach = abs(raw.x).sub(OARLOCK_X).max(0);
  // Rowers keep stroke, but not to the hundredth: each seat is a touch behind the one aft of it.
  const sweep = row.x.sub(seat.mul(0.07));
  const oarOffset = V(
    sign(raw.x)
      .mul(reach)
      .mul(float(1).sub(cos(sweep)))
      .negate(),
    // The blades dip into the water through the pull and lift clear on the recovery.
    reach.mul(row.y).sub(reach.mul(seat.mul(0.015).add(0.27))),
    reach.mul(sin(sweep)),
  );
  const lean = smoothstep(float(0.5), float(1.0), raw.y).mul(row.z.mul(0.16).sub(0.08));
  const rowerOffset = V(0, 0, lean.negate());
  const local = select(isOar, oarOffset, select(isRower, rowerOffset, V(0, 0, 0))) as AnyNode;
  const c = cos(row.w);
  const s = sin(row.w);
  mat.positionNode = p.add(
    V(local.x.mul(c).add(local.z.mul(s)), local.y, local.z.mul(c).sub(local.x.mul(s))),
  );
  return mat;
}
