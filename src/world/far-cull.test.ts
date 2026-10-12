import { describe, expect, it } from 'vitest';
import { BoxGeometry, Frustum, Group, Matrix4, Mesh, PerspectiveCamera } from 'three/webgpu';
import { FarCull } from './far-cull';

/** A frustum that sees everything in front of a camera at the origin looking down -z. */
function wideFrustum(): Frustum {
  const camera = new PerspectiveCamera(170, 1, 0.1, 10000);
  camera.updateMatrixWorld();
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
}

function boxAt(size: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(size, size, size));
  mesh.position.set(0, 0, z);
  mesh.updateMatrixWorld();
  return mesh;
}

describe('FarCull', () => {
  it('culls the detail while the camera is far from the island', () => {
    const cull = new FarCull(0, -50, 100);
    const root = new Group();
    const mesh = boxAt(1, -50);
    root.add(mesh);
    cull.add(root);
    const frustum = wideFrustum();
    cull.update(0, 0);
    expect(mesh.intersectsFrustum(frustum)).toBe(true);
    cull.update(0, 200);
    expect(mesh.intersectsFrustum(frustum)).toBe(false);
  });

  it('with a size ratio, drops small pieces sooner than big ones', () => {
    const cull = new FarCull(0, 0, Infinity, 100);
    const small = boxAt(1, -60); // radius ~0.87 m: kept within ~87 m
    const big = boxAt(4, -60); // radius ~3.5 m: kept within ~350 m
    cull.add(small);
    cull.add(big);
    const frustum = wideFrustum();
    cull.update(0, 0);
    expect(small.intersectsFrustum(frustum)).toBe(true);
    expect(big.intersectsFrustum(frustum)).toBe(true);
    cull.update(0, 40); // 100 m away
    expect(small.intersectsFrustum(frustum)).toBe(false);
    expect(big.intersectsFrustum(frustum)).toBe(true);
  });

  it('with no size ratio, keeps everything near the island', () => {
    const cull = new FarCull(0, 0, Infinity);
    const small = boxAt(0.1, -900);
    cull.add(small);
    cull.update(0, 0);
    expect(small.intersectsFrustum(wideFrustum())).toBe(true);
  });

  it("doesn't cull a piece before its first draw (a late load uploads when it's added)", () => {
    const cull = new FarCull(0, 0, 100, 100);
    const late = boxAt(1, -500);
    cull.add(late);
    const frustum = wideFrustum();
    cull.update(0, 400); // far from the island, and far past the piece's size
    expect(late.intersectsFrustum(frustum)).toBe(true);
    expect(late.intersectsFrustum(frustum)).toBe(false);
  });
});
