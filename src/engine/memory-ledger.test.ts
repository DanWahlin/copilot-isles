import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  CompressedTexture,
  DataTexture,
  InstancedInterleavedBuffer,
  RenderTarget,
  Texture,
  InterleavedBufferAttribute,
} from 'three/webgpu';
// three's own Info (not exported from three/webgpu), so the test follows its real bookkeeping.
import Info from 'three/src/renderers/common/Info.js';
import { compressedTextureBytes, correctMemoryInfo, type InfoWithMemory } from './memory-ledger';

type TestInfo = InfoWithMemory & {
  createAttribute(a: object): void;
  destroyAttribute(a: object): void;
  createTexture(t: object): void;
  destroyTexture(t: object): void;
};

const withRefresh = () => {
  const info = new Info() as unknown as TestInfo;
  const refresh = correctMemoryInfo(info);
  return { info, refresh };
};

const fresh = () => withRefresh().info;

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

  it("counts an image that was still decoding when first seen once it's there", () => {
    const { info, refresh } = withRefresh();
    // A loader's texture: no image yet, so three counts it as 1 × 1 (with its mip chain).
    const t = new Texture();
    t.image = null;
    info.createTexture(t);
    expect(info.memory.texturesSize).toBeLessThan(16);
    t.image = { width: 1024, height: 1024 };
    refresh();
    expect(info.memory.texturesSize).toBe(Math.round(1024 * 1024 * 4 * 1.333));
    expect(info.memory.textures).toBe(1);
    info.destroyTexture(t);
    expect(info.memory.texturesSize).toBe(0);
    expect(info.memory.total).toBe(0);
    expect(info.memory.textures).toBe(0);
  });

  it('follows a render target through a resize', () => {
    const { info, refresh } = withRefresh();
    const target = new RenderTarget(1, 1);
    info.createTexture(target.texture);
    expect(info.memory.texturesSize).toBe(4);
    target.setSize(1600, 900);
    refresh();
    expect(info.memory.texturesSize).toBe(1600 * 900 * 4);
    target.setSize(800, 450);
    refresh();
    expect(info.memory.texturesSize).toBe(800 * 450 * 4);
    expect(info.memory.total).toBe(800 * 450 * 4);
    info.destroyTexture(target.texture);
    expect(info.memory.total).toBe(0);
  });

  it("doesn't recount what hasn't changed, or what three has forgotten", () => {
    const { info, refresh } = withRefresh();
    const a = new DataTexture(new Uint8Array(8 * 8 * 4), 8, 8);
    const b = new DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
    info.createTexture(a);
    info.createTexture(b);
    info.destroyTexture(a);
    a.image = { data: new Uint8Array(64 * 64 * 4), width: 64, height: 64 };
    refresh();
    expect(info.memory.texturesSize).toBe(4 * 4 * 4);
    expect(info.memory.textures).toBe(1);
  });

  it('returns the same refresh when wrapped twice', () => {
    const { info, refresh } = withRefresh();
    expect(correctMemoryInfo(info)).toBe(refresh);
  });
});
