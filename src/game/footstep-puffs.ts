import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh } from 'three/webgpu';
import type { SurfaceKind } from './collision';
import { unreflected } from '../world/reflection';
import { createSparkleMaterial } from '../world/sites/sparkle';

const MAX_PUFFS = 28;
const SEGMENTS = 14;
const VERTS_PER_PUFF = SEGMENTS * 2;
const FLOATS_PER_PUFF = VERTS_PER_PUFF * 3;

interface Puff {
  x: number;
  y: number;
  z: number;
  start: number;
  duration: number;
  scale: number;
  heading: number;
}

export class FootstepPuffs {
  readonly mesh: Mesh;
  private readonly puffs: Puff[] = [];
  private readonly positions = new Float32Array(MAX_PUFFS * FLOATS_PER_PUFF);
  private readonly colors = new Float32Array(MAX_PUFFS * FLOATS_PER_PUFF);
  private readonly positionAttr: BufferAttribute;
  private readonly colorAttr: BufferAttribute;
  private t = 0;
  /** Whether any puff shows (visibility changes only when that does: a warm may have it shown). */
  private shown = false;

  constructor() {
    const geometry = createPuffGeometry(this.positions, this.colors);
    this.positionAttr = geometry.getAttribute('position') as BufferAttribute;
    this.colorAttr = geometry.getAttribute('color') as BufferAttribute;
    this.positionAttr.setUsage(DynamicDrawUsage);
    this.colorAttr.setUsage(DynamicDrawUsage);
    this.mesh = new Mesh(geometry, createSparkleMaterial());
    this.mesh.name = 'player-footstep-puffs';
    this.mesh.frustumCulled = false;
    // Hidden until the first puff: the world's warm draws it once, so its first puff uploads nothing
    // (a captain who first walks after the warm-up, ashore on a streamed island, hitched on it).
    this.mesh.visible = false;
    this.mesh.userData.prewarm = true;
    // Not in the harbour mirror: the ground under them isn't reflected (PLAN §15.4).
    unreflected.add(this.mesh);
  }

  addTo(parent: { add(object: Mesh): void }): void {
    parent.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, surface: SurfaceKind, heading: number, intensity = 1): void {
    if (surface === 'wood' || surface === 'stone') intensity *= 0.45;
    if (surface === 'rock') intensity *= 0.55;
    const wet = surface === 'water';
    const puff: Puff = {
      x,
      y: y + (wet ? 0.055 : 0.035),
      z,
      start: this.t,
      duration: wet ? 0.5 : 0.72,
      scale: (wet ? 0.36 : 0.27) * Math.max(0.35, intensity),
      heading,
    };
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    this.puffs.push(puff);
  }

  update(dt: number): void {
    this.t += dt;
    this.positions.fill(0);
    this.colors.fill(0);
    let visible = 0;
    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      const p = this.puffs[i]!;
      const age = (this.t - p.start) / p.duration;
      if (age >= 1) {
        this.puffs.splice(i, 1);
        continue;
      }
      writePuff(this.positions, this.colors, visible, p, age);
      visible += 1;
    }
    if (visible > 0 !== this.shown) {
      this.shown = visible > 0;
      this.mesh.visible = this.shown;
    }
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  dispose(): void {
    unreflected.delete(this.mesh);
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      for (const material of this.mesh.material) material.dispose();
    } else this.mesh.material.dispose();
  }
}

function createPuffGeometry(positions: Float32Array, colors: Float32Array): BufferGeometry {
  const idx: number[] = [];
  for (let p = 0; p < MAX_PUFFS; p += 1) {
    const base = p * VERTS_PER_PUFF;
    for (let i = 0; i < SEGMENTS; i += 1) {
      const j = (i + 1) % SEGMENTS;
      idx.push(
        base + i * 2,
        base + j * 2,
        base + i * 2 + 1,
        base + i * 2 + 1,
        base + j * 2,
        base + j * 2 + 1,
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(idx);
  return geometry;
}

function writePuff(positions: Float32Array, colors: Float32Array, slot: number, p: Puff, age: number): void {
  const spread = p.scale * (0.35 + age * 1.6);
  const lift = Math.sin(age * Math.PI) * 0.055 * p.scale;
  const fade = (1 - age) * (0.7 + age * 0.3);
  const heading = p.heading + age * 0.8;
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  let o = slot * FLOATS_PER_PUFF;
  for (let i = 0; i < SEGMENTS; i += 1) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const inner = 0.2 * spread;
    const outer = spread;
    const ix = ca * inner;
    const iz = sa * inner;
    const ox = ca * outer;
    const oz = sa * outer;
    positions[o] = p.x + ix * ch + iz * sh;
    positions[o + 1] = p.y + lift;
    positions[o + 2] = p.z - ix * sh + iz * ch;
    colors[o] = 0.95 * fade;
    colors[o + 1] = 0.78 * fade;
    colors[o + 2] = 0.5 * fade;
    positions[o + 3] = p.x + ox * ch + oz * sh;
    positions[o + 4] = p.y + lift * 0.25;
    positions[o + 5] = p.z - ox * sh + oz * ch;
    o += 6;
  }
}
