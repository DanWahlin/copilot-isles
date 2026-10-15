import { describe, expect, it } from 'vitest';
import type { Mesh, Object3D } from 'three/webgpu';
import { TIERS } from '../../engine/quality';
import { createChest } from '../../game/chest';
import { createBottles } from './bottles';
import { createSloop } from './sloop';
import { ground, installCanvasStub, kit } from './site-test-support';

/** Meshes (draws) under a root, and their triangles. */
function draws(root: Object3D): { meshes: number; triangles: number } {
  let meshes = 0;
  let triangles = 0;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    meshes++;
    triangles += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
  });
  return { meshes, triangles };
}

describe('Lite draws small parts with their neighbours (PLAN §12.1)', () => {
  installCanvasStub();

  it('draws the message bottles in two draws on Lite, same triangles', () => {
    const full = draws(createBottles({ kit: kit(), ground }).group);
    const lite = draws(createBottles({ kit: kit(), ground, lite: true }).group);
    expect(full.meshes).toBe(4);
    expect(lite.meshes).toBe(2);
    expect(lite.triangles).toBe(full.triangles);
  });

  it("draws a moored sloop's rope with its cloth and its iron with its timber on Lite", () => {
    const make = (tier: keyof typeof TIERS) =>
      createSloop({ kit: kit(), tier: TIERS[tier], flag: 'guild', accent: 0x3366aa, seed: 3 });
    const high = make('high');
    const lite = make('lite');
    const names = (s: ReturnType<typeof make>) => {
      const out: string[] = [];
      s.group.traverse((o) => (o as Mesh).isMesh && out.push(o.name));
      return out;
    };
    expect(names(high)).toEqual(expect.arrayContaining(['sloop rope', 'sloop metal']));
    expect(names(lite)).not.toContain('sloop rope');
    expect(names(lite)).not.toContain('sloop metal');
    expect(draws(lite.group).meshes).toBe(draws(high.group).meshes - 2);
  });

  it("draws a chest's coins with its body on Lite", () => {
    const full = createChest();
    const lite = createChest({ lite: true });
    expect(draws(lite.group).meshes).toBe(draws(full.group).meshes - 1);
    expect(draws(lite.group).triangles).toBe(draws(full.group).triangles);
    expect(lite.group.getObjectByName('chest coins')).toBeUndefined();
    full.dispose();
    lite.dispose();
  });
});
