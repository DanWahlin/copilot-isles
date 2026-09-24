import { describe, expect, it } from 'vitest';
import { classifyRenderer } from './detect';

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
