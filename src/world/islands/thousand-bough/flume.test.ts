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
  it('places the board’s rock tiles without changing or moving the island rock batches', async () => {
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
    expect(flumeBatches[0]!.geometry).toBe(rocks.flumeStones.geometries[0]);
    expect(flumeBatches[0]!.material).toBe(rocks.flumeStones.material);

    expect(flumeBatches).toHaveLength(1);
    flume.setBoard(
      [
        [...'LLSLL'].map(() => ({ kind: 'elbow' as const, rot: 0 as const })),
        [...'SRSRS'].map((k) => ({
          kind: k === 'R' ? ('rock' as const) : ('straight' as const),
          rot: 0 as const,
        })),
        [...'SLSLS'].map(() => ({ kind: 'straight' as const, rot: 0 as const })),
        [...'SSSSS'].map(() => ({ kind: 'straight' as const, rot: 0 as const })),
      ],
      false,
    );
    // Round 3 plays on the same board: nothing rolls in, and resuming there replays nothing.
    const round = flume.setRound(3);
    for (let frame = 0; frame < 30; frame++) {
      flume.update(1 / 60);
      rocks.group.updateMatrixWorld(true);
      sweep.run(rocks.group, true);
    }
    await round;

    expect(flumeBatches.some((mesh, i) => mesh.instanceMatrix.version > flumeVersions[i]!)).toBe(true);
    expect(flumeBatches[0]!.count).toBe(2);
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
