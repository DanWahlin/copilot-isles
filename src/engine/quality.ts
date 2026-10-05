import type { Tier } from '../world/contracts';

/**
 * Per-tier feature settings (PLAN §12.1 + delta consensus D1). Systems read these; they never
 * branch on device names. Values here are the single source for what each tier turns on.
 */
export interface TierSettings {
  tier: Tier;
  targetFps: 30 | 60;
  renderScale: number;
  maxDpr: number;
  /** Gerstner wave count (Low/Lite: 3). */
  waves: number;
  foamOctaves: 1 | 2 | 3;
  /** Analytic hull reflection rays: 4 (High/Ultra), 1 (Medium), 0 = hull smear (Low), -1 = none (Lite). */
  hullRays: 4 | 1 | 0 | -1;
  refractionDistortion: boolean;
  caustics: boolean;
  sparkles: boolean;
  /** Planar mirror in calm zones (High/Ultra only). */
  mirror: boolean;
  shadowMap: 0 | 1024 | 2048 | 4096;
  /** Cascaded sun shadows: 0 = single/no map, otherwise number of cascades. */
  shadowCascades: 0 | 2 | 3;
  dynamicShadows: boolean;
  cloudShadowRes: 0 | 128 | 256;
  clouds: 'layer' | 'dome' | 'volumetric';
  ssao: boolean;
  bloom: boolean;
  sunShafts: 'none' | 'radial' | 'shadowmap';
  /** Leaps director: 0 off, 0.5 half splashes, 1 full. */
  leaps: 0 | 0.5 | 1;
  /** Plant density multiplier (grass and scattered plants) and grass draw distance (m). */
  grassDensity: number;
  /** Extra multiplier on the grass blades only (Lite has none, Low a sparse lawn). */
  grassCover: number;
  grassDistance: number;
  /** Tree near-geometry distance before impostors (m). */
  treeNear: number;
  birds: number;
  npcAnimRate: number;
}

const base: Omit<TierSettings, 'tier'> = {
  targetFps: 60,
  renderScale: 1,
  maxDpr: 1.5,
  waves: 6,
  foamOctaves: 3,
  hullRays: 4,
  refractionDistortion: true,
  caustics: true,
  sparkles: true,
  mirror: true,
  shadowMap: 4096,
  shadowCascades: 0,
  dynamicShadows: true,
  cloudShadowRes: 256,
  clouds: 'dome',
  ssao: true,
  bloom: true,
  sunShafts: 'shadowmap',
  leaps: 1,
  grassDensity: 1,
  grassCover: 1,
  grassDistance: 88,
  treeNear: 75,
  birds: 30,
  npcAnimRate: 1,
};

export const TIERS: Record<Tier, TierSettings> = {
  lite: {
    ...base,
    tier: 'lite',
    targetFps: 30,
    renderScale: 0.55,
    maxDpr: 1,
    waves: 3,
    foamOctaves: 1,
    hullRays: -1,
    refractionDistortion: false,
    caustics: false,
    sparkles: false,
    mirror: false,
    shadowMap: 0,
    shadowCascades: 0,
    dynamicShadows: false,
    cloudShadowRes: 0,
    clouds: 'layer',
    ssao: false,
    bloom: false,
    sunShafts: 'none',
    leaps: 0,
    grassDensity: 0.25,
    grassCover: 0,
    grassDistance: 30,
    treeNear: 30,
    birds: 8,
    npcAnimRate: 0.5,
  },
  low: {
    ...base,
    tier: 'low',
    targetFps: 30,
    renderScale: 0.65,
    maxDpr: 1,
    waves: 3,
    foamOctaves: 1,
    hullRays: 0,
    refractionDistortion: false,
    caustics: false,
    sparkles: false,
    mirror: false,
    shadowMap: 1024,
    shadowCascades: 0,
    dynamicShadows: false,
    cloudShadowRes: 128,
    clouds: 'layer',
    ssao: false,
    bloom: false,
    sunShafts: 'none',
    leaps: 0.5,
    grassDensity: 0.45,
    grassCover: 0.28,
    grassDistance: 46,
    treeNear: 45,
    birds: 14,
    npcAnimRate: 0.5,
  },
  medium: {
    ...base,
    tier: 'medium',
    renderScale: 0.9,
    maxDpr: 1.25,
    waves: 5,
    foamOctaves: 2,
    hullRays: 1,
    mirror: false,
    shadowMap: 2048,
    shadowCascades: 2,
    // Quarter-res AO on WebGPU; the cheap highlight glow is High and Ultra only.
    ssao: true,
    bloom: false,
    sunShafts: 'radial',
    grassDensity: 0.7,
    grassDistance: 64,
    treeNear: 60,
    birds: 22,
  },
  high: {
    ...base,
    tier: 'high',
    clouds: 'volumetric',
    mirror: false,
    shadowCascades: 2,
    cloudShadowRes: 0,
  },
  ultra: {
    ...base,
    tier: 'ultra',
    clouds: 'volumetric',
    shadowCascades: 3,
    maxDpr: 2,
    grassDistance: 110,
    treeNear: 90,
    birds: 40,
  },
};

export function tierSettings(tier: Tier): TierSettings {
  return TIERS[tier];
}
