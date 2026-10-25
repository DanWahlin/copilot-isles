import { Color, InstancedBufferAttribute, NormalBlending, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  float,
  instancedBufferAttribute,
  mix,
  normalize,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { releaseInstanceAttributes } from '../../engine/instance-buffers';
import { releaseSpriteQuad, useSpriteQuad } from '../../engine/sprite-quad';
import { world } from '../uniforms';
import { terrainNoiseTexture } from '../terrain/noise-texture';

// three's fluent TSL typings don't cover every scalar/vector mix used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** One mist card: its centre (m) and size (a bank is 1.7 × `s` wide and 0.72 × `s` tall). */
export interface MistCard {
  x: number;
  y: number;
  z: number;
  s: number;
}

/** An island's mist look: its shade and sun colours (sRGB hex) and the height it fades out under. */
export interface MistLook {
  name: string;
  shade: number;
  sun: number;
  top: number;
  /** How thick the cards are at rest (1 by default). */
  density?: number;
  /** How tall a bank is against its width (1 by default; lower is a thinner layer). */
  aspect?: number;
  /** How bright it reads in the sun (1 by default). */
  bright?: number;
  /** How much brighter a bank's sunlit top is than its foot (0 by default). */
  topLight?: number;
  /** Whether small cards (under about 20 m) are a fall's spray: round, brighter and thinner (default off). */
  spray?: boolean;
  /** How softly a bank fades to its edge (0 a frayed but clear edge, the default; 1 no edge at all). */
  soft?: number;
}

export interface MistCards {
  sprite: Sprite;
  /** How thick the mist is (1 at the island's authored mood; Thousand-Bough's Seal thins it to 0.7). */
  setDensity(k: number): void;
  dispose(): void;
}

/**
 * An island's mist (Thousand-Bough's valley, Keelhaven's valley head and cloud caps): big soft cards
 * (one instanced sprite, one material: one shader for every island, its look in uniforms) drifting
 * slowly, shaded from the cool shade colour to the warm sun colour on the side toward the sun, fading
 * out near the camera and toward their top and bottom, so no hard line shows where they meet the world.
 */
export function createMistCards(cards: readonly MistCard[], look: MistLook): MistCards {
  const data = new Float32Array(cards.length * 4);
  cards.forEach((c, i) => data.set([c.x, c.y, c.z, c.s], i * 4));
  const attr = new InstancedBufferAttribute(data, 4);
  const card = instancedBufferAttribute(attr) as AnyNode;
  const base = look.density ?? 1;
  const densityU = uniform(base) as AnyNode;
  const shadeU = uniform(new Color(look.shade)) as AnyNode;
  const sunU = uniform(new Color(look.sun)) as AnyNode;
  const topU = uniform(look.top) as AnyNode;
  const aspectU = uniform(look.aspect ?? 1) as AnyNode;
  const brightU = uniform(look.bright ?? 1) as AnyNode;
  const topLightU = uniform(look.topLight ?? 0) as AnyNode;
  const sprayU = uniform(look.spray ? 1 : 0) as AnyNode;
  const softU = uniform(look.soft ?? 0) as AnyNode;
  // A fall's spray (with `spray`): a small card, round, brighter, a little thinner.
  const small = float(1)
    .sub(smoothstep(16, 24, card.w))
    .mul(sprayU) as AnyNode;
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending });
  material.name = look.name;
  const seed = card.x.mul(0.137).add(card.z.mul(0.071));
  const t = world.time as AnyNode;
  const drift = vec3(
    sin(t.mul(0.021).add(seed)).mul(4),
    sin(t.mul(0.033).add(seed.mul(1.7))).mul(0.8),
    sin(t.mul(0.017).add(seed.mul(2.3))).mul(4),
  );
  const centre = card.xyz.add(drift) as AnyNode;
  material.positionNode = centre;
  // Wide, low banks rather than round puffs.
  const breathe = float(1).add(sin(t.mul(0.05).add(seed)).mul(0.06));
  const aspect = mix(aspectU, float(1.3), small);
  material.scaleNode = vec2(card.w.mul(1.7), card.w.mul(0.72).mul(aspect)).mul(breathe);
  // A soft bank broken into wisps: two layers of the shared noise (drifting slowly, each card its
  // own patch) carve the round falloff, so its edges fray instead of ending in a sheet's outline.
  const q = uv() as AnyNode;
  const p = q.sub(0.5).mul(2);
  const d2 = p.dot(p);
  const noiseTex = terrainNoiseTexture();
  const n1 = texture(
    noiseTex,
    q
      .mul(vec2(0.55, 0.3))
      .add(vec2(seed.mul(0.37), seed.mul(0.21)))
      .add(t.mul(0.0035)),
  ) as AnyNode;
  const n2 = texture(
    noiseTex,
    q
      .mul(vec2(1.3, 0.8))
      .add(vec2(seed.mul(0.11), seed.mul(0.53)))
      .sub(t.mul(0.006)),
  ) as AnyNode;
  const wisp = n1.r.mul(0.65).add(n2.g.mul(0.35));
  const body = clamp(float(1).sub(d2), 0, 1);
  const frayed = smoothstep(0.32, 0.78, body.mul(0.75).add(wisp.mul(0.6)).sub(0.15)).mul(body.pow(1.1));
  // A soft layer: thickest in its middle, thinning all the way to its edge, the wisps only shading it.
  const layer = body.pow(1.5).mul(smoothstep(0.3, 0.85, wisp.add(body.mul(0.25))));
  const puff = mix(frayed, layer, softU);
  // Warm where the view looks toward the sun through it; cool in the shade.
  const view = normalize(centre.sub(cameraPosition)) as AnyNode;
  const sunward = smoothstep(-0.2, 0.85, view.dot(world.sunDir)) as AnyNode;
  const lit = mix(shadeU, sunU, sunward.mul(0.7).add(0.15)) as AnyNode;
  const light = (world.sunColor as AnyNode)
    .length()
    .mul(0.13)
    .add(world.skyColor.mul(0.9).length().mul(0.55))
    .add(float(0.08).mul(float(1).sub(world.night.mul(0.7)))) as AnyNode;
  // Lit from above: a bank's top reads brighter than its foot (`topLight`), spray brightest.
  const top = float(1).add(q.y.sub(0.5).mul(topLightU));
  const bright = mix(brightU, brightU.mul(1.25), small).mul(top);
  material.colorNode = lit.mul(clamp(light, 0.12, 1.25)).mul(bright);
  const dist = centre.sub(cameraPosition).length() as AnyNode;
  // Gone within 10 m of the camera, full by 30 m or so (no sheet across the lens).
  const near = smoothstep(card.w.mul(0.3).add(14), card.w.mul(0.6).add(42), dist);
  const height = smoothstep(4, 10, centre.y).mul(float(1).sub(smoothstep(topU.sub(8), topU, centre.y)));
  material.opacityNode = puff
    .mul(near)
    .mul(height)
    .mul(0.22)
    .mul(densityU)
    .mul(mix(float(1), float(0.7), small));
  material.fog = true;
  const sprite = useSpriteQuad(new Sprite(material));
  sprite.count = cards.length;
  sprite.name = look.name;
  sprite.frustumCulled = false;
  sprite.renderOrder = 2;
  sprite.castShadow = false;
  sprite.receiveShadow = false;
  return {
    sprite,
    setDensity(k) {
      densityU.value = base * k;
    },
    dispose() {
      material.dispose();
      releaseSpriteQuad(sprite);
      releaseInstanceAttributes([attr]);
    },
  };
}
