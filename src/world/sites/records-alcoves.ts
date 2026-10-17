import { Group, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three/webgpu';
import { unreflected } from '../reflection';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village/kit';
import { box, merge } from './geo';
import { mergeWithRigidParts } from './rigid-parts';
import { SignSet } from './sign';

/** Bay centres along the portico: the gaps between the hall's six columns, 2.45 m apart. */
const BAYS = [-4.9, -2.45, 0, 2.45, 4.9] as const;
/** The column line, out from the hall's front wall (the cabinets stand in it). */
const COLUMNS_Z = 1.85;
const CAB = { w: 1.42, d: 0.48, h: 3.0 } as const;
/** Each cabinet's two cubbies: the shelf each stands on, top row first; 0.88 m high. */
const SHELVES = [1.94, 0.74] as const;
const CUBBY_H = 0.88;
/** Pell's desk, in front of the middle cabinet. */
const DESK = { z: 3.0, w: 1.4, d: 0.62, h: 0.92 } as const;
const TRAY = { x: 0.42, z: DESK.z } as const;
const OAK = 0x9c6c3c;
const OAK_DARK = 0x7a5031;
const RECESS = 0x3e2c1d;
const PAPER = 0xf3e6c8;
const SEAL = 0x9b1c1c;

/** A held camera shot: the eye, and the point it looks at (the follow camera's `CameraShot`). */
export interface RecordsShot {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

export interface RecordsAlcove {
  readonly id: string;
  readonly name: string;
}

export interface RecordsAlcovesSite {
  readonly group: Group;
  readonly colliders: { boxes: VillageBoxCollider[] };
  /** Where you stand to sort the letters: in front of Pell's desk, facing the cabinets. */
  readonly desk: { x: number; y: number; z: number; heading: number };
  /** The desk itself (where E works from). */
  readonly deskTop: { x: number; z: number };
  /** The five cabinets and the desk, from the foot of the portico (the overlay's on the right). */
  readonly shot: RecordsShot;
  /** The first `filed` letters sit where they were filed; the rest wait on the desk. */
  setFiled(filed: number): void;
  /** Nothing moves on its own (filing places the letters); here for the island's site list. */
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * The Hall of Records' alcoves (P1.3, POC §6.5): five oak record cabinets standing between the
 * portico's columns, two cubbies each, one cubby per Settings area in the app's order (the top row
 * first, Projects last on a brown plate), a "Settings" board on the middle one, and Pell's desk in
 * front with the bundle of letters and his tray. A filed letter stands in its cubby (the decoy lies in
 * the tray). The cabinets stand in the column line, so no column hides a cubby from the front.
 * Everything's the village kit's wood and plaster plus one sign atlas (no new shader); the letters are
 * rigid parts of the plaster mesh, hidden at zero scale until they're filed.
 */
export function createRecordsAlcoves(o: {
  kit: VillageKit;
  /** The hall's front wall at the portico floor, its centre; `heading` faces out of the wall. */
  origin: VillageAnchor;
  /** In the app's order: the first five are the top row. */
  alcoves: readonly RecordsAlcove[];
  /** Each letter's answer, in the order they're handed over (an alcove id, or 'tray'). */
  letters: readonly string[];
  /** The cloth over the middle cabinet (the course pack's word for the bins: "Settings"). */
  crest: string;
}): RecordsAlcovesSite {
  const group = new Group();
  group.name = 'hall of records alcoves (P1.3)';
  // A Meridian site, so never in the Anchorage harbour mirror (PLAN §15.4).
  unreflected.add(group);
  const root = new Group();
  root.position.set(o.origin.x, o.origin.y, o.origin.z);
  root.rotation.y = o.origin.heading;
  group.add(root);
  root.updateMatrixWorld(true);

  const mats: Record<'wood' | 'plaster', Material> = {
    wood: o.kit.materials.wood,
    plaster: o.kit.materials.plaster,
  };
  const slot = (i: number) => ({ x: BAYS[i % BAYS.length]!, shelf: SHELVES[i < BAYS.length ? 0 : 1] });
  const slotOf = new Map(o.alcoves.map((a, i) => [a.id, slot(i)]));

  // The cabinets: a dark back, oak sides, shelves, a cap, and a rail under each cubby for its plate.
  const wood = [];
  const back = COLUMNS_Z - CAB.d / 2;
  const front = COLUMNS_Z + CAB.d / 2;
  const rail = SHELVES[0] - 0.04 - (SHELVES[1] + CUBBY_H + 0.04);
  for (const x of BAYS) {
    wood.push(box(CAB.w, CAB.h, 0.04, { x, z: back + 0.02 }, RECESS, 1.2));
    for (const side of [-1, 1])
      wood.push(box(0.07, CAB.h, CAB.d, { x: x + side * (CAB.w / 2 - 0.035), z: COLUMNS_Z }, OAK, 1.2));
    wood.push(box(CAB.w + 0.08, 0.1, CAB.d + 0.06, { x, y: CAB.h, z: COLUMNS_Z }, OAK_DARK));
    for (const shelf of SHELVES) {
      wood.push(box(CAB.w - 0.14, 0.04, CAB.d - 0.05, { x, y: shelf - 0.04, z: COLUMNS_Z + 0.02 }, OAK));
      wood.push(box(CAB.w - 0.14, 0.04, CAB.d - 0.05, { x, y: shelf + CUBBY_H, z: COLUMNS_Z + 0.02 }, OAK));
    }
    // The rail under the top cubby, and the plinth under the bottom one.
    wood.push(
      box(CAB.w - 0.14, rail, 0.03, { x, y: SHELVES[1] + CUBBY_H + 0.04, z: front - 0.015 }, OAK_DARK),
    );
    wood.push(box(CAB.w - 0.14, SHELVES[1] - 0.04, 0.03, { x, z: front - 0.015 }, OAK_DARK));
  }
  // Pell's desk and his tray.
  wood.push(box(DESK.w - 0.2, DESK.h - 0.06, DESK.d - 0.16, { z: DESK.z }, OAK_DARK));
  wood.push(box(DESK.w, 0.06, DESK.d, { y: DESK.h - 0.06, z: DESK.z }, OAK));
  wood.push(box(0.46, 0.02, 0.34, { x: TRAY.x, y: DESK.h, z: TRAY.z }, OAK_DARK));
  for (const [w, d, x, z] of [
    [0.46, 0.03, TRAY.x, TRAY.z - 0.155],
    [0.46, 0.03, TRAY.x, TRAY.z + 0.155],
    [0.03, 0.28, TRAY.x - 0.215, TRAY.z],
    [0.03, 0.28, TRAY.x + 0.215, TRAY.z],
  ] as const)
    wood.push(box(w, 0.06, d, { x, y: DESK.h, z }, OAK_DARK));
  const cabinets = new Mesh(merge(wood), mats.wood);
  cabinets.name = 'hall record cabinets';
  cabinets.castShadow = cabinets.receiveShadow = true;
  root.add(cabinets);

  // The letters: each is two rigid parts, its place in the bundle on the desk and its place once
  // filed; one of the two shows. Built in their own frame (an envelope standing up, facing +z).
  const envelope = () =>
    merge([
      box(0.3, 0.21, 0.012, { y: -0.105 }, PAPER, 6),
      box(0.05, 0.05, 0.006, { y: -0.025, z: 0.012 }, SEAL, 6),
    ]);
  const letters = mergeWithRigidParts(
    [],
    o.letters.flatMap(() => [envelope(), envelope()]),
    { bounds: true },
  );
  const paper = new Mesh(letters.geometry, mats.plaster);
  paper.name = 'lost letters';
  paper.castShadow = true;
  root.add(paper);

  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const one = new Vector3(1, 1, 1);
  const up = new Vector3(0, 1, 0);
  const zero = new Matrix4().makeScale(0, 0, 0);
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.14);
  /** On the desk: flat, in a slightly untidy stack (the next letter's on top). */
  const pileAt = (i: number) => {
    const k = o.letters.length - 1 - i;
    q.setFromAxisAngle(up, Math.sin(i * 2.3) * 0.25).multiply(flat);
    p.set(-0.3 + Math.sin(i * 1.7) * 0.03, DESK.h + 0.007 + k * 0.013, DESK.z + Math.cos(i * 1.3) * 0.03);
    return m.compose(p, q, one);
  };
  /** Filed: standing in its cubby, leaning on the back; the decoy lies in the tray. */
  const filedAt = (i: number) => {
    const s = slotOf.get(o.letters[i]!);
    if (!s) return m.compose(p.set(TRAY.x, DESK.h + 0.03, TRAY.z), flat, one);
    return m.compose(p.set(s.x, s.shelf + 0.115, COLUMNS_Z - 0.06), lean, one);
  };
  let shown = -1;
  const setFiled = (filed: number) => {
    if (filed === shown) return;
    shown = filed;
    for (let i = 0; i < o.letters.length; i++) {
      letters.set(i * 2, i < filed ? zero : pileAt(i));
      letters.set(i * 2 + 1, i < filed ? filedAt(i) : zero);
    }
    letters.commit();
  };
  setFiled(0);

  // Name plates under the cubbies (the last, Projects, on brown), and the crest on the middle cabinet.
  const signs = new SignSet('hall cubby plates');
  o.alcoves.forEach((a, i) => {
    const { x, shelf } = slot(i);
    const projects = i === o.alcoves.length - 1;
    const s = signs.add([a.name], 1.22, 0.22, {
      size: 0.12,
      fill: projects ? '#6b4a1f' : '#1f3a6b',
      colors: ['#f1dca6'],
    });
    s.object.position.set(x, shelf - 0.16, front + 0.008);
    root.add(s.object);
  });
  const crest = signs.add([o.crest], 1.3, 0.34, { look: 'cloth', size: 0.16, colors: ['#1f3a6b'] });
  crest.object.position.set(0, CAB.h + 0.28, front - 0.02);
  root.add(crest.object);
  const signMesh = signs.finalize();
  group.add(signMesh);
  signs.update();

  const world = (lx: number, ly: number, lz: number) =>
    new Vector3(lx, ly, lz).applyMatrix4(root.matrixWorld);
  // From above the portico steps and a little to the right, so the cabinets clear the overlay and
  // nobody at the desk hides a plate.
  const eye = world(2.8, 7.2, 11.0);
  const at = world(2.8, 1.5, COLUMNS_Z);
  const shot = { x: eye.x, y: eye.y, z: eye.z, tx: at.x, ty: at.y, tz: at.z };
  const stand = world(0, 0, DESK.z + 1.0);
  const desk = { x: stand.x, y: o.origin.y, z: stand.z, heading: o.origin.heading + Math.PI };
  const top = world(0, 0, DESK.z);
  const deskTop = { x: top.x, z: top.z };
  const collider = (lz: number, hx: number, hz: number, height: number): VillageBoxCollider => {
    const c = world(0, 0, lz);
    return { x: c.x, z: c.z, hx, hz, rot: o.origin.heading, height };
  };
  // The desk, and the row of cabinets (with the columns between them).
  const colliders = {
    boxes: [
      collider(DESK.z, DESK.w / 2, DESK.d / 2, DESK.h),
      collider(COLUMNS_Z, 6.2, CAB.d / 2 + 0.02, CAB.h),
    ],
  };

  return {
    group,
    colliders,
    desk,
    deskTop,
    shot,
    setFiled,
    update() {},
    dispose() {
      unreflected.delete(group);
      cabinets.geometry.dispose();
      letters.geometry.dispose();
      signs.dispose();
      group.clear();
    },
  };
}
