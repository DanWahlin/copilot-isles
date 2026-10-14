import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';
import { writesMotion, writesMotionVectors } from './motion-vectors';

describe('writesMotion', () => {
  it('keeps motion vectors for opaque materials and see-through ones that write depth', () => {
    expect(writesMotion(new MeshBasicNodeMaterial())).toBe(true);
    expect(writesMotion(new MeshBasicNodeMaterial({ transparent: true, opacity: 0.95 }))).toBe(true);
    expect(writesMotion(null)).toBe(true);
  });

  it('leaves the motion behind see-through effects that write no depth', () => {
    expect(writesMotion(new SpriteNodeMaterial({ transparent: true, depthWrite: false }))).toBe(false);
  });

  it('lets an opted-in see-through material write its own motion', () => {
    const sea = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    expect(writesMotion(writesMotionVectors(sea))).toBe(true);
  });
});
