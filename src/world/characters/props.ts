import { Bone, Box3, Group, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector3 } from 'three/webgpu';
import { ANNE_HAT_SWATCHES, ANNE_TRICORN_FIT, createTricornGeometry } from './tricorn';
import type { PlayerBody } from './types';

/** Kit the player captains wear or carry on top of the stock models. */

const TEMP_BOX = new Box3();
const TEMP_SIZE = new Vector3();

/**
 * Hangs a tricorn on the Head bone so it follows every nod and look. It reuses the body's atlas
 * material, so it shares the program the rigid weapon meshes already compile (+1 draw, +0 programs).
 */
export function addTricorn(root: Group): void {
  const head = root.getObjectByName('Head');
  let body: SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!body && o instanceof SkinnedMesh) body = o;
  });
  if (!(head instanceof Bone) || !body) return;
  const skinned: SkinnedMesh = body;
  root.updateMatrixWorld(true);
  const headScale = head.getWorldScale(new Vector3()).x;
  const rootScale = root.getWorldScale(new Vector3()).x;
  const hat = new Mesh(createTricornGeometry(ANNE_TRICORN_FIT, ANNE_HAT_SWATCHES), skinned.material);
  hat.name = 'captain tricorn';
  hat.userData.ownedGeometry = true;
  // Author in metres: undo the armature's scale between the root and the Head bone.
  hat.scale.setScalar(rootScale / headScale);
  hat.castShadow = true;
  hat.receiveShadow = true;
  head.add(hat);
}

/** The sheathed cutlass's length in metres (the kit blade is 2 units long, hilt at −z). */
const CUTLASS_LENGTH = 0.62;
/** Hilt at the left hip, in metres from the Hips joint in the root's frame (+x left, +z forward). */
const CUTLASS_HILT = { left: 0.2, up: 0.07, forward: 0.07 };
/** Blade direction from the hilt: back, gently down, and a touch out from the leg. */
const CUTLASS_BLADE = new Vector3(0.16, -0.36, -1).normalize();

/**
 * Stows the player's weapon for walking about: the Captain's cutlass sheathed at his left hip, and
 * Anne's double axe put away. The chibi legs are short (hips ~0.38 m), so the blade rakes back
 * rather than hanging straight down: its tip stays above the ground and it sits against the body.
 * It's posed in the root's frame, then attached to Hips so it rides the walk's hip sway.
 */
export function stowPlayerWeapon(root: Group, body: PlayerBody): void {
  const weaponName = body === 'man' ? 'Weapon_Cutlass' : 'Weapon_DoubleAxe';
  const weapon = root.getObjectByName(weaponName);
  if (!(weapon instanceof Mesh)) return;
  if (body === 'woman') {
    weapon.visible = false;
    return;
  }
  const hips = root.getObjectByName('Hips');
  if (!(hips instanceof Bone)) return;
  root.updateMatrixWorld(true);
  const unit = 1 / root.getWorldScale(new Vector3()).x;
  const hip = root.worldToLocal(hips.getWorldPosition(new Vector3()));
  const hilt = hip.add(
    new Vector3(CUTLASS_HILT.left, CUTLASS_HILT.up, CUTLASS_HILT.forward).multiplyScalar(unit),
  );
  // Blade (+z) along CUTLASS_BLADE, its flat (thin y) facing out from the hip.
  const out = new Vector3(1, 0, 0).addScaledVector(CUTLASS_BLADE, -CUTLASS_BLADE.x).normalize();
  const edge = new Vector3().crossVectors(out, CUTLASS_BLADE);
  const quaternion = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(edge, out, CUTLASS_BLADE),
  );
  root.add(weapon);
  weapon.position.copy(hilt).addScaledVector(CUTLASS_BLADE, (CUTLASS_LENGTH / 2) * unit);
  weapon.quaternion.copy(quaternion);
  weapon.scale.setScalar((CUTLASS_LENGTH / 2) * unit);
  weapon.updateMatrixWorld(true);
  hips.attach(weapon);
  if (import.meta.env.DEV) checkStowedCutlass(root, weapon);
}

/** Dev guard: bone-scale mistakes here once made the sheathed blade ~70 m long. */
function checkStowedCutlass(root: Group, weapon: Mesh): void {
  root.updateMatrixWorld(true);
  const diagonal = TEMP_BOX.setFromObject(weapon).getSize(TEMP_SIZE).length();
  if (diagonal < 0.4 || diagonal > 1.2) {
    console.warn(`Captain cutlass stow size is ${diagonal.toFixed(2)} m; expected 0.4–1.2 m.`);
  }
}
