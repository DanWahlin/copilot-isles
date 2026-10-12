import { Sphere, type Frustum, type FrustumArray, type Object3D } from 'three/webgpu';

type Cullable = Object3D & {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  geometry?: { boundingSphere: Sphere | null; computeBoundingSphere(): void };
  boundingSphere?: Sphere | null;
  computeBoundingSphere?(): void;
};

const sphere = new Sphere();
/**
 * The size (bounding radius, m) a skinned part is taken to have: its bind-pose bounds don't follow
 * its bones (a character's can be over 100 m), so it's sized like a person round its own origin
 * (unless it sets `userData.cullRadius`).
 */
const SKINNED_RADIUS = 1;

/** An object's world bounding sphere, found the way three's frustum test finds it (no allocation). */
function worldSphere(object: Cullable): Sphere {
  if (object.boundingSphere !== undefined) {
    if (object.boundingSphere === null) object.computeBoundingSphere?.();
    sphere.copy(object.boundingSphere!);
  } else {
    const geometry = object.geometry!;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    sphere.copy(geometry.boundingSphere!);
  }
  return sphere.applyMatrix4(object.matrixWorld);
}

function isSkinned(object: Cullable): boolean {
  const geometry = object.geometry as { hasAttribute?(name: string): boolean } | undefined;
  return geometry?.hasAttribute?.('skinIndex') === true;
}

function skinnedSphere(object: Object3D): Sphere {
  const e = object.matrixWorld.elements;
  sphere.center.set(e[12]!, e[13]!, e[14]!);
  sphere.radius = SKINNED_RADIUS;
  return sphere;
}

function isRenderable(object: Cullable): boolean {
  return !!(object.isMesh || object.isLine || object.isPoints || object.isSprite);
}

/**
 * Culls an island's small detail (its people, puzzle sites, chests, props) in every pass, main and
 * shadow, while the camera is far from the island, like anything off-screen. At that range they're a
 * pixel or two, so the island keeps its look (its terrain, town and silhouette stay). It works through
 * three's frustum test, not `visible` (the game shows and hides these for its own reasons), so a
 * warm-up still draws them: it draws objects unculled.
 *
 * With a `sizeRatio` (the tier's `detailCullRatio`, PLAN §12.4 distance culling per layer), each piece
 * also drops out once the camera is more than that many times its bounding radius away, so a small
 * part goes sooner than a big one.
 */
export class FarCull {
  /** True while the camera is beyond `radius` of the centre. */
  far = false;
  private readonly radiusSq: number;
  private cx = 0;
  private cz = 0;

  constructor(
    private readonly x: number,
    private readonly z: number,
    radius: number,
    private readonly sizeRatio = 0,
  ) {
    this.radiusSq = radius * radius;
  }

  /** Puts every renderable under `root` on this switch (call once per root, after it's built). */
  add(root: Object3D): void {
    root.traverse((object: Cullable) => {
      if (!isRenderable(object)) return;
      // Something drawn unculled (its bounds don't follow it, e.g. shader-moved water) still goes when
      // far: it's culled here only, never by three's own test.
      const unculled = !object.frustumCulled;
      object.frustumCulled = true;
      const test = unculled
        ? () => true
        : (object.intersectsFrustum.bind(object) as (frustum: Frustum | FrustumArray) => boolean);
      // Not culled before its first draw, so whatever arrives late (a model that loads in the
      // background) uploads when it's added, like before, not mid-play when you come near.
      let drawn = false;
      object.intersectsFrustum = (frustum: Frustum | FrustumArray) => {
        if (!drawn) return (drawn = test(frustum));
        return !this.far && (this.sizeRatio <= 0 || this.bigEnough(object)) && test(frustum);
      };
    });
  }

  /** Call once a frame with the camera's position. */
  update(cameraX: number, cameraZ: number): void {
    const dx = cameraX - this.x;
    const dz = cameraZ - this.z;
    this.far = dx * dx + dz * dz > this.radiusSq;
    this.cx = cameraX;
    this.cz = cameraZ;
  }

  private bigEnough(object: Cullable): boolean {
    const s = isSkinned(object) ? skinnedSphere(object) : worldSphere(object);
    // A part can say how big it really is (e.g. a character's hat and belt, skinned with the body).
    const own = object.userData.cullRadius as number | undefined;
    if (own !== undefined) s.radius = own;
    const dx = s.center.x - this.cx;
    const dz = s.center.z - this.cz;
    const reach = s.radius * this.sizeRatio;
    return dx * dx + dz * dz <= reach * reach;
  }
}
