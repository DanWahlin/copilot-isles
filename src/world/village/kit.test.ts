import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardNodeMaterial,
  Scene,
  Texture,
} from 'three/webgpu';
import { dropZeroAreaTriangles, loadVillageKit, missingRoughness } from './kit';

// The kit's download fails (offline): the loader rejects at once.
const loads = vi.hoisted(() => ({ n: 0 }));
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() {}
    setKTX2Loader() {}
    loadAsync() {
      loads.n++;
      return Promise.reject(new Error('offline'));
    }
  },
}));

describe('dropZeroAreaTriangles', () => {
  it('removes collinear slivers and keeps real triangles', () => {
    const geometry = new BufferGeometry();
    // Corner 3 lies on the line from 0 to 1, so the triangle 0-3-1 has no area.
    const p = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 0, 0];
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
    geometry.setIndex([0, 1, 2, 0, 3, 1]);

    dropZeroAreaTriangles(geometry);

    expect(Array.from(geometry.getIndex()!.array)).toEqual([0, 1, 2]);
  });
});

describe('the village kit loads without the KTX2 transcoder', () => {
  it('ships a WebP for every KTX2 map, and KHR_texture_basisu is optional', () => {
    const glb = readFileSync(new URL('../../../public/packs/testcove/village/kit.glb', import.meta.url));
    const jsonLength = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as {
      extensionsUsed?: string[];
      extensionsRequired?: string[];
      textures: { source?: number; extensions?: Record<string, { source: number }> }[];
    };
    expect(json.extensionsUsed).toContain('KHR_texture_basisu');
    expect(json.extensionsRequired ?? []).not.toContain('KHR_texture_basisu');
    const ktx = json.textures.filter((t) => t.extensions?.KHR_texture_basisu);
    expect(ktx.length).toBeGreaterThan(0);
    for (const t of ktx) expect(t.extensions?.EXT_texture_webp ?? t.source).toBeDefined();
  });

  it('notices a roughness map that failed to load (then it loads again on WebP)', () => {
    const scene = new Scene();
    const mesh = new Mesh(new BufferGeometry(), new MeshStandardNodeMaterial());
    mesh.material.name = 'Stone';
    scene.add(mesh);
    const gltf = {
      parser: {
        json: { materials: [{ name: 'Stone', pbrMetallicRoughness: { metallicRoughnessTexture: {} } }] },
      },
      scenes: [scene],
    } as unknown as Parameters<typeof missingRoughness>[0];
    expect(missingRoughness(gltf)).toBe(true);
    mesh.material.roughnessMap = new Texture();
    expect(missingRoughness(gltf)).toBe(false);
  });

  it("doesn't keep a failed load: the next caller tries again", async () => {
    const first = loadVillageKit('/missing/kit.glb');
    await expect(first).rejects.toThrow('offline');
    const second = loadVillageKit('/missing/kit.glb');
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow('offline');
    expect(loads.n).toBe(2);
  });
});
