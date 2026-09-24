import { describe, expect, it } from 'vitest';
import { chooseBackend, classifyAdapter, classifyRenderer, type GpuInfo, type WebGpuInfo } from './detect';

describe('classifyRenderer', () => {
  it.each([
    'Google SwiftShader',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Microsoft Basic Render Driver',
  ])('treats %s as software', (s) => {
    expect(classifyRenderer(s)).toBe('software');
  });

  it.each([
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Mali-G52',
  ])('treats %s as hardware', (s) => {
    expect(classifyRenderer(s)).toBe('hardware');
  });
});

describe('classifyAdapter', () => {
  it('treats fallback adapters and SwiftShader as software', () => {
    expect(classifyAdapter({ isFallbackAdapter: true, vendor: 'apple' })).toBe('software');
    expect(classifyAdapter({ vendor: 'google', architecture: 'swiftshader' })).toBe('software');
  });
  it('treats real adapters as hardware', () => {
    expect(classifyAdapter({ vendor: 'apple', architecture: 'metal-3' })).toBe('hardware');
    expect(classifyAdapter({ vendor: 'intel', architecture: 'gen-9' })).toBe('hardware');
  });
});

describe('chooseBackend', () => {
  const gpu = (kind: WebGpuInfo['kind']): WebGpuInfo => ({
    available: kind !== 'none',
    kind,
    vendor: '',
    architecture: '',
    features: [],
  });
  const gl = (kind: GpuInfo['kind']): GpuInfo => ({ webgl2: kind !== 'none', renderer: '', kind });

  it('prefers a hardware WebGPU adapter', () => {
    expect(chooseBackend(gpu('hardware'), gl('hardware')).backend).toBe('webgpu');
  });
  it('falls back to hardware WebGL2 when WebGPU is missing or software', () => {
    expect(chooseBackend(gpu('none'), gl('hardware')).backend).toBe('webgl2');
    expect(chooseBackend(gpu('software'), gl('hardware')).backend).toBe('webgl2');
  });
  it('honours ?webgl', () => {
    expect(chooseBackend(gpu('hardware'), gl('hardware'), { preferWebGL: true }).backend).toBe('webgl2');
  });
  it('routes software-only and no-WebGL2 devices to the 2D mode', () => {
    expect(chooseBackend(gpu('software'), gl('software'))).toEqual({ backend: null, reason: 'software' });
    expect(chooseBackend(gpu('none'), gl('none'))).toEqual({ backend: null, reason: 'no-webgl2' });
  });
  it('uses hardware WebGPU when WebGL2 is missing, even with ?webgl', () => {
    expect(chooseBackend(gpu('hardware'), gl('none')).backend).toBe('webgpu');
    expect(chooseBackend(gpu('hardware'), gl('none'), { preferWebGL: true })).toEqual({
      backend: 'webgpu',
      reason: 'webgl2 unavailable',
    });
  });
  it('never picks a software (fallback) WebGPU adapter without force', () => {
    expect(chooseBackend(gpu('software'), gl('none'))).toEqual({ backend: null, reason: 'no-webgl2' });
  });
  it('lets tests force the 3D path on software rendering', () => {
    expect(chooseBackend(gpu('none'), gl('software'), { force: true }).backend).toBe('webgl2');
    expect(chooseBackend(gpu('hardware'), gl('hardware'), { forceSoftware: true }).backend).toBeNull();
  });
});
