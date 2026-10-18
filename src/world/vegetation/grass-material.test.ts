import { describe, expect, it } from 'vitest';
import { InstancedBufferAttribute, InstancedMesh, type BufferGeometry } from 'three/webgpu';
import { interleaveVertexAttributes } from '../../engine/instancing';
import { createFlowerGeometry } from '../flora/heads';
import type { HeadForm } from '../flora/types';
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
    { ground: 0x4f6a22, straw: 0.04, strawColour: 0xc0ab5c },
  );
  interleaveVertexAttributes(geometry);
  geometry.setAttribute('grassShape', new InstancedBufferAttribute(new Float32Array(8), 2));
  geometry.setAttribute('tint', new InstancedBufferAttribute(new Float32Array(12), 3));
  return buildWgsl(new InstancedMesh(geometry, material, 4), material);
}

describe('grass material', () => {
  it('draws every flower form with the same shader (a new species adds no program)', () => {
    const forms: HeadForm[] = ['bloom', 'spike', 'cap', 'frond'];
    const [first, ...rest] = forms.map((form) => grassWgsl(createFlowerGeometry(form)));
    for (const other of rest) expect(other).toEqual(first);
  });

  it('sets every shared value before a branch reads it', () => {
    const { vertex, fragment } = grassWgsl(createFlowerGeometry('bloom'));
    expect({ vertex: unsetReads(vertex), fragment: unsetReads(fragment) }).toEqual({
      vertex: [],
      fragment: [],
    });
  });
});
