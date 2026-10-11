import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { dropZeroAreaTriangles } from './kit';

describe('dropZeroAreaTriangles', () => {
  it('removes collinear slivers and keeps real triangles', () => {
    const geometry = new BufferGeometry();
    // Corner 3 lies on the line from 0 to 1, so the triangle 0-3-1 has no area.
    const p = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 0, 0];
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
    geometry.setIndex([0, 1, 2, 0, 3, 1]);

    dropZeroAreaTriangles(geometry);

    expect(Array.from(geometry.getIndex()!.array)).toEqual([0, 1, 2]);
  });
});
