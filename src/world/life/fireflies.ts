import { AdditiveBlending, InstancedBufferAttribute, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  color,
  float,
  instancedBufferAttribute,
  mix,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { releaseSpriteQuad, useSpriteQuad } from '../../engine/sprite-quad';
import { world } from '../uniforms';

// three's fluent TSL typings don't cover every scalar/vector mix used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * One glowing point: where it rests, how far it wanders, how big it is, and its kind: 0 a firefly
 * (wanders and blinks, yellow-green), 1 a lantern's halo (still and steady, amber).
 */
export interface Glow {
  x: number;
  y: number;
  z: number;
  wander: number;
  size: number;
  kind: 0 | 1;
}

export interface Glows {
  sprite: Sprite;
  /** 0–1: how much of the glow shows (fireflies come out as the light goes; the Seal raises it). */
  setStrength(k: number): void;
  /** Lifts the fireflies by up to `metres` in a slow spiral (the Seal's cascade). */
  setRise(metres: number): void;
  /**
   * The lantern halos' light: `rest` before they're lit (1 by default), and `k` (0–1) how far a wave
   * of light has run down from `top` to `top - span` (halos above it shine in full).
   */
  setHalos(rest: number, k: number, top?: number, span?: number): void;
  dispose(): void;
}

/**
 * Fireflies and lantern halos (spec ISLAND-02 §2.4, §4.4): one instanced sprite of additive glows,
 * every motion in the shader (no CPU work a frame). Fireflies drift on slow loops and blink; halos
 * sit still round lanterns. Both kinds share one material graph (one shader for both sets). They show
 * as the sun goes down (at night in full), and less with reduced motion's still air.
 */
export function createGlows(points: readonly Glow[], name: string): Glows {
  const a = new Float32Array(points.length * 4);
  const b = new Float32Array(points.length * 4);
  points.forEach((p, i) => {
    a.set([p.x, p.y, p.z, (i * 0.618) % 1], i * 4);
    b.set([p.wander, p.size, p.kind, 0], i * 4);
  });
  const base = instancedBufferAttribute(new InstancedBufferAttribute(a, 4)) as AnyNode;
  const params = instancedBufferAttribute(new InstancedBufferAttribute(b, 4)) as AnyNode;
  const strength = uniform(1) as AnyNode;
  const rise = uniform(0) as AnyNode;
  const haloRest = uniform(1) as AnyNode;
  const wave = uniform(1) as AnyNode;
  const waveTop = uniform(100) as AnyNode;
  const waveSpan = uniform(100) as AnyNode;
  const material = new SpriteNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.name = 'glows';
  const t = world.time as AnyNode;
  const phase = base.w.mul(6.283);
  const still = float(1).sub(world.reducedMotion.mul(0.8));
  const wander = params.x.mul(still);
  const firefly = float(1).sub(params.z);
  const loop = (vec3 as AnyNode)(
    sin(t.mul(0.31).add(phase)).add(sin(t.mul(0.13).add(phase.mul(2.1))).mul(0.6)),
    sin(t.mul(0.23).add(phase.mul(1.3))).mul(0.5),
    sin(t.mul(0.27).add(phase.mul(0.7))).add(sin(t.mul(0.11).add(phase.mul(3.1))).mul(0.6)),
  ).mul(wander);
  // The Seal's spiral: up and round as `rise` grows.
  const spin = rise.mul(0.08).add(phase);
  const spiral = (vec3 as AnyNode)(
    sin(spin).mul(rise.mul(0.15)),
    rise.mul(base.w.mul(0.6).add(0.4)),
    sin(spin.add(1.57)).mul(rise.mul(0.15)),
  ).mul(firefly);
  material.positionNode = base.xyz.add(loop).add(spiral);
  const blink = mix(
    float(1),
    smoothstep(0.35, 1, sin(t.mul(1.7).add(phase.mul(5))))
      .mul(0.85)
      .add(0.15),
    firefly,
  );
  // A halo's light: lit once the wave from the top has passed it, else at rest.
  const lit = smoothstep(0, 0.08, wave.sub(waveTop.sub(base.y).div(waveSpan)));
  // Lit, a lantern's halo blooms bigger and brighter than any lantern before the Seal.
  const halo = mix(haloRest, float(2.4), lit);
  const haloLight = mix(float(1), halo, params.z);
  material.scaleNode = params.y.mul(mix(float(1), halo.mul(0.35).add(0.62), params.z));
  const p = (uv() as AnyNode).sub(0.5).mul(2);
  const r2 = p.dot(p);
  // Fireflies a bright pin, halos a small warm bloom that fades fast (not a big screen-facing orb).
  const core = clamp(float(1).sub(r2), 0, 1).pow(mix(float(3), float(2.8), params.z));
  const dusk = smoothstep(0.32, 0.02, world.sunDir.y).mul(0.75).add(world.night.mul(0.25));
  const tone = mix(color(0xd9ff7a), color(0xffb54a), params.z);
  // A firefly fades out as the camera comes within 3 m (no glowing ball across the lens).
  const near = mix(smoothstep(1.2, 3.2, base.xyz.distance(cameraPosition)), float(1), params.z);
  material.colorNode = tone.mul(
    near
      .mul(core)
      .mul(blink)
      .mul(dusk)
      .mul(strength)
      .mul(haloLight)
      .mul(mix(float(1.8), float(0.85), params.z)),
  );
  material.fog = true;
  const sprite = useSpriteQuad(new Sprite(material));
  sprite.count = points.length;
  sprite.name = name;
  sprite.frustumCulled = false;
  sprite.renderOrder = 3;
  sprite.castShadow = false;
  return {
    sprite,
    setStrength(k) {
      strength.value = k;
    },
    setRise(m) {
      rise.value = m;
    },
    setHalos(rest, k, top, span) {
      haloRest.value = rest;
      wave.value = k;
      if (top !== undefined) waveTop.value = top;
      if (span !== undefined) waveSpan.value = span;
    },
    dispose() {
      material.dispose();
      releaseSpriteQuad(sprite);
    },
  };
}
