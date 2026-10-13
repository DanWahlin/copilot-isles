import {
  AdditiveBlending,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  Object3D,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import { color, sin } from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import { COVE } from '../layout';
import { deckHeightAt } from '../ship/lines';
import { world } from '../uniforms';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village/kit';
import { CRANE_CARGO, CRANE_FACINGS, lineTone, type LineTone } from './crane-logic';
import { box, cylinder, merge, paint, plank, TRIM } from './geo';
import { SignSet, type PaintedSign } from './sign';
import { createBerthFlags, createSloop, type Sloop } from './sloop';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

type CrateKind = 'ghost' | 'real';

export interface CraneSite {
  readonly group: Group;
  readonly sloops: readonly Sloop[];
  /** Walkable surfaces (none: the crane stands on the pier deck). */
  heightAt(x: number, z: number): number | null;
  /** `camera`: camera-only blockers (CollisionWorld.addCameraBox). */
  readonly colliders: {
    circles: CircleObstacle[];
    boxes: VillageBoxCollider[];
    camera: VillageBoxCollider[];
  };
  /** Keeps the brigantine off the moored sloops and their dolphins. */
  readonly shipObstacles: CircleObstacle[];
  readonly anchors: Record<string, VillageAnchor>;
  excludes(x: number, z: number): boolean;
  /** Slews to a facing (in CRANE_FACINGS order), animated unless `snap`. */
  setFacing(i: number, snap?: boolean): void;
  /** True while the crane is slewing or crates are being set down. */
  readonly busy: boolean;
  /** Lowers the four crates onto a berth one at a time; `onLand` fires as each one touches down. */
  drop(kind: CrateKind, facing: number, onLand?: (k: number) => void): Promise<void>;
  /** Shows `count` crates already landed (restoring a save). */
  showCrates(kind: CrateKind, facing: number, count: number): void;
  clearCrates(kind: CrateKind): void;
  setSign(lines: readonly string[]): void;
  /** Ticks the stores board for the first `n` cargo kinds. */
  setBoard(n: number): void;
  setBanner(open: boolean, snap?: boolean): void;
  /** The gold pulse round the capstan (hint tier 2). */
  setHint(on: boolean): void;
  pullLever(which: 'dry' | 'yes'): void;
  /** The pawl slams in: the crane shudders and won't lower anything. */
  refuse(): void;
  /** Where crates land on your ship: a point in `obj`'s frame (tracked every frame). */
  setShip(obj: Object3D, local: Vector3): void;
  /** World points for tests and hints. */
  spots(): { capstan: Vector3; dry: Vector3; yes: Vector3; board: Vector3 };
  update(dt: number, t: number): void;
  dispose(): void;
}

export interface CraneOptions {
  tier: TierSettings;
  kit: VillageKit;
  /** The island's shared sign atlas (finalized and updated by its owner); else the crane keeps its own. */
  signs?: SignSet;
}

const DECK = COVE.pier.deck;
/** Jib underside above the pier deck: clears the sloops' mastheads and the brigantine's fore course yard. */
const JIB_Y = 6.6;
const JIB_LEN = 7.0;
const TROLLEY_PARK = 3.3;
const SLEW_SPEED = 1.5;
const TROLLEY_SPEED = 1.8;
const CRATE = { w: 0.62, h: 0.5, d: 0.52 };
/** 2 × 2 on deck, in the target's frame. */
const STACK: readonly [number, number][] = [
  [-0.35, -0.3],
  [0.35, -0.3],
  [-0.35, 0.3],
  [0.35, 0.3],
];
/** Your brigantine's clear foredeck, port side (ship-local, forward of the foremast). */
export const BRIGANTINE_CARGO = new Vector3(1.4, deckHeightAt(6.2), 6.2);

const WOOD = 0xf2e4d2;
const WOOD_DARK = 0xd8c2a6;
const IRON = 0x6d6a66;
const ROPE = 0xe8d6b4;

/**
 * P0.2's set piece (POC §4.5): a timber slewing jib crane on the pier head. A capstan at its foot
 * swings it between the berths, a trolley runs out along the jib, and the hook lowers crates (ghosts
 * for a dry run, real ones for `--yes`). The painted `Repository:` sign hangs under the jib, the
 * Dry-Run and `--yes` levers stand before it, the stores board ticks off what lands, and a
 * "Setup complete." banner unfurls at the end. Two moored sloops and three berth flags complete it.
 *
 * The jib can't swing through the brigantine's fore rigging, so its angle stays on one arc (from
 * Berth 1 anticlockwise round to the quay); a turn from Berth 1 to the quay swings the long way.
 */
export function createCrane(o: CraneOptions): CraneSite {
  const { kit } = o;
  const C = COVE.crane;
  const pivot = new Vector3(C.x, DECK, C.z);
  const group = new Group();
  group.name = 'dry-run crane (P0.2)';

  // --- Moored sloops and berth flags --------------------------------------------------------------
  const sloops: Sloop[] = [];
  const berthFrames: ({ obj: Object3D; local: Vector3 } | null)[] = CRANE_FACINGS.map(() => null);
  const shipObstacles: CircleObstacle[] = [];
  for (const s of C.sloops) {
    const kind = s.berth === 2 ? 'captain' : 'guild';
    const sloop = createSloop({
      kit,
      tier: o.tier,
      flag: kind,
      accent: s.berth === 2 ? 0x2f7f86 : 0x8a2f2a,
      seed: s.berth * 7 + 3,
    });
    sloop.group.position.set(s.x, 0, s.z);
    sloop.group.rotation.y = s.heading;
    sloop.group.updateMatrixWorld(true);
    group.add(sloop.group);
    sloops.push(sloop);
    const facing = CRANE_FACINGS.findIndex((f) => f.berth === s.berth);
    // Set down just inboard of the centreline, clear of the topping lift.
    berthFrames[facing] = { obj: sloop.group, local: sloop.cargo.clone().add(new Vector3(0.45, 0, 0)) };
    const fx = Math.sin(s.heading),
      fz = Math.cos(s.heading);
    for (const along of [-3.1, 0, 3.1])
      shipObstacles.push({ x: s.x + fx * along, z: s.z + fz * along, r: 1.9 });
    const back = -(sloop.halfLength + 1.1);
    shipObstacles.push({ x: s.x + fx * back, z: s.z + fz * back, r: 1.2 });
  }
  const m = COVE.mooring;
  const shipProxy = new Object3D();
  shipProxy.position.set(m.x, 0, m.z);
  shipProxy.rotation.y = m.heading;
  shipProxy.updateMatrixWorld(true);
  const youFacing = CRANE_FACINGS.findIndex((f) => f.owner === 'you');
  berthFrames[youFacing] = { obj: shipProxy, local: BRIGANTINE_CARGO.clone() };
  const quayFacing = CRANE_FACINGS.findIndex((f) => !f.owner);

  const flags = [
    { berth: 1 as const, kind: 'you' as const, x: C.x + 2.15, y: DECK, z: C.z + 1.8, ry: 0 },
    { berth: 2 as const, kind: 'captain' as const, x: C.x - 2.15, y: DECK, z: C.z + 2.2, ry: 0 },
    { berth: 3 as const, kind: 'guild' as const, x: C.x - 2.0, y: DECK, z: C.z - 1.7, ry: 0 },
  ];
  // One flag mesh for all three; the poles and plaques join the base timber below.
  const berthFlags = createBerthFlags(flags);
  group.add(berthFlags.mesh);
  const ownSigns = o.signs ? null : new SignSet('crane signs');
  const signs = o.signs ?? ownSigns!;

  // Facing geometry: the jib heading and trolley reach that put the hook over each berth's cargo spot.
  const targetWorld = (i: number, out = new Vector3()): Vector3 => {
    const f = berthFrames[i];
    if (!f) return out.set(C.x, DECK, C.z + 4.4);
    f.obj.updateMatrixWorld();
    return out.copy(f.local).applyMatrix4(f.obj.matrixWorld);
  };
  const arc = (h: number) => (h < 1.0 ? h + Math.PI * 2 : h);
  const facingGeo = CRANE_FACINGS.map((_, i) => {
    const p = targetWorld(i);
    const dx = p.x - C.x,
      dz = p.z - C.z;
    return {
      angle: arc(Math.atan2(dx, dz)),
      reach: Math.min(JIB_LEN - 0.35, Math.max(2.8, Math.hypot(dx, dz))),
    };
  });

  // --- Fixed base on the pier deck -----------------------------------------------------------------
  const baseWood: BufferGeometry[] = [...berthFlags.poles];
  const baseIron: BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    baseWood.push(
      plank(
        2.6,
        0.16,
        0.5,
        { x: C.x, y: DECK, z: C.z - 1.04 + k * 0.52 },
        k % 2 ? WOOD_DARK : WOOD,
        TRIM.dark,
      ),
    );
  }
  baseIron.push(cylinder(0.66, 0.7, 0.07, { x: C.x, y: DECK + 0.16, z: C.z }, IRON, 24));
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    baseIron.push(
      cylinder(0.05, 0.05, 0.05, { x: C.x + sx * 1.12, y: DECK + 0.16, z: C.z + sz * 1.12 }, IRON, 6),
    );
  }

  // Levers: a timber stand each, an iron quadrant, and a painted plaque. The arms pivot toward you.
  const levers = {
    dry: { x: C.x - 1.25, z: C.z + 4.2, knob: 0x9ec6dc, label: '--dry-run' },
    yes: { x: C.x + 1.25, z: C.z + 4.2, knob: 0xc4523f, label: '--yes' },
  };
  for (const l of Object.values(levers)) {
    baseWood.push(plank(0.44, 0.62, 0.34, { x: l.x, y: DECK, z: l.z }, WOOD_DARK, TRIM.dark));
    baseWood.push(plank(0.52, 0.06, 0.42, { x: l.x, y: DECK + 0.62, z: l.z }, WOOD, TRIM.light));
    baseIron.push(box(0.05, 0.26, 0.3, { x: l.x - 0.12, y: DECK + 0.68, z: l.z }, IRON, 1, true));
    baseIron.push(box(0.05, 0.26, 0.3, { x: l.x + 0.12, y: DECK + 0.68, z: l.z }, IRON, 1, true));
  }

  // The stores board on two posts at the pier head's east corner (beside your berth), facing the
  // levers and the walk up the pier, clear of the view from the levers to the capstan.
  const BOARD = { w: 1.5, h: 1.2 };
  const boardAt = { x: C.x + 1.65, z: C.z - 1.45 };
  for (const dx of [-0.7, 0.7])
    baseWood.push(
      plank(0.1, 2.3, 0.1, { x: boardAt.x + dx, y: DECK, z: boardAt.z - 0.02 }, WOOD_DARK, TRIM.dark),
    );

  const baseWoodMesh = new Mesh(merge(baseWood), kit.materials.wood);
  baseWoodMesh.name = 'crane base timber';
  const baseIronMesh = new Mesh(merge(baseIron), kit.materials.metal);
  baseIronMesh.name = 'crane base iron';
  for (const mesh of [baseWoodMesh, baseIronMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  group.add(baseWoodMesh, baseIronMesh);

  const leverArms: Record<'dry' | 'yes', { pivot: Group; t: number }> = {
    dry: makeLever(levers.dry),
    yes: makeLever(levers.yes),
  };
  function makeLever(l: (typeof levers)['dry']): { pivot: Group; t: number } {
    const g = new Group();
    g.position.set(l.x, DECK + 0.76, l.z);
    const arm = new Mesh(
      merge([
        plank(0.06, 0.78, 0.06, { y: 0 }, WOOD, TRIM.light),
        paint(new CylinderGeometry(0.075, 0.075, 0.2, 10).rotateZ(Math.PI / 2).translate(0, 0.8, 0), l.knob),
      ]),
      kit.materials.wood,
    );
    arm.castShadow = true;
    g.add(arm);
    g.rotation.x = -0.45;
    group.add(g);
    const plaque = signs.add([l.label], 0.5, 0.2, { size: 0.16 });
    plaque.object.position.set(l.x, DECK + 0.4, l.z + 0.176);
    group.add(plaque.object);
    return { pivot: g, t: -1 };
  }

  const board: PaintedSign = signs.add(boardLines(0), BOARD.w, BOARD.h, { layout: 'list' });
  board.object.position.set(boardAt.x, DECK + 1.6, boardAt.z + 0.04);
  group.add(board.object);

  // --- The slewing crane -----------------------------------------------------------------------------
  const slew = new Group();
  slew.name = 'crane (slewing)';
  slew.position.copy(pivot);
  group.add(slew);
  const wood: BufferGeometry[] = [];
  const iron: BufferGeometry[] = [];
  const rope: BufferGeometry[] = [];
  // Capstan drum, bands, and bars (at 45° to the jib so none points along it).
  wood.push(cylinder(0.4, 0.44, 0.9, { y: 0.23 }, WOOD_DARK, 14));
  for (const y of [0.3, 1.02]) iron.push(cylinder(0.455, 0.455, 0.05, { y }, IRON, 14));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    wood.push(
      plank(
        0.07,
        0.07,
        1.0,
        { x: Math.sin(a) * 0.82, y: 0.92, z: Math.cos(a) * 0.82, ry: a },
        WOOD,
        TRIM.light,
      ),
    );
  }
  for (let k = 0; k < 6; k++) rope.push(cylinder(0.46, 0.46, 0.035, { y: 0.45 + k * 0.045 }, ROPE, 14));
  // King post (it runs up past the jib), braces, and the jib and counter-jib.
  const postTop = JIB_Y + 2.2;
  wood.push(plank(0.38, postTop - 1.13, 0.38, { y: 1.13 }, WOOD, TRIM.dark));
  wood.push(plank(0.26, 0.34, JIB_LEN + 0.3, { y: JIB_Y, z: JIB_LEN / 2 - 0.15 }, WOOD, TRIM.light));
  wood.push(plank(0.24, 0.3, 2.3, { y: JIB_Y + 0.02, z: -1.25 }, WOOD_DARK, TRIM.dark));
  wood.push(strut(new Vector3(0, JIB_Y - 1.9, 0.19), new Vector3(0, JIB_Y, 2.3), 0.16, WOOD_DARK));
  wood.push(strut(new Vector3(0, JIB_Y - 1.2, -0.19), new Vector3(0, JIB_Y + 0.02, -1.5), 0.14, WOOD_DARK));
  for (const y of [JIB_Y - 0.08, JIB_Y + 0.4, postTop - 0.25])
    iron.push(box(0.42, 0.06, 0.42, { y }, IRON, 1, true));
  // Tie rods from the post head to the jib tip and the counter-jib end.
  iron.push(rod(new Vector3(0, postTop - 0.1, 0.1), new Vector3(0, JIB_Y + 0.34, JIB_LEN - 0.2), 0.022));
  iron.push(rod(new Vector3(0, postTop - 0.1, -0.1), new Vector3(0, JIB_Y + 0.32, -2.3), 0.022));
  // The sign's chains hang from the jib (they slew with it).
  const SIGN = { w: 2.7, h: 1.0, top: JIB_Y - 1.7, z: 2.0 };
  iron.push(cylinder(0.014, 0.014, JIB_Y - SIGN.top, { y: SIGN.top + 0.02, z: SIGN.z }, IRON, 4));
  // Sheave at the jib tip and a rail strip along the jib's underside.
  iron.push(
    paint(
      new CylinderGeometry(0.16, 0.16, 0.08, 14)
        .rotateZ(Math.PI / 2)
        .translate(0, JIB_Y - 0.02, JIB_LEN - 0.1),
      IRON,
    ),
  );
  iron.push(box(0.3, 0.03, JIB_LEN - 1.4, { y: JIB_Y - 0.03, z: (JIB_LEN - 1.4) / 2 + 1.0 }, IRON, 1, true));
  const woodMesh = new Mesh(merge(wood), kit.materials.wood);
  woodMesh.name = 'crane timber';
  const ironMesh = new Mesh(merge(iron), kit.materials.metal);
  ironMesh.name = 'crane ironwork';
  const ropeMesh = new Mesh(merge(rope), kit.materials.rope);
  ropeMesh.name = 'crane capstan rope';
  // Counterweight: a stone box hung under the counter-jib.
  const weight = new Mesh(
    merge([box(0.8, 0.7, 0.7, { y: JIB_Y - 0.95, z: -1.85 }, 0xe2d2b8, 0.9, true)]),
    kit.materials.stone,
  );
  weight.name = 'crane counterweight';
  for (const mesh of [woodMesh, ironMesh, ropeMesh, weight]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    slew.add(mesh);
  }

  // Trolley (moves along the jib) and the hook block with its rope.
  const trolley = new Mesh(
    merge([
      box(0.06, 0.28, 0.46, { x: -0.16, y: JIB_Y - 0.22 }, IRON, 1, true),
      box(0.06, 0.28, 0.46, { x: 0.16, y: JIB_Y - 0.22 }, IRON, 1, true),
      paint(
        new CylinderGeometry(0.1, 0.1, 0.28, 12).rotateZ(Math.PI / 2).translate(0, JIB_Y - 0.14, 0),
        IRON,
      ),
    ]),
    kit.materials.metal,
  );
  trolley.castShadow = true;
  slew.add(trolley);
  const hookGeo = merge([
    box(0.2, 0.22, 0.14, { y: -0.22 }, IRON, 1, true),
    cylinder(0.02, 0.02, 0.18, { y: -0.4 }, IRON, 6),
    paint(new TorusGeometry(0.08, 0.018, 6, 12, Math.PI * 1.4).translate(0, -0.46, 0), IRON),
  ]);
  const hook = new Mesh(hookGeo, kit.materials.metal);
  hook.castShadow = true;
  group.add(hook);
  const hookRope = new Mesh(merge([cylinder(0.018, 0.018, 1, { y: -1 }, ROPE, 6)]), kit.materials.rope);
  group.add(hookRope);

  // The Repository: sign hangs from a swivel under the jib and always turns to face the levers
  // (two-sided, so it reads from the pier head too). It swings a little as the crane slews.
  const signHang = new Group();
  signHang.position.set(0, SIGN.top, SIGN.z);
  slew.add(signHang);
  const sign = signs.add(jibLines(['Repository:', '(pull Dry-Run to preview)']), SIGN.w, SIGN.h, {
    twoSided: true,
    offsetY: -SIGN.h / 2 - 0.34,
  });
  signHang.add(sign.object);
  const bridle = new Mesh(
    merge([
      rod(new Vector3(0, 0, 0), new Vector3(-SIGN.w * 0.42, -0.34, 0), 0.01),
      rod(new Vector3(0, 0, 0), new Vector3(SIGN.w * 0.42, -0.34, 0), 0.01),
      paint(new TorusGeometry(0.05, 0.012, 5, 10), IRON),
    ]),
    kit.materials.metal,
  );
  signHang.add(bridle);
  let signYaw = 0;
  let lastSlew = 0;
  const banner = signs.add(['Setup complete.'], 3.0, 0.8, {
    look: 'cloth',
    twoSided: true,
    size: 0.13,
    offsetY: -0.4,
  });
  banner.object.position.set(0, JIB_Y - 0.04, 5.3);
  banner.object.rotation.y = Math.PI / 2;
  banner.object.visible = false;
  slew.add(banner.object);
  if (ownSigns) group.add(ownSigns.finalize());

  // Hint ring round the capstan bars.
  const hintMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  hintMat.color.setHex(0xffc45a);
  hintMat.opacity = 0.8;
  const hintRing = new Mesh(new TorusGeometry(1.36, 0.035, 6, 48).rotateX(Math.PI / 2), hintMat);
  hintRing.position.set(C.x, DECK + 0.95, C.z);
  hintRing.visible = false;
  hintRing.renderOrder = 3;
  group.add(hintRing);

  // --- Crates ------------------------------------------------------------------------------------------
  const crateGeos = CRANE_CARGO.map((c) => crateGeometry(c.prop));
  const ghostMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  ghostMat.colorNode = color(0xc6ecff).mul(sin(world.time.mul(2.4)).mul(0.1).add(1.05)) as AnyNode;
  ghostMat.opacity = 0.42;
  const makeCrates = (kind: CrateKind) =>
    crateGeos.map((g, k) => {
      const mesh = new Mesh(g, kind === 'ghost' ? ghostMat : kit.materials.wood);
      mesh.name = `${kind} crate: ${CRANE_CARGO[k]!.id}`;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      mesh.castShadow = kind === 'real';
      mesh.renderOrder = kind === 'ghost' ? 2 : 0;
      group.add(mesh);
      return mesh;
    });
  const crates: Record<CrateKind, Mesh[]> = { ghost: makeCrates('ghost'), real: makeCrates('real') };
  const shown: Record<CrateKind, { facing: number; count: number }> = {
    ghost: { facing: -1, count: 0 },
    real: { facing: -1, count: 0 },
  };

  // --- State ------------------------------------------------------------------------------------------
  let angle = facingGeo[0]!.angle;
  let targetAngle = angle;
  let reach = TROLLEY_PARK;
  let targetReach = facingGeo[0]!.reach;
  let bannerT = 0;
  let bannerTarget = 0;
  let shake = 0;
  let hintOn = false;
  let clock = 0;
  interface Drop {
    kind: CrateKind;
    facing: number;
    k: number;
    t: number;
    onLand?: (k: number) => void;
    resolve: () => void;
  }
  let dropping: Drop | null = null;

  const mtx = new Matrix4();
  const off = new Vector3();
  const tmp = new Vector3();
  const tmpB = new Vector3();
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();

  /** World matrix for crate `k` resting on `facing`'s cargo spot. */
  const restMatrix = (facing: number, k: number, out: Matrix4): Matrix4 => {
    const f = berthFrames[facing];
    if (!f) return out.makeTranslation(C.x, DECK, C.z + 4.4);
    const [ox, oz] = STACK[k]!;
    off.set(f.local.x + ox, f.local.y, f.local.z + oz);
    f.obj.updateMatrixWorld();
    return out.copy(f.obj.matrixWorld).multiply(mtx.makeTranslation(off.x, off.y, off.z));
  };
  const trolleyWorld = (out: Vector3) =>
    out
      .set(0, JIB_Y - 0.26, reach)
      .applyAxisAngle(up, angle + shakeYaw())
      .add(pivot);
  const slewing = () => Math.abs(angle - targetAngle) > 1e-3 || Math.abs(reach - targetReach) > 1e-3;
  const shakeYaw = () => (shake > 0 ? Math.sin(clock * 55) * 0.012 * shake : 0);

  const placeRope = (top: Vector3, bottom: Vector3) => {
    const d = tmpB.copy(bottom).sub(top);
    const len = Math.max(0.05, d.length());
    hookRope.position.copy(top);
    q.setFromUnitVectors(tmp.set(0, -1, 0), d.normalize());
    hookRope.quaternion.copy(q);
    hookRope.scale.set(1, len, 1);
  };

  const flagSpots = flags.map((f) => ({ x: f.x, z: f.z, r: 0.14 }));
  const circles: CircleObstacle[] = [
    { x: C.x, z: C.z, r: 1.45 },
    { x: levers.dry.x, z: levers.dry.z, r: 0.32 },
    { x: levers.yes.x, z: levers.yes.z, r: 0.32 },
    { x: boardAt.x - 0.7, z: boardAt.z, r: 0.12 },
    { x: boardAt.x + 0.7, z: boardAt.z, r: 0.12 },
    ...flagSpots,
  ];

  const anchors: Record<string, VillageAnchor> = {
    // Up the pier from the lamp post, meeting you as you walk out: 4 m clear of the gangway and
    // the lever spots so neither pair steals the boarding or lever prompts.
    pim: { x: C.x - 1.3, y: DECK, z: C.z + 12.4, heading: 0.4 },
    pol: { x: C.x + 1.3, y: DECK, z: C.z + 12.4, heading: -0.4 },
    craneCapstan: { x: C.x, y: DECK, z: C.z + 2.0, heading: Math.PI },
    craneDry: { x: levers.dry.x, y: DECK, z: levers.dry.z + 0.8, heading: Math.PI },
    craneYes: { x: levers.yes.x, y: DECK, z: levers.yes.z + 0.8, heading: Math.PI },
    /** Old Finn's fishing spot, moved down the pier from the crane. */
    finn: { x: COVE.pier.x - 1.85, y: DECK, z: -104.5, heading: -Math.PI / 2 },
  };

  function boardLines(n: number): string[] {
    return [
      'Practice items for your fork',
      ...CRANE_CARGO.map((c, k) => `${k < n ? '✓' : '○'}  ${c.count} ${c.title.toLowerCase()}`),
    ];
  }

  return {
    group,
    sloops,
    heightAt: () => null,
    // Camera only: the king post and the feet of its braces (they stay round the post as the jib slews).
    colliders: {
      circles,
      boxes: [],
      camera: [{ x: C.x, z: C.z, hx: 0.45, hz: 0.45, rot: 0, y0: DECK, y1: DECK + JIB_Y + 2.3 }],
    },
    shipObstacles,
    anchors,
    excludes: () => false,
    setFacing(i, snap = false) {
      const g = facingGeo[i];
      if (!g) return;
      targetAngle = g.angle;
      targetReach = g.reach;
      if (snap) {
        angle = targetAngle;
        reach = targetReach;
      }
    },
    get busy() {
      return dropping !== null || slewing();
    },
    drop(kind, facing, onLand) {
      if (facing === quayFacing) return Promise.resolve();
      crates[kind].forEach((c) => (c.visible = false));
      shown[kind] = { facing, count: 0 };
      return new Promise<void>((resolve) => {
        dropping = { kind, facing, k: 0, t: 0, onLand, resolve };
      });
    },
    showCrates(kind, facing, count) {
      shown[kind] = { facing, count: Math.min(4, count) };
    },
    clearCrates(kind) {
      shown[kind] = { facing: -1, count: 0 };
      crates[kind].forEach((c) => (c.visible = false));
    },
    setSign(lines) {
      const shown = jibLines(lines);
      sign.redraw(shown, { colors: shown.map(inkFor) });
    },
    setBoard(n) {
      board.redraw(boardLines(n), {
        colors: [undefined, ...CRANE_CARGO.map((_, k) => (k < n ? '#ffd98a' : '#cdb894'))],
      });
    },
    setBanner(open, snap = false) {
      bannerTarget = open ? 1 : 0;
      if (snap) bannerT = bannerTarget;
    },
    setHint(on) {
      hintOn = on;
      hintRing.visible = on;
    },
    pullLever(which) {
      leverArms[which].t = 0;
    },
    refuse() {
      shake = 1;
    },
    setShip(obj, local) {
      berthFrames[youFacing] = { obj, local: local.clone() };
    },
    spots() {
      return {
        capstan: new Vector3(C.x, DECK, C.z),
        dry: new Vector3(levers.dry.x, DECK, levers.dry.z),
        yes: new Vector3(levers.yes.x, DECK, levers.yes.z),
        board: new Vector3(boardAt.x, DECK, boardAt.z),
      };
    },
    update(dt, t) {
      clock = t;
      // Slew first, then run the trolley out.
      const da = targetAngle - angle;
      if (Math.abs(da) > 1e-3) {
        angle += Math.sign(da) * Math.min(Math.abs(da), SLEW_SPEED * dt);
        reach += (TROLLEY_PARK - reach) * Math.min(1, dt * 3);
      } else {
        angle = targetAngle;
        const dr = targetReach - reach;
        reach += Math.sign(dr) * Math.min(Math.abs(dr), TROLLEY_SPEED * dt);
      }
      shake = Math.max(0, shake - dt * 1.4);
      slew.rotation.y = angle + shakeYaw();
      // The swivel drags the sign round a little as the jib turns; its world yaw then settles back
      // to 0 (facing the levers).
      signYaw += (slew.rotation.y - lastSlew) * 0.45;
      lastSlew = slew.rotation.y;
      signYaw -= signYaw * Math.min(1, dt * 2.2);
      signHang.rotation.y = signYaw - slew.rotation.y;
      signHang.rotation.z = Math.sin(t * 0.9) * 0.012;
      trolley.position.z = reach;
      slew.updateMatrixWorld();

      // Crates at rest (they ride along with whatever they sit on).
      for (const kind of ['ghost', 'real'] as const) {
        const s = shown[kind];
        crates[kind].forEach((c, k) => {
          const rest = s.facing >= 0 && k < s.count && !(dropping?.kind === kind && dropping.k === k);
          c.visible = rest;
          if (rest) restMatrix(s.facing, k, c.matrix);
        });
      }

      // The hook: hanging under the trolley, or lowering the current crate.
      const top = trolleyWorld(tmp.set(0, 0, 0)).clone();
      let hookAt = tmpB
        .copy(top)
        .add(off.set(0, -0.9, 0))
        .clone();
      if (dropping && !slewing()) {
        const d = dropping;
        d.t += dt;
        const c = crates[d.kind][d.k]!;
        restMatrix(d.facing, d.k, mtx);
        const land = new Vector3().setFromMatrixPosition(mtx);
        const start = top.clone().add(off.set(0, -0.62 - CRATE.h, 0));
        const APPEAR = 0.25,
          FALL = 0.85;
        const u = Math.min(1, Math.max(0, (d.t - APPEAR) / FALL));
        const e = u * u * (3 - 2 * u);
        const p = start.lerp(land, e);
        const s = Math.min(1, d.t / APPEAR);
        mtx.setPosition(p);
        c.matrix.copy(mtx).multiply(new Matrix4().makeScale(s, s, s));
        c.visible = true;
        hookAt = p.clone().add(off.set(0, CRATE.h + 0.5, 0));
        if (u >= 1) {
          shown[d.kind] = { facing: d.facing, count: d.k + 1 };
          d.onLand?.(d.k);
          d.k += 1;
          d.t = 0;
          if (d.k >= STACK.length) {
            dropping = null;
            d.resolve();
          }
        }
      }
      hook.position.copy(hookAt);
      hook.rotation.y = angle;
      placeRope(top, tmp.copy(hookAt).add(off.set(0, -0.2, 0)));

      // Levers spring back after a pull.
      for (const l of Object.values(leverArms)) {
        if (l.t < 0) continue;
        l.t += dt;
        const pull = l.t < 0.15 ? l.t / 0.15 : l.t < 0.7 ? 1 : Math.max(0, 1 - (l.t - 0.7) / 0.45);
        l.pivot.rotation.x = -0.45 + pull * 1.0;
        if (l.t > 1.2) l.t = -1;
      }

      bannerT += (bannerTarget - bannerT) * Math.min(1, dt * 1.6);
      banner.object.visible = bannerT > 0.01;
      banner.object.scale.y = Math.max(0.001, bannerT);
      if (hintOn) hintMat.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 4));
      for (const s of sloops) s.update(dt, t);
      berthFlags.update(dt, t);
      ownSigns?.update();
    },
    dispose() {
      for (const s of sloops) s.dispose();
      berthFlags.dispose();
      ownSigns?.dispose();
      for (const g of crateGeos) g.dispose();
      ghostMat.dispose();
      hintMat.dispose();
      group.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh && !crateGeos.includes(mesh.geometry)) mesh.geometry.dispose();
      });
      group.removeFromParent();
    },
  };
}

/**
 * The arm sign's lettering: a `Repository: owner/name` line splits so the owner gets a line of its
 * own, big enough to read from the levers.
 */
function jibLines(lines: readonly string[]): string[] {
  return lines.flatMap((l) => {
    if (l.startsWith('Default branch')) return [];
    const m = /^Repository: (.+?)\/(.+)$/.exec(l);
    return m ? ['Repository:', `${m[1]}/`, m[2]!] : [l];
  });
}

const INK: Record<LineTone, string> = { cmd: '#9fb6c4', you: '#ffd98a', other: '#ffb09a', ok: '#b9ef9c' };

/** Ink per line: your fork in gold, anyone else's (and refusals) in coral, success in green. */
function inkFor(line: string): string | undefined {
  const tone = lineTone(line);
  return tone ? INK[tone] : undefined;
}

/** A timber between two points (in the slewing group's frame). */
function strut(a: Vector3, b: Vector3, w: number, hex: number): BufferGeometry {
  const d = b.clone().sub(a);
  const len = d.length();
  const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  const yaw = Math.atan2(d.x, d.z);
  const g = plank(w, w, len, { y: -w / 2 }, hex, TRIM.dark);
  g.translate(0, 0, len / 2);
  g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(-pitch, yaw, 0, 'YXZ')));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** An iron tie rod between two points. */
function rod(a: Vector3, b: Vector3, r: number): BufferGeometry {
  const d = b.clone().sub(a);
  const g = new CylinderGeometry(r, r, d.length(), 5);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(a.x, a.y, a.z);
  return paint(g, IRON);
}

/** One cargo crate (origin at its base centre) with its kind's marker on the lid. */
function crateGeometry(prop: (typeof CRANE_CARGO)[number]['prop']): BufferGeometry {
  const { w, h, d } = CRATE;
  const parts: BufferGeometry[] = [plank(w, h, d, { y: 0 }, 0xf0dcbc, TRIM.light)];
  // Battens round the edges.
  for (const y of [0.02, h - 0.07]) {
    parts.push(plank(w + 0.02, 0.06, 0.04, { y, z: d / 2 }, 0xc9a77e, TRIM.dark));
    parts.push(plank(w + 0.02, 0.06, 0.04, { y, z: -d / 2 }, 0xc9a77e, TRIM.dark));
  }
  for (const x of [-w / 2, w / 2]) parts.push(plank(0.04, h, d + 0.02, { x, y: 0 }, 0xc9a77e, TRIM.dark));
  const lid = h + 0.001;
  switch (prop) {
    case 'pennants': {
      // A string of coloured pennants between two sticks.
      parts.push(cylinder(0.012, 0.012, 0.32, { x: -0.24, y: lid }, 0x7a5a3a, 4));
      parts.push(cylinder(0.012, 0.012, 0.32, { x: 0.24, y: lid }, 0x7a5a3a, 4));
      [0xd24a3a, 0xf0c040, 0x3f7fc4, 0x4aa05a].forEach((hex, k) => {
        const g = new CylinderGeometry(0.06, 0.06, 0.012, 3);
        g.rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
        g.translate(-0.16 + k * 0.107, lid + 0.24, 0);
        parts.push(paint(g, hex));
      });
      break;
    }
    case 'notices':
      // Pinned bounty notices on the lid and the front.
      parts.push(box(0.2, 0.006, 0.26, { x: -0.12, y: lid, ry: 0.15 }, 0xfff4dc, 1, true));
      parts.push(box(0.2, 0.006, 0.26, { x: 0.13, y: lid + 0.004, ry: -0.2 }, 0xfff0d0, 1, true));
      parts.push(box(0.22, 0.26, 0.006, { y: 0.12, z: d / 2 + 0.02 }, 0xfff4dc, 1, true));
      parts.push(cylinder(0.02, 0.02, 0.012, { x: 0.13, y: lid + 0.01, z: -0.08 }, 0xb03a2a, 8));
      break;
    case 'hulls': {
      // Two little practice hulls on the lid.
      for (const x of [-0.13, 0.13]) {
        const g = new CylinderGeometry(0.07, 0.07, 0.4, 10, 1, false, Math.PI / 2, Math.PI);
        g.rotateX(Math.PI / 2).rotateZ(Math.PI);
        g.scale(1, 0.8, 1);
        g.translate(x, lid + 0.06, 0);
        parts.push(paint(g, 0xb98a5a));
      }
      break;
    }
    case 'seals': {
      // A tied scroll with a red wax seal.
      const s = new CylinderGeometry(0.06, 0.06, 0.42, 10);
      s.rotateZ(Math.PI / 2).translate(0, lid + 0.06, -0.05);
      parts.push(paint(s, 0xfff0d2));
      const seal = new CylinderGeometry(0.055, 0.055, 0.02, 12);
      seal.rotateX(Math.PI / 2).translate(0.05, lid + 0.06, 0.02);
      parts.push(paint(seal, 0xa3261e));
      break;
    }
  }
  return merge(parts);
}
