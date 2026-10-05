import { describe, expect, it } from 'vitest';
import { heuristicTier, isPhoneDevice, refineWithBenchmark } from './capability';

describe('heuristicTier', () => {
  it('maps common GPUs to capability classes', () => {
    expect(heuristicTier({ backend: 'webgpu', gpu: 'intel gen-9 UHD Graphics 620', isPhone: false })).toBe(
      'low',
    );
    expect(heuristicTier({ backend: 'webgpu', gpu: 'intel xe', isPhone: false })).toBe('medium');
    expect(heuristicTier({ backend: 'webgpu', gpu: 'apple metal-3 Apple M2', isPhone: false })).toBe('high');
    expect(heuristicTier({ backend: 'webgpu', gpu: 'Apple M3 Max', isPhone: false })).toBe('ultra');
  });
  it('caps phones at medium and the WebGL2 backend at medium', () => {
    expect(heuristicTier({ backend: 'webgpu', gpu: 'Apple M3 Max', isPhone: true })).toBe('medium');
    expect(heuristicTier({ backend: 'webgl2', gpu: 'NVIDIA GeForce RTX 4090', isPhone: false })).toBe(
      'medium',
    );
  });
  it('caps low-memory devices at low', () => {
    expect(heuristicTier({ backend: 'webgpu', gpu: 'apple M2', isPhone: false, deviceMemory: 4 })).toBe(
      'low',
    );
  });
});

describe('heuristicTier on WebGPU with the WebGL renderer string', () => {
  const tier = (gpu: string) => heuristicTier({ backend: 'webgpu', gpu, isPhone: false });
  it('reads the model on Windows, Linux, and macOS', () => {
    expect(
      tier(
        'nvidia ampere ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ),
    ).toBe('ultra');
    expect(
      tier(
        'nvidia ampere ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ),
    ).toBe('high');
    expect(
      tier(
        'intel gen-12lp ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ),
    ).toBe('medium');
    expect(tier('intel gen-9 ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)')).toBe(
      'low',
    );
    expect(tier('amd rdna-2 ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(
      'high',
    );
    expect(tier('apple metal-3 ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)')).toBe(
      'ultra',
    );
  });
});

describe('refineWithBenchmark', () => {
  it('lowers freely but raises at most one step', () => {
    expect(refineWithBenchmark('high', 30, false)).toBe('lite');
    expect(refineWithBenchmark('low', 1, false)).toBe('medium');
    expect(refineWithBenchmark('medium', undefined, false)).toBe('medium');
  });
  it('keeps phones at medium or below', () => {
    expect(refineWithBenchmark('medium', 1, true)).toBe('medium');
  });
});

describe('isPhoneDevice', () => {
  it('detects phones but not iPads or desktops', () => {
    expect(isPhoneDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)' }, 390)).toBe(true);
    expect(isPhoneDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Mobile' }, 412)).toBe(true);
    expect(
      isPhoneDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 }, 820),
    ).toBe(false);
    expect(
      isPhoneDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0 }, 900),
    ).toBe(false);
  });
});
