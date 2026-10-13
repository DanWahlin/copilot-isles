import { describe, expect, it } from 'vitest';
import { detectPlatform, friendlyGpuName } from './capability';
import { TIERS, sunShadowReach } from './quality';
import { TIER_ORDER, tierBlurbs, tierFeatures, tierFor } from './tier-info';

describe('tier blurbs', () => {
  it('follow the TIERS table', () => {
    for (const tier of TIER_ORDER) {
      const t = TIERS[tier];
      const f = tierFeatures(t);
      expect(f[0]).toBe(`${t.targetFps} fps`);
      expect(f.includes('no sun shadows')).toBe(t.shadowCascades === 0);
      expect(f.includes('no grass')).toBe(t.grassDensity * t.grassCover === 0);
      expect(f.includes('soft contact shadows')).toBe(t.ssao);
      expect(f.includes('glowing highlights')).toBe(t.bloom);
      expect(f.includes('harbor reflections')).toBe(t.mirror);
      expect(f.includes('3D clouds')).toBe(t.clouds === 'volumetric');
    }
  });

  it('give every tier its own line, and Ultra says it is heavy', () => {
    const b = tierBlurbs('webgpu');
    expect(new Set(Object.values(b)).size).toBe(TIER_ORDER.length);
    expect(b.lite).toMatch(/no sun shadows/);
    for (const p of ['mac', 'windows', 'linux', 'mobile'] as const)
      expect(tierFor(p).ultra).toMatch(/^Heavy/);
    expect(b.ultra).toMatch(/^Everything in High, plus /);
  });

  it('say how far the sun shadows reach (about 60 m, 90 m, 170 m)', () => {
    expect(TIER_ORDER.map((t) => sunShadowReach(TIERS[t]))).toEqual([0, 60, 60, 90, 170]);
    for (const backend of ['webgpu', 'webgl2'] as const) {
      expect(tierFeatures(TIERS.low, backend)).toContain('sun shadows near you');
      expect(tierFeatures(TIERS.medium, backend)).toContain('sun shadows near you');
      expect(tierFeatures(TIERS.high, backend)).toContain('sun shadows farther out');
      expect(tierFeatures(TIERS.ultra, backend)).toContain('sun shadows that reach farthest');
    }
    expect(Object.values(tierBlurbs('webgpu')).join(' ')).not.toMatch(/distant shadows/);
  });

  it('leave out WebGPU-only features on WebGL2', () => {
    const b = tierBlurbs('webgl2');
    expect(b.high).not.toMatch(/3D clouds|contact shadows/);
  });
});

describe('tierFor', () => {
  it('names Macs only on a Mac', () => {
    for (const p of ['windows', 'linux', 'chromeos', 'other', 'mobile'] as const)
      expect(Object.values(tierFor(p)).join(' ')).not.toMatch(/\bMacs?\b/);
    expect(tierFor('mac').high).toMatch(/Mac/);
    expect(tierFor('windows').ultra).toMatch(/RTX/);
  });
});

describe('detectPlatform', () => {
  const ua = {
    win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
    linux:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0',
    cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0',
    android:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile',
  };
  it('tells desktop systems apart', () => {
    expect(detectPlatform({ userAgent: ua.win })).toBe('windows');
    expect(detectPlatform({ userAgent: ua.linux })).toBe('linux');
    expect(detectPlatform({ userAgent: ua.mac })).toBe('mac');
    expect(detectPlatform({ userAgent: ua.cros })).toBe('chromeos');
  });
  it('treats phones and iPads (which claim to be Macs) as mobile', () => {
    expect(detectPlatform({ userAgent: ua.android })).toBe('mobile');
    expect(detectPlatform({ userAgent: ua.mac, maxTouchPoints: 5 })).toBe('mobile');
  });
});

describe('friendlyGpuName', () => {
  it('unwraps ANGLE renderer strings', () => {
    expect(friendlyGpuName('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)')).toBe(
      'Apple M3 Max',
    );
    expect(
      friendlyGpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ).toBe('NVIDIA GeForce RTX 3060');
    expect(
      friendlyGpuName(
        'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      ),
    ).toBe('Intel UHD Graphics 620');
  });
  it('reads Windows AMD and Linux (OpenGL, Vulkan, Mesa) strings', () => {
    expect(friendlyGpuName('ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(
      'AMD Radeon RX 6700 XT',
    );
    expect(friendlyGpuName('ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)')).toBe(
      'Intel UHD Graphics 620',
    );
    expect(
      friendlyGpuName('ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.5.0)'),
    ).toBe('NVIDIA GeForce RTX 3060');
    expect(
      friendlyGpuName(
        'ANGLE (NVIDIA, Vulkan 1.3.242 (NVIDIA GeForce RTX 3060 (0x00002503)), NVIDIA-535.183)',
      ),
    ).toBe('NVIDIA GeForce RTX 3060');
    expect(friendlyGpuName('AMD Radeon RX 6600 (radeonsi, navi23, LLVM 15.0.7, DRM 3.49, 6.2.0)')).toBe(
      'AMD Radeon RX 6600',
    );
  });
  it('falls back to the WebGPU vendor, or nothing', () => {
    expect(friendlyGpuName('WebKit WebGL', 'apple')).toBe('Apple GPU');
    expect(friendlyGpuName('', '')).toBe('');
    expect(friendlyGpuName('Mali-G78')).toBe('Mali-G78');
  });
});
