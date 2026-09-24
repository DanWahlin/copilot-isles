import { describe, expect, it, vi } from 'vitest';
import {
  benchmarkStorageKey,
  readStartupBenchmark,
  refineTierFromBenchmark,
  writeStartupBenchmark,
} from './benchmark';

describe('startup benchmark helpers', () => {
  it('builds stable storage keys', () => {
    expect(benchmarkStorageKey('webgpu', ' Apple   M3 Max ')).toBe(
      'copilot-isles.benchmark.v1:webgpu:apple m3 max',
    );
  });

  it('persists valid samples and rejects stale ones', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const key = benchmarkStorageKey('webgl2', 'renderer');
    writeStartupBenchmark(key, {
      backend: 'webgl2',
      gpu: 'renderer',
      measuredAt: 1000,
      frames: 20,
      wallMs: 1000,
      cpuMs: 2,
      gpuMs: 4,
      fps: 60,
      heuristicTier: 'medium',
      refinedTier: 'high',
    });
    expect(readStartupBenchmark(key, 2000)?.refinedTier).toBe('high');
    expect(readStartupBenchmark(key, 1000 + 1000 * 60 * 60 * 24 * 31)).toBeNull();
    vi.unstubAllGlobals();
  });

  it('caps phone benchmark refinement at medium', () => {
    expect(refineTierFromBenchmark('high', 1, true)).toBe('medium');
  });
});
