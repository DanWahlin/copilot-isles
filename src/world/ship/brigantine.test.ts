import { describe, expect, it } from 'vitest';
import type { BufferAttribute, Mesh, Object3D } from 'three/webgpu';
import { createBrigantine, fitShipNameFontSize } from './brigantine';
import { COVE } from '../layout';
import { deckHeightAt } from './lines';

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
    vertices: 19434,
    indices: 98928,
    position: '414c9ae1',
    uv: 'a1910533',
    color: 'a1ed7991',
  },
  {
    name: 'wales strakes gunports galleries anchors',
    vertices: 13029,
    indices: 50265,
    position: '2e5c3bfb',
    uv: 'e05728f2',
    color: '21d647f8',
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
    vertices: 189,
    indices: 636,
    position: '24349af8',
    uv: '00000000',
    color: 'b49c4daf',
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

  it('exposes local helm and pier-side boarding anchors', () => {
    const ship = createBrigantine({ tier: 'low' });
    expect(ship.anchors.helm.z).toBeLessThan(-8);
    expect(ship.anchors.helm.y).toBeCloseTo(deckHeightAt(ship.anchors.helm.z) + 0.18, 6);
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
});
