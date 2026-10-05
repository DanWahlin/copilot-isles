import { describe, expect, it } from 'vitest';
import type { BufferAttribute, Mesh, Object3D } from 'three/webgpu';
import { createBrigantine, fitShipNameFontSize } from './brigantine';
import { QUARTERDECK_Z, WHEEL } from './brigantine-hull';
import { GUN_SLOTS, SCORCH_SLOTS, shipRecoil, shipScorch } from './brigantine-materials';
import { CUTTER_FLAG, createCutterSailGeometry, createRiggingGeometry } from './brigantine-rig';
import { COVE } from '../layout';
import { BRIGANTINE_HALF_LENGTH, deckHeightAt } from './lines';

interface MeshSignature {
  name: string;
  vertices: number;
  indices: number;
  position: string;
  uv: string;
  color: string;
}

const HIGH_TIER_MESH_SIGNATURES: MeshSignature[] = [
  {
    name: 'rounded planked hull',
    vertices: 10505,
    indices: 61887,
    position: '54024027',
    uv: 'fb751034',
    color: '147597e7',
  },
  {
    name: 'deck planking rails and fittings',
    vertices: 13986,
    indices: 73296,
    position: '66df62b5',
    uv: 'cfbebd63',
    color: '3ea0eee1',
  },
  {
    name: 'wales strakes gunports galleries anchors',
    vertices: 12107,
    indices: 41949,
    position: 'b326431e',
    uv: '0760d908',
    color: '70cb0d74',
  },
  // The deck guns were split out of the deck mesh (same vertices) so each can recoil.
  {
    name: 'deck guns',
    vertices: 5448,
    indices: 25632,
    position: '6b14a189',
    uv: 'db41ee55',
    color: '8cc441f5',
  },
  {
    name: 'stern gallery windows and name board backing',
    vertices: 384,
    indices: 576,
    position: '8c0c37d1',
    uv: '414a55c5',
    color: '6cd57a25',
  },
  {
    name: 'stern gallery trim and lantern bracket',
    vertices: 1346,
    indices: 2784,
    position: 'ca5e3583',
    uv: 'd0b34fc5',
    color: 'bcc6a239',
  },
  {
    name: 'christening ship name boards',
    vertices: 68,
    indices: 102,
    position: 'ea1be3f1',
    uv: '85cdb10d',
    color: '5b4c32a5',
  },
  {
    name: 'masts yards boom bowsprit jibboom',
    vertices: 3343,
    indices: 18078,
    position: 'c3d6b2c2',
    uv: 'f7de7d45',
    color: '016fcd69',
  },
  {
    name: 'furled canvas bundles',
    vertices: 494,
    indices: 2808,
    position: '8f86aed8',
    uv: 'f7318079',
    color: '71ad0869',
  },
  {
    name: 'billowed procedural sails',
    vertices: 11949,
    indices: 67035,
    position: 'cd825833',
    uv: '00000000',
    color: '00000000',
  },
  {
    name: 'animated jolly roger and pennants',
    vertices: 489,
    indices: 2448,
    position: 'c4975a1e',
    uv: '2a5ae3de',
    color: '37408793',
  },
  {
    name: 'first words prompt and terminal pipes',
    vertices: 730,
    indices: 1920,
    position: '5af3c35e',
    uv: 'a4869269',
    color: '9935413e',
  },
  {
    name: 'pipe hint and response sparkles',
    vertices: 297,
    indices: 936,
    position: '45e7a6b5',
    uv: '00000000',
    color: '14ff7c35',
  },
  {
    name: 'christening coconut shells and droplets',
    vertices: 786,
    indices: 1944,
    position: '5606c7a9',
    uv: '96c46216',
    color: 'f15e9541',
  },
  {
    name: 'christening crack sparkle',
    vertices: 18,
    indices: 48,
    position: '635edb61',
    uv: '00000000',
    color: '531f62c5',
  },
  {
    name: 'gangplank',
    vertices: 408,
    indices: 612,
    position: '1bcd840d',
    uv: '06091345',
    color: '374baac5',
  },
  {
    name: 'lantern hanger',
    vertices: 114,
    indices: 324,
    position: '04bfa6ab',
    uv: '68814c25',
    color: '65444cf9',
  },
  {
    name: 'stern lantern',
    vertices: 216,
    indices: 324,
    position: 'bee7f94d',
    uv: 'f66e3745',
    color: '3041cae5',
  },
  {
    name: 'hanging line and block',
    vertices: 38,
    indices: 108,
    position: 'b5dc86d4',
    uv: '16ac0665',
    color: '9ccdf591',
  },
];

function checksumAttribute(mesh: Mesh, name: string): string {
  const attr = mesh.geometry.getAttribute(name) as BufferAttribute | undefined;
  if (!attr) return '00000000';
  const array = attr.array;
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function captureMeshSignatures(root: Object3D): MeshSignature[] {
  const signatures: MeshSignature[] = [];
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position') as BufferAttribute | undefined;
    signatures.push({
      name: mesh.name,
      vertices: position?.count ?? 0,
      indices: mesh.geometry.getIndex()?.count ?? 0,
      position: checksumAttribute(mesh, 'position'),
      uv: checksumAttribute(mesh, 'uv'),
      color: checksumAttribute(mesh, 'color'),
    });
  });
  return signatures;
}

describe('createBrigantine', () => {
  it('keeps the hero asset inside the draw-call and high-tier triangle budget', () => {
    const ship = createBrigantine({ tier: 'high' });
    expect(ship.drawCallCount).toBeLessThanOrEqual(20);
    expect(ship.triangleCount).toBeGreaterThanOrEqual(45_000);
    expect(ship.triangleCount).toBeLessThanOrEqual(110_000);
    ship.dispose();
  });

  it('keeps generated brigantine and pipe mesh geometry byte-identical', () => {
    const ship = createBrigantine({ tier: 'high' });
    expect(captureMeshSignatures(ship.group)).toEqual(HIGH_TIER_MESH_SIGNATURES);
    ship.dispose();
  });

  it('hangs the swaying block from a real rigging line', () => {
    const ship = createBrigantine({ tier: 'high' });
    const pivot = ship.group.getObjectByName('hanging block spring')!;
    const p = pivot.position;
    const rig = createRiggingGeometry('high').getAttribute('position') as BufferAttribute;
    let nearest = Infinity;
    for (let i = 0; i < rig.count; i += 2) {
      const ax = rig.getX(i),
        ay = rig.getY(i),
        az = rig.getZ(i);
      const dx = rig.getX(i + 1) - ax,
        dy = rig.getY(i + 1) - ay,
        dz = rig.getZ(i + 1) - az;
      const len2 = dx * dx + dy * dy + dz * dz;
      const t = Math.min(1, Math.max(0, ((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / len2));
      nearest = Math.min(nearest, Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y, az + dz * t - p.z));
    }
    expect(nearest).toBeLessThan(0.02);
    ship.dispose();
  });

  it('exposes local helm and pier-side boarding anchors', () => {
    const ship = createBrigantine({ tier: 'low' });
    // Aft of the wheel, facing it, standing on the quarterdeck's flat top.
    expect(ship.anchors.helm.z).toBeLessThan(WHEEL.z - 0.2);
    expect(ship.anchors.helm.z).toBeGreaterThan(WHEEL.z - 0.5);
    expect(ship.anchors.helm.y).toBeCloseTo(deckHeightAt(QUARTERDECK_Z) + 0.18, 6);
    expect(ship.anchors.helm.heading).toBe(0);
    expect(ship.anchors.boarding.x).toBeGreaterThan(0);
    expect(ship.anchors.boarding.y).toBeCloseTo(deckHeightAt(ship.anchors.boarding.z), 6);
    expect(ship.pipes.tube.x).toBeGreaterThan(0);
    expect(ship.pipes.hatch.x).toBeGreaterThan(0);

    ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
    const pose = ship.dynamics.pose;
    const worldX =
      pose.x +
      Math.cos(pose.heading) * ship.anchors.boarding.x +
      Math.sin(pose.heading) * ship.anchors.boarding.z;
    const worldZ =
      pose.z -
      Math.sin(pose.heading) * ship.anchors.boarding.x +
      Math.cos(pose.heading) * ship.anchors.boarding.z;
    expect(worldX).toBeLessThan(COVE.mooring.x);
    expect(worldZ).toBeCloseTo(COVE.mooring.z - ship.anchors.boarding.z, 6);
    expect(COVE.mooring.z - ship.pipes.tube.z).toBeGreaterThan(-106.6);
    expect(COVE.mooring.z - ship.pipes.tube.z).toBeLessThan(-103.8);
    expect(COVE.mooring.z - ship.pipes.hatch.z).toBeGreaterThan(-106.6);
    expect(COVE.mooring.z - ship.pipes.hatch.z).toBeLessThan(-103.8);
    ship.dispose();
  });

  it('exposes current world-space waterline, bow, and stern points', () => {
    const ship = createBrigantine({ tier: 'low' });
    ship.dynamics.reset(10, -20, Math.PI / 2);
    const poly = new Float32Array(64);
    const bow = new Float32Array(2);
    const bowStem = new Float32Array(3);
    const stern = new Float32Array(2);
    ship.waterlinePolygon(poly);
    ship.bowWorld(bow);
    ship.bowStemWorld(bowStem);
    ship.sternWorld(stern);
    for (const v of poly) expect(Number.isFinite(v)).toBe(true);
    for (const v of bowStem) expect(Number.isFinite(v)).toBe(true);
    expect(poly.length).toBe(64);
    expect(bow[0]).toBeGreaterThan(stern[0]);
    expect(Math.abs(bow[1] - stern[1])).toBeLessThan(0.001);
    expect(bowStem[1]).toBeGreaterThan(1);
    ship.dispose();
  });

  it('fits christening names down to the board width', () => {
    const measure = (size: number, text: string) => size * text.length * 0.58;
    const long = 'Anne’s Brigantine';
    const wide = fitShipNameFontSize(long, 320, measure, 86, 20);
    expect(measure(wide, long)).toBeLessThanOrEqual(320);
    expect(wide).toBeGreaterThanOrEqual(20);
  });

  it('builds a raider that sails as a brigantine or a one-mast cutter', () => {
    const ship = createBrigantine({ tier: 'high', raider: true });
    const brig = ship.group.getObjectByName('brigantine rig')!;
    const cutter = ship.group.getObjectByName('cutter rig')!;
    expect(brig.visible).toBe(true);
    expect(cutter.visible).toBe(false);
    const brigDraws = ship.drawCallCount;
    ship.setRig('cutter');
    expect(brig.visible).toBe(false);
    expect(cutter.visible).toBe(true);
    expect(ship.drawCallCount).toBeLessThanOrEqual(brigDraws);
    expect(ship.uniforms.sailPatch.value).toBe(1);
    expect(ship.uniforms.livery.value).toBe(1);
    ship.setRig('brigantine');
    expect(brig.visible).toBe(true);
    ship.dispose();
  });

  it("keeps your own ship's paint and rig", () => {
    const ship = createBrigantine({ tier: 'low' });
    expect(ship.group.getObjectByName('cutter rig')).toBeUndefined();
    expect(ship.uniforms.sailPatch.value).toBe(0);
    expect(ship.uniforms.livery.value).toBe(0);
    ship.setRig('cutter');
    expect(ship.group.getObjectByName('brigantine rig')!.visible).toBe(true);
    ship.dispose();
  });

  it("keeps the cutter's canvas above the deck and over the hull and bowsprit", () => {
    const pos = createCutterSailGeometry('medium').getAttribute('position') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      expect(z).toBeGreaterThan(-BRIGANTINE_HALF_LENGTH - 0.5);
      expect(z).toBeLessThan(22.5);
      expect(pos.getY(i)).toBeGreaterThan(deckHeightAt(Math.max(-12, Math.min(12, z))) + 0.8);
      expect(pos.getY(i)).toBeLessThan(CUTTER_FLAG.y0);
    }
  });

  it("keeps each ship's shot marks and gun recoil in its own block of the shared arrays", () => {
    const a = createBrigantine({ tier: 'low' });
    const b = createBrigantine({ tier: 'low', raider: true });
    const marks = shipScorch.array as { y: number; w: number }[];
    const guns = shipRecoil.array as number[];
    const markedBlocks = () => {
      const out: number[] = [];
      for (let i = 0; i < marks.length; i++) if (marks[i]!.w > 0) out.push(Math.floor(i / SCORCH_SLOTS));
      return out;
    };
    a.addScorch(3, 1, 0);
    b.addScorch(-3, 1, 2);
    b.addScorch(-3, 1.4, -2);
    const blocks = markedBlocks();
    expect(new Set(blocks).size).toBe(2);
    a.setGunRecoil(2, 0.5);
    expect(guns.filter((g) => g === 0.5)).toHaveLength(1);
    expect(guns.indexOf(0.5) % GUN_SLOTS).toBe(2);
    b.clearScorch();
    expect(new Set(markedBlocks()).size).toBe(1);
    a.dispose();
    b.dispose();
    expect(markedBlocks()).toHaveLength(0);
    expect(guns.every((g) => g === 0)).toBe(true);
  });
});
