/**
 * Makes three's `renderer.info.memory` count what the GPU really holds (PLAN §12.10, the memory gate).
 * three r186 counts two things wrong:
 * - An interleaved buffer once per attribute that views it. An instanced mesh's matrices are one
 *   buffer seen as four `vec4` columns, so each counted four times (~120 MB of the 676 MB High
 *   figure at Anchorage was this); the backend makes one GPU buffer per interleaved buffer.
 * - A compressed texture (KTX2) as 1 byte. Its real size is the sum of its mip levels' data.
 * - A texture at the size it had when it was first seen, for good. An image still decoding then (a
 *   kit or terrain WebP, a sign canvas) counts as 1 × 1 and its 1024² upload never adds its 5.3 MB;
 *   a render target sized after its first use (TRAA's history) or resized since (the canvas, the
 *   adaptive scale) keeps its first size. Which way each went was down to timing, so the same stop
 *   read 11-27 MB apart from run to run under load (the memory gate's false "growth").
 *
 * `correctMemoryInfo` wraps the info object's public create/destroy calls on this renderer only (no
 * three internals are patched), so `total` and `texturesSize` stay the figures the HUD, the debug
 * readout and `tools/memorytest.mjs` read. It returns a `refresh` to call once a frame: a texture
 * whose size has changed since it was counted is counted again (three's own `destroyTexture` and
 * `createTexture`), so the figures follow the textures the GPU holds now.
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
  format?: number;
  type?: number;
}

/** A counted texture, and the shape it was counted at (a weak reference: the ledger keeps nothing alive). */
interface Counted {
  ref: WeakRef<TextureLike>;
  index: number;
  width: number;
  height: number;
  depth: number;
  mips: number;
  format: number;
  type: number;
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
  destroyTexture?(t: object): void;
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

type Image = { width?: number; height?: number; depth?: number } | null | undefined;

/** Writes a texture's shape (what three sizes it by) into `c`; true if it changed. */
function reshape(c: Counted, t: TextureLike): boolean {
  const image = (Array.isArray(t.image) ? null : t.image) as Image;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  const depth = image?.depth ?? 0;
  const mips = t.mipmaps?.length ?? 0;
  const format = t.format ?? 0;
  const type = t.type ?? 0;
  if (
    c.width === width &&
    c.height === height &&
    c.depth === depth &&
    c.mips === mips &&
    c.format === format &&
    c.type === type
  )
    return false;
  c.width = width;
  c.height = height;
  c.depth = depth;
  c.mips = mips;
  c.format = format;
  c.type = type;
  return true;
}

const noop = (): void => {};
const refreshers = new WeakMap<object, () => void>();

/**
 * Corrects `info`'s memory figures (see above) and returns the `refresh` that recounts textures whose
 * size changed since they were counted. Call it once a frame, before reading the figures.
 */
export function correctMemoryInfo(info: InfoWithMemory): () => void {
  const tagged = info as InfoWithMemory & { [CORRECTED]?: true };
  if (tagged[CORRECTED]) return refreshers.get(info) ?? noop;
  if (!info.memoryMap || !info.memory) return noop;
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

  // Every counted texture, by the shape it was counted at (swap-removed, so a refresh doesn't allocate).
  const counted: Counted[] = [];
  const slots = new WeakMap<object, Counted>();
  const forget = (c: Counted) => {
    const last = counted.pop()!;
    if (last !== c) {
      counted[c.index] = last;
      last.index = c.index;
    }
  };
  let recounting = false;

  const createTexture = info.createTexture;
  if (typeof createTexture === 'function')
    info.createTexture = function (this: InfoWithMemory, t: object) {
      createTexture.call(this, t);
      const tex = t as TextureLike;
      if (!recounting && !slots.has(t)) {
        const c: Counted = {
          ref: new WeakRef(tex),
          index: counted.length,
          width: -1,
          height: -1,
          depth: -1,
          mips: -1,
          format: -1,
          type: -1,
        };
        reshape(c, tex);
        counted.push(c);
        slots.set(t, c);
      }
      if (!tex.isCompressedTexture && !tex.isCompressedArrayTexture) return;
      const size = info.memoryMap.get(t);
      if (typeof size !== 'number') return;
      const bytes = compressedTextureBytes(tex);
      if (bytes <= size) return;
      adjust('texturesSize', bytes - size);
      info.memoryMap.set(t, bytes);
    };

  const destroyTexture = info.destroyTexture;
  if (typeof destroyTexture === 'function')
    info.destroyTexture = function (this: InfoWithMemory, t: object) {
      destroyTexture.call(this, t);
      if (recounting) return;
      const c = slots.get(t);
      if (!c) return;
      slots.delete(t);
      forget(c);
    };

  const refresh = () => {
    if (typeof createTexture !== 'function' || typeof destroyTexture !== 'function') return;
    for (let i = counted.length - 1; i >= 0; i--) {
      const c = counted[i]!;
      const t = c.ref.deref();
      // Gone without a dispose: three never uncounts it either, so neither do we; just stop watching.
      if (!t) {
        forget(c);
        continue;
      }
      if (!reshape(c, t) || !info.memoryMap.has(t)) continue;
      recounting = true;
      try {
        info.destroyTexture!(t);
        info.createTexture!(t);
      } finally {
        recounting = false;
      }
    }
  };
  refreshers.set(info, refresh);
  return refresh;
}
