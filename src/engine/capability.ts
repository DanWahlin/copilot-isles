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

/** Device family for the settings copy (which examples each tier names). */
export type Platform = 'mac' | 'windows' | 'linux' | 'chromeos' | 'mobile' | 'other';

export function detectPlatform(nav: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; mobile?: boolean };
}): Platform {
  const ua = nav.userAgent;
  if (nav.userAgentData?.mobile || /iPhone|iPod|iPad|Android/.test(ua)) return 'mobile';
  // iPadOS reports a Mac user agent; a touch screen gives it away.
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'mobile';
  // The user agent's OS token first (every browser keeps it); the platform hints only as a fallback.
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Linux|X11/.test(ua)) return 'linux';
  const p = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''}`.toLowerCase();
  if (p.includes('chrome os')) return 'chromeos';
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux')) return 'linux';
  return 'other';
}

/**
 * A short GPU name for the settings screen, e.g. "Apple M3 Max" or "NVIDIA GeForce RTX 3060", from the
 * WebGL renderer string (ANGLE on Windows, macOS, and Linux wraps it; Mesa and Vulkan add driver
 * details) or, failing that, the WebGPU adapter's vendor. '' if unknown.
 */
export function friendlyGpuName(webglRenderer: string, webgpuVendor = ''): string {
  let s = webglRenderer.trim();
  const angle = /^ANGLE \((.*)\)$/.exec(s);
  if (angle) {
    const parts = angle[1]!.split(', ');
    // "Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version" or "NVIDIA, NVIDIA GeForce …, D3D11".
    s = (parts.length > 1 ? parts[1]! : parts[0]!).replace(/^ANGLE [\w ]+ Renderer: /, '');
  }
  // ANGLE on Vulkan: "Vulkan 1.3.242 (NVIDIA GeForce RTX 3060 (0x00002503))".
  const vk = /^Vulkan [\d.]+ \((.*)\)$/.exec(s);
  if (vk) s = vk[1]!;
  s = s
    .replace(/\((R|TM)\)/gi, '')
    .replace(/^Mesa\s+/i, '')
    .replace(/\/PCIe.*$/i, '')
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s*\((radeonsi|[A-Z]{2,4} GT\d|LLVM)[^)]*\)/gi, '')
    .replace(/\s+(Direct3D|vs_|ps_|OpenGL|Vulkan|Metal|D3D).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s && !/^(webkit webgl|generic renderer|unknown|disabled)$/i.test(s)) return s.slice(0, 48);
  const v = webgpuVendor.trim();
  return v ? `${v.charAt(0).toUpperCase()}${v.slice(1)} GPU` : '';
}
