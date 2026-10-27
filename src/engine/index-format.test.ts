import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Index16Attribute, keepIndexUint16 } from './index-format';

const quad = () => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
};

describe('keepIndexUint16', () => {
  it('flags a 16-bit index so three uploads it as it is, and reads its plain values', () => {
    const g = keepIndexUint16(quad());
    const index = g.getIndex()!;
    expect(index).toBeInstanceOf(Index16Attribute);
    expect(index.array).toBeInstanceOf(Uint16Array);
    // three r186's WebGPU backend copies a Uint16 attribute to Uint32 only when it isn't normalized.
    expect(index.normalized).toBe(true);
    expect([0, 1, 2, 3, 4, 5].map((i) => index.getX(i))).toEqual([0, 1, 2, 2, 1, 3]);
    index.setX(5, 9);
    expect(index.getComponent(5, 0)).toBe(9);
  });

  it('merges like a plain index', () => {
    const merged = mergeGeometries([keepIndexUint16(quad()), keepIndexUint16(quad())])!;
    expect(Array.from(merged.getIndex()!.array)).toEqual([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
  });

  it('leaves a 32-bit index alone', () => {
    const g = new BufferGeometry();
    g.setIndex(new BufferAttribute(new Uint32Array([0, 1, 70000]), 1));
    const before = g.getIndex();
    keepIndexUint16(g);
    expect(g.getIndex()).toBe(before);
  });
});
