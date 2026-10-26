import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  type Material,
} from 'three/webgpu';
import { attribute } from 'three/tsl';
import type { WaveSampler } from '../contracts';

/**
 * The kraken's evidence on the water before it acts, and the danger area it will strike: a dark
 * shadow under the surface with a slow swirl in it, and a ring (or an arc, for a sweep) at the
 * danger radius. Both lie on the swell (their vertices follow the sea each frame) and draw with
 * one unlit see-through material, so every mark is one shader whatever its look. Marks are pooled:
 * no geometry is made after the warm-up.
 */
export interface MarkState {
  x: number;
  z: number;
  /** The danger radius (m): the ring's, and the shadow's size. */
  radius: number;
  /** The danger arc's middle (radians, like a heading) and its width (2π a full ring). */
  heading: number;
  arc: number;
  /** 0…1 how dark the shadow is, and how strong the ring. */
  shadow: number;
  ring: number;
  /** The swirl's turn (radians). */
  spin: number;
}

const RINGS = 6;
const SEGMENTS = 48;
const RING_SEGMENTS = 96;
/** The ring's band (m) and how far over the sea the marks lie (m). */
const BAND = 1.1;
const LIFT = 0.12;
const SHADOW = [0.01, 0.035, 0.05] as const;
const DANGER = [1.0, 0.36, 0.12] as const;

let material: MeshBasicNodeMaterial | null = null;
let users = 0;

function markMaterial(): MeshBasicNodeMaterial {
  if (material) return material;
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  m.name = 'kraken marks';
  m.colorNode = attribute('color', 'vec3');
  m.opacityNode = attribute('markAlpha', 'float');
  material = m;
  return m;
}

interface Slot {
  mesh: Mesh;
  pos: BufferAttribute;
  alpha: BufferAttribute;
  state: MarkState;
  live: boolean;
}

export class TellMarks {
  readonly group = new Group();
  private readonly slots: Slot[] = [];
  /** Each shadow vertex's place (radial 0…1, angle) and its base darkness (the swirl's bands). */
  private readonly discR: Float32Array;
  private readonly discA: Float32Array;
  /** Each ring vertex's angle and side (0 inner, 1 outer). */
  private readonly ringA: Float32Array;
  private readonly ringO: Float32Array;
  private readonly material: Material;

  constructor(size = 3) {
    this.group.name = 'kraken tell marks';
    users++;
    this.material = markMaterial();
    const discCount = 1 + RINGS * SEGMENTS;
    const ringCount = (RING_SEGMENTS + 1) * 2;
    this.discR = new Float32Array(discCount);
    this.discA = new Float32Array(discCount);
    for (let r = 1; r <= RINGS; r++)
      for (let s = 0; s < SEGMENTS; s++) {
        const i = 1 + (r - 1) * SEGMENTS + s;
        this.discR[i] = r / RINGS;
        this.discA[i] = (s / SEGMENTS) * Math.PI * 2;
      }
    this.ringA = new Float32Array(ringCount);
    this.ringO = new Float32Array(ringCount);
    for (let s = 0; s <= RING_SEGMENTS; s++) {
      this.ringA[s * 2] = this.ringA[s * 2 + 1] = s / RING_SEGMENTS;
      this.ringO[s * 2 + 1] = 1;
    }
    for (let k = 0; k < size; k++) this.slots.push(this.makeSlot(discCount, ringCount));
  }

  private makeSlot(discCount: number, ringCount: number): Slot {
    const n = discCount + ringCount;
    const g = new BufferGeometry();
    const pos = new BufferAttribute(new Float32Array(n * 3), 3);
    const alpha = new BufferAttribute(new Float32Array(n), 1);
    const color = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = i < discCount ? SHADOW : DANGER;
      color[i * 3] = c[0];
      color[i * 3 + 1] = c[1];
      color[i * 3 + 2] = c[2];
    }
    const index: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) index.push(0, 1 + ((s + 1) % SEGMENTS), 1 + s);
    for (let r = 1; r < RINGS; r++)
      for (let s = 0; s < SEGMENTS; s++) {
        const a = 1 + (r - 1) * SEGMENTS + s;
        const b = 1 + (r - 1) * SEGMENTS + ((s + 1) % SEGMENTS);
        index.push(a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS);
      }
    for (let s = 0; s < RING_SEGMENTS; s++) {
      const a = discCount + s * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    pos.setUsage(35048); // DynamicDrawUsage
    alpha.setUsage(35048);
    g.setAttribute('position', pos);
    g.setAttribute('color', new BufferAttribute(color, 3));
    g.setAttribute('markAlpha', alpha);
    g.setIndex(index);
    const mesh = new Mesh(g, this.material);
    mesh.name = 'kraken tell mark';
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.visible = false;
    this.group.add(mesh);
    return {
      mesh,
      pos,
      alpha,
      live: false,
      state: { x: 0, z: 0, radius: 10, heading: 0, arc: Math.PI * 2, shadow: 0, ring: 0, spin: 0 },
    };
  }

  /** A free mark's state to fill in (it shows from the next `update`), or null if all are in use. */
  acquire(): MarkState | null {
    for (const s of this.slots)
      if (!s.live) {
        s.live = true;
        s.state.shadow = s.state.ring = s.state.spin = 0;
        s.state.arc = Math.PI * 2;
        return s.state;
      }
    return null;
  }

  release(state: MarkState | null): void {
    for (const s of this.slots)
      if (s.state === state) {
        s.live = false;
        s.mesh.visible = false;
      }
  }

  clear(): void {
    for (const s of this.slots) {
      s.live = false;
      s.mesh.visible = false;
    }
  }

  /** For the warm-up: every mark shown; returns the undo. */
  stageWarm(): () => void {
    for (const s of this.slots) s.mesh.visible = true;
    return () => {
      for (const s of this.slots) s.mesh.visible = s.live;
    };
  }

  /** Lays each live mark on the sea and writes its look (no allocation). */
  update(t: number, waves: WaveSampler): void {
    for (const s of this.slots) {
      if (!s.live) continue;
      const m = s.state;
      s.mesh.visible = m.shadow > 0.002 || m.ring > 0.002;
      if (!s.mesh.visible) continue;
      const p = s.pos.array as Float32Array;
      const a = s.alpha.array as Float32Array;
      const n = this.discR.length;
      for (let i = 0; i < n; i++) {
        const r = this.discR[i]! * m.radius * 0.9;
        const ang = this.discA[i]!;
        const x = m.x + Math.cos(ang) * r;
        const z = m.z + Math.sin(ang) * r;
        p[i * 3] = x;
        p[i * 3 + 1] = waves.heightAt(x, z, t) + LIFT;
        p[i * 3 + 2] = z;
        // Darkest in the middle, soft at the edge, with two slow spiral bands: the swirl.
        const rn = this.discR[i]!;
        const swirl = 0.72 + 0.28 * Math.sin(2 * ang + 7 * rn - m.spin);
        a[i] = m.shadow * (1 - rn * rn) * swirl;
      }
      for (let j = 0; j < this.ringA.length; j++) {
        const i = n + j;
        const ang = m.heading - m.arc / 2 + this.ringA[j]! * m.arc;
        const r = m.radius - BAND * 0.5 + this.ringO[j]! * BAND;
        // Headings run clockwise from +z (sin, cos), like a ship's.
        const x = m.x + Math.sin(ang) * r;
        const z = m.z + Math.cos(ang) * r;
        p[i * 3] = x;
        p[i * 3 + 1] = waves.heightAt(x, z, t) + LIFT + 0.03;
        p[i * 3 + 2] = z;
        a[i] = m.ring * 0.85;
      }
      s.pos.needsUpdate = true;
      s.alpha.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const s of this.slots) s.mesh.geometry.dispose();
    if (--users === 0) {
      material?.dispose();
      material = null;
    }
  }
}
