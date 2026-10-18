import { BoxGeometry, Group, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, Scene } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { releaseRemovedObjects } from '../../../util/dispose-three';
import type { CreatedTerrain } from '../../terrain/terrain-mesh';
import { createAnchorageStream } from './stream';

function world(warm?: (roots: unknown[]) => Promise<void>) {
  const scene = new Scene();
  const plants = new Group();
  scene.add(plants);
  const terrain = new Mesh(new BoxGeometry(), new MeshBasicNodeMaterial());
  terrain.name = 'test-cove-terrain';
  const gulls = new Mesh(new BoxGeometry(), new MeshBasicNodeMaterial());
  const shrub = new Mesh(new BoxGeometry(), new MeshBasicNodeMaterial());
  scene.add(terrain, gulls);
  plants.add(shrub);
  const stream = createAnchorageStream({
    scene,
    terrain: { group: terrain } as unknown as CreatedTerrain,
    silhouette: new Group(),
    parts: () => [terrain, gulls, shrub],
    plantsAwake: () => {},
    breathe: async () => {},
    warm,
  });
  return { scene, plants, terrain, gulls, shrub, stream };
}

const terrains = (scene: Scene) => {
  let n = 0;
  scene.traverse((o) => void (o.name === 'test-cove-terrain' && n++));
  return n;
};

describe('Anchorage stream', () => {
  it('parks its parts out of the scene while dormant, and puts them back on waking', async () => {
    const { scene, plants, terrain, shrub, stream } = world();
    await stream.unload();
    expect(stream.state).toBe('absent');
    expect(terrain.parent).toBeNull();
    expect(stream.parkedRoots()).toHaveLength(3);
    expect(stream.silhouette.visible).toBe(true);
    await stream.load();
    expect(terrain.parent).toBe(scene);
    expect(shrub.parent).toBe(plants);
    // Hidden until the warm-up has drawn them.
    expect(terrain.visible).toBe(false);
    stream.reveal();
    expect(terrain.visible).toBe(true);
    expect(stream.parkedRoots()).toHaveLength(0);
  });

  it("leaves the silhouette's visibility to its warm while it runs", async () => {
    let finish!: () => void;
    let started!: () => void;
    const warmStarted = new Promise<void>((r) => (started = r));
    const { stream } = world(async ([silhouette]) => {
      (silhouette as Group).visible = false;
      started();
      await new Promise<void>((r) => (finish = r));
      (silhouette as Group).visible = true;
    });
    const sleeping = stream.unload();
    await warmStarted;
    stream.update(new PerspectiveCamera());
    expect(stream.silhouette.visible).toBe(false);
    finish();
    await sleeping;
    stream.update(new PerspectiveCamera());
    expect(stream.silhouette.visible).toBe(true);
  });

  it('leaves parked parts out of the scene when the voyage ends while dormant (no ghost island)', async () => {
    const { scene, terrain, gulls, shrub, stream } = world();
    await stream.unload();
    const parked = stream.parkedRoots();
    const told: string[] = [];
    for (const o of parked) o.addEventListener('dispose', () => told.push(o.uuid));
    stream.dispose();
    expect(terrain.parent).toBeNull();
    expect(gulls.parent).toBeNull();
    expect(shrub.parent).toBeNull();
    expect(terrains(scene)).toBe(0);
    // The world's dispose tells three every parked object is gone (cove-scene's dispose).
    releaseRemovedObjects(parked, scene);
    expect(told).toHaveLength(3);
    // Nothing loads after the voyage.
    expect(await stream.load()).toBeNull();
    expect(terrains(scene)).toBe(0);
  });
});
