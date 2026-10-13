import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardNodeMaterial } from 'three/webgpu';
import { skipSunShadows, skipSunShadowsWhereOff } from './cached-sun-shadow';

function mesh(receive: boolean): Mesh {
  const m = new Mesh(new BoxGeometry(), new MeshStandardNodeMaterial());
  m.receiveShadow = receive;
  return m;
}

describe('sun shadow skipping', () => {
  it('keeps receiveShadow on (one shader per look) and marks the meshes to skip the lookup', () => {
    const root = new Group();
    const a = mesh(false);
    const b = mesh(true);
    root.add(a, b);
    skipSunShadows(root);
    for (const m of [a, b]) {
      expect(m.receiveShadow).toBe(true);
      expect(m.userData.sunShadow).toBe(false);
    }
  });

  it('marks only the meshes that had receiveShadow off', () => {
    const root = new Group();
    const off = mesh(false);
    const on = mesh(true);
    root.add(off, on);
    skipSunShadowsWhereOff(root);
    expect(off.receiveShadow).toBe(true);
    expect(off.userData.sunShadow).toBe(false);
    expect(on.receiveShadow).toBe(true);
    expect(on.userData.sunShadow).toBeUndefined();
  });
});
