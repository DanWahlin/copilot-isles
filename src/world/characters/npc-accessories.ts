import {
  AttachedBindMode,
  Bone,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Ray,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTricornGeometry, type TricornFit } from './tricorn';
import type { CharacterBody, NpcId } from './types';

type ColorHex = number;

const TMP_SCALE = new Vector3();
/**
 * How big a character's accessories (hat, belt, bag…) count for small-detail culling (FarCull's size
 * ratio, Lite and Low only): they drop out sooner than the character.
 */
const ACCESSORY_CULL_RADIUS = 0.4;
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
      addLedgerInHand(root, 0x5a3925, 1);
      break;
    case 'merchant':
      addWatchCap(root, 0x26384a);
      addSpectacles(root, SPECTACLES.merchant);
      addSatchel(root, 0x5c3b23, -1);
      addLedgerInHand(root, 0x23445f, -1);
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
    case 'tobias':
      addWideBrimFeltHat(root, 0x55341f, 0xc68b35);
      addApron(root, 0xc18a4b, 0x4a2f1e);
      addMoneyPouch(root, 0x8b5428, -1);
      addMerchantScales(root, 1);
      break;
    case 'mina':
      addSunHat(root, 0xdeb85a, 0x1f8a93);
      addSatchel(root, 0x8b4f24, -1);
      addRolledMapInHand(root, -1);
      break;
    case 'anders':
      addFlatCap(root, 0x5d4a2f);
      addBeard(root, 0x9b3f1f);
      addApron(root, 0x5b351f, 0x2c1b12);
      addMalletInHand(root, -1);
      addPencilBehindEar(root, 1);
      break;
    case 'rhea':
      addNavalTricorn(root, 0x11131c, 0xd7b15a);
      addNavalCoat(root, 0x7a1f2d, 0xf0dfbd, false, 0xd6b35f);
      addSpyglassInHand(root, 1);
      break;
    case 'oren':
      addSoftStarCap(root, 0x4b255f, 0xd8bb62);
      addSpectacles(root, SPECTACLES.oren, 0xd7c586);
      addBeard(root, 0xe5dfcf);
      addAstronomerRobe(root, 0x4b2e5f, 0xd8bb62);
      addAstrolabeInHand(root, -1);
      break;
    case 'pell':
      addPeriwig(root, 0xf0ead8, 0x2f3540);
      addSpectacles(root, SPECTACLES.pell, 0xd9d0aa);
      addArchivistCoat(root, 0x1f4a34, 0xe9dec8);
      addLedgerInHand(root, 0x4b2e5f, 1);
      addQuillBehindEar(root, -1);
      break;
    case 'admiral':
      addBicorne(root, 0x121a2b, 0xf2ede0);
      addPlume(root, 0xf2ede0);
      addNavalCoat(root, 0x172d59, 0xe0bd63, true);
      addSash(root, 0x9f2630, 1);
      addMedals(root);
      break;
    case 'mer_fisher':
      addSunBleachedCap(root);
      addBeard(root, 0xf0ead8);
      addRolledSleeves(root, 0xe8d8b5);
      addFishingNet(root, -1);
      addTacklePouch(root, 0x8b5a2b, 1);
      break;
    case 'mer_matron':
      addHeadscarf(root, 0xd28a22, 0x7a1f2d);
      addApron(root, 0xe2c98f, 0x6d4a2e);
      addMarketBasket(root, -1);
      break;
    case 'mer_vendor':
      addStripedShirt(root, 0x1f8790);
      addNeckerchief(root, 0xc64e3f);
      addFruitTray(root, -1);
      break;
    case 'mer_kid_a':
      addChildSailorCap(root, 0x2f6fa1, 0xd28a22);
      addToyPinwheel(root, 1);
      addSatchel(root, 0x8b4f24, -1);
      break;
    case 'mer_kid_b':
      addHeadscarf(root, 0xc64e3f, 0xf0dfbd);
      addToyHoop(root, -1);
      addSash(root, 0xd28a22, 1);
      break;
    case 'mer_guard':
      addGuardBicorne(root, 0x11131c, 0x7a1f2d, 0xd6b35f);
      addGuardLivery(root, 0x172d59, 0x7a1f2d, 0xd6b35f);
      break;
    case 'lookout':
      addWatchCap(root, 0x24394a);
      addSpyglass(root, -1);
      break;
    // Thousand-Bough Isle (spec §4.2).
    case 'tamsin':
      addStrawHat(root);
      addRolledSleeves(root, 0x2f7777);
      addSatchel(root, 0x6b5a45, -1);
      break;
    case 'saffi':
      addHeadscarf(root, 0x5e8c3a, 0x6b5a45);
      addAstronomerRobe(root, 0x4f6e3a, 0x8c8573);
      addScroll(root, 1);
      break;
    case 'oak':
      addBandana(root, 0xd28a22, 0xc64e3f);
      addRolledSleeves(root, 0xd4c1a0);
      addSash(root, 0xc8b48a, 1);
      break;
    case 'fen':
      addFlatCap(root, 0x4a4038);
      addApron(root, 0x5b3a22, 0x2c1b12);
      addTool(root, 0x9aa3a8, 1);
      addRolledSleeves(root, 0xb7a281);
      break;
    case 'ines':
      addNeckerchief(root, 0xe2552d);
      addSash(root, 0x3b82f6, 1);
      addSatchel(root, 0x8b4f24, -1);
      break;
    case 'rook':
      addApron(root, 0x7d5a3a, 0x3e2c1a);
      addMalletInHand(root, 1);
      addPencilBehindEar(root, -1);
      break;
    case 'pip':
      addSpectacles(root, SPECTACLES.pell, 0xd9d0aa);
      addBeard(root, 0xe5dfcf);
      addLedgerInHand(root, 0x6b2a1d, 1);
      addQuillBehindEar(root, -1);
      break;
    case 'elder':
      addAstronomerRobe(root, 0x2f6e48, 0xc9a86a);
      addSash(root, 0xc9a86a, 1);
      break;
    case 'tb_kid_a':
      addChildSailorCap(root, 0x3fa34d, 0xd28a22);
      addToyPinwheel(root, 1);
      break;
    case 'tb_kid_b':
      addHeadscarf(root, 0x1ea7a7, 0xf0dfbd);
      addToyHoop(root, -1);
      break;
    case 'tb_weaver':
      addHeadscarf(root, 0xc9a86a, 0x3e7a3a);
      addMarketBasket(root, -1);
      break;
    case 'tb_operator':
      addBandana(root, 0x3e7a3a, 0xc9a86a);
      addRolledSleeves(root, 0xb7a281);
      break;
    case 'tb_fisher':
      addSunBleachedCap(root);
      addBeard(root, 0xf0ead8);
      addFishingNet(root, -1);
      break;
    case 'tb_lookout':
      addWatchCap(root, 0x1ea7a7);
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
  hat.position.set(0, 0.085, -0.035);
  hat.rotation.x = -0.08;
  addHead(root, hat);
  const cockade = mesh(new SphereGeometry(0.045, 6, 4), mat(trim), 'bicorne cockade');
  cockade.position.set(0.18, 0.37, 0.18);
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

function addSunBleachedCap(root: Group): void {
  const cap = mesh(new SphereGeometry(0.25, 12, 6), mat(0xd9c88f), 'sun-bleached cap crown');
  cap.position.set(0, 0.205, 0);
  cap.scale.set(1.08, 0.26, 0.88);
  addHead(root, cap);

  const bill = mesh(new BoxGeometry(0.23, 0.02, 0.12), mat(0xc8aa67), 'sun-bleached cap bill');
  bill.position.set(0, 0.19, 0.22);
  bill.rotation.x = -0.08;
  addHead(root, bill);
}

function addWideBrimFeltHat(root: Group, felt: ColorHex, band: ColorHex): void {
  const brim = mesh(new CylinderGeometry(0.43, 0.45, 0.036, 18), mat(felt), 'wide felt brim');
  brim.position.set(0, 0.215, 0.01);
  brim.scale.set(1.08, 0.34, 0.8);
  addHead(root, brim);

  const crown = mesh(new CylinderGeometry(0.22, 0.26, 0.2, 14), mat(felt), 'merchant hat crown');
  crown.position.set(0, 0.31, 0);
  crown.scale.set(1, 0.86, 0.88);
  addHead(root, crown);

  const hatband = mesh(new TorusGeometry(0.235, 0.012, 5, 18), mat(band), 'merchant hat band');
  hatband.position.set(0, 0.255, 0.005);
  hatband.rotation.x = Math.PI / 2;
  hatband.scale.set(1, 0.84, 1);
  addHead(root, hatband);
}

function addSunHat(root: Group, straw: ColorHex, ribbon: ColorHex): void {
  const brim = mesh(new CylinderGeometry(0.48, 0.5, 0.028, 20), mat(straw), 'sun hat broad brim');
  brim.position.set(0, 0.22, 0.018);
  brim.scale.set(1.12, 0.28, 0.78);
  brim.rotation.x = 0.05;
  addHead(root, brim);

  const crown = mesh(new CylinderGeometry(0.18, 0.24, 0.2, 14), mat(0xc8973f), 'sun hat crown');
  crown.position.set(0, 0.315, 0.0);
  crown.scale.set(1, 0.82, 0.86);
  addHead(root, crown);

  const band = mesh(new TorusGeometry(0.22, 0.012, 5, 18), mat(ribbon), 'sun hat ribbon');
  band.position.set(0, 0.255, 0.005);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 0.82, 1);
  addHead(root, band);

  const bow = mesh(new BoxGeometry(0.12, 0.045, 0.018), mat(ribbon), 'sun hat ribbon bow');
  bow.position.set(-0.2, 0.255, 0.17);
  bow.rotation.z = -0.35;
  addHead(root, bow);
}

function addHeadscarf(root: Group, cloth: ColorHex, trim: ColorHex): void {
  const scarf = mesh(new SphereGeometry(0.29, 14, 7), mat(cloth), 'headscarf wrap');
  scarf.position.set(0, 0.205, 0.0);
  scarf.scale.set(1.02, 0.38, 0.88);
  addHead(root, scarf);

  const band = mesh(new CylinderGeometry(0.285, 0.292, 0.04, 16), mat(trim), 'headscarf band');
  band.position.set(0, 0.155, 0.01);
  band.scale.set(1, 0.45, 0.85);
  addHead(root, band);

  const knot = mesh(new SphereGeometry(0.06, 7, 5), mat(cloth), 'headscarf knot');
  knot.position.set(-0.22, 0.14, -0.11);
  knot.scale.set(1, 0.78, 0.65);
  addHead(root, knot);

  const tail = mesh(new BoxGeometry(0.08, 0.2, 0.02), mat(cloth), 'headscarf tail');
  tail.position.set(-0.29, 0.035, -0.16);
  tail.rotation.z = -0.3;
  addHead(root, tail);
}

function addFlatCap(root: Group, wool: ColorHex): void {
  const crown = mesh(new SphereGeometry(0.29, 14, 6), mat(wool), 'flat cap crown');
  crown.position.set(0, 0.205, 0.0);
  crown.scale.set(1.26, 0.2, 0.9);
  addHead(root, crown);

  const button = mesh(new SphereGeometry(0.026, 6, 4), mat(0x3e2f1f), 'flat cap button');
  button.position.set(0, 0.26, 0.02);
  button.scale.set(1, 0.3, 1);
  addHead(root, button);

  const bill = mesh(new BoxGeometry(0.24, 0.02, 0.12), mat(wool), 'flat cap bill');
  bill.position.set(0, 0.19, 0.22);
  bill.rotation.x = -0.08;
  addHead(root, bill);
}

function addNavalTricorn(root: Group, felt: ColorHex, trim: ColorHex): void {
  const hat = mesh(
    createTricornGeometry(
      { base: 0.205, rx: 0.29, front: 0.27, back: 0.31, crown: 0.24, brim: 0.25, tilt: 0.1 },
      { felt: [0, 0], trim: [0, 0], band: [0, 0] },
    ),
    mat(felt),
    'naval tricorn',
  );
  addHead(root, hat);

  const braid = mesh(new TorusGeometry(0.31, 0.008, 5, 28), mat(trim), 'tricorn gold braid');
  braid.position.set(0, 0.26, 0.02);
  braid.rotation.x = Math.PI / 2;
  braid.scale.set(1.05, 0.74, 1);
  addHead(root, braid);

  const cockade = mesh(new SphereGeometry(0.04, 8, 5), mat(trim), 'tricorn cockade');
  cockade.position.set(0.18, 0.295, 0.23);
  cockade.scale.set(1, 0.55, 0.25);
  addHead(root, cockade);
}

function addChildSailorCap(root: Group, cloth: ColorHex, trim: ColorHex): void {
  const cap = mesh(new CylinderGeometry(0.24, 0.25, 0.11, 14), mat(cloth), 'child sailor cap');
  cap.position.set(0, 0.19, 0);
  cap.scale.set(1.02, 0.62, 0.88);
  addHead(root, cap);

  const brim = mesh(new CylinderGeometry(0.27, 0.27, 0.026, 14), mat(trim), 'child sailor cap brim');
  brim.position.set(0, 0.145, 0.01);
  brim.scale.set(1, 0.35, 0.82);
  addHead(root, brim);
}

function addGuardBicorne(root: Group, felt: ColorHex, cockadeColor: ColorHex, trim: ColorHex): void {
  const hat = mesh(
    createTricornGeometry(
      { base: 0.17, rx: 0.25, front: 0.28, back: 0.31, crown: 0.19, brim: 0.24, tilt: 0.06 },
      { felt: [0, 0], trim: [0, 0], band: [0, 0] },
    ),
    mat(felt),
    'guard bicorne',
  );
  hat.rotation.y = Math.PI / 2;
  hat.scale.set(0.92, 0.9, 1.12);
  addHead(root, hat);

  const braid = mesh(new TorusGeometry(0.285, 0.007, 5, 24), mat(trim), 'guard bicorne braid');
  braid.position.set(0, 0.225, 0.02);
  braid.rotation.x = Math.PI / 2;
  braid.scale.set(0.9, 0.82, 1);
  addHead(root, braid);

  const cockade = mesh(new SphereGeometry(0.035, 7, 5), mat(cockadeColor), 'guard bicorne cockade');
  cockade.position.set(0.02, 0.255, 0.25);
  cockade.scale.set(1, 0.62, 0.28);
  addHead(root, cockade);
}

function addSoftStarCap(root: Group, cloth: ColorHex, stitch: ColorHex): void {
  const cap = mesh(new SphereGeometry(0.32, 16, 8), mat(cloth), 'star cap crown');
  cap.position.set(0, 0.205, 0.005);
  cap.scale.set(1.08, 0.36, 0.9);
  addHead(root, cap);

  const band = mesh(new TorusGeometry(0.285, 0.026, 6, 22), mat(cloth), 'star cap brim band');
  band.position.set(0, 0.14, 0.0);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1.05, 0.78, 1);
  addHead(root, band);

  for (const side of [-1, 1] as const) {
    const tuck = mesh(new SphereGeometry(0.12, 8, 5), mat(cloth), 'star cap tucked tail cover');
    tuck.position.set(side * 0.22, 0.12, -0.08);
    tuck.scale.set(0.72, 0.8, 0.45);
    addHead(root, tuck);
  }

  for (const [x, y, z] of [
    [-0.13, 0.27, 0.26],
    [0.04, 0.295, 0.27],
    [0.15, 0.255, 0.23],
  ] as const) {
    const star = mesh(new SphereGeometry(0.026, 5, 4), mat(stitch), 'star cap embroidery');
    star.position.set(x, y, z);
    star.scale.set(1, 0.48, 0.26);
    addHead(root, star);
  }
}

function addPlume(root: Group, color: ColorHex): void {
  for (let i = 0; i < 4; i += 1) {
    const plume = mesh(new BoxGeometry(0.04, 0.28 - i * 0.035, 0.018), mat(color), 'white plume');
    plume.position.set(0.12 + i * 0.018, 0.48 + i * 0.015, 0.12 - i * 0.012);
    plume.rotation.set(0.2, -0.25, -0.35 - i * 0.12);
    addHead(root, plume);
  }
}

/**
 * Where a pair of spectacles sits on one face, in accessory units (the head bone's origin is at the
 * jaw). Measured from each rig's eye meshes and face depth, since the two rigs differ: Nell's eyes
 * sit lower and closer together, Ezra's are higher and wider, with a longer nose to bridge.
 */
export interface SpectacleFit {
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

export const SPECTACLES: Record<'nell' | 'merchant' | 'oren' | 'pell', SpectacleFit> = {
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
  oren: {
    eyeX: 0.136,
    eyeY: 0.088,
    radius: 0.056,
    lensZ: 0.258,
    bridgeY: 0.108,
    bridgeZ: 0.292,
    temple: [0.232, 0.135],
    ear: [0.266, 0.006],
  },
  pell: {
    eyeX: 0.125,
    eyeY: 0.086,
    radius: 0.047,
    lensZ: 0.258,
    bridgeY: 0.102,
    bridgeZ: 0.292,
    temple: [0.214, 0.14],
    ear: [0.26, 0.012],
  },
};

/** Lenses wrap back a touch at their outer edge to follow the face. */
const LENS_WRAP = 0.18;

/** Round wire spectacles over the eyes, bridged over the nose, with arms back to the ears. */
function addSpectacles(root: Group, fit: SpectacleFit, color: ColorHex = 0xd9c38f): void {
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
  addHead(root, mesh(geometry, mat(color), 'spectacles'));
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

/** Bones a worn strap rests on (the body and anything dressed over it), not the head or hands. */
// Not the hips: a satchel or a coat's skirt there would pull the strap off the body.
const TORSO_BONES = new Set(['Abdomen', 'Torso', 'Body']);
const SASH_SAMPLES = 40;
const SASH_TILT = 0.8;

/**
 * What a strap can rest on, posed as it is now, as triangles in the character root's space: each
 * skinned body (skinned on the CPU) and anything worn on the torso (`worn`, so a coat panel standing
 * off the chest still counts). Plain triangles, so fitting needs no Raycaster.
 */
function strapSurfaces(root: Group): { tris: Float32Array; worn: Uint8Array } {
  const tris: number[] = [];
  const worn: number[] = [];
  const v = new Vector3();
  const toRoot = new Matrix4();
  root.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();
  const add = (o: Mesh, skinned: boolean, isWorn: boolean) => {
    const g = o.geometry;
    const pos = g.getAttribute('position');
    toRoot.multiplyMatrices(rootInverse, o.matrixWorld);
    const corner = (i: number) => {
      if (skinned) (o as SkinnedMesh).getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(toRoot);
      tris.push(v.x, v.y, v.z);
    };
    // Only the draw range: a body's index also carries its coarser levels of detail after it.
    const start = g.drawRange.start;
    const count = Math.min(g.index ? g.index.count : pos.count, start + g.drawRange.count);
    for (let i = start; i + 2 < count; i += 3) {
      for (let k = 0; k < 3; k++) corner(g.index ? g.index.getX(i + k) : i + k);
      worn.push(isWorn ? 1 : 0);
    }
  };
  root.traverse((o) => {
    if (o instanceof SkinnedMesh) {
      o.skeleton.update();
      add(o, true, false);
    } else if (o instanceof Mesh) {
      for (let p: Object3D | null = o.parent; p && p !== root; p = p.parent) {
        if (!(p instanceof Bone)) continue;
        if (TORSO_BONES.has(p.name)) add(o, false, true);
        return;
      }
    }
  });
  return { tris: new Float32Array(tris), worn: new Uint8Array(worn) };
}

const tA = new Vector3();
const tB = new Vector3();
const tC = new Vector3();
const tHit = new Vector3();

/** Distances along `ray` to every triangle it crosses (either face), nearest first. */
function rayHits(ray: Ray, s: { tris: Float32Array; worn: Uint8Array }): { d: number; worn: boolean }[] {
  const out: { d: number; worn: boolean }[] = [];
  const t = s.tris;
  for (let i = 0, f = 0; i < t.length; i += 9, f++) {
    tA.set(t[i]!, t[i + 1]!, t[i + 2]!);
    tB.set(t[i + 3]!, t[i + 4]!, t[i + 5]!);
    tC.set(t[i + 6]!, t[i + 7]!, t[i + 8]!);
    if (ray.intersectTriangle(tA, tB, tC, false, tHit))
      out.push({ d: tHit.distanceTo(ray.origin), worn: s.worn[f] === 1 });
  }
  return out.sort((a, b) => a.d - b.d);
}

function boneLocal(root: Group, name: string, out: Vector3): Vector3 | null {
  const bone = root.getObjectByName(name);
  if (!(bone instanceof Bone)) return null;
  bone.getWorldPosition(out);
  return root.worldToLocal(out);
}

/**
 * A sash worn as a real strap: a band over one shoulder (`side` 1: the character's right), across
 * the chest to the opposite hip and round the back, fitted to the body (and any coat) by casting
 * rays out from inside the chest, with a brass buckle at the front. It used to be a flat box stuck
 * on the chest, standing off the body at its edges and ending in mid-air.
 */
function addSash(root: Group, color: ColorHex, side: -1 | 1): void {
  const halfWidth = 0.036;
  const halfThick = 0.006;
  // The loop's centre, inside the chest: between the abdomen and torso bones, a little forward.
  const a = boneLocal(root, 'Abdomen', new Vector3());
  const t = boneLocal(root, 'Torso', new Vector3());
  const centre = a && t ? a.lerp(t, 0.7).add(new Vector3(0, 0, 0.04)) : new Vector3(0, 0.62, -0.12);
  // The loop's plane holds the forward axis and `up`, tilted toward the character's right shoulder.
  const up = new Vector3(-side * Math.sin(SASH_TILT), Math.cos(SASH_TILT), 0);
  const forward = new Vector3(0, 0, 1);
  const across = new Vector3().crossVectors(up, forward).normalize();

  const surfaces = strapSurfaces(root);
  const ray = new Ray();
  const raw: number[] = [];
  const dirs: Vector3[] = [];
  for (let i = 0; i < SASH_SAMPLES; i++) {
    const th = (i / SASH_SAMPLES) * Math.PI * 2;
    const d = up.clone().multiplyScalar(Math.cos(th)).addScaledVector(forward, Math.sin(th));
    dirs.push(d);
    // The band lies on the highest of its centre line and its two edges.
    let r = 0;
    for (const e of [-0.8, 0, 0.8]) {
      ray.origin.copy(centre).addScaledVector(across, e * halfWidth);
      ray.direction.copy(d);
      const hits = rayHits(ray, surfaces);
      if (!hits.length) continue;
      // The body's surface, or a coat panel worn over it (which can stand well off the chest); not
      // an arm further out (part of the body mesh).
      const first = hits[0]!.d;
      let far = first;
      for (const h of hits) {
        const gap = h.d - first;
        if (gap < 0.05 || (h.worn && gap < 0.16)) far = h.d;
      }
      r = Math.max(r, far);
    }
    raw.push(r);
  }
  for (let i = 0; i < raw.length; i++) if (!raw[i]) raw[i] = raw[(i + raw.length - 1) % raw.length] || 0.2;
  // Smooth the low-poly body's facets out of it, never sinking below where the rays found the body.
  const smooth = (r: number[]) =>
    r.map((x, i) => 0.25 * r[(i + r.length - 1) % r.length]! + 0.5 * x + 0.25 * r[(i + 1) % r.length]!);
  const lift = (r: number[]) => r.map((x, i) => Math.max(x, raw[i]!));
  const radius = lift(smooth(lift(smooth(raw))));

  // Four faces round the loop (out, in, two edges), each with its own vertices for crisp edges.
  const n = SASH_SAMPLES;
  const pos = new Float32Array(n * 4 * 2 * 3);
  const nor = new Float32Array(n * 4 * 2 * 3);
  const index: number[] = [];
  const p = new Vector3();
  const c = new Vector3();
  const faces: [number, number, number, number][] = [
    [1, 1, -1, 1],
    [-1, -1, 1, -1],
    [1, 1, 1, -1],
    [-1, -1, -1, 1],
  ];
  for (let f = 0; f < 4; f++) {
    const [o0, o1, a0, a1] = faces[f]!;
    for (let i = 0; i < n; i++) {
      const d = dirs[i]!;
      c.copy(centre).addScaledVector(d, radius[i]! + halfThick + 0.006);
      for (let k = 0; k < 2; k++) {
        const out = k === 0 ? o0 : o1;
        const wide = k === 0 ? a0 : a1;
        p.copy(c)
          .addScaledVector(d, out * halfThick)
          .addScaledVector(across, wide * halfWidth);
        const at = ((f * n + i) * 2 + k) * 3;
        pos[at] = p.x;
        pos[at + 1] = p.y;
        pos[at + 2] = p.z;
        const nx = f === 0 ? d.x : f === 1 ? -d.x : f === 2 ? across.x : -across.x;
        const ny = f === 0 ? d.y : f === 1 ? -d.y : f === 2 ? across.y : -across.y;
        const nz = f === 0 ? d.z : f === 1 ? -d.z : f === 2 ? across.z : -across.z;
        nor[at] = nx;
        nor[at + 1] = ny;
        nor[at + 2] = nz;
      }
      const j = (i + 1) % n;
      const a0i = (f * n + i) * 2;
      const b0i = (f * n + j) * 2;
      if (f === 1 || f === 3) index.push(a0i, a0i + 1, b0i, a0i + 1, b0i + 1, b0i);
      else index.push(a0i, b0i, a0i + 1, a0i + 1, b0i, b0i + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.setIndex(index);
  addRoot(root, mesh(geometry, mat(color), 'sash'), 'Torso');

  // The buckle, at the front of the chest (the forward-most sample), along the strap.
  const front = Math.round(n / 4);
  const buckle = mesh(new BoxGeometry(halfWidth * 2 + 0.016, 0.05, 0.012), mat(0xd6b35f), 'sash buckle');
  buckle.position.copy(centre).addScaledVector(dirs[front]!, radius[front]! + halfThick * 2 + 0.012);
  buckle.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(across, up, forward));
  addRoot(root, buckle, 'Torso');
}

function addSatchel(root: Group, color: ColorHex, side: -1 | 1): void {
  const bag = mesh(new BoxGeometry(0.07, 0.16, 0.2), mat(color), 'satchel');
  bag.position.set(side * 0.25, 0.4, -0.15);
  addRoot(root, bag, 'Hips');
}

function addApron(root: Group, leather: ColorHex, straps: ColorHex): void {
  const bib = mesh(new BoxGeometry(0.24, 0.28, 0.025), mat(leather), 'merchant apron bib');
  bib.position.set(0, 0.64, 0.115);
  addRoot(root, bib, 'Torso');

  const skirt = mesh(new BoxGeometry(0.3, 0.34, 0.026), mat(leather), 'merchant apron skirt');
  skirt.position.set(0, 0.4, 0.105);
  addRoot(root, skirt, 'Hips');

  for (const side of [-1, 1] as const) {
    const strap = mesh(new BoxGeometry(0.03, 0.36, 0.018), mat(straps), 'apron cross strap');
    strap.position.set(side * 0.085, 0.72, 0.125);
    strap.rotation.z = side * 0.34;
    addRoot(root, strap, 'Torso');
  }
}

function addMoneyPouch(root: Group, leather: ColorHex, side: -1 | 1): void {
  const pouch = mesh(new SphereGeometry(0.075, 8, 5), mat(leather), 'money pouch');
  pouch.position.set(side * 0.24, 0.42, 0.08);
  pouch.scale.set(0.85, 0.95, 0.55);
  addRoot(root, pouch, 'Hips');

  const flap = mesh(new BoxGeometry(0.095, 0.035, 0.015), mat(0xc38b42), 'money pouch clasp');
  flap.position.set(side * 0.24, 0.48, 0.125);
  addRoot(root, flap, 'Hips');
}

function addTacklePouch(root: Group, leather: ColorHex, side: -1 | 1): void {
  const pouch = mesh(new BoxGeometry(0.12, 0.11, 0.075), mat(leather), 'tackle pouch');
  pouch.position.set(side * 0.25, 0.36, 0.05);
  pouch.rotation.z = side * 0.08;
  addRoot(root, pouch, 'Hips');

  const cork = mesh(new SphereGeometry(0.025, 6, 4), mat(0xd6b35f), 'fishing cork');
  cork.position.set(side * 0.25, 0.43, 0.1);
  cork.scale.set(1, 0.8, 0.55);
  addRoot(root, cork, 'Hips');
}

function addLedgerInHand(root: Group, color: ColorHex, side: -1 | 1): void {
  holds(root, side);
  // Carried by its spine: the top edge sits in the closed fist and the book hangs along the fingers.
  const grip = handGrip(root, side);
  const W = 0.17;
  const H = 0.23;
  const book = mesh(new BoxGeometry(W, H, 0.035), mat(color), 'ledger');
  const page = mesh(new BoxGeometry(W - 0.025, H - 0.035, 0.008), mat(0xe8dcb8), 'ledger page');
  if (!grip) {
    book.position.set(side * 0.34, 0.34, 0.08);
    page.position.set(side * 0.34, 0.34, 0.102);
  } else {
    book.quaternion.copy(grip.quaternion);
    book.position
      .copy(grip.palm)
      .addScaledVector(grip.up, -(H / 2 - 0.03))
      .addScaledVector(grip.out, 0.01);
    page.quaternion.copy(grip.quaternion);
    // The page shows on the outside of the book, away from the leg.
    page.position.copy(book.position).addScaledVector(grip.out, 0.022).addScaledVector(grip.up, -0.008);
  }
  addRoot(root, book, lowerArmName(side));
  addRoot(root, page, lowerArmName(side));
}

/**
 * Where a hand closes, in the character's own frame at bind pose (arms down): the fist's centre, and a
 * frame for a book carried at the side, upright, its broad face against the leg (`out` points away
 * from the body). A prop built in this frame and attached to the forearm stays in the fist.
 */
function handGrip(
  root: Group,
  side: -1 | 1,
): { palm: Vector3; up: Vector3; out: Vector3; quaternion: Quaternion } | null {
  const sfx = side === 1 ? 'L' : 'R';
  const wrist = root.getObjectByName(`Middle1${sfx}`);
  const knuckle = root.getObjectByName(`Middle2${sfx}`);
  if (!wrist || !knuckle) return null;
  root.updateMatrixWorld(true);
  const w = root.worldToLocal(wrist.getWorldPosition(new Vector3()));
  const k = root.worldToLocal(knuckle.getWorldPosition(new Vector3()));
  const palm = w.clone().lerp(k, 0.75);
  const up = new Vector3(0, 1, 0);
  const out = new Vector3(side, 0, 0);
  // Tipped a little forward and out at the bottom, as a book swings from a relaxed hand.
  const quaternion = new Quaternion().setFromEuler(new Euler(0.12, 0, side * -0.08));
  up.applyQuaternion(quaternion);
  out.applyQuaternion(quaternion);
  // Book width runs front to back, its height up and down, its thickness out from the leg.
  quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
  return { palm, up, out, quaternion };
}

function addMarketBasket(root: Group, side: -1 | 1): void {
  holds(root, side);
  const basket = mesh(new CylinderGeometry(0.075, 0.105, 0.12, 10), mat(0x9d642e), 'market basket');
  basket.position.set(side * 0.31, 0.36, 0.1);
  basket.scale.set(1, 1, 0.72);
  addRoot(root, basket, lowerArmName(side));

  const handle = mesh(new TorusGeometry(0.075, 0.007, 5, 12), mat(0x6a3d1f), 'market basket handle');
  handle.position.set(side * 0.31, 0.43, 0.1);
  handle.rotation.x = Math.PI / 2;
  handle.scale.set(0.9, 0.55, 1);
  addRoot(root, handle, lowerArmName(side));

  for (const [i, color] of [0xc64e3f, 0xd28a22, 0x8fbf4a].entries()) {
    const fruit = mesh(new SphereGeometry(0.025, 6, 4), mat(color), 'basket fruit');
    fruit.position.set(side * (0.28 + i * 0.03), 0.43, 0.1 + (i % 2) * 0.025);
    addRoot(root, fruit, lowerArmName(side));
  }
}

function addFruitTray(root: Group, side: -1 | 1): void {
  holds(root, side);
  const tray = mesh(new BoxGeometry(0.22, 0.035, 0.14), mat(0x8b5a2b), 'vendor produce tray');
  tray.position.set(side * 0.31, 0.43, 0.12);
  tray.rotation.z = side * 0.04;
  addRoot(root, tray, lowerArmName(side));

  for (const [i, color] of [0xd28a22, 0xc64e3f, 0x8fbf4a, 0xd9c88f].entries()) {
    const fruit = mesh(new SphereGeometry(0.03, 6, 4), mat(color), 'vendor produce');
    fruit.position.set(side * (0.235 + i * 0.045), 0.47, 0.105 + (i % 2) * 0.035);
    addRoot(root, fruit, lowerArmName(side));
  }
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

/**
 * Old Finn's rod, held in his right fist: a 2.2 m rod raised forward and out over the water, with a
 * line hanging from the tip down to the surface. It rides the forearm, so it follows his hand.
 */
function addFishingRod(root: Group): void {
  const side = -1;
  holds(root, side);
  const grip = handGrip(root, side);
  const palm = grip ? grip.palm.clone() : new Vector3(side * 0.34, 0.36, 0.1);
  // Raised about 40° from horizontal, pointing forward (+z) and a little out to his right.
  const dir = new Vector3(side * 0.18, 0.62, 0.76).normalize();
  const L = 2.2;
  const butt = palm.clone().addScaledVector(dir, -0.25);
  const rod = mesh(new CylinderGeometry(0.008, 0.017, L, 8), mat(0x5d4027), 'fishing rod');
  rod.position.copy(butt).addScaledVector(dir, L / 2);
  rod.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
  addRoot(root, rod, lowerArmName(side));
  const tip = butt.clone().addScaledVector(dir, L);
  // The line drops from the tip to about the waterline (the seat's on the pier deck, ~1.8 m up).
  const drop = tip.y + 1.75;
  const line = mesh(new CylinderGeometry(0.0025, 0.0025, drop, 4), mat(0xe8e2d0), 'fishing line');
  line.position.set(tip.x, tip.y - drop / 2, tip.z);
  addRoot(root, line, lowerArmName(side));
}

function addBucket(root: Group, color: ColorHex, side: -1 | 1): void {
  // On the ground by the feet (it stays put while its owner idles).
  const bucket = mesh(new CylinderGeometry(0.12, 0.1, 0.18, 8), mat(color), 'fish bucket');
  bucket.position.set(side * 0.36, 0.09, 0.02);
  // On the rig's root bone (it doesn't animate), so it merges into the skinned accessories: alone
  // on the character's root it kept a material, and a shader, of its own.
  addRoot(root, bucket, 'Root');
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

function addRolledSleeves(root: Group, color: ColorHex): void {
  for (const side of [-1, 1] as const) {
    const cuff = mesh(new CylinderGeometry(0.055, 0.055, 0.035, 8), mat(color), 'rolled sleeve cuff');
    cuff.position.set(side * 0.25, 0.53, 0.03);
    cuff.rotation.z = Math.PI / 2;
    addRoot(root, cuff, lowerArmName(side));
  }
}

function addFishingNet(root: Group, side: -1 | 1): void {
  const ring = mesh(new TorusGeometry(0.11, 0.009, 5, 18), mat(0xd8c99a), 'coiled fishing net');
  ring.position.set(side * 0.23, 0.45, -0.12);
  ring.rotation.set(Math.PI / 2, 0, side * 0.15);
  addRoot(root, ring, 'Hips');

  for (let i = 0; i < 4; i += 1) {
    const line = mesh(new BoxGeometry(0.006, 0.2, 0.006), mat(0xe7d9b5), 'fishing net line');
    line.position.set(side * (0.18 + i * 0.035), 0.45, -0.045);
    line.rotation.z = side * (0.45 - i * 0.25);
    addRoot(root, line, 'Hips');
  }
}

function addStripedShirt(root: Group, stripe: ColorHex): void {
  for (let i = 0; i < 4; i += 1) {
    const band = mesh(new BoxGeometry(0.29, 0.025, 0.018), mat(stripe), 'striped shirt band');
    band.position.set(0, 0.68 - i * 0.07, 0.127);
    addRoot(root, band, 'Torso');
  }
}

function addNeckerchief(root: Group, color: ColorHex): void {
  const knot = mesh(new SphereGeometry(0.045, 7, 5), mat(color), 'neckerchief knot');
  knot.position.set(0, 0.71, 0.14);
  knot.scale.set(1, 0.75, 0.45);
  addRoot(root, knot, 'Torso');

  const tail = mesh(new BoxGeometry(0.055, 0.16, 0.02), mat(color), 'neckerchief tail');
  tail.position.set(0.025, 0.61, 0.14);
  tail.rotation.z = -0.2;
  addRoot(root, tail, 'Torso');
}

function addToyPinwheel(root: Group, side: -1 | 1): void {
  holds(root, side);
  const stick = mesh(new BoxGeometry(0.012, 0.28, 0.012), mat(0x7a4a2a), 'pinwheel stick');
  stick.position.set(side * 0.3, 0.4, 0.14);
  stick.rotation.z = side * 0.18;
  addRoot(root, stick, lowerArmName(side));

  for (const [i, color] of [0xc64e3f, 0xd28a22, 0x2f6fa1, 0x1f8790].entries()) {
    const vane = mesh(new BoxGeometry(0.06, 0.018, 0.012), mat(color), 'pinwheel vane');
    vane.position.set(side * 0.31, 0.54, 0.15);
    vane.rotation.z = (Math.PI / 2) * i;
    addRoot(root, vane, lowerArmName(side));
  }
}

function addToyHoop(root: Group, side: -1 | 1): void {
  holds(root, side);
  const hoop = mesh(new TorusGeometry(0.1, 0.008, 5, 18), mat(0xd6b35f), 'toy hoop');
  hoop.position.set(side * 0.3, 0.35, 0.12);
  hoop.rotation.y = side * 0.25;
  addRoot(root, hoop, lowerArmName(side));
}

function addGuardLivery(root: Group, navy: ColorHex, burgundy: ColorHex, brass: ColorHex): void {
  const coat = mesh(new BoxGeometry(0.31, 0.34, 0.032), mat(navy), 'guard uniform coat');
  coat.position.set(0, 0.62, 0.108);
  addRoot(root, coat, 'Torso');

  const skirt = mesh(new BoxGeometry(0.32, 0.28, 0.032), mat(navy), 'guard coat skirt');
  skirt.position.set(0, 0.4, 0.095);
  addRoot(root, skirt, 'Hips');

  for (const side of [-1, 1] as const) {
    const lapel = mesh(new BoxGeometry(0.055, 0.32, 0.018), mat(burgundy), 'guard burgundy lapel');
    lapel.position.set(side * 0.075, 0.64, 0.13);
    lapel.rotation.z = side * 0.22;
    addRoot(root, lapel, 'Torso');

    const cuff = mesh(new CylinderGeometry(0.055, 0.055, 0.035, 8), mat(burgundy), 'guard burgundy cuff');
    cuff.position.set(side * 0.25, 0.5, 0.03);
    cuff.rotation.z = Math.PI / 2;
    addRoot(root, cuff, lowerArmName(side));
  }

  const belt = mesh(new BoxGeometry(0.31, 0.05, 0.022), mat(brass), 'guard brass belt');
  belt.position.set(0, 0.42, 0.13);
  addRoot(root, belt, 'Hips');

  for (const side of [-1, 1] as const) {
    const shoulder = mesh(new SphereGeometry(0.055, 7, 5), mat(brass), 'guard shoulder boss');
    shoulder.position.set(side * 0.17, 0.73, 0.06);
    shoulder.scale.set(1.2, 0.45, 0.7);
    addRoot(root, shoulder, 'Torso');
  }

  for (let i = 0; i < 3; i += 1) {
    const button = mesh(new SphereGeometry(0.015, 6, 4), mat(brass), 'guard brass button');
    button.position.set(0, 0.7 - i * 0.075, 0.138);
    button.scale.set(1, 1, 0.4);
    addRoot(root, button, 'Torso');
  }
}

function addMerchantScales(root: Group, side: -1 | 1): void {
  holds(root, side);
  const x = side * 0.26;
  const top = new Vector3(x, 0.62, 0.16);
  const center = new Vector3(x, 0.52, 0.17);
  const left = new Vector3(x - 0.1, 0.51, 0.17);
  const right = new Vector3(x + 0.1, 0.51, 0.17);
  const parts = [
    rod(top, center, 0.008),
    rod(left, right, 0.009),
    rod(left, new Vector3(left.x, 0.43, 0.18), 0.005),
    rod(right, new Vector3(right.x, 0.43, 0.18), 0.005),
  ];
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  addRoot(root, mesh(geometry, mat(0xd0a14b), 'merchant scales'), lowerArmName(side));

  for (const panX of [left.x, right.x]) {
    const pan = mesh(new CylinderGeometry(0.045, 0.06, 0.012, 10), mat(0xc38b42), 'scale pan');
    pan.position.set(panX, 0.42, 0.18);
    addRoot(root, pan, lowerArmName(side));
  }
}

function addRolledMapInHand(root: Group, side: -1 | 1): void {
  holds(root, side);
  const scroll = mesh(new CylinderGeometry(0.034, 0.034, 0.28, 10), mat(0xe2c98f), 'rolled map in hand');
  scroll.position.set(side * 0.26, 0.49, 0.15);
  scroll.rotation.set(0.2, 0.1 * side, Math.PI / 2 + side * 0.2);
  addRoot(root, scroll, lowerArmName(side));

  const band = mesh(new CylinderGeometry(0.037, 0.037, 0.032, 8), mat(0x1f8a93), 'map ribbon');
  band.position.copy(scroll.position);
  band.rotation.copy(scroll.rotation);
  addRoot(root, band, lowerArmName(side));
}

function addMalletInHand(root: Group, side: -1 | 1): void {
  holds(root, side);
  const handle = mesh(new BoxGeometry(0.028, 0.34, 0.028), mat(0x5b351f), 'shipwright mallet handle');
  handle.position.set(side * 0.27, 0.43, 0.13);
  handle.rotation.set(0.1, 0, side * 0.12);
  addRoot(root, handle, lowerArmName(side));

  const head = mesh(new BoxGeometry(0.17, 0.065, 0.075), mat(0x3a2a1c), 'shipwright mallet head');
  head.position.set(side * 0.27, 0.59, 0.14);
  head.rotation.y = side * 0.08;
  addRoot(root, head, lowerArmName(side));
}

function addSpyglassInHand(root: Group, side: -1 | 1): void {
  holds(root, side);
  const tube = mesh(new CylinderGeometry(0.032, 0.043, 0.28, 10), mat(0xb98533), 'handheld spyglass');
  tube.position.set(side * 0.26, 0.54, 0.19);
  tube.rotation.set(Math.PI / 2 + 0.08, side * 0.2, 0);
  addRoot(root, tube, lowerArmName(side));

  const rim = mesh(new CylinderGeometry(0.048, 0.048, 0.025, 10), mat(0xddbd65), 'handheld spyglass rim');
  rim.position.set(side * 0.26, 0.54, 0.325);
  rim.rotation.copy(tube.rotation);
  addRoot(root, rim, lowerArmName(side));
}

function addAstrolabeInHand(root: Group, side: -1 | 1): void {
  holds(root, side);
  const ring = new TorusGeometry(0.07, 0.0055, 5, 20);
  const parts = [
    ring,
    rod(new Vector3(-0.055, 0, 0), new Vector3(0.055, 0, 0), 0.006),
    rod(new Vector3(0, -0.055, 0), new Vector3(0, 0.055, 0), 0.006),
    rod(new Vector3(-0.03, -0.03, 0), new Vector3(0.04, 0.04, 0), 0.005),
  ];
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  const astrolabe = mesh(geometry, mat(0xd3a34d), 'brass astrolabe');
  astrolabe.position.set(side * 0.33, 0.45, 0.18);
  astrolabe.rotation.set(0.08, side * 0.12, 0);
  addRoot(root, astrolabe, lowerArmName(side));

  const grip = mesh(new BoxGeometry(0.018, 0.1, 0.018), mat(0xd3a34d), 'astrolabe hand grip');
  grip.position.set(side * 0.33, 0.39, 0.18);
  grip.rotation.z = side * 0.08;
  addRoot(root, grip, lowerArmName(side));
}

function addPencilBehindEar(root: Group, side: -1 | 1): void {
  const pencil = mesh(new BoxGeometry(0.018, 0.22, 0.018), mat(0xd6b35a), 'pencil behind ear');
  pencil.position.set(side * 0.24, 0.12, 0.02);
  pencil.rotation.set(0.2, 0.2 * side, side * 0.88);
  addHead(root, pencil);
}

function addQuillBehindEar(root: Group, side: -1 | 1): void {
  const shaft = mesh(new BoxGeometry(0.01, 0.11, 0.01), mat(0xe7d9b5), 'quill shaft');
  shaft.position.set(side * 0.22, 0.12, 0.04);
  shaft.rotation.set(0.08, 0.18 * side, side * 0.48);
  addHead(root, shaft);

  const feather = mesh(new SphereGeometry(0.05, 7, 4), mat(0xf1ead2), 'quill feather');
  feather.position.set(side * 0.255, 0.18, 0.035);
  feather.scale.set(0.45, 1.05, 0.18);
  feather.rotation.copy(shaft.rotation);
  addHead(root, feather);
}

function addNavalCoat(
  root: Group,
  color: ColorHex,
  trim: ColorHex,
  long: boolean,
  buttonColor: ColorHex = trim,
): void {
  const chest = mesh(new BoxGeometry(0.28, 0.34, 0.03), mat(color), 'naval coat chest');
  chest.position.set(0, 0.62, 0.105);
  addRoot(root, chest, 'Torso');

  const skirt = mesh(
    new BoxGeometry(long ? 0.32 : 0.28, long ? 0.48 : 0.26, 0.032),
    mat(color),
    'naval coat tails',
  );
  skirt.position.set(0, long ? 0.34 : 0.44, 0.095);
  addRoot(root, skirt, 'Hips');

  for (const side of [-1, 1] as const) {
    const lapel = mesh(new BoxGeometry(0.052, 0.34, 0.018), mat(trim), 'gold coat lapel');
    lapel.position.set(side * 0.08, 0.64, 0.126);
    lapel.rotation.z = side * 0.24;
    addRoot(root, lapel, 'Torso');

    const epaulette = mesh(new CylinderGeometry(0.055, 0.072, 0.026, 10), mat(trim), 'gold epaulette');
    epaulette.position.set(side * 0.17, 0.76, 0.04);
    epaulette.scale.set(1.25, 0.55, 0.72);
    addRoot(root, epaulette, 'Torso');
  }

  for (let i = 0; i < 4; i += 1) {
    const button = mesh(new SphereGeometry(0.017, 6, 4), mat(buttonColor), 'brass coat button');
    button.position.set(i % 2 === 0 ? -0.035 : 0.035, 0.71 - i * 0.075, 0.135);
    button.scale.set(1, 1, 0.35);
    addRoot(root, button, 'Torso');
  }
}

function addAstronomerRobe(root: Group, cloth: ColorHex, trim: ColorHex): void {
  const robe = mesh(new CylinderGeometry(0.2, 0.29, 0.62, 16), mat(cloth), 'astronomer long robe');
  robe.position.set(0, 0.31, 0.0);
  robe.scale.set(1, 1, 0.78);
  addRoot(root, robe, 'Hips');

  const mantle = mesh(new CylinderGeometry(0.25, 0.22, 0.16, 16), mat(cloth), 'astronomer shoulder mantle');
  mantle.position.set(0, 0.66, 0.015);
  mantle.scale.set(1.06, 1, 0.72);
  addRoot(root, mantle, 'Torso');

  const hem = mesh(new TorusGeometry(0.29, 0.012, 5, 24), mat(trim), 'robe gold hem');
  hem.position.set(0, 0.01, 0);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.78, 1);
  addRoot(root, hem, 'Hips');

  const collar = mesh(new BoxGeometry(0.28, 0.08, 0.028), mat(trim), 'robe brass collar');
  collar.position.set(0, 0.75, 0.12);
  addRoot(root, collar, 'Torso');

  const star = mesh(new SphereGeometry(0.02, 5, 4), mat(trim), 'robe star clasp');
  star.position.set(0, 0.68, 0.14);
  star.scale.set(1, 0.55, 0.35);
  addRoot(root, star, 'Torso');

  for (const [x, y] of [
    [-0.09, 0.5],
    [0.1, 0.39],
    [-0.04, 0.25],
  ] as const) {
    const embroidered = mesh(new SphereGeometry(0.018, 5, 4), mat(trim), 'robe gold star');
    embroidered.position.set(x, y, 0.225);
    embroidered.scale.set(1, 0.55, 0.25);
    addRoot(root, embroidered, 'Hips');
  }
}

function addPeriwig(root: Group, hair: ColorHex, ribbon: ColorHex): void {
  const cap = mesh(new SphereGeometry(0.29, 14, 7), mat(hair), 'periwig cap');
  cap.position.set(0, 0.185, 0.0);
  cap.scale.set(1.08, 0.34, 0.9);
  addHead(root, cap);

  for (const x of [-0.12, 0, 0.12]) {
    const roll = mesh(new SphereGeometry(0.075, 8, 5), mat(hair), 'periwig brow curl');
    // Above the eyes (their tops are at about 0.15), so the face shows (issue #186).
    roll.position.set(x, 0.168, 0.214 - Math.abs(x) * 0.12);
    roll.scale.set(1, 0.58, 0.45);
    addHead(root, roll);
  }

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 3; i += 1) {
      const curl = mesh(new SphereGeometry(0.065, 8, 5), mat(hair), 'periwig side curl');
      curl.position.set(side * 0.255, 0.095 - i * 0.065, 0.05);
      curl.scale.set(0.72, 0.82, 0.55);
      addHead(root, curl);
    }
  }

  const queue = mesh(new BoxGeometry(0.065, 0.24, 0.04), mat(hair), 'periwig queue');
  queue.position.set(0, -0.02, -0.22);
  queue.rotation.x = -0.12;
  addHead(root, queue);

  const bow = mesh(new BoxGeometry(0.16, 0.05, 0.026), mat(ribbon), 'periwig queue ribbon');
  bow.position.set(0, 0.02, -0.245);
  addHead(root, bow);
}

function addArchivistCoat(root: Group, coat: ColorHex, linen: ColorHex): void {
  const chest = mesh(new BoxGeometry(0.28, 0.32, 0.03), mat(coat), 'archivist frock coat');
  chest.position.set(0, 0.6, 0.105);
  addRoot(root, chest, 'Torso');

  for (const side of [-1, 1] as const) {
    const lapel = mesh(new BoxGeometry(0.055, 0.27, 0.018), mat(0xd0b06a), 'archivist brass lapel');
    lapel.position.set(side * 0.08, 0.62, 0.127);
    lapel.rotation.z = side * 0.24;
    addRoot(root, lapel, 'Torso');

    const tail = mesh(new BoxGeometry(0.095, 0.34, 0.03), mat(coat), 'archivist coat tail');
    tail.position.set(side * 0.095, 0.36, 0.08);
    tail.rotation.z = side * 0.05;
    addRoot(root, tail, 'Hips');
  }

  const cravat = mesh(new SphereGeometry(0.055, 8, 5), mat(linen), 'white cravat');
  cravat.position.set(0, 0.72, 0.135);
  cravat.scale.set(1, 0.7, 0.45);
  addRoot(root, cravat, 'Torso');

  const cravatTail = mesh(new BoxGeometry(0.045, 0.16, 0.016), mat(linen), 'cravat tail');
  cravatTail.position.set(0, 0.62, 0.14);
  addRoot(root, cravatTail, 'Torso');
}

function addMedals(root: Group): void {
  for (let i = 0; i < 3; i += 1) {
    const medal = mesh(
      new CylinderGeometry(0.018, 0.018, 0.008, 8),
      mat(i === 1 ? 0xc84a3a : 0xd9bb62),
      'medal',
    );
    medal.position.set(-0.06 + i * 0.04, 0.66, 0.14);
    medal.rotation.x = Math.PI / 2;
    addRoot(root, medal, 'Torso');
  }
}

function lowerArmName(side: -1 | 1): 'LowerArmL' | 'LowerArmR' {
  return side === 1 ? 'LowerArmL' : 'LowerArmR';
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

/** Marks the hand that carries a prop, so its fingers close on it (runtime-character). */
function holds(root: Group, side: -1 | 1): void {
  const sides = (root.userData.holds ??= []) as number[];
  if (!sides.includes(side)) sides.push(side);
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

/** Every merged accessory mesh: one look (the per-colour materials' roughness and metalness), coloured per vertex. */
const ACCESSORY_MATERIAL = new MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.82,
  metalness: 0.02,
  vertexColors: true,
});

/**
 * The same look for the skinned merge. Its own material, because shared skinning gives it a skinning
 * position node, which the rigid merges (parts on the character's root) mustn't get.
 */
const SKINNED_ACCESSORY_MATERIAL = ACCESSORY_MATERIAL.clone();

/**
 * Merges an NPC's rigid accessories (hats, coats, props: one mesh per part, one material per colour)
 * into as few meshes as it can, coloured per vertex, so each NPC costs a draw or two in every pass
 * rather than one per part. Parts on bones become one mesh skinned to the body's skeleton (each
 * vertex rides its part's bone with full weight); parts on the root, or on a rig with no skinned
 * body, become one mesh per anchor. The look is the same: same shading, same colours, same bones.
 */
export function mergeNpcAccessories(root: Group): void {
  const owned = new Set<Material>(MATERIALS.values());
  const byAnchor = new Map<Object3D, Mesh[]>();
  const bodies: SkinnedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) {
      bodies.push(object);
      return;
    }
    if (!(object instanceof Mesh) || object.children.length) return;
    if (!object.visible || !owned.has(object.material as Material)) return;
    let anchor = object.parent;
    while (anchor && anchor !== root && !(anchor instanceof Bone)) anchor = anchor.parent;
    if (!anchor) return;
    const list = byAnchor.get(anchor) ?? [];
    list.push(object);
    byAnchor.set(anchor, list);
  });
  root.updateMatrixWorld(true);
  const size = (m: SkinnedMesh): number => m.geometry.getAttribute('position').count;
  const body = bodies.reduce<SkinnedMesh | null>(
    (best, m) => (!best || size(m) > size(best) ? m : best),
    null,
  );
  const skinned = body?.parent ? skinAccessories(body, byAnchor) : null;
  if (skinned) {
    body!.parent!.add(skinned);
    skinned.updateMatrixWorld(true);
  }
  const toAnchor = new Matrix4();
  for (const [anchor, parts] of byAnchor) {
    if (parts.length < 2) continue;
    toAnchor.copy(anchor.matrixWorld).invert();
    const geometries = parts.map((part) => accessoryGeometry(part, toAnchor));
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    for (const part of parts) part.removeFromParent();
    const out = mesh(merged, ACCESSORY_MATERIAL, `npc accessories (${anchor.name || 'root'})`);
    out.userData.parts = parts.map((part) => part.name);
    out.userData.cullRadius = ACCESSORY_CULL_RADIUS;
    anchor.add(out);
  }
}

/**
 * One skinned mesh for every part that rides a bone of `body`'s skeleton (taken out of `byAnchor`), in
 * `body`'s bind space: skinning a vertex with its bone at full weight puts it back where the part was.
 */
function skinAccessories(body: SkinnedMesh, byAnchor: Map<Object3D, Mesh[]>): SkinnedMesh | null {
  const bones = body.skeleton.bones;
  const geometries: BufferGeometry[] = [];
  const names: string[] = [];
  const toBind = new Matrix4();
  const bindInverse = new Matrix4().copy(body.bindMatrix).invert();
  // Where skinning puts a vertex: world space for an attached mesh, else bind space through the mesh.
  const skinSpace = new Matrix4();
  if (body.bindMode !== AttachedBindMode)
    skinSpace.copy(body.matrixWorld).invert().premultiply(body.bindMatrix);
  for (const [anchor, parts] of byAnchor) {
    const bone = bones.indexOf(anchor as Bone);
    if (bone < 0) continue;
    // Skinned space to bind space: bind^-1 x boneInverse^-1 x boneWorld^-1.
    toBind
      .copy(body.skeleton.boneInverses[bone]!)
      .invert()
      .premultiply(bindInverse)
      .multiply(boneSpace.copy(anchor.matrixWorld).invert())
      .multiply(skinSpace);
    for (const part of parts) {
      const g = accessoryGeometry(part, toBind);
      const count = g.getAttribute('position').count;
      const index = new Uint16Array(count * 4);
      const weight = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        index[i * 4] = bone;
        weight[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new BufferAttribute(index, 4));
      g.setAttribute('skinWeight', new BufferAttribute(weight, 4));
      geometries.push(g);
      names.push(part.name);
    }
    byAnchor.delete(anchor);
    for (const part of parts) part.removeFromParent();
  }
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!merged) return null;
  const out = new SkinnedMesh(merged, SKINNED_ACCESSORY_MATERIAL);
  out.name = 'npc accessories';
  out.castShadow = true;
  out.receiveShadow = true;
  out.userData.ownedGeometry = true;
  out.userData.parts = names;
  out.userData.cullRadius = ACCESSORY_CULL_RADIUS;
  out.position.copy(body.position);
  out.quaternion.copy(body.quaternion);
  out.scale.copy(body.scale);
  out.bindMode = body.bindMode;
  out.bind(body.skeleton, body.bindMatrix);
  return out;
}

const boneSpace = new Matrix4();

/** A part's geometry in its anchor's space, with its colour per vertex (position, normal, colour, indexed). */
function accessoryGeometry(part: Mesh, toAnchor: Matrix4): BufferGeometry {
  const source = part.geometry;
  const g = new BufferGeometry();
  g.setAttribute('position', source.getAttribute('position').clone());
  if (source.getAttribute('normal')) g.setAttribute('normal', source.getAttribute('normal').clone());
  else g.computeVertexNormals();
  const count = g.getAttribute('position').count;
  const index = source.index ? Array.from(source.index.array) : Array.from({ length: count }, (_, i) => i);
  const matrix = new Matrix4().multiplyMatrices(toAnchor, part.matrixWorld);
  // A mirrored part's faces would turn inside out once baked: wind them the other way.
  if (matrix.determinant() < 0)
    for (let i = 0; i + 2 < index.length; i += 3)
      [index[i + 1], index[i + 2]] = [index[i + 2]!, index[i + 1]!];
  g.setIndex(index);
  g.applyMatrix4(matrix);
  const color = (part.material as MeshStandardMaterial).color;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function mat(color: ColorHex): MeshStandardMaterial {
  const existing = MATERIALS.get(color);
  if (existing) return existing;
  const material = new MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });
  MATERIALS.set(color, material);
  return material;
}
