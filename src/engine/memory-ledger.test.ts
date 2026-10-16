import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  CompressedTexture,
  DataTexture,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
} from 'three/webgpu';
// three's own Info (not exported from three/webgpu), so the test follows its real bookkeeping.
import Info from 'three/src/renderers/common/Info.js';
import { compressedTextureBytes, correctMemoryInfo, type InfoWithMemory } from './memory-ledger';

const fresh = () => {
  const info = new Info() as unknown as InfoWithMemory & {
    createAttribute(a: object): void;
    destroyAttribute(a: object): void;
    createTexture(t: object): void;
    destroyTexture(t: object): void;
  };
  correctMemoryInfo(info);
  return info;
};

describe('correctMemoryInfo', () => {
  it("counts an instanced mesh's matrix buffer once, not once per column", () => {
    const info = fresh();
    const matrices = new InstancedInterleavedBuffer(new Float32Array(16 * 100), 16, 1);
    const columns = [0, 4, 8, 12].map((o) => new InterleavedBufferAttribute(matrices, 4, o));
    for (const c of columns) info.createAttribute(c);
    expect(info.memory.total).toBe(16 * 100 * 4);
    expect(info.memory.attributesSize).toBe(16 * 100 * 4);
    for (const c of columns) info.destroyAttribute(c);
    expect(info.memory.total).toBe(0);
    expect(info.memory.attributesSize).toBe(0);
  });

  it('leaves plain attributes as three counts them', () => {
    const info = fresh();
    const a = new BufferAttribute(new Float32Array(30), 3);
    info.createAttribute(a);
    expect(info.memory.total).toBe(120);
    info.destroyAttribute(a);
    expect(info.memory.total).toBe(0);
  });

  it("counts a compressed texture's mip data, and frees the same", () => {
    const info = fresh();
    const mips = [
      { data: new Uint8Array(4096), width: 64, height: 64 },
      { data: new Uint8Array(1024), width: 32, height: 32 },
    ];
    const t = new CompressedTexture(mips, 64, 64);
    expect(compressedTextureBytes(t)).toBe(5120);
    info.createTexture(t);
    expect(info.memory.texturesSize).toBe(5120);
    expect(info.memory.total).toBe(5120);
    info.destroyTexture(t);
    expect(info.memory.texturesSize).toBe(0);
    expect(info.memory.total).toBe(0);
  });

  it('leaves uncompressed textures alone', () => {
    const info = fresh();
    const t = new DataTexture(new Uint8Array(16 * 16 * 4), 16, 16);
    info.createTexture(t);
    expect(info.memory.texturesSize).toBe(16 * 16 * 4);
  });

  it('wraps an info object only once', () => {
    const info = fresh();
    correctMemoryInfo(info);
    const matrices = new InstancedInterleavedBuffer(new Float32Array(16), 16, 1);
    for (const o of [0, 4, 8, 12]) info.createAttribute(new InterleavedBufferAttribute(matrices, 4, o));
    expect(info.memory.total).toBe(64);
  });
});
