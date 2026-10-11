import type { Frustum, FrustumArray, Object3D } from 'three/webgpu';

type Cullable = Object3D & {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
};

/**
 * Culls an island's small detail (its people, puzzle sites, chests, props) in every pass, main and
 * shadow, while the camera is far from the island, like anything off-screen. At that range they're a
 * pixel or two, so the island keeps its look (its terrain, town and silhouette stay). It works through
 * three's frustum test, not `visible` (the game shows and hides these for its own reasons), so a
 * warm-up still draws them: it draws objects unculled.
 */
export class FarCull {
  /** True while the camera is beyond `radius` of the centre. */
  far = false;
  private readonly radiusSq: number;

  constructor(
    private readonly x: number,
    private readonly z: number,
    radius: number,
  ) {
    this.radiusSq = radius * radius;
  }

  /** Puts every renderable under `root` on this switch (call once per root, after it's built). */
  add(root: Object3D): void {
    root.traverse((object: Cullable) => {
      if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return;
      const test = object.intersectsFrustum.bind(object) as (frustum: Frustum | FrustumArray) => boolean;
      object.intersectsFrustum = (frustum: Frustum | FrustumArray) => !this.far && test(frustum);
    });
  }

  /** Call once a frame with the camera's position. */
  update(cameraX: number, cameraZ: number): void {
    const dx = cameraX - this.x;
    const dz = cameraZ - this.z;
    this.far = dx * dx + dz * dz > this.radiusSq;
  }
}
