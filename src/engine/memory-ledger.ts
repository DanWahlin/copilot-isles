/**
 * Makes three's `renderer.info.memory` count what the GPU really holds (PLAN §12.10, the memory gate).
 * three r186 counts two things wrong:
 * - An interleaved buffer once per attribute that views it. An instanced mesh's matrices are one
 *   buffer seen as four `vec4` columns, so each counted four times (~120 MB of the 676 MB High
 *   figure at Anchorage was this); the backend makes one GPU buffer per interleaved buffer.
 * - A compressed texture (KTX2) as 1 byte. Its real size is the sum of its mip levels' data.
 *
 * `correctMemoryInfo` wraps the info object's public create/destroy calls on this renderer only (no
 * three internals are patched), so `total` and `texturesSize` stay the figures the HUD, the debug
 * readout and `tools/memorytest.mjs` read.
 */

interface MemoryLike {
  total?: number;
  texturesSize?: number;
  [key: string]: number | undefined;
}

interface AttributeLike {
  isInterleavedBufferAttribute?: boolean;
  data?: object;
}

interface TextureLike {
  isCompressedTexture?: boolean;
  isCompressedArrayTexture?: boolean;
  isCubeTexture?: boolean;
  mipmaps?: readonly ({ data?: ArrayBufferView } | null | undefined)[];
  image?: unknown;
}

type MemoryEntry = number | { size: number; type: string };

export interface InfoWithMemory {
  memory: MemoryLike;
  memoryMap: WeakMap<object, MemoryEntry>;
  createAttribute?(a: object): void;
  createIndexAttribute?(a: object): void;
  createStorageAttribute?(a: object): void;
  createIndirectStorageAttribute?(a: object): void;
  destroyAttribute?(a: object): void;
  createTexture?(t: object): void;
}

const CORRECTED = Symbol('memoryLedger');

/** The bytes a compressed texture's mip levels hold (all faces or layers are in each level's data). */
export function compressedTextureBytes(t: TextureLike): number {
  let bytes = 0;
  for (const m of t.mipmaps ?? []) bytes += m?.data?.byteLength ?? 0;
  // A compressed cube map keeps one image per face, each with its own mip list.
  if (t.isCubeTexture && Array.isArray(t.image))
    for (const face of t.image as { mipmaps?: { data?: ArrayBufferView }[] }[])
      for (const m of face?.mipmaps ?? []) bytes += m?.data?.byteLength ?? 0;
  return bytes;
}

export function correctMemoryInfo(info: InfoWithMemory): void {
  const tagged = info as InfoWithMemory & { [CORRECTED]?: true };
  if (tagged[CORRECTED] || !info.memoryMap || !info.memory) return;
  tagged[CORRECTED] = true;
  const memory = info.memory;
  // Interleaved buffers already counted, by how many of their attributes are live.
  const views = new WeakMap<object, number>();

  const adjust = (key: string, delta: number) => {
    memory.total = (memory.total ?? 0) + delta;
    memory[key] = (memory[key] ?? 0) + delta;
  };

  const wrapCreate = (
    name:
      | 'createAttribute'
      | 'createIndexAttribute'
      | 'createStorageAttribute'
      | 'createIndirectStorageAttribute',
  ) => {
    const create = info[name];
    if (typeof create !== 'function') return;
    info[name] = function (this: InfoWithMemory, a: object) {
      create.call(this, a);
      const attr = a as AttributeLike;
      if (!attr.isInterleavedBufferAttribute || !attr.data) return;
      const live = views.get(attr.data) ?? 0;
      views.set(attr.data, live + 1);
      if (live === 0) return;
      const entry = info.memoryMap.get(a);
      if (!entry || typeof entry === 'number' || entry.size === 0) return;
      adjust(`${entry.type}Size`, -entry.size);
      entry.size = 0;
    };
  };
  wrapCreate('createAttribute');
  wrapCreate('createIndexAttribute');
  wrapCreate('createStorageAttribute');
  wrapCreate('createIndirectStorageAttribute');

  const destroy = info.destroyAttribute;
  if (typeof destroy === 'function')
    info.destroyAttribute = function (this: InfoWithMemory, a: object) {
      const attr = a as AttributeLike;
      if (attr.isInterleavedBufferAttribute && attr.data && info.memoryMap.has(a)) {
        const live = (views.get(attr.data) ?? 1) - 1;
        if (live > 0) views.set(attr.data, live);
        else views.delete(attr.data);
      }
      destroy.call(this, a);
    };

  const createTexture = info.createTexture;
  if (typeof createTexture === 'function')
    info.createTexture = function (this: InfoWithMemory, t: object) {
      createTexture.call(this, t);
      const tex = t as TextureLike;
      if (!tex.isCompressedTexture && !tex.isCompressedArrayTexture) return;
      const counted = info.memoryMap.get(t);
      if (typeof counted !== 'number') return;
      const bytes = compressedTextureBytes(tex);
      if (bytes <= counted) return;
      adjust('texturesSize', bytes - counted);
      info.memoryMap.set(t, bytes);
    };
}
