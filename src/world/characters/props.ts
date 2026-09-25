import { Bone, Box3, Group, Mesh, SkinnedMesh, Vector3 } from 'three/webgpu';
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

/**
 * Stows the player's weapon for walking about: the Captain's cutlass sheathed at his hip, and Anne's
 * double axe put away. `attach` keeps the weapon's world size through the armature's ×100 bone scale.
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
  hips.attach(weapon);
  weapon.position.set(0.0032, -0.002, -0.0028);
  weapon.rotation.set(1.25, -0.28, 2.28);
  weapon.scale.setScalar(0.0036);
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
