import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  TorusKnotGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import {
  CharacterLod,
  LOD_DISTANCES,
  LOD_HYSTERESIS,
  attachCharacterLod,
  buildLodIndex,
  buildLods,
  chooseLodLevel,
  clearCharacterLodView,
  loadLodSimplifier,
  lodRanges,
  setCharacterLodView,
  type LodSimplifier,
} from './character-lod';

let simplify: LodSimplifier;

beforeAll(async () => {
  const s = await loadLodSimplifier();
  expect(s).not.toBeNull();
  simplify = s!;
});

afterEach(() => clearCharacterLodView());

/** A skinned torus knot (4096 triangles) on a two-bone skeleton, like a character body. */
function skinnedCharacter(): { root: Group; mesh: SkinnedMesh; skeleton: Skeleton } {
  const geometry = new TorusKnotGeometry(1, 0.3, 128, 16);
  const n = geometry.getAttribute('position').count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = geometry.getAttribute('position').getY(i);
    skinIndex[i * 4] = 0;
    skinIndex[i * 4 + 1] = 1;
    skinWeight[i * 4] = y > 0 ? 0.8 : 0.2;
    skinWeight[i * 4 + 1] = y > 0 ? 0.2 : 0.8;
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  const hip = new Bone();
  const spine = new Bone();
  spine.position.y = 1;
  hip.add(spine);
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  const root = new Group();
  root.add(hip, mesh);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton([hip, spine]);
  mesh.bind(skeleton);
  return { root, mesh, skeleton };
}

function triangles(geometry: BufferGeometry, level: number): number {
  return lodRanges(geometry)![level * 2 + 1]! / 3;
}

describe('character LOD build', () => {
  it('makes LOD 1 near 45% and LOD 2 near 15% of the triangles', () => {
    const { mesh } = skinnedCharacter();
    const full = mesh.geometry.index!.count / 3;
    expect(buildLodIndex(mesh.geometry, simplify)).toBe(true);
    expect(triangles(mesh.geometry, 0)).toBe(full);
    const r1 = triangles(mesh.geometry, 1) / full;
    const r2 = triangles(mesh.geometry, 2) / full;
    expect(r1).toBeGreaterThan(0.3);
    expect(r1).toBeLessThanOrEqual(0.5);
    expect(r2).toBeGreaterThan(0.05);
    expect(r2).toBeLessThanOrEqual(0.2);
    expect(r2).toBeLessThan(r1);
  });

  it('keeps the vertices, skin, skeleton and bind pose, and only adds index ranges', () => {
    const { mesh, skeleton } = skinnedCharacter();
    const g = mesh.geometry;
    const before = {
      position: g.getAttribute('position'),
      skinIndex: g.getAttribute('skinIndex'),
      skinWeight: g.getAttribute('skinWeight'),
      fullIndex: Array.from(g.index!.array),
    };
    const bones = [...skeleton.bones];
    const bindMatrix = mesh.bindMatrix.clone();
    const inverses = skeleton.boneInverses.map((m) => m.clone());
    buildLodIndex(g, simplify);
    expect(g.getAttribute('position')).toBe(before.position);
    expect(g.getAttribute('skinIndex')).toBe(before.skinIndex);
    expect(g.getAttribute('skinWeight')).toBe(before.skinWeight);
    expect(mesh.skeleton).toBe(skeleton);
    expect(mesh.skeleton.bones).toEqual(bones);
    expect(mesh.bindMatrix.equals(bindMatrix)).toBe(true);
    skeleton.boneInverses.forEach((m, i) => expect(m.equals(inverses[i]!)).toBe(true));
    const r = lodRanges(g)!;
    // Contiguous [full | LOD 1 | LOD 2], the full list unchanged, every index a real vertex.
    expect(r[0]).toBe(0);
    expect(r[2]).toBe(r[0] + r[1]);
    expect(r[4]).toBe(r[2] + r[3]);
    expect(g.index!.count).toBe(r[4] + r[5]);
    expect(Array.from(g.index!.array.slice(0, r[1]))).toEqual(before.fullIndex);
    const vertices = before.position.count;
    expect(Math.max(...Array.from(g.index!.array))).toBeLessThan(vertices);
    expect(g.drawRange.start).toBe(0);
    expect(g.drawRange.count).toBe(r[1]);
  });

  it('skips small, grouped, non-indexed and already-built geometry', () => {
    expect(buildLodIndex(new BoxGeometry(1, 1, 1, 4, 4, 4), simplify)).toBe(false); // 192 tris
    const grouped = new TorusKnotGeometry(1, 0.3, 128, 16);
    grouped.addGroup(0, 300, 0);
    expect(buildLodIndex(grouped, simplify)).toBe(false);
    const flat = new TorusKnotGeometry(1, 0.3, 128, 16).toNonIndexed();
    expect(buildLodIndex(flat, simplify)).toBe(false);
    const { mesh } = skinnedCharacter();
    expect(buildLodIndex(mesh.geometry, simplify)).toBe(true);
    const index = mesh.geometry.index;
    expect(buildLodIndex(mesh.geometry, simplify)).toBe(false);
    expect(mesh.geometry.index).toBe(index);
  });

  it('builds shared geometry once and leaves the face alone', async () => {
    const { root, mesh } = skinnedCharacter();
    const twin = new Mesh(mesh.geometry, mesh.material);
    const face = new Mesh(new TorusKnotGeometry(1, 0.3, 128, 16), mesh.material);
    face.name = 'character-face';
    root.add(twin, face);
    expect(await buildLods(root, simplify)).toBe(1);
    expect(lodRanges(face.geometry)).toBeNull();
  });
});

describe('character LOD choice', () => {
  const edges = [20, 45] as const;
  const h = LOD_HYSTERESIS;

  it('picks the level from the distance', () => {
    expect(chooseLodLevel(5, 0, edges)).toBe(0);
    expect(chooseLodLevel(30, 0, edges)).toBe(1);
    expect(chooseLodLevel(80, 0, edges)).toBe(2);
    expect(chooseLodLevel(5, 2, edges)).toBe(0);
  });

  it('holds the level inside the hysteresis band on both sides of an edge', () => {
    expect(chooseLodLevel(20 * (1 + h) - 0.1, 0, edges)).toBe(0);
    expect(chooseLodLevel(20 * (1 + h) + 0.1, 0, edges)).toBe(1);
    expect(chooseLodLevel(20 * (1 - h) + 0.1, 1, edges)).toBe(1);
    expect(chooseLodLevel(20 * (1 - h) - 0.1, 1, edges)).toBe(0);
    expect(chooseLodLevel(45, 1, edges)).toBe(1);
    expect(chooseLodLevel(45, 2, edges)).toBe(2);
  });

  it('switches sooner on lower tiers', () => {
    const order = ['lite', 'low', 'medium', 'high', 'ultra'] as const;
    for (let i = 1; i < order.length; i++) {
      const a = LOD_DISTANCES[order[i - 1]!];
      const b = LOD_DISTANCES[order[i]!];
      expect(a.edges[0]).toBeLessThan(b.edges[0]);
      expect(a.edges[1]).toBeLessThan(b.edges[1]);
      expect(a.nearPlayer).toBeLessThanOrEqual(b.nearPlayer);
    }
    expect(LOD_DISTANCES.high.nearPlayer).toBeGreaterThanOrEqual(12);
  });
});

describe('CharacterLod', () => {
  function place(x: number): Object3D {
    const o = new Object3D();
    o.position.x = x;
    o.updateMatrixWorld(true);
    return o;
  }

  it('draws full detail with no game view (title, opening, dev pages)', () => {
    const lod = new CharacterLod(place(500));
    expect(lod.resolve(false)).toBe(0);
    expect(lod.resolve(true)).toBe(0);
  });

  it('goes coarser with distance and draws its shadow one level coarser', () => {
    setCharacterLodView({ camera: place(0), focus: place(-1000), tier: 'high' });
    const npc = new CharacterLod(place(40));
    expect(npc.resolve(false)).toBe(1);
    expect(npc.resolve(true)).toBe(2);
    const far = new CharacterLod(place(100));
    expect(far.resolve(false)).toBe(2);
    expect(far.resolve(true)).toBe(2);
  });

  it('keeps full detail when talking, near the player, or for the player inside 18 m', () => {
    setCharacterLodView({ camera: place(0), focus: place(40), tier: 'high' });
    const talker = new CharacterLod(place(100));
    talker.forced = true;
    expect(talker.resolve(false)).toBe(0);
    expect(talker.resolve(true)).toBe(0);
    const beside = new CharacterLod(place(45));
    expect(beside.resolve(false)).toBe(0);
    expect(beside.resolve(true)).toBe(0);
    const away = new CharacterLod(place(60));
    expect(away.resolve(false)).toBe(1);
    // The walk camera sits 14 m from the player at most: still full detail, even on lite.
    setCharacterLodView({ camera: place(0), focus: null, tier: 'lite' });
    const player = new CharacterLod(place(15), true);
    expect(player.resolve(false)).toBe(0);
    expect(player.resolve(true)).toBe(1);
    const cinematic = new CharacterLod(place(60), true);
    expect(cinematic.resolve(false)).toBe(2);
  });

  it('only clears the view of the session that set it', () => {
    const focus = place(0);
    setCharacterLodView({ camera: place(0), focus, tier: 'high' });
    clearCharacterLodView(place(0));
    expect(new CharacterLod(place(200)).resolve(false)).toBe(2);
    clearCharacterLodView(focus);
    expect(new CharacterLod(place(200)).resolve(false)).toBe(0);
  });

  it('sets the draw range per draw and puts the full list back after', () => {
    const { root, mesh } = skinnedCharacter();
    buildLodIndex(mesh.geometry, simplify);
    const r = lodRanges(mesh.geometry)!;
    const lod = new CharacterLod(root);
    expect(attachCharacterLod(root, lod)).toBe(1);
    root.position.x = 100;
    root.updateMatrixWorld(true);
    setCharacterLodView({ camera: place(0), focus: place(-1000), tier: 'high' });
    const args = [null, null, null, mesh.geometry, mesh.material, null] as unknown as Parameters<
      Mesh['onBeforeRender']
    >;
    mesh.onBeforeRender(...args);
    expect([mesh.geometry.drawRange.start, mesh.geometry.drawRange.count]).toEqual([r[4], r[5]]);
    mesh.onAfterRender(...args);
    expect([mesh.geometry.drawRange.start, mesh.geometry.drawRange.count]).toEqual([r[0], r[1]]);
    root.position.x = 40;
    root.updateMatrixWorld(true);
    lod.level = 0;
    const shadowArgs = args as unknown as Parameters<Mesh['onBeforeShadow']>;
    mesh.onBeforeShadow(...shadowArgs);
    mesh.onBeforeRender(...args);
    expect(mesh.geometry.drawRange.start).toBe(r[4]);
    mesh.onAfterRender(...args);
    mesh.onAfterShadow(...shadowArgs);
    mesh.onBeforeRender(...args);
    expect(mesh.geometry.drawRange.start).toBe(r[2]);
    mesh.onAfterRender(...args);
  });
});
