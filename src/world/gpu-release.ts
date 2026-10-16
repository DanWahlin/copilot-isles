import type { BufferGeometry, Material, Object3D, Texture } from 'three/webgpu';

type WithGeometry = Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };

/** Every texture a material samples: its texture properties and the textures in its node graphs. */
export function materialTextures(material: Material, out: Set<Texture>): void {
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 24 || seen.has(v)) return;
    seen.add(v);
    const o = v as { isTexture?: boolean; isNode?: boolean; isMaterial?: boolean };
    if (o.isTexture) {
      out.add(v as Texture);
      return;
    }
    if (!o.isNode && !o.isMaterial && !Array.isArray(v)) return;
    for (const key of Object.keys(v)) {
      if (key === 'parent' || key === '_cacheKey') continue;
      walk((v as Record<string, unknown>)[key], depth + 1);
    }
  };
  walk(material, 0);
}

const materialsOf = (o: WithGeometry): Material[] =>
  Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];

/**
 * Only plain meshes give their geometry back: three gathers an instanced or skinned mesh's instance
 * and bone buffers with the geometry's attributes, and frees them with it, but the mesh's nodes keep
 * the destroyed buffers ("used in submit while destroyed", like issue 251).
 */
const plain = (o: Object3D) => {
  const m = o as Object3D & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
  return !m.isInstancedMesh && !m.isSkinnedMesh && !m.isBatchedMesh;
};

const interleaved = (g: BufferGeometry) =>
  Object.values(g.attributes).some(
    (a) => (a as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute,
  );

/**
 * Frees the GPU copies of what only `roots` draw (they've left the scene, and come back later):
 * their geometries' buffers and the textures nothing still in `scene` samples. The CPU data stays
 * (arrays, images, canvases), so the next draw uploads them again; three's render objects drop their
 * attribute cache on a geometry's `dispose` (skill §4). Interleaved geometries keep their buffers
 * (issue 251), as do instanced and skinned meshes' (see `plain`) and anything an object still in the
 * scene shares. Returns what it freed.
 */
export async function releaseGpuCopies(
  roots: readonly Object3D[],
  scene: Object3D,
  breathe: () => Promise<void> = () => Promise.resolve(),
): Promise<{ geometries: number; textures: number }> {
  const keepGeometry = new Set<BufferGeometry>();
  const keepTexture = new Set<Texture>();
  const seenMaterials = new Set<Material>();
  scene.traverse((o) => {
    const m = o as WithGeometry;
    if (m.geometry) keepGeometry.add(m.geometry);
    for (const mat of materialsOf(m)) {
      if (seenMaterials.has(mat)) continue;
      seenMaterials.add(mat);
      materialTextures(mat, keepTexture);
    }
  });
  await breathe();
  const geometries = new Set<BufferGeometry>();
  const textures = new Set<Texture>();
  const ownMaterials = new Set<Material>();
  for (const root of roots)
    root.traverse((o) => {
      const m = o as WithGeometry;
      if (m.geometry && !keepGeometry.has(m.geometry) && !interleaved(m.geometry) && plain(m))
        geometries.add(m.geometry);
      for (const mat of materialsOf(m)) ownMaterials.add(mat);
    });
  for (const mat of ownMaterials) materialTextures(mat, textures);
  let freedTextures = 0;
  // A few dozen a frame: each frees its buffers and drops the render objects' attribute caches.
  let n = 0;
  for (const g of geometries) {
    g.dispose();
    if (++n % 48 === 0) await breathe();
  }
  for (const t of textures) {
    // Render targets belong to whoever draws into them; only plain images and canvases re-upload.
    if (keepTexture.has(t) || (t as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture)
      continue;
    t.dispose();
    freedTextures++;
  }
  return { geometries: geometries.size, textures: freedTextures };
}
