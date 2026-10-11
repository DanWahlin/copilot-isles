import { describe, expect, it } from 'vitest';
import { Group, Object3D, PerspectiveCamera, Scene } from 'three/webgpu';
import { BLOB, BLOB_RANGE, BlobShadows, blobFade, isCharacterRoot } from './blob-shadows';

describe('blob shadows', () => {
  it('fades blobs out over the last 20% of the range', () => {
    expect(blobFade(0, 40)).toBe(1);
    expect(blobFade(32, 40)).toBe(1);
    expect(blobFade(36, 40)).toBeCloseTo(0.5, 5);
    expect(blobFade(40, 40)).toBe(0);
    expect(blobFade(80, 40)).toBe(0);
    expect(BLOB_RANGE.lite).toBeLessThan(BLOB_RANGE.low);
  });

  it('knows a character root by its name', () => {
    const a = new Object3D();
    a.name = 'character_woman';
    const b = new Object3D();
    b.name = 'crate';
    expect(isCharacterRoot(a)).toBe(true);
    expect(isCharacterRoot(b)).toBe(false);
  });

  it('puts one blob under each shown character in range, at its feet', () => {
    const scene = new Scene();
    const blobs = new BlobShadows(40);
    scene.add(blobs.mesh);
    const make = (x: number, z: number, parent: Object3D = scene) => {
      const c = new Group();
      c.name = 'character_man';
      c.position.set(x, 2, z);
      parent.add(c);
      return c;
    };
    make(1, 0);
    make(0, 5);
    const hidden = new Group();
    hidden.visible = false;
    scene.add(hidden);
    make(2, 2, hidden);
    make(500, 0);
    scene.updateMatrixWorld(true);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 3, 0);
    camera.updateMatrixWorld(true);
    const renderer = { info: { frame: 1 } };
    const draw = () =>
      blobs.mesh.onBeforeRender(
        renderer as never,
        scene,
        camera,
        blobs.mesh.geometry,
        blobs.mesh.material as never,
        null as never,
      );
    draw();
    expect(blobs.mesh.count).toBe(2);
    const m = blobs.mesh.instanceMatrix.array;
    expect(m[12]).toBe(1);
    expect(m[13]).toBeCloseTo(2 + BLOB.lift, 5);
    expect(m[0]).toBeCloseTo(BLOB.radius, 5);
    // A second draw in the same frame (another pass) doesn't place again.
    hidden.visible = true;
    draw();
    expect(blobs.mesh.count).toBe(2);
    // The next frame does: visibility changes apply at once, between scene sweeps.
    renderer.info.frame = 2;
    draw();
    expect(blobs.mesh.count).toBe(3);
    blobs.dispose();
  });
});
