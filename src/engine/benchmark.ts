import type { Engine } from './engine';
import type { Tier } from '../world/contracts';
import { refineWithBenchmark } from './capability';

export interface StartupBenchmarkSample {
  backend: 'webgpu' | 'webgl2';
  gpu: string;
  measuredAt: number;
  frames: number;
  wallMs: number;
  cpuMs: number;
  gpuMs: number;
  fps: number;
  heuristicTier: Tier;
  refinedTier: Tier;
}

const STORAGE_PREFIX = 'copilot-isles.benchmark.v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function clean(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120) || 'unknown';
}

export function benchmarkStorageKey(backend: 'webgpu' | 'webgl2', gpu: string): string {
  return `${STORAGE_PREFIX}:${backend}:${clean(gpu)}`;
}

export function readStartupBenchmark(key: string, now = Date.now()): StartupBenchmarkSample | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StartupBenchmarkSample;
    if (!parsed || now - parsed.measuredAt > MAX_AGE_MS) return null;
    if (!(parsed.gpuMs > 0) || !(parsed.cpuMs > 0) || parsed.frames < 10) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStartupBenchmark(key: string, sample: StartupBenchmarkSample): void {
  try {
    localStorage.setItem(key, JSON.stringify(sample));
  } catch {
    // Private mode / storage full: simply run the benchmark again next time.
  }
}

export function refineTierFromBenchmark(
  heuristic: Tier,
  benchmarkMs: number | undefined,
  isPhone: boolean,
): Tier {
  return refineWithBenchmark(heuristic, benchmarkMs, isPhone);
}

export async function runTitleStartupBenchmark(
  engine: Engine,
  options: {
    backend: 'webgpu' | 'webgl2';
    gpu: string;
    heuristicTier: Tier;
    isPhone: boolean;
    durationMs?: number;
    maxPixelRatio?: number;
  },
): Promise<StartupBenchmarkSample> {
  const durationMs = Math.min(1500, Math.max(250, options.durationMs ?? 1400));
  const renderer = engine.renderer;
  const pixelRatio = Math.min(options.maxPixelRatio ?? 1, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  let frames = 0;
  let cpuTotal = 0;
  let gpuTotal = 0;
  let last = performance.now();
  const start = last;
  const backendInfo = (renderer.backend as { trackTimestamp?: boolean }) ?? {};
  const useTimestamps = backendInfo.trackTimestamp === true;

  while (performance.now() - start < durationMs) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const before = performance.now();
    engine.renderNow();
    const after = performance.now();
    const wall = Math.max(0.01, after - last);
    last = after;
    const cpu = Math.max(0.01, after - before);
    let gpu = wall;
    if (useTimestamps) {
      try {
        const measured = await renderer.resolveTimestampsAsync('render');
        if (typeof measured === 'number' && measured > 0) gpu = Math.min(measured, wall);
      } catch {
        gpu = wall;
      }
    }
    cpuTotal += cpu;
    gpuTotal += gpu;
    frames += 1;
  }

  engine.resize();
  const wallMs = Math.max(1, performance.now() - start);
  const gpuMs = gpuTotal / Math.max(1, frames);
  const cpuMs = cpuTotal / Math.max(1, frames);
  const refinedTier = refineTierFromBenchmark(options.heuristicTier, gpuMs, options.isPhone);
  return {
    backend: options.backend,
    gpu: options.gpu,
    measuredAt: Date.now(),
    frames,
    wallMs,
    cpuMs,
    gpuMs,
    fps: (frames / wallMs) * 1000,
    heuristicTier: options.heuristicTier,
    refinedTier,
  };
}
