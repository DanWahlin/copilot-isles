import { beforeAll, describe, expect, test } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three/webgpu';
import { TIERS } from '../../engine/quality';
import type { WaveSampler } from '../contracts';
import { ANCHORAGE_SLUICE } from './sluice-logic';
import { createCrane } from './crane';
import { createCrateYardSite } from './crate-yard';
import { MERIDIAN_YARD } from './crate-yard-logic';
import { createHelmBuoys } from './helm-buoys';
import { createMill } from './mill';
import { InstanceProxies } from './proxies';
import { SignSet, setSignResolution, signPixels } from './sign';
import { flatHeight, installCanvasStub, kit } from './site-test-support';

beforeAll(installCanvasStub);

function meshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) out.push(o);
  });
  return out;
}

function named(root: Object3D, name: string): Mesh[] {
  return meshes(root).filter((m) => m.name === name);
}

function positions(mesh: Mesh): Float32Array {
  return ((mesh.geometry as BufferGeometry).getAttribute('position') as BufferAttribute)
    .array as Float32Array;
}

function signMaterials(root: Object3D): Set<Material> {
  return new Set(
    meshes(root)
      .map((m) => m.material as Material)
      .filter((m) => m.name === 'painted signs'),
  );
}

function createAnchorageMill(signs?: SignSet) {
  return createMill({
    kit: kit(),
    tier: TIERS.high,
    heightField: flatHeight,
    kinds: ANCHORAGE_SLUICE.tiles.map((tile) => tile.kind),
    signs,
  });
}

const calmSea: WaveSampler = {
  heightAt: (x, _z, t) => Math.sin(x * 0.3 + t),
  velocityAt: (_x, _z, _t, out) => out,
};

describe('SignSet', () => {
  test("paints a board at its size in metres, within its tier's limits", () => {
    setSignResolution('high');
    expect(signPixels(0.5)).toBe(384);
    expect(signPixels(1.22)).toBe(781);
    expect(signPixels(3.6)).toBe(1024);
    setSignResolution('lite');
    expect(signPixels(0.5)).toBe(192);
    expect(signPixels(3.6)).toBe(512);
    setSignResolution('high');
  });

  test('draws every board from one atlas with one material and one mesh', () => {
    const set = new SignSet('test signs');
    set.add(['One'], 2, 0.5);
    set.add(['Two', 'lines'], 1.6, 0.8, { twoSided: true });
    set.add(['Three'], 1, 1, { look: 'cloth', offsetY: -0.5 });
    const mesh = set.finalize();

    expect(set.finalize()).toBe(mesh);
    expect(set.count).toBe(3);
    const material = mesh.material as MeshStandardNodeMaterial;
    expect(material).toBeInstanceOf(MeshStandardNodeMaterial);
    // The atlas is the material's palette (stage-light.ts palettedMaterial), so its shadow shares one shader.
    expect((material as MeshStandardNodeMaterial & { paletteMap?: Texture }).paletteMap).toBeTruthy();
    // One-sided boards are one quad; a two-sided board adds a back quad.
    const geometry = mesh.geometry as BufferGeometry;
    expect(geometry.getAttribute('position').count).toBe(4 + 8 + 4);
    expect(geometry.index?.count).toBe(6 + 12 + 6);
    expect(mesh.castShadow).toBe(true);

    // Every board maps to its own atlas rectangle (no overlap).
    const uv = geometry.getAttribute('uv') as BufferAttribute;
    const rects = [0, 4, 12].map((start) => ({
      u0: uv.getX(start),
      v0: uv.getY(start),
      u1: uv.getX(start + 2),
      v1: uv.getY(start + 2),
    }));
    for (const r of rects) {
      expect(r.u0).toBeGreaterThanOrEqual(0);
      expect(r.v0).toBeGreaterThanOrEqual(0);
      expect(r.u1).toBeLessThanOrEqual(1);
      expect(r.v1).toBeLessThanOrEqual(1);
      expect(r.v1).toBeGreaterThan(r.v0);
      expect(r.u1).toBeGreaterThan(r.u0);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!,
          b = rects[j]!;
        const apart = a.u1 <= b.u0 || b.u1 <= a.u0 || a.v1 <= b.v0 || b.v1 <= a.v0;
        expect(apart).toBe(true);
      }
    expect(() => set.add(['Late'], 1, 1)).toThrow();
    set.dispose();
  });

  test('follows, hides, and repaints its boards without new meshes', () => {
    const set = new SignSet('moving signs');
    const parent = new Group();
    const sign = set.add(['Move me'], 2, 1);
    const other = set.add(['Stay'], 2, 1);
    parent.add(sign.object, other.object);
    const mesh = set.finalize();
    parent.add(mesh);
    const pos = positions(mesh);
    const otherBefore = pos.slice(12, 24);

    sign.object.position.set(3, 1, -2);
    set.update();
    expect(pos[0]).toBeCloseTo(3 - 1);
    expect(pos[1]).toBeCloseTo(1 - 0.5);
    expect(pos[2]).toBeCloseTo(-2 + 0.004);
    expect(mesh.geometry.boundingSphere!.center.x).toBeGreaterThan(0);
    expect(pos.slice(12, 24)).toEqual(otherBefore);

    // Hidden (itself or through a parent group): its quad folds to a point and draws nothing.
    sign.object.visible = false;
    set.update();
    for (let k = 3; k < 12; k += 3)
      expect([pos[k], pos[k + 1], pos[k + 2]]).toEqual([pos[0], pos[1], pos[2]]);
    sign.object.visible = true;
    set.update();
    expect(pos[3]).toBeCloseTo(3 + 1);

    const atlas = (mesh.material as MeshStandardNodeMaterial & { paletteMap: Texture }).paletteMap;
    const version = atlas.version;
    sign.redraw(['Moved']);
    expect(atlas.version).toBeGreaterThan(version);
    expect(sign.object.name).toBe('sign: Moved');
    expect(meshes(parent)).toHaveLength(1);
    set.dispose();
  });
});

describe('InstanceProxies', () => {
  test('copies each placeholder into its instance and scales hidden ones to nothing', () => {
    const root = new Group();
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicNodeMaterial(), 2);
    const a = new Object3D();
    const b = new Object3D();
    root.add(mesh, a, b);
    const proxies = new InstanceProxies(mesh, [a, b]);
    a.position.set(1, 2, 3);
    b.visible = false;
    proxies.update();
    const m = mesh.instanceMatrix.array;
    expect([m[12], m[13], m[14]]).toEqual([1, 2, 3]);
    expect(m[16]).toBe(0);
    expect(m[21]).toBe(0);
    b.visible = true;
    proxies.update();
    expect(m[16]).toBe(1);
  });
});

describe('Anchorage puzzle sites', () => {
  test('the mill and the crane share one sign set: one material, one mesh', () => {
    const signs = new SignSet('anchorage painted signs');
    const mill = createAnchorageMill(signs);
    const crane = createCrane({ kit: kit(), tier: TIERS.high, signs });
    expect(signMaterials(mill.group).size).toBe(0);
    expect(signMaterials(crane.group).size).toBe(0);
    expect(signs.count).toBeGreaterThanOrEqual(8);

    const root = new Group();
    root.add(mill.group, crane.group, signs.finalize());
    expect(signMaterials(root).size).toBe(1);
    expect(named(root, 'anchorage painted signs')).toHaveLength(1);
  });

  test('the mill tiles join the terrace mesh and still turn', () => {
    const mill = createAnchorageMill();
    expect(meshes(mill.group).filter((m) => m.name.startsWith('mill tile'))).toHaveLength(0);
    const [stone] = named(mill.group, 'mill terrace and tiles');
    expect(stone).toBeDefined();
    const pos = positions(stone!);
    const before = pos.slice();
    mill.setRotation(1, 1, true);
    const changed = pos.findIndex((v, i) => v !== before[i]);
    expect(changed).toBeGreaterThan(0);
    // The terrace itself (the start of the buffer) doesn't move.
    expect(pos.slice(0, 30)).toEqual(before.slice(0, 30));
    // Signs moved into one mesh per site.
    expect(named(mill.group, 'mill signs')).toHaveLength(1);
  });

  test('the mill lever and wheel stay separate meshes that move', () => {
    const mill = createAnchorageMill();
    const all = meshes(mill.group);
    mill.group.updateMatrixWorld(true);
    const before = all.map((m) => m.matrixWorld.clone());
    mill.setLever(true, true);
    for (let i = 0; i < 10; i++) mill.update(0.1, i * 0.1);
    mill.group.updateMatrixWorld(true);
    const moved = all.filter((m, i) => !m.matrixWorld.equals(before[i]!));
    expect(moved.length).toBeGreaterThan(0);
    for (const m of moved) expect(m.name).not.toBe('mill terrace and tiles');
  });

  test('the crane draws its berth flags as one mesh and keeps its moving parts apart', () => {
    const crane = createCrane({ kit: kit(), tier: TIERS.high });
    expect(named(crane.group, 'berth flags')).toHaveLength(1);
    expect(
      meshes(crane.group).filter((m) => m.name.endsWith(' flag') && m.parent === crane.group),
    ).toHaveLength(0);
    expect(named(crane.group, 'crane signs')).toHaveLength(1);
    const [timber] = named(crane.group, 'crane timber');
    expect(timber!.parent!.name).toBe('crane (slewing)');

    const [signMesh] = named(crane.group, 'crane signs');
    crane.update(0.016, 0);
    const shut = positions(signMesh!).slice();
    crane.setBanner(true, true);
    crane.update(0.016, 0.016);
    expect(positions(signMesh!)).not.toEqual(shut);
  });
});

describe('Meridian puzzle sites', () => {
  test('the crate yard instances its crates and merges their stencils', () => {
    const yard = createCrateYardSite({
      kit: kit(),
      tier: TIERS.high,
      origin: { x: 5, y: 1, z: 3, heading: 0.3 },
      layout: MERIDIAN_YARD,
    });
    const crates = meshes(yard.group).filter((m) => m.name === 'crate yard crates');
    expect(crates).toHaveLength(1);
    const bodies = crates[0] as InstancedMesh;
    expect(bodies.isInstancedMesh).toBe(true);
    expect(bodies.count).toBe(MERIDIAN_YARD.crates.length);
    expect(named(yard.group, 'crate yard lettering')).toHaveLength(1);

    MERIDIAN_YARD.crates.forEach((c, i) => yard.setCrate(i, c.at, true));
    yard.update(0.016, 0);
    const letters = positions(named(yard.group, 'crate yard lettering')[0]!).slice();
    const matrices = bodies.instanceMatrix.array.slice();
    const [first] = MERIDIAN_YARD.crates;
    yard.setCrate(0, [first!.at[0], first!.at[1] === 0 ? 1 : first!.at[1] - 1], true);
    yard.update(0.016, 0.016);
    expect(positions(named(yard.group, 'crate yard lettering')[0]!)).not.toEqual(letters);
    expect(bodies.instanceMatrix.array.slice(0, 16)).not.toEqual(matrices.slice(0, 16));
    expect(bodies.instanceMatrix.array.slice(16, 32)).toEqual(matrices.slice(16, 32));
    // Seen from the far side, the top stencils turn to face you (the crates stay put).
    const lettersBefore = positions(named(yard.group, 'crate yard lettering')[0]!).slice();
    const c = yard.cellCenter(2, 2);
    yard.faceLabels(c.x - Math.sin(0.3) * 20, c.z - Math.cos(0.3) * 20);
    yard.update(0.016, 0.032);
    expect(positions(named(yard.group, 'crate yard lettering')[0]!)).not.toEqual(lettersBefore);
    expect(bodies.instanceMatrix.array.slice(16, 32)).toEqual(matrices.slice(16, 32));
  });

  test('the helm buoys draw their floats as one instanced mesh that rides the waves', () => {
    const helms = createHelmBuoys({ kit: kit(), waves: calmSea });
    const floats = named(helms.group, 'helm buoy floats') as InstancedMesh[];
    expect(floats).toHaveLength(1);
    expect(floats[0]!.isInstancedMesh).toBe(true);
    // The three orders' buoys and the Shoal's float.
    expect(floats[0]!.count).toBe(4);
    expect(named(helms.group, 'helm name boards')).toHaveLength(1);
    // Plan's routes as dashed lines: the first chart, then the fixed one, never both.
    const lines = named(helms.group, 'helm route line');
    expect(lines).toHaveLength(2);
    helms.showRoute('draft');
    expect(lines.filter((l) => l.visible)).toHaveLength(1);
    helms.showRoute('plan');
    expect(lines.filter((l) => l.visible)).toHaveLength(1);
    helms.showRoute(null);
    expect(lines.filter((l) => l.visible)).toHaveLength(0);
    helms.update(0.016, 0);
    const before = floats[0]!.instanceMatrix.array.slice(0, 48);
    helms.update(0.016, 1);
    expect(floats[0]!.instanceMatrix.array.slice(0, 48)).not.toEqual(before);
  });
});
