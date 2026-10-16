import { Mesh, type InstancedMesh, type Material, type Object3D } from 'three/webgpu';
import { bakeInstances } from '../engine/instancing';
import type { TierSettings } from '../engine/quality';
import { loadLodSimplifier } from './characters/character-lod';
import { LITE_ROCK_ERROR, simplifyInPlace } from './village/chunks';

/**
 * Lite (PLAN §12.1, the weakest GPUs): the islands' loose instanced rocks (not cliffs or sea stacks)
 * draw a coarser copy of their shape, all baked into one draw (they never move). Done before the
 * island warms, so nothing uploads twice.
 */
export async function coarserRocksOnLite(root: Object3D, tier: TierSettings): Promise<void> {
  if (tier.tier !== 'lite') return;
  const simplify = await loadLodSimplifier();
  const rocks: InstancedMesh[] = [];
  root.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (mesh.isInstancedMesh && /rocks-Rock_/.test(mesh.name)) rocks.push(mesh);
  });
  if (rocks.length === 0) return;
  if (simplify) for (const mesh of rocks) simplifyInPlace(mesh.geometry, simplify, LITE_ROCK_ERROR);
  const parent = rocks[0]!.parent;
  const material = rocks[0]!.material;
  const same = rocks.filter((mesh) => mesh.parent === parent && mesh.material === material);
  const baked = parent ? bakeInstances(same) : null;
  if (!parent || !baked) return;
  const mesh = new Mesh(baked, material);
  mesh.name = `${parent.name}-Rock_baked`;
  mesh.castShadow = false;
  mesh.receiveShadow = same[0]!.receiveShadow;
  for (const rock of same) {
    rock.removeFromParent();
    rock.geometry.dispose();
    rock.dispose();
  }
  parent.add(mesh);
}

/**
 * Lite: the flowing water strips (mill race, fountain, Meridian's brooks) draw in one pass, not a back
 * then a front pass (three's default for a two-sided transparent material). They're shallow strips
 * seen from above, so the order of their two sides doesn't show.
 */
export function singlePassWaterOnLite(root: Object3D, tier: TierSettings): void {
  if (tier.tier !== 'lite') return;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && mesh.userData.waterStrips) (mesh.material as Material).forceSinglePass = true;
  });
}

/** Disposes every geometry and material under `root` (a group that owns them all). */
export function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } };
    m.geometry?.dispose();
    m.material?.dispose();
  });
}
