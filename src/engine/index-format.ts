import { BufferAttribute, type BufferGeometry } from 'three/webgpu';

/**
 * A 16-bit index that stays 16-bit on WebGPU.
 *
 * three r186's WebGPU backend uploads every `Uint16Array` (and `Uint8Array`) attribute that isn't
 * `normalized` as a `Uint32Array` copy, the index too, and keeps the copy as the attribute's array
 * (WebGPUAttributeUtils.createAttribute): a 16-bit index then holds twice its memory on the GPU and in
 * JS. WebGPU draws 16-bit indices, and three picks the index format from the array type (`uint16` for
 * a `Uint16Array`). An index isn't a vertex attribute: three reads its `normalized` flag only for that
 * copy and in the accessors (`getX`, `setX`…), which scale by 65535 when it's set. So this index is
 * flagged `normalized` and its accessors read and write the plain values (a merge, a raycast). WebGL2
 * draws a 16-bit index as it is either way. Issue 316: Keelhaven's terrain held 77 MB of index on High.
 */
export class Index16Attribute extends BufferAttribute {
  constructor(array: Uint16Array) {
    super(array, 1, true);
  }

  override getComponent(index: number, component: number): number {
    return this.array[index * this.itemSize + component]!;
  }

  override setComponent(index: number, component: number, value: number): this {
    this.array[index * this.itemSize + component] = value;
    return this;
  }

  override getX(index: number): number {
    return this.array[index * this.itemSize]!;
  }

  override setX(index: number, x: number): this {
    this.array[index * this.itemSize] = x;
    return this;
  }
}

/** Gives a geometry with a 16-bit index an `Index16Attribute` of the same values; returns the geometry. */
export function keepIndexUint16<T extends BufferGeometry>(geometry: T): T {
  const index = geometry.index;
  if (index && !(index instanceof Index16Attribute) && index.array instanceof Uint16Array)
    geometry.setIndex(new Index16Attribute(index.array));
  return geometry;
}
