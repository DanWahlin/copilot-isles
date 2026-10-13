import {
  AttachedBindMode,
  BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  NodeMaterial,
  SkinnedMesh,
  type BufferGeometry,
  type Intersection,
  type Material,
  type Object3D,
  type Raycaster,
  type Skeleton,
  type Vector3,
} from 'three/webgpu';
import {
  Fn,
  OnObjectUpdate,
  add,
  attribute,
  mat3,
  normalLocal,
  positionLocal,
  positionPrevious,
  reference,
  referenceBuffer,
  tangentLocal,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// three's TSL fluent node typings do not cover this matrix graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * Bone slots in the shared buffer. Every rig is padded to this, so the buffer's size is the same for
 * all of them (the largest rig here has 61 bones).
 */
export const SHARED_BONE_SLOTS = 64;

interface SkeletonState {
  skeleton: Skeleton;
  /** This frame's bone matrices, padded to SHARED_BONE_SLOTS. */
  bones: Float32Array;
  /** Last frame's, for motion vectors (TRAA). */
  previous: Float32Array;
  frame: number;
}

/** What a shared-skinned mesh carries (`mesh.sharedSkin`), read per object by the shared graph. */
interface SharedSkin {
  bindMatrix: Matrix4;
  bindMatrixInverse: Matrix4;
  attached: boolean;
  bones: Float32Array;
  previous: Float32Array;
  state: SkeletonState;
}

type SharedSkinMesh = Mesh & { sharedSkin: SharedSkin; skeleton: Skeleton };

/**
 * A character mesh skinned by the shared graph. To three it's a plain Mesh (so the renderer doesn't
 * skin it a second time), but CPU queries see the drawn shape: `getVertexPosition` and `raycast` skin
 * like SkinnedMesh's. A plain Mesh would test its bind pose, which lies metres from the character
 * (a ray "hit" the kids' accessories across the plaza).
 */
class SharedSkinnedMesh extends Mesh {
  declare sharedSkin: SharedSkin;
  declare skeleton: Skeleton;

  get bindMatrix(): Matrix4 {
    return this.sharedSkin.bindMatrix;
  }

  get bindMatrixInverse(): Matrix4 {
    return this.sharedSkin.bindMatrixInverse;
  }

  override updateMatrixWorld(force?: boolean): void {
    super.updateMatrixWorld(force);
    // As SkinnedMesh does, so CPU queries are right before the first draw (updateSkin does it then).
    if (this.sharedSkin?.attached) this.sharedSkin.bindMatrixInverse.copy(this.matrixWorld).invert();
  }

  applyBoneTransform(index: number, target: Vector3): Vector3 {
    SkinnedMesh.prototype.applyBoneTransform.call(this as unknown as SkinnedMesh, index, target);
    return target;
  }

  override getVertexPosition(index: number, target: Vector3): Vector3 {
    super.getVertexPosition(index, target);
    return this.applyBoneTransform(index, target);
  }

  override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    // SkinnedMesh's raycast, with bounds fitted to this pose. They're dropped afterwards: frustum
    // culling would use an object's own bounding sphere, and this one goes stale as it animates.
    const self = this as unknown as SkinnedMesh;
    try {
      self.boundingSphere = null as never;
      self.boundingBox = null as never;
      SkinnedMesh.prototype.computeBoundingSphere.call(self);
      SkinnedMesh.prototype.computeBoundingBox.call(self);
      SkinnedMesh.prototype.raycast.call(self, raycaster, intersects);
    } finally {
      delete (this as { boundingSphere?: unknown }).boundingSphere;
      delete (this as { boundingBox?: unknown }).boundingBox;
    }
  }
}

const states = new WeakMap<Skeleton, SkeletonState>();

/** A reference with no object reads the property from whichever object is being drawn. */
const PER_OBJECT = null as never;

function stateFor(skeleton: Skeleton): SkeletonState {
  let state = states.get(skeleton);
  if (!state) {
    skeleton.update();
    const bones = new Float32Array(SHARED_BONE_SLOTS * 16);
    bones.set(skeleton.boneMatrices!);
    state = { skeleton, bones, previous: bones.slice(), frame: -1 };
    states.set(skeleton, state);
  }
  return state;
}

function updateSkin(object: Object3D, frameId: number): void {
  const skin = (object as Partial<SharedSkinMesh>).sharedSkin;
  if (!skin) return;
  // As SkinnedMesh does in updateMatrixWorld: an attached mesh's bind follows it.
  if (skin.attached) skin.bindMatrixInverse.copy(object.matrixWorld).invert();
  const state = skin.state;
  if (state.frame === frameId) return;
  state.frame = frameId;
  state.previous.set(state.bones);
  state.skeleton.update();
  state.bones.set(state.skeleton.boneMatrices!);
}

function skinnedPosition(
  bones: AnyNode,
  position: AnyNode,
  bind: AnyNode,
  bindInverse: AnyNode,
  index: AnyNode,
  weight: AnyNode,
): AnyNode {
  const v = bind.mul(position);
  return bindInverse.mul(
    add(
      bones.element(index.x).mul(weight.x).mul(v),
      bones.element(index.y).mul(weight.y).mul(v),
      bones.element(index.z).mul(weight.z).mul(v),
      bones.element(index.w).mul(weight.w).mul(v),
    ),
  ).xyz;
}

/**
 * The skinning every character shares (three's own names each mesh's bone buffer after its node id,
 * so no two characters, nor two passes of one, could share a shader; issue 235). Set as the
 * material's `positionNode`, so the shadow pass (which copies it) skins the same way. Same maths as
 * three's `skinning`: position, last frame's position for motion vectors, normal and tangent.
 */
const sharedSkinning = Fn((_: unknown, builder: AnyNode) => {
  const index = attribute('skinIndex', 'uvec4') as AnyNode;
  const weight = attribute('skinWeight', 'vec4') as AnyNode;
  const bind = reference('sharedSkin.bindMatrix', 'mat4', PER_OBJECT) as AnyNode;
  const bindInverse = reference('sharedSkin.bindMatrixInverse', 'mat4', PER_OBJECT) as AnyNode;
  const bones = (
    referenceBuffer('sharedSkin.bones', 'mat4', SHARED_BONE_SLOTS, PER_OBJECT) as AnyNode
  ).setName('sharedBones');
  OnObjectUpdate(({ object, frameId }) => {
    if (object) updateSkin(object, frameId);
  });
  if (builder.needsPreviousData()) {
    const previous = (
      referenceBuffer('sharedSkin.previous', 'mat4', SHARED_BONE_SLOTS, PER_OBJECT) as AnyNode
    ).setName('sharedBonesPrevious');
    (positionPrevious as AnyNode).assign(
      skinnedPosition(previous, positionPrevious, bind, bindInverse, index, weight),
    );
  }
  if (builder.hasGeometryAttribute('normal')) {
    const skin = bindInverse
      .mul(
        add(
          weight.x.mul(bones.element(index.x)),
          weight.y.mul(bones.element(index.y)),
          weight.z.mul(bones.element(index.z)),
          weight.w.mul(bones.element(index.w)),
        ),
      )
      .mul(bind);
    const skin3 = mat3(skin) as AnyNode;
    (normalLocal as AnyNode).assign(skin3.mul(normalLocal));
    if (builder.hasGeometryAttribute('tangent')) (tangentLocal as AnyNode).assign(skin3.mul(tangentLocal));
  }
  return skinnedPosition(bones, positionLocal, bind, bindInverse, index, weight);
});

/** One node for every material, so the program cache sees the same graph. */
let sharedSkinningNode: AnyNode = null;

function skinningNode(): AnyNode {
  sharedSkinningNode ??= sharedSkinning();
  return sharedSkinningNode;
}

function nodeMaterialFor(material: Material, clone: boolean): Material {
  let m: Material = material;
  if (m instanceof NodeMaterial) {
    if (clone) m = m.clone();
  } else if (m instanceof MeshStandardMaterial) {
    const node = new MeshStandardNodeMaterial();
    node.copy(m as unknown as MeshStandardNodeMaterial);
    m = node;
  } else {
    return material;
  }
  (m as NodeMaterial).positionNode = skinningNode();
  return m;
}

/**
 * Swaps each skinned mesh under `root` (rigs up to SHARED_BONE_SLOTS bones) for a plain Mesh skinned
 * by the shared graph: same skeleton, bind and look, but one shader for every character in each pass.
 * Run it once a character's built (hats, birds and materials in place); the skeleton and the
 * animation mixer's bones are untouched.
 */
export function shareSkinning(root: Object3D): void {
  const skinned: SkinnedMesh[] = [];
  const staticMaterials = new Set<Material>();
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) {
      if (object.skeleton.bones.length <= SHARED_BONE_SLOTS) skinned.push(object);
    } else if (object instanceof Mesh) {
      for (const m of Array.isArray(object.material) ? object.material : [object.material])
        staticMaterials.add(m);
    }
  });
  const converted = new Map<Material, Material>();
  const convert = (m: Material): Material => {
    let out = converted.get(m);
    if (!out) {
      // A material a static mesh also uses gets its own copy (the positionNode needs a skin).
      out = nodeMaterialFor(m, staticMaterials.has(m));
      converted.set(m, out);
    }
    return out;
  };
  for (const source of skinned) {
    const material = Array.isArray(source.material) ? source.material.map(convert) : convert(source.material);
    const mesh = new SharedSkinnedMesh(source.geometry, material) as SharedSkinMesh;
    mesh.name = source.name;
    mesh.position.copy(source.position);
    mesh.quaternion.copy(source.quaternion);
    mesh.scale.copy(source.scale);
    mesh.matrixAutoUpdate = source.matrixAutoUpdate;
    mesh.visible = source.visible;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.frustumCulled = source.frustumCulled;
    mesh.renderOrder = source.renderOrder;
    mesh.layers.mask = source.layers.mask;
    mesh.userData = source.userData;
    mesh.skeleton = source.skeleton;
    const state = stateFor(source.skeleton);
    mesh.sharedSkin = {
      bindMatrix: source.bindMatrix.clone(),
      bindMatrixInverse: source.bindMatrixInverse.clone(),
      attached: source.bindMode === AttachedBindMode,
      bones: state.bones,
      previous: state.previous,
      state,
    };
    for (const child of [...source.children]) mesh.add(child);
    const parent = source.parent;
    if (parent) {
      const i = parent.children.indexOf(source);
      parent.children[i] = mesh;
      mesh.parent = parent;
      source.parent = null;
    }
    mesh.updateMatrixWorld(true);
  }
}

/**
 * The constant offset `C` with `part[j] = first[j] · C` for every bone's inverse bind matrix, or null
 * when there's none. Parts of one glTF rig often each have their own skin over the same joints, with
 * inverse binds that differ only by where the part was modelled; then the part's vertices move by `C`.
 */
function boneInverseOffset(first: Skeleton, part: Skeleton, out: Matrix4): Matrix4 | null {
  if (first === part) return out.identity();
  const a = first.boneInverses;
  const b = part.boneInverses;
  if (a.length !== b.length || a.length === 0) return null;
  out.copy(a[0]!).invert().multiply(b[0]!);
  for (let j = 0; j < a.length; j++) {
    const expected = check.multiplyMatrices(a[j]!, out).elements;
    const actual = b[j]!.elements;
    for (let k = 0; k < 16; k++)
      if (Math.abs(expected[k]! - actual[k]!) > 1e-4 * (1 + Math.abs(actual[k]!))) return null;
  }
  return out;
}
const check = new Matrix4();

/** A float copy of a (possibly quantized) attribute, so a transform can't overflow it. */
function floatCopy(g: BufferGeometry, name: string): void {
  const a = g.getAttribute(name);
  if (!a || a.array instanceof Float32Array) return;
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++)
    for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
  g.setAttribute(name, new BufferAttribute(out, a.itemSize));
}

/**
 * Merges the attached-bind skinned meshes under `root` that share bones, a material and an
 * attribute layout (a rig built of parts: arms, legs, body, head) into one, so the rig costs one draw
 * per pass. Each part's vertices move into the first part's bind space, so they skin to the same
 * place. The parts' geometries are disposed: use it on a rig that owns them, not a shared source.
 */
export function mergeSkinnedParts(root: Object3D): void {
  const sets = new Map<string, SkinnedMesh[]>();
  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh) || Array.isArray(object.material) || object.children.length) return;
    const g = object.geometry;
    if (!object.visible || object.bindMode !== AttachedBindMode || Object.keys(g.morphAttributes).length)
      return;
    const layout = Object.keys(g.attributes)
      .map((name) => {
        const a = g.getAttribute(name);
        return `${name}:${a.itemSize}:${a.array.constructor.name}:${a.normalized}`;
      })
      .sort()
      .join(',');
    // A glTF gives each skinned part its own Skeleton object over the same bones: group by the bones.
    const bones = object.skeleton.bones.map((b) => b.uuid).join(',');
    const key = `${bones}|${object.material.uuid}|${g.index ? 'i' : 'n'}|${layout}`;
    const list = sets.get(key) ?? [];
    list.push(object);
    sets.set(key, list);
  });
  const toFirst = new Matrix4();
  const offset = new Matrix4();
  for (const set of sets.values()) {
    // Only parts whose inverse binds match the first's (up to one offset) skin alike on its skeleton.
    const parts = set.filter((part) => boneInverseOffset(set[0]!.skeleton, part.skeleton, offset));
    if (parts.length < 2) continue;
    const first = parts[0]!;
    const firstBindInverse = new Matrix4().copy(first.bindMatrix).invert();
    const geometries = parts.map((part) => {
      const g = part.geometry.clone();
      for (const name of ['position', 'normal', 'tangent']) floatCopy(g, name);
      boneInverseOffset(first.skeleton, part.skeleton, offset);
      toFirst.multiplyMatrices(firstBindInverse, offset).multiply(part.bindMatrix);
      g.applyMatrix4(toFirst);
      return g;
    });
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    const out = new SkinnedMesh(merged, first.material);
    out.name = parts.map((part) => part.name).join('+');
    out.position.copy(first.position);
    out.quaternion.copy(first.quaternion);
    out.scale.copy(first.scale);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.frustumCulled = first.frustumCulled;
    out.bindMode = first.bindMode;
    out.bind(first.skeleton, first.bindMatrix);
    first.parent?.add(out);
    for (const part of parts) {
      part.removeFromParent();
      part.geometry.dispose();
    }
  }
}
