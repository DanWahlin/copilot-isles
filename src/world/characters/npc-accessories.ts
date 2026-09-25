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
      addSpectacles(root);
      addLedger(root, 0x5a3925, 1);
      break;
    case 'merchant':
      addWatchCap(root, 0x26384a);
      addSpectacles(root);
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

function addSpectacles(root: Group): void {
  const parts: BufferGeometry[] = [];
  for (const x of [-0.075, 0.075]) {
    const lens = new TorusGeometry(0.055, 0.006, 5, 10);
    lens.translate(x, 0, 0.29);
    parts.push(lens);
  }
  const bridge = new BoxGeometry(0.05, 0.012, 0.012);
  bridge.translate(0, 0, 0.29);
  parts.push(bridge);
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  addHead(root, mesh(geometry, mat(0xd9c38f), 'spectacles'));
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

function addSash(root: Group, color: ColorHex, side: -1 | 1): void {
  const sash = mesh(new BoxGeometry(0.09, 0.58, 0.025), mat(color), 'sash');
  sash.position.set(side * 0.08, 0.86, 0.4);
  sash.rotation.z = side * 0.38;
  addRoot(root, sash);
}

function addSatchel(root: Group, color: ColorHex, side: -1 | 1): void {
  const bag = mesh(new BoxGeometry(0.22, 0.18, 0.08), mat(color), 'satchel');
  bag.position.set(side * 0.34, 0.62, 0.39);
  addRoot(root, bag);
}

function addLedger(root: Group, color: ColorHex, side: -1 | 1): void {
  const book = mesh(new BoxGeometry(0.22, 0.3, 0.035), mat(color), 'ledger');
  book.position.set(side * 0.34, 0.82, 0.53);
  book.rotation.set(0.05, side * 0.24, side * 0.08);
  addRoot(root, book);
  const page = mesh(new BoxGeometry(0.18, 0.25, 0.008), mat(0xe8dcb8), 'ledger page');
  page.position.set(side * 0.34, 0.82, 0.553);
  page.rotation.copy(book.rotation);
  addRoot(root, page);
}

function addScroll(root: Group, side: -1 | 1): void {
  const scroll = mesh(new CylinderGeometry(0.035, 0.035, 0.27, 8), mat(0xe4d1a4), 'rolled chart');
  scroll.position.set(side * 0.36, 0.96, 0.5);
  scroll.rotation.z = side * 1.18;
  addRoot(root, scroll);
}

function addSpyglass(root: Group, side: -1 | 1): void {
  const tube = mesh(new CylinderGeometry(0.032, 0.045, 0.36, 8), mat(0xb27a35), 'spyglass');
  tube.position.set(side * 0.34, 1.02, 0.52);
  tube.rotation.z = Math.PI / 2;
  addRoot(root, tube);
  const rim = mesh(new CylinderGeometry(0.05, 0.05, 0.025, 8), mat(0xd5b75f), 'spyglass rim');
  rim.position.set(side * 0.52, 1.02, 0.52);
  rim.rotation.z = Math.PI / 2;
  addRoot(root, rim);
}

function addLute(root: Group): void {
  const body = mesh(new CylinderGeometry(0.18, 0.22, 0.055, 14), mat(0x9a5f2e), 'lute body');
  body.position.set(-0.31, 0.65, 0.54);
  body.rotation.x = Math.PI / 2;
  body.scale.set(0.85, 1.1, 1);
  addRoot(root, body);

  const soundHole = mesh(new CylinderGeometry(0.055, 0.055, 0.061, 8), mat(0x382619), 'lute soundhole');
  soundHole.position.set(-0.31, 0.66, 0.57);
  soundHole.rotation.x = Math.PI / 2;
  addRoot(root, soundHole);

  const neck = mesh(new BoxGeometry(0.045, 0.52, 0.035), mat(0x7a4625), 'lute neck');
  neck.position.set(-0.16, 0.91, 0.54);
  neck.rotation.z = -0.46;
  addRoot(root, neck);

  for (const x of [-0.035, 0, 0.035]) {
    const string = mesh(new BoxGeometry(0.006, 0.48, 0.006), mat(0xe5d6a4), 'lute string');
    string.position.set(-0.19 + x, 0.84, 0.577);
    string.rotation.z = -0.39;
    addRoot(root, string);
  }
}

function addFishingRod(root: Group): void {
  const rod = mesh(new CylinderGeometry(0.01, 0.014, 1.2, 8), mat(0x5d4027), 'fishing rod');
  rod.position.set(0.36, 1.02, 0.36);
  rod.rotation.z = -0.72;
  addRoot(root, rod);
}

function addBucket(root: Group, color: ColorHex, side: -1 | 1): void {
  const bucket = mesh(new CylinderGeometry(0.12, 0.1, 0.18, 8), mat(color), 'fish bucket');
  bucket.position.set(side * 0.38, 0.24, 0.32);
  addRoot(root, bucket);
}

function addTool(root: Group, metal: ColorHex, side: -1 | 1): void {
  const handle = mesh(new BoxGeometry(0.035, 0.38, 0.035), mat(0x5c3b23), 'tool handle');
  handle.position.set(side * 0.35, 0.78, 0.51);
  handle.rotation.z = side * 0.22;
  addRoot(root, handle);
  const head = mesh(new BoxGeometry(0.16, 0.045, 0.04), mat(metal), 'tool head');
  head.position.set(side * 0.33, 0.98, 0.51);
  addRoot(root, head);
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
