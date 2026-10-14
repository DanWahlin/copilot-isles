import { Sprite } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { releaseSpriteQuad, spriteQuadUsers, useSpriteQuad } from './sprite-quad';

describe('sprite quad (issue 251)', () => {
  it('gives every sprite one plain quad, not three’s interleaved one', () => {
    const a = useSpriteQuad(new Sprite());
    const b = useSpriteQuad(new Sprite());
    expect(a.geometry).toBe(b.geometry);
    for (const name of ['position', 'uv'])
      expect(
        (a.geometry.getAttribute(name) as { isInterleavedBufferAttribute?: boolean })
          .isInterleavedBufferAttribute,
      ).toBeFalsy();
    expect(a.geometry.getAttribute('position').count).toBe(4);
    expect(a.geometry.index?.count).toBe(6);
    releaseSpriteQuad(a);
    releaseSpriteQuad(b);
  });

  it('frees the GPU copy with the last sprite only, and keeps the CPU data', () => {
    const a = useSpriteQuad(new Sprite());
    const b = useSpriteQuad(new Sprite());
    let disposed = 0;
    const onDispose = () => disposed++;
    a.geometry.addEventListener('dispose', onDispose);
    releaseSpriteQuad(a);
    releaseSpriteQuad(a);
    expect(disposed).toBe(0);
    expect(spriteQuadUsers()).toBe(1);
    releaseSpriteQuad(b);
    expect(disposed).toBe(1);
    expect(spriteQuadUsers()).toBe(0);
    // The next voyage's sprites get the same quad back (uploaded again on its first draw).
    const c = useSpriteQuad(new Sprite());
    expect(c.geometry).toBe(a.geometry);
    expect(c.geometry.getAttribute('position').count).toBe(4);
    c.geometry.removeEventListener('dispose', onDispose);
    releaseSpriteQuad(c);
  });
});
