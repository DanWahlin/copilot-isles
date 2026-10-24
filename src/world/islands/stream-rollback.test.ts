import { Group, Mesh, Scene } from 'three/webgpu';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import { CompositeHeightField } from '../terrain/composite-height-field';

// A stream that fails part-way: its terrain is in (scene, height field), then the town's kit 404s.
const terrains: { group: Group; dispose: ReturnType<typeof vi.fn> }[] = [];
const loadTerrainPack = vi.fn(async () => ({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }));
vi.mock('../terrain/bake', () => ({ loadTerrainPack: (...a: unknown[]) => loadTerrainPack(...(a as [])) }));
vi.mock('../terrain/terrain-mesh', () => ({
  createTerrainAsync: async () => {
    const t = {
      group: new Group(),
      heightField: { heightAt: () => 5, normalAt: () => [0, 1, 0] },
      dispose: vi.fn(),
    };
    terrains.push(t);
    return t;
  },
}));
vi.mock('../terrain/coast-foam', () => ({ createCoastFoam: () => new Mesh() }));
vi.mock('../village/kit', () => ({
  loadVillageKit: async () => {
    throw new Error('404 kit.glb');
  },
}));
vi.mock('./meridian-water-mesh', () => ({
  createMeridianWaterMesh: () => ({ mesh: new Mesh(), dispose: () => {} }),
}));
vi.mock('./meridian-silhouette', () => ({
  createMeridianSilhouette: () => ({ group: new Group(), ready: Promise.resolve() }),
}));
vi.mock('./thousand-bough/tree/silhouette', () => ({
  createThousandBoughSilhouette: () => ({ group: new Group(), ready: Promise.resolve() }),
}));
vi.mock('./meridian', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meridian')>()),
  // eslint-disable-next-line require-yield
  meridianRockCameraBlockersSliced: function* () {
    return [];
  },
}));

const { createMeridianStream } = await import('./meridian-stream');
const { createThousandBoughStream } = await import('./thousand-bough/stream');
const { ISLANDS } = await import('../../game/islands');

function context(island: (typeof ISLANDS)[keyof typeof ISLANDS]) {
  const scene = new Scene();
  const heightField = new CompositeHeightField();
  const shipObstacles: CircleObstacle[] = [{ x: 1, z: 1, r: 1 } as CircleObstacle];
  return {
    scene,
    heightField,
    shipObstacles,
    tier: tierSettings('high'),
    packBase: '/packs',
    breathe: async () => {},
    vegetation: () => null,
    birds: false,
    skipShadows: false,
    disabled: false,
    sky: { mood: { fogScale: 1, hazeTint: [1, 1, 1] as [number, number, number], fill: 1, exposure: 1 } },
    island,
    nearLoads: () => true,
  };
}

describe.each([
  ['Port Meridian', createMeridianStream, ISLANDS.meridian],
  ['Thousand-Bough', createThousandBoughStream, ISLANDS['thousand-bough']],
] as const)('%s stream that fails part-way', (_name, create, island) => {
  beforeEach(() => {
    terrains.length = 0;
    loadTerrainPack.mockClear();
  });

  it('takes back what it had added, and waits before it tries again', async () => {
    const ctx = context(island);
    const stream = create(ctx);
    const before = ctx.scene.children.length;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await stream.load()).toBeNull();
    expect(stream.state).toBe('failed');
    expect(stream.ready).toBe(false);
    expect(stream.terrain).toBeNull();
    // Only the silhouette is left in the scene; the terrain is out of the height field and freed.
    expect(ctx.scene.children.length).toBe(before);
    expect(ctx.heightField.heightAt(5, 5)).toBe(-52);
    expect(ctx.shipObstacles).toHaveLength(1);
    expect(terrains).toHaveLength(1);
    expect(terrains[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(terrains[0]!.group.parent).toBeNull();

    // Every frame in range asks again: nothing is fetched until the wait is over.
    for (let i = 0; i < 5; i++) expect(await stream.load()).toBeNull();
    expect(loadTerrainPack).toHaveBeenCalledTimes(1);

    // A jump there (or a player's ask) tries at once, and rolls back again.
    expect(await stream.load('auto', true)).toBeNull();
    expect(loadTerrainPack).toHaveBeenCalledTimes(2);
    expect(stream.state).toBe('failed');
    expect(ctx.scene.children.length).toBe(before);
    stream.dispose();
  });
});
