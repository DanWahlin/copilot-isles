import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  DataTexture,
  Mesh,
  MeshStandardNodeMaterial,
  NodeFrame,
  PlaneGeometry,
} from 'three/webgpu';
import type { Material, Texture } from 'three/webgpu';
import { ownMap } from './own-map';
import { disposeMaterialWithTextures } from '../util/dispose-three';
import { meshNodeBuilder, type MeshNodeBuilder } from '../world/vegetation/wgsl-test-helpers';

const pixel = (): Texture => {
  const t = new DataTexture(new Uint8Array([200, 160, 60, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};

/** A frame's draw of `material`: three updates the nodes its build listed, for that object. */
function drawFrame(material: Material): void {
  const mesh = new Mesh(new PlaneGeometry(), material);
  const builder = meshNodeBuilder(mesh, material);
  builder.build();
  const frame = new NodeFrame() as NodeFrame & { material: unknown; object: unknown };
  frame.material = material;
  frame.object = mesh;
  for (const node of builder.updateNodes) frame.updateNode(node as never);
}

/** The textures a build's bindings start from (what each new render object of its look uploads). */
function boundTextures(builder: MeshNodeBuilder): unknown[] {
  return builder
    .getBindings()
    .flatMap((group) => group.bindings)
    .filter((b) => b.isSampledTexture)
    .map((b) => b.texture);
}

/**
 * Builds a `map` look as compileAsync does (its build yields between stages), with `between` drawn in
 * a frame that lands mid-build.
 */
async function buildWithFrameBetween(between: Material): Promise<{ builder: MeshNodeBuilder; map: Texture }> {
  const map = pixel();
  const material = new MeshStandardNodeMaterial({ map, roughness: 0.3, metalness: 0 });
  const builder = meshNodeBuilder(new Mesh(new BoxGeometry(), material), material);
  let drawn = false;
  // three yields through requestAnimationFrame where there's no scheduler.yield (as here, in Node).
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    if (!drawn) {
      drawn = true;
      drawFrame(between);
    }
    setTimeout(cb, 0);
    return 0;
  });
  await builder.buildAsync();
  expect(drawn).toBe(true);
  return { builder, map };
}

afterEach(() => vi.unstubAllGlobals());

describe('ownMap', () => {
  it('three keeps a mid-build frame’s `map` in another look’s bindings (why ownMap exists)', async () => {
    const plate = pixel();
    const { builder, map } = await buildWithFrameBetween(
      new MeshStandardNodeMaterial({ map: plate, roughness: 0.42, metalness: 0.15 }),
    );
    // If this stops holding (a three upgrade), the leak's gone at its source: ownMap is optional.
    expect(boundTextures(builder)).toContain(plate);
    expect(boundTextures(builder)).not.toContain(map);
  });

  it('keeps its texture out of other looks built while it draws', async () => {
    const plate = pixel();
    const { builder, map } = await buildWithFrameBetween(
      ownMap(new MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0.15 }), plate),
    );
    expect(boundTextures(builder)).toContain(map);
    expect(boundTextures(builder)).not.toContain(plate);
  });

  it('draws its texture from its own binding', () => {
    const plate = pixel();
    const material = ownMap(new MeshStandardNodeMaterial(), plate);
    const builder = meshNodeBuilder(new Mesh(new PlaneGeometry(), material), material);
    builder.build();
    expect(material.map).toBeNull();
    expect(boundTextures(builder)).toContain(plate);
  });

  it('frees its texture with the material, beside any others it frees', () => {
    const plate = pixel();
    const other = pixel();
    const material = new MeshStandardNodeMaterial();
    material.userData.disposeTextures = other;
    ownMap(material, plate);
    const freed: Texture[] = [];
    for (const t of [plate, other]) t.addEventListener('dispose', () => freed.push(t));
    disposeMaterialWithTextures(material);
    expect(freed).toEqual([other, plate]);
  });
});
