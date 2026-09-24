import type { Backend, Tier } from '../world/contracts';

/**
 * Capability class → starting tier (PLAN §15.1, §14.2). Heuristics first (backend, adapter,
 * device type), then a short benchmark refines it. The player can always override.
 */
export interface CapabilityInput {
  backend: Backend;
  /** WebGPU adapter vendor/architecture or the WebGL renderer string. */
  gpu: string;
  isPhone: boolean;
  /** navigator.deviceMemory (GB) when available. */
  deviceMemory?: number;
  /** Benchmark: GPU (or frame) ms for the title scene at render scale 1, 1080p-equivalent. */
  benchmarkMs?: number;
}

const ORDER: Tier[] = ['lite', 'low', 'medium', 'high', 'ultra'];
const rank = (t: Tier) => ORDER.indexOf(t);
const minTier = (a: Tier, b: Tier): Tier => (rank(a) <= rank(b) ? a : b);

export function heuristicTier(c: CapabilityInput): Tier {
  const g = c.gpu.toLowerCase();
  let t: Tier;
  if (/uhd|hd graphics|gen-?9|gen-?9\.5|celeron|mali-g5|mali-g3|adreno \(tm\) 5|powervr/.test(g)) t = 'low';
  else if (/iris|xe|intel|apple m1|m1\b|adreno|mali|apple a1[3-6]/.test(g)) t = 'medium';
  else if (/apple m[2-9]|apple|nvidia|geforce|rtx|radeon|amd|arc a7/.test(g)) t = 'high';
  else t = 'medium';
  if (/m\d (pro|max|ultra)|rtx (30[6-9]|40|50)|radeon rx 7/.test(g)) t = 'ultra';
  if (c.backend === 'webgl2') t = minTier(t, 'medium');
  if (c.deviceMemory !== undefined && c.deviceMemory <= 4) t = minTier(t, 'low');
  // Consensus E7: phones cap at the Medium feature set until Phase 2b.
  if (c.isPhone) t = minTier(t, 'medium');
  return t;
}

/** Benchmark refinement: the title at scale 1 must fit comfortably inside the tier's frame budget. */
export function refineWithBenchmark(start: Tier, benchmarkMs: number | undefined, isPhone: boolean): Tier {
  if (benchmarkMs === undefined || !(benchmarkMs > 0)) return start;
  let t: Tier;
  if (benchmarkMs < 3) t = 'ultra';
  else if (benchmarkMs < 6) t = 'high';
  else if (benchmarkMs < 11) t = 'medium';
  else if (benchmarkMs < 20) t = 'low';
  else t = 'lite';
  // The benchmark may lower the heuristic tier by any amount, but raise it by at most one step.
  const up = ORDER[Math.min(rank(start) + 1, ORDER.length - 1)];
  t = rank(t) > rank(start) ? minTier(t, up) : t;
  return isPhone ? minTier(t, 'medium') : t;
}

export function isPhoneDevice(
  nav: { userAgent: string; maxTouchPoints?: number },
  screenMin: number,
): boolean {
  const ua = nav.userAgent;
  if (/iPhone|iPod/.test(ua)) return true;
  if (/Android/.test(ua) && /Mobile/.test(ua)) return true;
  return (nav.maxTouchPoints ?? 0) > 1 && screenMin < 600 && !/iPad|Macintosh/.test(ua);
}
