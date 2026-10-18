import { describe, expect, it } from 'vitest';
import { InstancedBufferAttribute, InstancedMesh, type BufferGeometry } from 'three/webgpu';
import { interleaveVertexAttributes } from '../../engine/instancing';
import { createFlowerGeometry } from '../flora/heads';
import type { HeadForm } from '../flora/types';
import { bladeBands } from './blade-bands';
import { createGrassGeometry, createSeedHeadGeometry } from './grass';
import { createGrassMaterial, createHeightDataTexture } from './materials';
import type { HeightGrid } from './types';
import { buildWgsl, unsetReads } from './wgsl-test-helpers';

const GRID: HeightGrid = { heights: new Float32Array(16), nx: 4, nz: 4, minX: -10, minZ: -10, cell: 5 };

/** A grass-field mesh of `geometry` (instanced, its attributes interleaved like the field's). */
function grassWgsl(geometry: BufferGeometry): { vertex: string; fragment: string } {
  const material = createGrassMaterial(
    createHeightDataTexture(GRID),
    GRID,
    { full: 20, far: 40, keep: 0.35 },
    bladeBands(1, 1.5),
    { ground: 0x4f6a22, straw: 0.04, strawColour: 0xc0ab5c },
  );
  interleaveVertexAttributes(geometry);
  geometry.setAttribute('grassShape', new InstancedBufferAttribute(new Float32Array(16), 4));
  geometry.setAttribute('tint', new InstancedBufferAttribute(new Float32Array(12), 3));
  return buildWgsl(new InstancedMesh(geometry, material, 4), material);
}

describe('grass material', () => {
  it('draws every blade band, seed head and flower form with the same shader (no new program)', () => {
    const forms: HeadForm[] = ['bloom', 'spike', 'cap', 'frond'];
    const [first, ...rest] = [
      createGrassGeometry(184, 'near'),
      createGrassGeometry(72, 'far'),
      createGrassGeometry(20, 'far'),
      createSeedHeadGeometry(),
      ...forms.map((form) => createFlowerGeometry(form)),
    ].map(grassWgsl);
    for (const other of rest) expect(other).toEqual(first);
  });

  it('keeps within the 16 vertex attribute slots WebGPU and WebGL2 promise', () => {
    const { vertex } = grassWgsl(createGrassGeometry(20, 'far'));
    const inputs = vertex.slice(vertex.indexOf('fn main('), vertex.indexOf('->', vertex.indexOf('fn main(')));
    const slots = [...inputs.matchAll(/@location\(\s*\d+\s*\)/g)].length;
    // The scene pass's motion vectors add last frame's instance matrix (four more slots).
    expect(slots + 4).toBeLessThanOrEqual(16);
  });

  it('sets every shared value before a branch reads it', () => {
    const { vertex, fragment } = grassWgsl(createFlowerGeometry('bloom'));
    expect({ vertex: unsetReads(vertex), fragment: unsetReads(fragment) }).toEqual({
      vertex: [],
      fragment: [],
    });
  });
});
