import { MeshBasicMaterial, type BufferGeometry, type InstancedMesh, type Mesh } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { CasterSweep, casterRecord, SHADOW_LAYER } from '../../shadow-casters';
import type { HeightField } from '../../contracts';
import { makeBuckets, type VillageKit } from '../../village/kit';
import { createFlumeTerrace } from './flume';
import { createThousandBoughRocks } from './rocks';

vi.mock('../../terrain/terrain-material', async () => {
  const { MeshBasicMaterial } = await import('three/webgpu');
  return { createRockMaterial: () => new MeshBasicMaterial() };
});

describe('flume rock meshes', () => {
  it('animates the boulder without changing or moving the island rock batches', async () => {
    const materials = {
      wood: new MeshBasicMaterial(),
      stone: new MeshBasicMaterial(),
      glow: new MeshBasicMaterial(),
    };
    const kit = { materials } as unknown as VillageKit;
    const rocks = createThousandBoughRocks({} as HeightField, undefined, 1, true);
    const rockBatches = rocks.group.children.filter(
      (child) =>
        child.name.startsWith('thousand-bough-rocks-') && (child as InstancedMesh).isInstancedMesh === true,
    ) as InstancedMesh[];
    const versions = rockBatches.map((mesh) => mesh.instanceMatrix.version);
    const sweep = new CasterSweep();
    sweep.run(rocks.group, true);

    const flume = createFlumeTerrace(kit, makeBuckets(), []);
    flume.useStones(rocks.flumeStones);
    const flumeBatches = flume.group.children.filter(
      (child) =>
        child.name.startsWith('thousand-bough-flume-rocks-') &&
        (child as InstancedMesh).isInstancedMesh === true,
    ) as InstancedMesh[];
    const flumeVersions = flumeBatches.map((mesh) => mesh.instanceMatrix.version);
    for (let i = 0; i < flumeBatches.length; i++) {
      expect(flumeBatches[i]!.geometry).toBe(rocks.flumeStones.geometries[i]);
      expect(flumeBatches[i]!.material).toBe(rocks.flumeStones.material);
    }

    const boulder = flume.setRound(3);
    for (let frame = 0; frame < 130; frame++) {
      flume.update(1 / 60);
      rocks.group.updateMatrixWorld(true);
      sweep.run(rocks.group, true);
    }
    await boulder;

    expect(flumeBatches.some((mesh, i) => mesh.instanceMatrix.version > flumeVersions[i]!)).toBe(true);
    expect(rockBatches.map((mesh) => mesh.instanceMatrix.version)).toEqual(versions);
    for (const mesh of rockBatches) {
      const record = casterRecord(mesh);
      expect(record?.moving).toBe(false);
      expect((record?.bits ?? 0) & (1 << SHADOW_LAYER.static)).toBe(1 << SHADOW_LAYER.static);
    }

    flume.dispose();
    const geometries = new Set<BufferGeometry>();
    rocks.group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh && !geometries.has(mesh.geometry)) {
        geometries.add(mesh.geometry);
        mesh.geometry.dispose();
      }
    });
    (rockBatches[0]!.material as MeshBasicMaterial).dispose();
    for (const material of Object.values(materials)) material.dispose();
  });
});
