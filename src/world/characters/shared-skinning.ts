import {
  AttachedBindMode,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  NodeMaterial,
  SkinnedMesh,
  type Material,
  type Object3D,
  type Skeleton,
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
    const mesh = new Mesh(source.geometry, material) as SharedSkinMesh;
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
