import { Color, InstancedBufferAttribute, NormalBlending, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  color,
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
import type { TierSettings } from '../../../engine/quality';
import { releaseInstanceAttributes } from '../../../engine/instance-buffers';
import { releaseSpriteQuad, useSpriteQuad } from '../../../engine/sprite-quad';
import { mulberry32 } from '../../../util/math';
import { world } from '../../uniforms';
import { terrainNoiseTexture } from '../../terrain/noise-texture';
import { THOUSAND_BOUGH as TB, TREE } from './layout';
import { thousandBoughHeight } from './height';
import { GREAT_FALLS_CURTAIN } from './water';
import { CURTAIN_FOOT_Y as GREAT_FALLS_FOOT_Y } from './water-mesh';
import type { WalkClearance } from './village/clearance';

// three's fluent TSL typings don't cover every scalar/vector mix used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** Mist cards per tier (spec §9.8): none on Lite (the haze carries it), 20 / 40 / 60. */
const COUNT: Record<TierSettings['tier'], number> = { lite: 0, low: 20, medium: 40, high: 60, ultra: 60 };

export interface Mist {
  sprite: Sprite;
  /** How thick the mist is (1 at the island's authored mood; the Seal thins it to 0.7). */
  setDensity(k: number): void;
  dispose(): void;
}

/** A card's spot: centre and size, kept clear of the ground, the trunk, the decks and every walk. */
export function mistCards(
  count: number,
  clearance: WalkClearance,
): { x: number; y: number; z: number; s: number }[] {
  const rand = mulberry32(0x3157);
  const out: { x: number; y: number; z: number; s: number }[] = [];
  const top = TB.mood.mistTop;
  // Spray where the two big falls land: a bank across each foot, low over its pool.
  const [veil, , great] = TB.water.falls;
  out.push({ x: great!.lip.x, y: GREAT_FALLS_FOOT_Y + 4.2, z: GREAT_FALLS_CURTAIN.footZ + 2.5, s: 13 });
  out.push({ x: veil!.foot.x, y: veil!.lip.y - veil!.drop + 4, z: veil!.foot.z + 2, s: 11 });
  // Over the valley floor, the pools and the cove's inner edge; thickest low in the shade.
  for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 170;
    const x = 1995 + Math.cos(a) * r * 1.15;
    const z = -1505 + Math.sin(a) * r;
    const ground = thousandBoughHeight(x, z);
    if (ground < 2 || ground > 26) continue;
    const s = 14 + rand() * 14;
    // Low in the valley: lying on the ground's hollows, not floating at the trees' tops.
    const y = Math.max(6, ground + s * 0.22 + 2) + rand() * 3;
    if (y > top - 2) continue;
    // A bank is 1.7 × its size wide and 0.72 × tall (its soft middle about 60% of that).
    const half = s * 0.36;
    const wide = s * 0.6;
    // Clear of the ground under it and round it (the cards are soft; their middles stay in the air).
    let low = Infinity;
    for (let k = 0; k < 8; k++) {
      const b = (k / 8) * Math.PI * 2;
      low = Math.min(low, y - thousandBoughHeight(x + Math.cos(b) * wide, z + Math.sin(b) * wide));
    }
    if (low < half * 0.55 + 3) continue;
    if (Math.hypot(x - TREE.x, z - TREE.z) < 30 + wide) continue;
    // Off the sightline from where you land to the trunk (the first look at the tree stays clear).
    const L = TB.harbor.landingShot;
    if (sightDistance(x, y, z, L.x, L.y, L.z, L.tx, L.ty, L.tz) < wide * 0.7 + 4) continue;
    // Nor in the landing's view toward the tree (a 25° cone short of the trunk): the first look is clear.
    {
      const vx = TREE.x - L.x;
      const vz = TREE.z - L.z;
      const px = x - L.x;
      const pz = z - L.z;
      const along = (px * vx + pz * vz) / Math.hypot(vx, vz);
      const cos = along / (Math.hypot(px, pz) || 1);
      if (along > 0 && along < Math.hypot(vx, vz) - 20 && cos > Math.cos((40 * Math.PI) / 180)) continue;
    }
    // Nor across the hero views of the tree (from the sea, the decks, the Root Gate).
    {
      const T = { x: TREE.x, y: 35, z: TREE.z };
      let across = false;
      for (const [cx, cy, cz] of HERO_EYES)
        if (sightDistance(x, y, z, cx, cy, cz, T.x, T.y, T.z) < wide * 0.7 + 4) across = true;
      if (across) continue;
    }
    if (clearance.conflict(x, y, z, wide * 0.6, { beside: 3, above: 3, below: 3 })) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < (c.s + s) * 0.3)) continue;
    out.push({ x, y, z, s });
  }
  return out;
}

/** Where the hero shots look at the tree from (spec §2.8): no bank sits across those views. */
const HERO_EYES: readonly (readonly [number, number, number])[] = [
  [1700, 12, -1020],
  [1820, 10, -1180],
  [1932.5, 6.4, -1362],
  [1955, 40, -1500],
  [1980, 16.5, -1532],
  [1972, 20.5, -1522],
];

/** How far (x, y, z) is from the segment a → b (3D). */
function sightDistance(
  x: number,
  y: number,
  z: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz)),
  );
  return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t);
}

/**
 * The valley's mist (spec §2.4): big soft cards (one instanced sprite, one material: a new shader,
 * PLAN §15.4) drifting slowly between 8 m and the mist's top, shaded from the cool shade colour to the
 * warm sun colour on the side toward the sun, fading out near the camera (gone within 6 m) and toward
 * their top and bottom, so no hard line shows where they meet the world.
 */
export function createMist(tier: TierSettings, clearance: WalkClearance): Mist | null {
  const n = COUNT[tier.tier];
  if (n === 0) return null;
  const cards = mistCards(n, clearance);
  if (cards.length === 0) return null;
  const data = new Float32Array(cards.length * 4);
  cards.forEach((c, i) => data.set([c.x, c.y, c.z, c.s], i * 4));
  const attr = new InstancedBufferAttribute(data, 4);
  const card = instancedBufferAttribute(attr) as AnyNode;
  const densityU = uniform(1) as AnyNode;
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending });
  material.name = 'thousand-bough-mist';
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
  material.scaleNode = vec2(card.w.mul(1.7), card.w.mul(0.72)).mul(breathe);
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
  const puff = smoothstep(0.32, 0.78, body.mul(0.75).add(wisp.mul(0.6)).sub(0.15)).mul(body.pow(1.1));
  // Warm where the view looks toward the sun through it; cool in the shade.
  const view = normalize(centre.sub(cameraPosition)) as AnyNode;
  const sunward = smoothstep(-0.2, 0.85, view.dot(world.sunDir)) as AnyNode;
  const shade = new Color(TB.mood.mistShade);
  const sunC = new Color(TB.mood.mistSun);
  const lit = mix(color(shade), color(sunC), sunward.mul(0.7).add(0.15)) as AnyNode;
  const light = (world.sunColor as AnyNode)
    .length()
    .mul(0.13)
    .add(world.skyColor.mul(0.9).length().mul(0.55))
    .add(float(0.08).mul(float(1).sub(world.night.mul(0.7)))) as AnyNode;
  material.colorNode = lit.mul(clamp(light, 0.12, 1.25));
  const dist = centre.sub(cameraPosition).length() as AnyNode;
  // Gone within 10 m of the camera, full by 30 m or so (no sheet across the lens).
  const near = smoothstep(card.w.mul(0.3).add(14), card.w.mul(0.6).add(42), dist);
  const height = smoothstep(4, 10, centre.y).mul(
    float(1).sub(smoothstep(TB.mood.mistTop - 8, TB.mood.mistTop, centre.y)),
  );
  material.opacityNode = puff.mul(near).mul(height).mul(0.22).mul(densityU);
  material.fog = true;
  const sprite = useSpriteQuad(new Sprite(material));
  sprite.count = cards.length;
  sprite.name = 'thousand-bough-mist';
  sprite.frustumCulled = false;
  sprite.renderOrder = 2;
  sprite.castShadow = false;
  sprite.receiveShadow = false;
  return {
    sprite,
    setDensity(k) {
      densityU.value = k;
    },
    dispose() {
      material.dispose();
      releaseSpriteQuad(sprite);
      releaseInstanceAttributes([attr]);
    },
  };
}
