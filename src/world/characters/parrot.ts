import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  SkinnedMesh,
  Vector3,
} from 'three/webgpu';

/**
 * The captains' parrots. The Captain's is Ernest, the Pirate Kit parrot, skinned to his hook arm.
 * Anne gets her own from the same mesh: a scarlet macaw on her right shoulder, repainted through
 * her atlas copy, so it shares her body material (+1 draw, +0 programs).
 */

type Hex = number;
type Cell = readonly [col: number, row: number];

/**
 * Ernest's source swatches (32 px atlas cells) and the parts they cover. His chest and face share
 * the grey cell at two UV spots; the chest's sits left of `CHEST_MAX_U`.
 */
const ERNEST = {
  wing: [19, 7],
  crest: [16, 7],
  grey: [17, 7],
  beak: [20, 7],
} as const satisfies Record<string, Cell>;
const CHEST_MAX_U = 0.549;

/** Free cells in the character atlas (rows 13+ are unused), painted in Anne's atlas copy. */
const MACAW_CELLS = {
  scarlet: [0, 20],
  gold: [1, 20],
  blue: [2, 20],
  horn: [3, 20],
} as const satisfies Record<string, Cell>;

/** Scarlet macaw: red head and body, a gold wing band, blue flight feathers, and a pale beak. */
export const MACAW_PAINT: readonly (readonly [Cell, Hex])[] = [
  [MACAW_CELLS.scarlet, 0xd42a1c],
  [MACAW_CELLS.gold, 0xf2b300],
  [MACAW_CELLS.blue, 0x1f5ec4],
  [MACAW_CELLS.horn, 0xe8dcc0],
];

/** Anne's shoulder perch, in metres from her UpperArm.R joint, in her root's frame (+z forward). */
const PERCH = { up: 0.05, inward: -0.075, forward: 0.015, yaw: 0.4, scale: 0.72 };

const TEMP_MATRIX = new Matrix4();
const TEMP_VECTOR = new Vector3();

/**
 * Bakes Ernest's rest pose into a static macaw: metres, feet centred on the origin, facing as he
 * does on the Captain's arm. Returns null if the Captain model has no parrot.
 */
export function createMacawGeometry(captain: Group): BufferGeometry | null {
  let ernest: SkinnedMesh | null = null;
  captain.traverse((object) => {
    if (!ernest && object instanceof SkinnedMesh && object.name === 'Ernest') ernest = object;
  });
  if (!ernest) return null;
  const source: SkinnedMesh = ernest;
  const boneIndex = source.skeleton.bones.findIndex((bone) => bone.name === 'LowerArmL');
  if (boneIndex < 0) return null;

  const geometry = (
    source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone()
  ) as BufferGeometry;
  geometry.deleteAttribute('skinIndex');
  geometry.deleteAttribute('skinWeight');
  toFloat32(geometry);
  repaintMacaw(geometry);

  captain.updateMatrixWorld(true);
  const bone = source.skeleton.bones[boneIndex];
  TEMP_MATRIX.multiplyMatrices(bone.matrixWorld, source.skeleton.boneInverses[boneIndex]).multiply(
    source.bindMatrix,
  );
  geometry.applyMatrix4(TEMP_MATRIX);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'macaw';
  return geometry;
}

/**
 * Perches the macaw on Anne's right shoulder. It rides the Torso bone, so it leans and twists with
 * her body but arm poses (walk swing, the helm grip) don't swing it across her face.
 */
export function addShoulderMacaw(root: Group, geometry: BufferGeometry): void {
  const torso = root.getObjectByName('Torso');
  const upperArm = root.getObjectByName('UpperArmR');
  let body: SkinnedMesh | null = null;
  root.traverse((object) => {
    if (!body && object instanceof SkinnedMesh) body = object;
  });
  if (!(torso instanceof Bone) || !(upperArm instanceof Bone) || !body) return;
  const skinned: SkinnedMesh = body;
  root.updateMatrixWorld(true);
  const scale = root.getWorldScale(TEMP_VECTOR).x;
  const joint = upperArm.getWorldPosition(new Vector3());
  const side = Math.sign(root.worldToLocal(joint.clone()).x) || -1;

  const parrot = new Mesh(geometry, skinned.material);
  parrot.name = 'hero parrot';
  parrot.castShadow = true;
  parrot.receiveShadow = true;
  const local = root.worldToLocal(joint.clone());
  local.x -= side * (PERCH.inward / scale);
  local.y += PERCH.up / scale;
  local.z += PERCH.forward / scale;
  root.add(parrot);
  parrot.position.copy(local);
  parrot.rotation.y = side * PERCH.yaw;
  parrot.scale.setScalar(PERCH.scale);
  parrot.updateMatrixWorld(true);
  torso.attach(parrot);
}

/** Moves Ernest's blue, green, white, and orange onto the macaw cells, one triangle at a time. */
function repaintMacaw(geometry: BufferGeometry): void {
  const uv = geometry.getAttribute('uv');
  const position = geometry.getAttribute('position');
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    minX = Math.min(minX, position.getX(i));
    maxX = Math.max(maxX, position.getX(i));
  }
  const span = maxX - minX || 1;
  for (let tri = 0; tri < uv.count; tri += 3) {
    const cell = cellOf(uv.getX(tri), uv.getY(tri));
    let target: Cell | null = null;
    if (sameCell(cell, ERNEST.crest)) target = MACAW_CELLS.scarlet;
    else if (sameCell(cell, ERNEST.grey) && uv.getX(tri) < CHEST_MAX_U) target = MACAW_CELLS.scarlet;
    else if (sameCell(cell, ERNEST.beak)) target = MACAW_CELLS.horn;
    else if (sameCell(cell, ERNEST.wing)) {
      // Ernest's body runs tail (−x) to beak (+x): red shoulders, a gold band, blue tips.
      const t = ((position.getX(tri) + position.getX(tri + 1) + position.getX(tri + 2)) / 3 - minX) / span;
      target = t > 0.56 ? MACAW_CELLS.scarlet : t > 0.36 ? MACAW_CELLS.gold : MACAW_CELLS.blue;
    }
    if (!target) continue;
    const u = (target[0] * 32 + 16) / 1024;
    const v = (target[1] * 32 + 16) / 1024;
    for (let k = 0; k < 3; k += 1) uv.setXY(tri + k, u, v);
  }
  uv.needsUpdate = true;
}

function cellOf(u: number, v: number): Cell {
  return [Math.floor(u * 32), Math.floor(v * 32)];
}

function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function toFloat32(geometry: BufferGeometry): void {
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = geometry.getAttribute(name);
    if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) continue;
    const out = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i += 1) {
      for (let c = 0; c < attr.itemSize; c += 1) out[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
    geometry.setAttribute(name, new Float32BufferAttribute(out, attr.itemSize));
  }
}
