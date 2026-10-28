import { describe, expect, it } from 'vitest';
import { Bone, BufferGeometry, Group, MeshStandardNodeMaterial, Skeleton, SkinnedMesh } from 'three/webgpu';
import { faceMaterial } from './face-material';
import { addShoulderMacaw } from './parrot';

/**
 * Faces and the parrot are hidden by what stands in front of them (a wall, a plant, another
 * character): they draw in the opaque pass with depth tested and written, never over the scene.
 */
describe('face and parrot depth', () => {
  it('the shared face material is opaque, depth tested and depth written', () => {
    const m = faceMaterial();
    expect(m.depthTest).toBe(true);
    expect(m.depthWrite).toBe(true);
    expect(m.transparent).toBe(false);
    expect(m.alphaTest).toBeGreaterThan(0);
  });

  it("a shoulder parrot draws with its character's body material, in the opaque pass", () => {
    const root = new Group();
    const torso = new Bone();
    torso.name = 'Torso';
    const arm = new Bone();
    arm.name = 'UpperArmR';
    arm.position.set(0.2, 1.3, 0);
    torso.add(arm);
    root.add(torso);
    const body = new MeshStandardNodeMaterial();
    const skinned = new SkinnedMesh(new BufferGeometry(), body);
    skinned.bind(new Skeleton([torso, arm]));
    root.add(skinned);
    addShoulderMacaw(root, new BufferGeometry());
    const parrot = root.getObjectByName('hero parrot') as SkinnedMesh | undefined;
    expect(parrot).toBeDefined();
    expect(parrot!.material).toBe(body);
    expect(parrot!.renderOrder).toBe(0);
    expect(body.depthTest && body.depthWrite && !body.transparent).toBe(true);
  });
});
