import { describe, expect, test } from 'vitest';
import { BufferAttribute, Group, Mesh, Object3D, type BufferGeometry } from 'three/webgpu';
import { TIERS } from '../../engine/quality';
import { ANCHORAGE_SLUICE } from './sluice-logic';
import { createBottles } from './bottles';
import { createCrane } from './crane';
import { createGearRack } from './gear-rack';
import { createHammock } from './hammock';
import { createMill } from './mill';
import { createPaletteStand } from './palette-stand';
import { flatHeight, ground, installCanvasStub, kit } from './site-test-support';

interface MeshFingerprint {
  readonly path: string;
  readonly vertices: number;
  readonly indices: number;
  readonly position: string;
  readonly uv: string;
  readonly color: string;
}

function siteGroups(): Record<string, Group> {
  installCanvasStub();
  const villageKit = kit();
  return {
    bottles: createBottles({ kit: villageKit, ground }).group,
    crane: createCrane({ kit: villageKit, tier: TIERS.high }).group,
    gear: createGearRack({ kit: villageKit, tier: TIERS.high, ground }).group,
    hammock: createHammock({ kit: villageKit, tier: TIERS.high, ground }).group,
    mill: createMill({
      kit: villageKit,
      tier: TIERS.high,
      heightField: flatHeight,
      kinds: ANCHORAGE_SLUICE.tiles.map((tile) => tile.kind),
    }).group,
    palette: createPaletteStand({ kit: villageKit, tier: TIERS.high, ground }).group,
  };
}

function fingerprints(group: Group): MeshFingerprint[] {
  const meshes: MeshFingerprint[] = [];
  visit(group, group.name || group.type, meshes);
  return meshes;
}

function visit(obj: Object3D, path: string, meshes: MeshFingerprint[]): void {
  if (obj instanceof Mesh) meshes.push(fingerprint(obj, path));
  obj.children.forEach((child, index) =>
    visit(child, `${path}/${child.name || child.type}#${index}`, meshes),
  );
}

function fingerprint(mesh: Mesh, path: string): MeshFingerprint {
  const geometry = mesh.geometry as BufferGeometry;
  const position = geometry.getAttribute('position') as BufferAttribute | undefined;
  return {
    path,
    vertices: position?.count ?? 0,
    indices: geometry.index?.count ?? 0,
    position: checksum(position),
    uv: checksum(geometry.getAttribute('uv') as BufferAttribute | undefined),
    color: checksum(geometry.getAttribute('color') as BufferAttribute | undefined),
  };
}

function checksum(attribute: BufferAttribute | undefined): string {
  if (!attribute) return 'none';
  const view = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
  let hash = 0x811c9dc5;
  for (const byte of view) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

describe('site geometry fingerprints', () => {
  test('stay stable across site cleanup refactors', () => {
    const groups = siteGroups();
    expect(
      Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, fingerprints(group)])),
    ).toMatchSnapshot();
  });
});
