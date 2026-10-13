import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three/webgpu';
import { compileProgressively, revealPrewarm } from './warm';

/** A root with a part that's shown only later (like Meridian's mooring lines or the ship's gangplank). */
function world(): { root: Group; late: Group; lateMesh: Mesh; hidden: Group } {
  const root = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  root.add(new Mesh(geometry, material));
  const late = new Group();
  late.visible = false;
  late.userData.prewarm = true;
  const lateMesh = new Mesh(geometry, material);
  late.add(lateMesh);
  root.add(late);
  const hidden = new Group();
  hidden.visible = false;
  hidden.add(new Mesh(geometry, material));
  root.add(hidden);
  return { root, late, lateMesh, hidden };
}

describe('revealPrewarm', () => {
  it('shows only the marked hidden parts, then hides them again', () => {
    const { root, late, hidden } = world();
    const hide = revealPrewarm(root);
    expect(late.visible).toBe(true);
    expect(hidden.visible).toBe(false);
    hide();
    expect(late.visible).toBe(false);
  });

  it('lets a warm compile a part that appears later', async () => {
    const { root, lateMesh } = world();
    const compiled: Object3D[] = [];
    const compile = (o: Object3D) => {
      compiled.push(o);
      return Promise.resolve();
    };
    await compileProgressively(root, compile, () => Promise.resolve());
    expect(compiled).not.toContain(lateMesh);
    compiled.length = 0;
    const hide = revealPrewarm(root);
    await compileProgressively(root, compile, () => Promise.resolve());
    hide();
    expect(compiled).toContain(lateMesh);
    expect(compiled).toHaveLength(2);
  });
});
