import {
  Bone,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTricornGeometry, type TricornFit } from './tricorn';
import type { CharacterBody, NpcId } from './types';

type ColorHex = number;

const TMP_SCALE = new Vector3();
const PERIOD_PROP_NAMES = ['Weapon_Cutlass', 'Weapon_DoubleAxe', 'Weapon_Lute', 'Pistol'];

const HAT_FIT: TricornFit = {
  base: 0.19,
  rx: 0.27,
  front: 0.25,
  back: 0.29,
  crown: 0.27,
  brim: 0.23,
  tilt: 0.08,
};

const MATERIALS = new Map<ColorHex, MeshStandardMaterial>();

/** Gives every NPC a period-readable silhouette without touching skin or player-only props. */
export function dressNpcCharacter(root: Group, body: CharacterBody): void {
  if (!isNpc(body)) return;
  hideSourceProps(root);

  switch (body) {
    case 'nell':
      addBicorne(root, 0x202a3a, 0xd8ad5a);
      addSpectacles(root, SPECTACLES.nell);
      addLedger(root, 0x5a3925, 1);
      break;
    case 'merchant':
      addWatchCap(root, 0x26384a);
      addSpectacles(root, SPECTACLES.merchant);
      addSatchel(root, 0x5c3b23, -1);
      addLedger(root, 0x23445f, -1);
      addScroll(root, 1);
      break;
    case 'dockhand_b':
      addWatchCap(root, 0x6a3728);
      break;
    case 'dockhand_a':
      addBandana(root, 0xb33a2f, 0xf0dfbd);
      break;
    case 'fisherman':
      addStrawHat(root);
      addBeard(root, 0xd7c7a3);
      addFishingRod(root);
      addBucket(root, 0x7b6b57, -1);
      break;
    case 'old_sailor':
      addBeard(root, 0xf0ead8);
      addPipe(root);
      break;
    case 'child':
      addSatchel(root, 0x704422, 1);
      break;
    case 'suri':
      addSatchel(root, 0x4f3925, 1);
      addTool(root, 0x9aa0a4, -1);
      break;
    case 'pim':
      addBandana(root, 0x3a7b45, 0xe2c170);
      break;
    case 'pol':
      addBandana(root, 0x9b3428, 0xe2c170);
      break;
    case 'juno':
      addBicorne(root, 0x171b25, 0xc94a38);
      addSash(root, 0x9d2735, 1);
      addSatchel(root, 0x4c3423, -1);
      addSpyglass(root, 1);
      break;
    case 'lyra':
      addLute(root);
      break;
    case 'lookout':
      addWatchCap(root, 0x24394a);
      addSpyglass(root, -1);
      break;
  }
}

function isNpc(body: CharacterBody): body is NpcId {
  return body !== 'man' && body !== 'woman';
}

function hideSourceProps(root: Group): void {
  for (const name of PERIOD_PROP_NAMES)
    root.getObjectByName(name)?.traverse((object) => (object.visible = false));
  root.getObjectByName('Ernest')?.traverse((object) => (object.visible = false));
}

function addBicorne(root: Group, felt: ColorHex, trim: ColorHex): void {
  const hat = mesh(
    createTricornGeometry(HAT_FIT, { felt: [0, 0], trim: [0, 0], band: [0, 0] }),
    mat(felt),
    'bicorne',
  );
  addHead(root, hat);
  const cockade = mesh(new SphereGeometry(0.045, 6, 4), mat(trim), 'bicorne cockade');
  cockade.position.set(0.18, 0.3, 0.22);
  cockade.scale.set(1, 0.55, 0.25);
  addHead(root, cockade);
}

function addBandana(root: Group, cloth: ColorHex, tie: ColorHex): void {
  const band = mesh(new CylinderGeometry(0.28, 0.3, 0.095, 12), mat(cloth), 'bandana');
  band.position.set(0, 0.2, 0.01);
  band.scale.set(1, 0.52, 0.92);
  addHead(root, band);

  const knot = mesh(new SphereGeometry(0.055, 6, 4), mat(tie), 'bandana knot');
  knot.position.set(-0.24, 0.19, -0.13);
  knot.scale.set(1, 0.75, 0.65);
  addHead(root, knot);

  const tail = mesh(new BoxGeometry(0.09, 0.22, 0.018), mat(cloth), 'bandana tail');
  tail.position.set(-0.31, 0.09, -0.17);
  tail.rotation.z = -0.42;
  addHead(root, tail);
}

function addWatchCap(root: Group, wool: ColorHex): void {
  const cap = mesh(new SphereGeometry(0.265, 12, 7), mat(wool), 'watch cap crown');
  cap.position.set(0, 0.24, 0.0);
  cap.scale.set(1, 0.48, 0.92);
  addHead(root, cap);
}

function addStrawHat(root: Group): void {
  const brim = mesh(new CylinderGeometry(0.42, 0.42, 0.035, 16), mat(0xd6b85e), 'straw brim');
  brim.position.set(0, 0.22, 0.01);
  brim.scale.set(1, 0.35, 0.82);
  addHead(root, brim);
  const crown = mesh(new CylinderGeometry(0.2, 0.24, 0.2, 12), mat(0xc69a45), 'straw crown');
  crown.position.set(0, 0.31, 0.0);
  crown.scale.set(1, 0.85, 0.92);
  addHead(root, crown);
}

/**
 * Where a pair of spectacles sits on one face, in accessory units (the head bone's origin is at the
 * jaw). Measured from each rig's eye meshes and face depth, since the two rigs differ: Nell's eyes
 * sit lower and closer together, Ezra's are higher and wider, with a longer nose to bridge.
 */
interface SpectacleFit {
  /** Lens centre, over the pupil. */
  eyeX: number;
  eyeY: number;
  radius: number;
  /** Lens plane, just clear of the eye and brow. */
  lensZ: number;
  /** The bridge rests on the nose at this height and depth. */
  bridgeY: number;
  bridgeZ: number;
  /** The arms run from the hinge past the temple to the ear, hugging the side of the head. */
  temple: readonly [x: number, z: number];
  ear: readonly [x: number, z: number];
}

const SPECTACLES: Record<'nell' | 'merchant', SpectacleFit> = {
  nell: {
    eyeX: 0.122,
    eyeY: 0.063,
    radius: 0.064,
    lensZ: 0.262,
    bridgeY: 0.084,
    bridgeZ: 0.292,
    temple: [0.232, 0.17],
    ear: [0.29, 0.05],
  },
  merchant: {
    eyeX: 0.138,
    eyeY: 0.09,
    radius: 0.058,
    lensZ: 0.257,
    bridgeY: 0.122,
    bridgeZ: 0.293,
    temple: [0.235, 0.13],
    ear: [0.268, 0.0],
  },
};

/** Lenses wrap back a touch at their outer edge to follow the face. */
const LENS_WRAP = 0.18;

/** Round wire spectacles over the eyes, bridged over the nose, with arms back to the ears. */
function addSpectacles(root: Group, fit: SpectacleFit): void {
  const parts: BufferGeometry[] = [];
  const wire = 0.0065;
  const cos = Math.cos(LENS_WRAP);
  const sin = Math.sin(LENS_WRAP);
  const bridgeRim = Math.sqrt(Math.max(0, fit.radius ** 2 - (fit.bridgeY - fit.eyeY) ** 2));
  const nose = 0.022;
  for (const side of [-1, 1]) {
    // `u` runs outward from the lens centre, across the wrapped lens plane.
    const onLens = (u: number, y: number) => new Vector3(side * (fit.eyeX + u * cos), y, fit.lensZ - u * sin);
    const lens = new TorusGeometry(fit.radius, wire, 5, 14);
    lens.rotateY(side * LENS_WRAP);
    lens.translate(side * fit.eyeX, fit.eyeY, fit.lensZ);
    parts.push(lens);

    const hinge = onLens(fit.radius, fit.eyeY + 0.008);
    const temple = new Vector3(side * fit.temple[0], fit.eyeY + 0.016, fit.temple[1]);
    const ear = new Vector3(side * fit.ear[0], fit.eyeY + 0.024, fit.ear[1]);
    parts.push(rod(hinge, temple, wire * 1.3), rod(temple, ear, wire * 1.3));
    // The bridge steps forward from the inner rims to clear the nose.
    parts.push(
      rod(onLens(-bridgeRim, fit.bridgeY), new Vector3(side * nose, fit.bridgeY, fit.bridgeZ), wire * 1.6),
    );
  }
  parts.push(
    rod(
      new Vector3(-nose, fit.bridgeY, fit.bridgeZ),
      new Vector3(nose, fit.bridgeY, fit.bridgeZ),
      wire * 1.6,
    ),
  );
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  addHead(root, mesh(geometry, mat(0xd9c38f), 'spectacles'));
}

/** A thin square rod from `a` to `b`. */
function rod(a: Vector3, b: Vector3, thickness: number): BufferGeometry {
  const length = a.distanceTo(b);
  const geometry = new BoxGeometry(thickness, thickness, length);
  const dir = b.clone().sub(a).normalize();
  geometry.rotateX(-Math.asin(Math.max(-1, Math.min(1, dir.y))));
  geometry.rotateY(Math.atan2(dir.x, dir.z));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

function addBeard(root: Group, color: ColorHex): void {
  const parts: BufferGeometry[] = [];
  const beard = new SphereGeometry(0.14, 8, 5);
  beard.scale(1.15, 0.72, 0.42);
  beard.translate(0, -0.14, 0.23);
  parts.push(beard);
  for (const x of [-0.07, 0.07]) {
    const moustache = new SphereGeometry(0.07, 6, 4);
    moustache.scale(1.15, 0.35, 0.28);
    moustache.translate(x, -0.055, 0.285);
    parts.push(moustache);
  }
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  addHead(root, mesh(geometry, mat(color), 'beard and moustache'));
}

function addPipe(root: Group): void {
  const stem = mesh(new CylinderGeometry(0.009, 0.012, 0.22, 8), mat(0x6b442b), 'pipe stem');
  stem.position.set(0.13, -0.08, 0.29);
  stem.rotation.z = Math.PI / 2;
  addHead(root, stem);
  const bowl = mesh(new CylinderGeometry(0.025, 0.032, 0.055, 10), mat(0x4d3020), 'pipe bowl');
  bowl.position.set(0.24, -0.075, 0.29);
  addHead(root, bowl);
}

// Worn and carried kit, posed in the root's frame (units scale with the body; +z forward, +x the
// character's left) against the body's surface, then attached to a bone so it moves with the
// walk and idle instead of hanging in the air. Reference body: hips ≈ (0, 0.37, −0.16), chest
// front z ≈ 0.08, back z ≈ −0.28, hip sides x ≈ ±0.22.

function addSash(root: Group, color: ColorHex, side: -1 | 1): void {
  const sash = mesh(new BoxGeometry(0.075, 0.46, 0.02), mat(color), 'sash');
  sash.position.set(side * 0.01, 0.6, 0.09);
  sash.rotation.z = side * 0.62;
  addRoot(root, sash, 'Torso');
}

function addSatchel(root: Group, color: ColorHex, side: -1 | 1): void {
  const bag = mesh(new BoxGeometry(0.07, 0.16, 0.2), mat(color), 'satchel');
  bag.position.set(side * 0.25, 0.4, -0.15);
  addRoot(root, bag, 'Hips');
}

function addLedger(root: Group, color: ColorHex, side: -1 | 1): void {
  // Held flat against the chest, as if hugged.
  const book = mesh(new BoxGeometry(0.2, 0.26, 0.035), mat(color), 'ledger');
  book.position.set(side * 0.1, 0.52, 0.11);
  book.rotation.set(-0.12, side * 0.18, side * 0.1);
  addRoot(root, book, 'Torso');
  const page = mesh(new BoxGeometry(0.17, 0.22, 0.008), mat(0xe8dcb8), 'ledger page');
  page.position.set(side * 0.1, 0.52, 0.13);
  page.rotation.copy(book.rotation);
  addRoot(root, page, 'Torso');
}

function addScroll(root: Group, side: -1 | 1): void {
  // Tucked into the satchel on the same side, poking up out of the flap.
  const scroll = mesh(new CylinderGeometry(0.03, 0.03, 0.26, 8), mat(0xe4d1a4), 'rolled chart');
  scroll.position.set(-side * 0.25, 0.5, -0.14);
  scroll.rotation.x = -0.25;
  addRoot(root, scroll, 'Hips');
}

function addSpyglass(root: Group, side: -1 | 1): void {
  // Pushed through the belt at the hip, pointing forward and a little down.
  const tube = mesh(new CylinderGeometry(0.03, 0.04, 0.32, 8), mat(0xb27a35), 'spyglass');
  tube.position.set(side * 0.22, 0.44, -0.08);
  tube.rotation.x = Math.PI / 2 + 0.35;
  addRoot(root, tube, 'Hips');
  const rim = mesh(new CylinderGeometry(0.046, 0.046, 0.025, 8), mat(0xd5b75f), 'spyglass rim');
  rim.position.set(side * 0.22, 0.385, 0.07);
  rim.rotation.x = tube.rotation.x;
  addRoot(root, rim, 'Hips');
}

function addLute(root: Group): void {
  // Slung across the back, neck up over the right shoulder.
  const body = mesh(new CylinderGeometry(0.16, 0.2, 0.055, 14), mat(0x9a5f2e), 'lute body');
  body.position.set(0.05, 0.5, -0.33);
  body.rotation.x = Math.PI / 2;
  body.scale.set(0.85, 1.1, 1);
  addRoot(root, body, 'Torso');

  const soundHole = mesh(new CylinderGeometry(0.05, 0.05, 0.061, 8), mat(0x382619), 'lute soundhole');
  soundHole.position.set(0.05, 0.51, -0.36);
  soundHole.rotation.x = Math.PI / 2;
  addRoot(root, soundHole, 'Torso');

  const neck = mesh(new BoxGeometry(0.045, 0.5, 0.035), mat(0x7a4625), 'lute neck');
  neck.position.set(-0.08, 0.78, -0.33);
  neck.rotation.z = -0.46;
  addRoot(root, neck, 'Torso');

  for (const x of [-0.035, 0, 0.035]) {
    const string = mesh(new BoxGeometry(0.006, 0.46, 0.006), mat(0xe5d6a4), 'lute string');
    string.position.set(-0.04 + x, 0.7, -0.362);
    string.rotation.z = -0.39;
    addRoot(root, string, 'Torso');
  }
}

function addFishingRod(root: Group): void {
  // Tucked under the right arm, raised forward over the water.
  const rod = mesh(new CylinderGeometry(0.01, 0.014, 1.2, 8), mat(0x5d4027), 'fishing rod');
  const tilt = 0.95;
  rod.position.set(-0.27, 0.42 + Math.cos(tilt) * 0.5, -0.12 + Math.sin(tilt) * 0.5);
  rod.rotation.x = tilt;
  addRoot(root, rod, 'Torso');
}

function addBucket(root: Group, color: ColorHex, side: -1 | 1): void {
  // On the ground by the feet (it stays put while its owner idles).
  const bucket = mesh(new CylinderGeometry(0.12, 0.1, 0.18, 8), mat(color), 'fish bucket');
  bucket.position.set(side * 0.36, 0.09, 0.02);
  addRoot(root, bucket);
}

function addTool(root: Group, metal: ColorHex, side: -1 | 1): void {
  // A mallet hung from the belt, head up.
  const handle = mesh(new BoxGeometry(0.03, 0.3, 0.03), mat(0x5c3b23), 'tool handle');
  handle.position.set(side * 0.23, 0.33, -0.1);
  handle.rotation.x = 0.12;
  addRoot(root, handle, 'Hips');
  const head = mesh(new BoxGeometry(0.05, 0.05, 0.14), mat(metal), 'tool head');
  head.position.set(side * 0.23, 0.49, -0.08);
  addRoot(root, head, 'Hips');
}

function addHead(root: Group, child: Mesh): void {
  const head = root.getObjectByName('Head');
  if (!(head instanceof Bone)) {
    addRoot(root, child);
    return;
  }
  root.updateMatrixWorld(true);
  const scalar = root.getWorldScale(TMP_SCALE).x / Math.max(0.001, head.getWorldScale(TMP_SCALE).x);
  child.position.multiplyScalar(scalar);
  child.scale.multiplyScalar(scalar);
  head.add(child);
}

function addRoot(root: Group, child: Object3D, boneName?: string): void {
  root.add(child);
  if (boneName) attachToBone(root, child, boneName);
}

function attachToBone(root: Group, child: Object3D, boneName: string): void {
  const bone = root.getObjectByName(boneName);
  if (!(bone instanceof Bone)) return;
  root.updateMatrixWorld(true);
  bone.attach(child);
}

function mesh(geometry: BufferGeometry, material: Material, name: string): Mesh {
  const out = new Mesh(geometry, material);
  out.name = name;
  out.castShadow = true;
  out.receiveShadow = true;
  out.userData.ownedGeometry = true;
  return out;
}

function mat(color: ColorHex): MeshStandardMaterial {
  const existing = MATERIALS.get(color);
  if (existing) return existing;
  const material = new MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });
  MATERIALS.set(color, material);
  return material;
}
