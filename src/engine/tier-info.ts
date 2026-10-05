import type { Backend, Tier } from '../world/contracts';
import type { Platform } from './capability';
import { TIERS, type TierSettings } from './quality';

/** Lowest to highest. */
export const TIER_ORDER: readonly Tier[] = ['lite', 'low', 'medium', 'high', 'ultra'];

export const TIER_NAMES: Readonly<Record<Tier, string>> = {
  lite: 'Lite',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
};

/**
 * Who each tier is for (PLAN §12.1 reference hardware), with examples a player on that kind of device
 * will recognise. Windows, Linux, ChromeOS and unknown systems share the PC examples.
 */
const TIER_FOR_BY: Readonly<Record<'pc' | 'mac' | 'mobile', Readonly<Record<Tier, string>>>> = {
  pc: {
    lite: 'Chromebooks, phones, and old laptops',
    low: 'Older laptops with Intel UHD graphics',
    medium: 'Laptops with Intel Iris Xe or Radeon graphics',
    high: 'Gaming laptops and cards like an RTX 3050',
    ultra: 'Heavy: desktop cards like an RTX 3060 and up',
  },
  mac: {
    lite: 'The oldest Intel Macs',
    low: 'Intel Macs with built-in graphics',
    medium: 'M1 Macs and older Macs with Radeon graphics',
    high: 'M2 and newer Macs',
    ultra: 'Heavy: Pro, Max, and Ultra Macs',
  },
  mobile: {
    lite: 'Older phones and tablets',
    low: 'Most phones',
    medium: 'Newer phones and tablets',
    high: 'Tablets with laptop chips, like an M1 iPad',
    ultra: 'Heavy: too much for phones and tablets',
  },
};

export function tierFor(platform: Platform = 'other'): Readonly<Record<Tier, string>> {
  return TIER_FOR_BY[platform === 'mac' ? 'mac' : platform === 'mobile' ? 'mobile' : 'pc'];
}

const BASE_GRASS_DISTANCE = 88;

/**
 * What a tier turns on, in player words, read from its TIERS row so the copy can't drift from what
 * renders. Features that need WebGPU are left out on the WebGL2 backend.
 */
export function tierFeatures(t: TierSettings, backend: Backend = 'webgpu'): string[] {
  const webgpu = backend === 'webgpu';
  const out = [`${t.targetFps} fps`];
  if (t.renderScale < 0.75) out.push('lower resolution');
  else if (t.renderScale < 1) out.push('slightly lower resolution');
  else if (t.maxDpr >= 2) out.push('sharper on high-res screens');
  else out.push('full resolution');
  out.push(
    t.shadowCascades === 0
      ? 'no sun shadows'
      : t.shadowCascades >= 3 && webgpu
        ? 'distant shadows'
        : 'sun shadows',
  );
  const grass = t.grassDensity * t.grassCover;
  if (grass <= 0) out.push('no grass');
  else if (grass < 0.3) out.push('a little grass');
  else if (grass < 0.95) out.push('most of the grass');
  else if (t.grassDistance > BASE_GRASS_DISTANCE) out.push('more grass');
  else out.push('all the grass');
  if (t.ssao && webgpu) out.push('soft contact shadows');
  if (t.bloom) out.push('glowing highlights');
  if (t.clouds === 'volumetric' && webgpu) out.push('3D clouds');
  if (t.mirror) out.push('harbor reflections');
  return out;
}

/**
 * What a tier draws, as one line for the settings list. A tier that keeps the tier below's frame rate
 * and sun shadows lists only what it adds ("Everything in High, plus …").
 */
export function tierBlurb(
  t: TierSettings,
  backend: Backend = 'webgpu',
  below: TierSettings | null = null,
): string {
  const f = tierFeatures(t, backend);
  if (below && below.targetFps === t.targetFps && below.shadowCascades > 0) {
    const had = new Set(tierFeatures(below, backend));
    const added = f.filter((x) => !had.has(x));
    if (added.length) return `Everything in ${TIER_NAMES[below.tier]}, plus ${list(added)}.`;
  }
  return `${capitalize(f.join(', '))}.`;
}

function list(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every tier's line, in TIER_ORDER. */
export function tierBlurbs(backend: Backend): Record<Tier, string> {
  const out = {} as Record<Tier, string>;
  TIER_ORDER.forEach((tier, i) => {
    out[tier] = tierBlurb(TIERS[tier], backend, i > 0 ? TIERS[TIER_ORDER[i - 1]!] : null);
  });
  return out;
}
