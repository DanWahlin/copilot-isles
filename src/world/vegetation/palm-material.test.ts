import { describe, expect, it } from 'vitest';
import { Mesh, Vector3, type BufferGeometry } from 'three/webgpu';
import { createPalmMaterial } from './materials';
import { buildPalmFar, buildPalmNear, buildYoungPalm } from './palms';
import { buildWgsl as buildMeshWgsl, unsetReads } from './wgsl-test-helpers';

/** A palm geometry's WGSL with the palm material. */
function buildWgsl(geometry: BufferGeometry): { vertex: string; fragment: string } {
  const material = createPalmMaterial();
  return buildMeshWgsl(new Mesh(geometry, material), material);
}

describe('palm material', () => {
  it('sets every shared value before a branch reads it (no zero normal on the trunk)', () => {
    // The trunk's normal came out zero: `normalLocal` was first built in the fronds' flutter branch
    // (vertex) and `normalView` in the fronds' glow branch (fragment), so the trunk's normalised normal
    // was a NaN, and the sun's normal-biased shadow lookup turned the whole trunk black.
    for (const geometry of [buildPalmNear(11), buildPalmFar(11), buildYoungPalm(5)]) {
      const { vertex, fragment } = buildWgsl(geometry);
      expect({ vertex: unsetReads(vertex), fragment: unsetReads(fragment) }).toEqual({
        vertex: [],
        fragment: [],
      });
    }
  });

  it('finds a value only one branch sets', () => {
    const wgsl = [
      'var<private> a : f32;',
      'var<private> b : f32;',
      'var<private> c : f32;',
      'fn main( @location( 0 ) x : f32 ) -> Out {',
      '\tif ( x > 0.0 ) {',
      '\t\ta = 1.0;',
      '\t\tb = 1.0;',
      '\t} else {',
      '\t\tb = 2.0;',
      '\t}',
      '\tc = a + b;',
      '}',
    ].join('\n');
    expect(unsetReads(wgsl)).toEqual(['a']);
  });

  it('has a usable normal at every vertex of every palm', () => {
    const n = new Vector3();
    for (const geometry of [buildPalmNear(11), buildPalmFar(11), buildYoungPalm(5)]) {
      const normals = geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i++) {
        n.fromBufferAttribute(normals, i);
        expect(n.length()).toBeGreaterThan(0.5);
      }
    }
  });
});
