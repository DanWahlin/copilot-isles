import { describe, expect, test } from 'vitest';
import {
  BufferAttribute,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import { TIERS } from '../../engine/quality';
import type { HeightField } from '../contracts';
import type { VillageKit } from '../village';
import { ANCHORAGE_SLUICE } from './sluice-logic';
import { createBottles } from './bottles';
import { createCrane } from './crane';
import { createGearRack } from './gear-rack';
import { createHammock } from './hammock';
import { createMill } from './mill';
import { createPaletteStand } from './palette-stand';

interface MeshFingerprint {
  readonly path: string;
  readonly vertices: number;
  readonly indices: number;
  readonly position: string;
  readonly uv: string;
  readonly color: string;
}

class NullCanvasContext {
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  globalAlpha = 1;
  shadowColor = 'transparent';
  shadowBlur = 0;

  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  closePath(): void {}
  fill(): void {}
  stroke(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  clearRect(): void {}
  fillText(): void {}
  arc(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  setLineDash(): void {}
  createLinearGradient(): CanvasGradient {
    return { addColorStop: () => undefined } as unknown as CanvasGradient;
  }
  measureText(text: string): TextMetrics {
    return { width: text.length * 32 } as TextMetrics;
  }
}

function installCanvasStub(): void {
  const context = new NullCanvasContext();
  globalThis.document = {
    createElement(tag: string): HTMLCanvasElement {
      if (tag !== 'canvas') throw new Error(`Unexpected element in site fingerprint test: ${tag}`);
      return {
        width: 0,
        height: 0,
        getContext: (kind: string) => (kind === '2d' ? context : null),
      } as HTMLCanvasElement;
    },
    createElementNS(namespace: string, tag: string): Element {
      void namespace;
      if (tag !== 'img') throw new Error(`Unexpected namespaced element in site fingerprint test: ${tag}`);
      return {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as unknown as Element;
    },
  } as Document;
}

const materialKeys = [
  'stone',
  'paving',
  'plaster',
  'roofTile',
  'thatch',
  'wood',
  'cloth',
  'metal',
  'rope',
  'glow',
  'halo',
] as const;

function kit(): VillageKit {
  const materials = Object.fromEntries(
    materialKeys.map((key) => [key, new MeshBasicNodeMaterial()]),
  ) as unknown as Record<(typeof materialKeys)[number], Material>;
  return { pieces: new Map(), materials, dispose: () => undefined } as VillageKit;
}

const flatHeight: HeightField = {
  heightAt: () => 0,
  normalAt(_x, _z, out) {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 1, grass: 0, rock: 0, cliff: 0 }),
};

const ground = (): number => 0;

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
