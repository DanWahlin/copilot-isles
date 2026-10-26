import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  Group,
  Mesh,
  OneMinusSrcColorFactor,
  ZeroFactor,
  type Material,
  type MeshBasicNodeMaterial,
} from 'three/webgpu';
import type { WaveSampler } from '../contracts';
import { createSparkleMaterial, sparklePulse } from '../sites/sparkle';
import { world } from '../uniforms';

/**
 * The kraken's evidence on the water before it acts, and the danger area it will strike: a dark
 * shadow under the surface with a slow swirl in it, and a ring (or an arc, for a sweep) at the
 * danger radius. Both lie on the swell (their vertices follow the sea each frame). Marks are pooled:
 * no geometry is made after the warm-up.
 *
 * They draw with the game's sparkle material (sites/sparkle.ts), so they add no shader: the shadow
 * darkens the sea (a blend that multiplies what's under it by one less its colour), and the ring and
 * white water add light. Each vertex's colour is written against the sparkle's shimmer
 * (`sparklePulse`, the same formula the shader uses) and its vertex-colour square, so the marks show
 * the colour asked for. Battle 3 was over its shader cap with a material of their own (BATTLES.md
 * §2.0c).
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
  /** 0 the kraken's shadow under the water (dark), 1 white water (foam where it breaks the surface). */
  foam: number;
}

const RINGS = 6;
const SEGMENTS = 48;
const RING_SEGMENTS = 96;
/** The ring's band (m) and how far over the sea the marks lie (m). */
const BAND = 1.1;
const LIFT = 0.12;
/** How much the shadow darkens the sea, per channel (a touch less in the blues: a deep green-blue). */
const SHADOW = [0.99, 0.965, 0.95] as const;
const DANGER = [1.0, 0.36, 0.12] as const;
/** Under the ring the sea darkens first (most in the blues), so the light added over it reads orange. */
const DANGER_SHADE = [0.35, 0.6, 0.85] as const;
const FOAM = [0.86, 0.92, 0.95] as const;
/** The ring and the white water are light added to the sea: this bright at full strength. */
const RING_GAIN = 0.85;
const FOAM_GAIN = 0.8;

let darken: MeshBasicNodeMaterial | null = null;
let glow: MeshBasicNodeMaterial | null = null;
let users = 0;

/** The shadow: the sparkle's graph, blended to multiply the sea by one less its colour. */
function shadowMaterial(): MeshBasicNodeMaterial {
  if (darken) return darken;
  const m = createSparkleMaterial();
  m.name = 'kraken marks shadow';
  m.blending = CustomBlending;
  m.blendSrc = ZeroFactor;
  m.blendDst = OneMinusSrcColorFactor;
  darken = m;
  return m;
}

/** The ring and the white water: the sparkle as it is (additive). */
function glowMaterial(): MeshBasicNodeMaterial {
  if (glow) return glow;
  glow = createSparkleMaterial();
  glow.name = 'kraken marks glow';
  return glow;
}

interface Slot {
  /** The shadow and the white water share the disc's geometry; one of them shows at a time. */
  shadow: Mesh;
  foam: Mesh;
  ring: Mesh;
  ringShade: Mesh;
  discPos: BufferAttribute;
  discColor: BufferAttribute;
  ringPos: BufferAttribute;
  ringColor: BufferAttribute;
  ringShadeColor: BufferAttribute;
  state: MarkState;
  live: boolean;
}

/** A dynamic attribute of `count` vec3s. */
function dynamic(count: number): BufferAttribute {
  const a = new BufferAttribute(new Float32Array(count * 3), 3);
  a.setUsage(35048); // DynamicDrawUsage
  return a;
}

/**
 * Writes the colour the sparkle material shows as `r, g, b` at (x, z): it multiplies a vertex's
 * colour by its shimmer and by the vertex colour again, so this writes the root of the colour over
 * the shimmer.
 */
function setColor(c: Float32Array, i: number, r: number, g: number, b: number, pulse: number): void {
  // Float colours may pass 1 (in the shimmer's troughs): the shader's product is the colour asked for.
  c[i * 3] = Math.sqrt(Math.max(0, r) / pulse);
  c[i * 3 + 1] = Math.sqrt(Math.max(0, g) / pulse);
  c[i * 3 + 2] = Math.sqrt(Math.max(0, b) / pulse);
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
  private readonly darken: Material;
  private readonly glow: Material;

  constructor(size = 3) {
    this.group.name = 'kraken tell marks';
    users++;
    this.darken = shadowMaterial();
    this.glow = glowMaterial();
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
    const disc = new BufferGeometry();
    const discPos = dynamic(discCount);
    const discColor = dynamic(discCount);
    disc.setAttribute('position', discPos);
    disc.setAttribute('color', discColor);
    const di: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) di.push(0, 1 + ((s + 1) % SEGMENTS), 1 + s);
    for (let r = 1; r < RINGS; r++)
      for (let s = 0; s < SEGMENTS; s++) {
        const a = 1 + (r - 1) * SEGMENTS + s;
        const b = 1 + (r - 1) * SEGMENTS + ((s + 1) % SEGMENTS);
        di.push(a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS);
      }
    disc.setIndex(di);
    const ring = new BufferGeometry();
    const ringPos = dynamic(ringCount);
    const ringColor = dynamic(ringCount);
    ring.setAttribute('position', ringPos);
    ring.setAttribute('color', ringColor);
    const ri: number[] = [];
    for (let s = 0; s < RING_SEGMENTS; s++) {
      const a = s * 2;
      ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    ring.setIndex(ri);
    // The ring's shade: the same strip (its positions shared), its own colours.
    const shade = new BufferGeometry();
    const ringShadeColor = dynamic(ringCount);
    shade.setAttribute('position', ringPos);
    shade.setAttribute('color', ringShadeColor);
    shade.setIndex(ri);
    const mesh = (g: BufferGeometry, m: Material, name: string, order: number) => {
      const o = new Mesh(g, m);
      o.name = name;
      o.frustumCulled = false;
      o.renderOrder = order;
      o.visible = false;
      this.group.add(o);
      return o;
    };
    return {
      shadow: mesh(disc, this.darken, 'kraken tell mark shadow', 3),
      foam: mesh(disc, this.glow, 'kraken tell mark foam', 3),
      ringShade: mesh(shade, this.darken, 'kraken tell mark ring shade', 4),
      ring: mesh(ring, this.glow, 'kraken tell mark ring', 5),
      discPos,
      discColor,
      ringPos,
      ringColor,
      ringShadeColor,
      live: false,
      state: { x: 0, z: 0, radius: 10, heading: 0, arc: Math.PI * 2, shadow: 0, ring: 0, spin: 0, foam: 0 },
    };
  }

  /** A free mark's state to fill in (it shows from the next `update`), or null if all are in use. */
  acquire(): MarkState | null {
    for (const s of this.slots)
      if (!s.live) {
        s.live = true;
        s.state.shadow = s.state.ring = s.state.spin = s.state.foam = 0;
        s.state.arc = Math.PI * 2;
        return s.state;
      }
    return null;
  }

  release(state: MarkState | null): void {
    for (const s of this.slots) if (s.state === state) this.hide(s);
  }

  clear(): void {
    for (const s of this.slots) this.hide(s);
  }

  private hide(s: Slot): void {
    s.live = false;
    s.shadow.visible = s.foam.visible = s.ring.visible = s.ringShade.visible = false;
  }

  /** For the warm-up: every mark shown; returns the undo. */
  stageWarm(): () => void {
    for (const s of this.slots)
      s.shadow.visible = s.foam.visible = s.ring.visible = s.ringShade.visible = true;
    return () => {
      for (const s of this.slots) if (!s.live) this.hide(s);
    };
  }

  /** Lays each live mark on the sea and writes its look (no allocation). */
  update(t: number, waves: WaveSampler): void {
    const time = world.time.value;
    const night = world.night.value;
    for (const s of this.slots) {
      if (!s.live) continue;
      const m = s.state;
      const foam = m.foam > 0.5;
      const disc = m.shadow > 0.002;
      s.shadow.visible = disc && !foam;
      s.foam.visible = disc && foam;
      s.ring.visible = s.ringShade.visible = m.ring > 0.002;
      if (disc) {
        const p = s.discPos.array as Float32Array;
        const c = s.discColor.array as Float32Array;
        const n = this.discR.length;
        for (let i = 0; i < n; i++) {
          const rn = this.discR[i]!;
          const r = rn * m.radius * 0.9;
          const ang = this.discA[i]!;
          const x = m.x + Math.cos(ang) * r;
          const z = m.z + Math.sin(ang) * r;
          p[i * 3] = x;
          p[i * 3 + 1] = waves.heightAt(x, z, t) + LIFT;
          p[i * 3 + 2] = z;
          const pulse = sparklePulse(x, z, time, night);
          if (foam) {
            // White water: a broken ring of foam, densest toward its rim, streaked by the swirl.
            const streak = 0.55 + 0.45 * Math.sin(5 * ang + 11 * rn - m.spin) * Math.sin(3 * ang - 4 * rn);
            const a = m.shadow * Math.min(1, rn * 1.6) * (1 - rn ** 4) * streak * FOAM_GAIN;
            setColor(c, i, FOAM[0] * a, FOAM[1] * a, FOAM[2] * a, pulse);
          } else {
            // Darkest in the middle, soft at the edge, with two slow spiral bands: the swirl.
            const swirl = 0.72 + 0.28 * Math.sin(2 * ang + 7 * rn - m.spin);
            const a = m.shadow * (1 - rn * rn) * swirl;
            setColor(c, i, SHADOW[0] * a, SHADOW[1] * a, SHADOW[2] * a, pulse);
          }
        }
        s.discPos.needsUpdate = true;
        s.discColor.needsUpdate = true;
      }
      if (s.ring.visible) {
        const p = s.ringPos.array as Float32Array;
        const c = s.ringColor.array as Float32Array;
        const d = s.ringShadeColor.array as Float32Array;
        const a = m.ring * RING_GAIN;
        for (let j = 0; j < this.ringA.length; j++) {
          const ang = m.heading - m.arc / 2 + this.ringA[j]! * m.arc;
          const r = m.radius - BAND * 0.5 + this.ringO[j]! * BAND;
          // Headings run clockwise from +z (sin, cos), like a ship's.
          const x = m.x + Math.sin(ang) * r;
          const z = m.z + Math.cos(ang) * r;
          p[j * 3] = x;
          p[j * 3 + 1] = waves.heightAt(x, z, t) + LIFT + 0.03;
          p[j * 3 + 2] = z;
          const pulse = sparklePulse(x, z, time, night);
          setColor(c, j, DANGER[0] * a, DANGER[1] * a, DANGER[2] * a, pulse);
          setColor(d, j, DANGER_SHADE[0] * a, DANGER_SHADE[1] * a, DANGER_SHADE[2] * a, pulse);
        }
        s.ringPos.needsUpdate = true;
        s.ringColor.needsUpdate = true;
        s.ringShadeColor.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      s.shadow.geometry.dispose();
      s.ring.geometry.dispose();
      s.ringShade.geometry.dispose();
    }
    if (--users === 0) {
      darken?.dispose();
      glow?.dispose();
      darken = glow = null;
    }
  }
}
