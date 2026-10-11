import { Matrix4, type InstancedMesh, type Object3D } from 'three/webgpu';
import { markInstancesChanged } from '../../engine/instancing';

const scratch = new Matrix4();
const inverse = new Matrix4();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * Draws a set of placeholder objects as the instances of one mesh: each `objects[i]` stays in the
 * scene graph (so the code that moves, turns, scales, or hides it doesn't change) and instance `i`
 * follows it. Call `update()` once a frame after the objects move; it uploads only when one did.
 */
export class InstanceProxies {
  constructor(
    readonly mesh: InstancedMesh,
    readonly objects: readonly Object3D[],
    /** An extra transform per instance, applied in the object's frame (a sign's size and offset). */
    private readonly locals: readonly Matrix4[] | null = null,
  ) {
    mesh.count = objects.length;
  }

  /**
   * Copies each object's place into its instance (relative to the mesh); a hidden object (or one
   * under a hidden group) scales to nothing.
   */
  update(): void {
    const mesh = this.mesh;
    mesh.updateWorldMatrix(true, false);
    inverse.copy(mesh.matrixWorld).invert();
    const out = mesh.instanceMatrix.array as Float32Array;
    let changed = false;
    for (let i = 0; i < this.objects.length; i++) {
      const object = this.objects[i]!;
      object.updateWorldMatrix(true, false);
      scratch.multiplyMatrices(inverse, object.matrixWorld);
      const local = this.locals?.[i];
      if (local) scratch.multiply(local);
      if (!shown(object, mesh.parent)) scratch.multiply(HIDDEN);
      const m = scratch.elements;
      const o = i * 16;
      for (let k = 0; k < 16; k++) {
        const v = Math.fround(m[k]!);
        if (out[o + k] !== v) {
          out[o + k] = v;
          changed = true;
        }
      }
    }
    if (changed) {
      markInstancesChanged(mesh);
      mesh.computeBoundingSphere();
    }
  }
}

/** False if `object` or an ancestor below `root` is hidden. */
export function shown(object: Object3D, root: Object3D | null): boolean {
  for (let o: Object3D | null = object; o && o !== root; o = o.parent) if (!o.visible) return false;
  return true;
}
