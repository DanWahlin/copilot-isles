import {
  BufferGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { unreflected } from '../reflection';

/**
 * Wingman's flight. The shoulder parrot is a static baked mesh, so for a flight the perched one
 * hides and a flyer takes its exact place: the same geometry and material (+0 programs) plus two
 * spread wings built here, which flap about the shoulders. It lifts off, hovers in front of and
 * above the captain facing the camera while he talks, then glides back and lands on the shoulder.
 */

export type FlightPhase = 'perched' | 'takeoff' | 'hover' | 'landing';

/**
 * What the flyer needs each frame: the captain (feet), their height, the camera, and which way is
 * "in front" (the captain's facing for a framed intro; by default, where the camera looks).
 */
export interface FlightView {
  readonly captain: Vector3;
  readonly height: number;
  readonly eye: Vector3;
  readonly ahead?: { readonly x: number; readonly z: number } | null;
}

type Cell = readonly [col: number, row: number];
interface WingPalette {
  readonly covert: Cell;
  readonly band: Cell;
  readonly flight: Cell;
  readonly tip: Cell;
}

/** Ernest is blue with a green head and dark flight-feather tips; the macaw scarlet, gold, and blue. */
const PALETTES: Record<'ernest' | 'macaw', WingPalette> = {
  ernest: { covert: [16, 7], band: [19, 7], flight: [19, 7], tip: [21, 7] },
  macaw: { covert: [0, 20], band: [1, 20], flight: [2, 20], tip: [2, 20] },
};

/**
 * The right wing's outline seen from above, in the baked parrot's units (it stands 0.57 tall and
 * runs 0.85 beak to tail): x out from the shoulder, z forward. Leading edge to the tip, then the
 * primaries and secondaries back along the trailing edge. The wing is a fan from HUB, so every
 * point has to turn the same way around it (the notches between feathers point at the hub).
 */
const OUTLINE: readonly (readonly [x: number, z: number])[] = [
  [0, 0.1],
  [0.12, 0.118],
  [0.25, 0.096],
  [0.37, 0.05],
  [0.5, -0.03],
  [0.462, -0.085],
  [0.383, -0.107],
  [0.405, -0.16],
  [0.319, -0.155],
  [0.315, -0.21],
  [0.236, -0.173],
  [0.205, -0.215],
  [0.151, -0.187],
  [0.09, -0.2],
  [0, -0.14],
];
const HUB: readonly [x: number, z: number] = [0.17, -0.03];
const WING_SPAN = 0.5;

const TAKEOFF_S = 0.95;
const LANDING_S = 1.15;
/** Hover spot relative to the captain's head: ahead (toward where the camera looks), up, and aside. */
export const HOVER = { ahead: 1.2, up: 0.34, aside: 0.45 };

const UP = new Vector3(0, 1, 0);
const TMP_M = new Matrix4();
const TMP_V = new Vector3();
const TMP_V2 = new Vector3();
const TMP_E = new Euler(0, 0, 0, 'YXZ');

/**
 * Wingbeats per second and their size for each part of the flight. They're slow and soft on
 * purpose: at a real parrot's rate the wings flicker in the corner of a talking close-up.
 */
export const WINGBEAT = {
  takeoff: { hz: 3.2, amp: 0.95 },
  hover: { hz: 2.2, amp: 0.62 },
  glide: { hz: 1.8, amp: 0.3 },
  flare: { hz: 3.4, amp: 0.85 },
} as const;

/** How quickly the beat eases to a new rate and size (per second), so it never jumps. */
const BEAT_EASE = 3;

/** Wing angles for a flap phase (radians) and how open the wings are (0 folded, 1 spread). */
export function wingPose(
  phase: number,
  open: number,
  amp: number,
): { flap: number; sweep: number; twist: number; scale: number } {
  // The downstroke is quicker than the upstroke.
  const wave = Math.cos(phase + 0.35 * Math.sin(phase));
  const k = MathUtils.clamp(open, 0, 1);
  return {
    flap: MathUtils.lerp(-0.3, 0.18 + amp * wave, k),
    sweep: MathUtils.lerp(1.38, 0.1 + 0.22 * Math.sin(phase) * amp, k),
    twist: 0.18 * Math.sin(phase) * amp * k,
    scale: MathUtils.lerp(0.34, 1, k),
  };
}

/** Where Wingman hovers: above and ahead of the captain's head as the camera sees it, on his side. */
export function hoverPoint(view: FlightView, side: number, out = new Vector3()): Vector3 {
  const [ax, az] = aheadOf(view);
  // Screen-right of a view along (ax, az) is (-az, ax).
  return out.set(
    view.captain.x + ax * HOVER.ahead - az * HOVER.aside * side,
    view.captain.y + view.height + HOVER.up,
    view.captain.z + az * HOVER.ahead + ax * HOVER.aside * side,
  );
}

export class ParrotFlight {
  readonly root = new Group();
  private readonly pose = new Group();
  private readonly align = new Group();
  private readonly wings: readonly [Mesh, Mesh];
  private readonly alignInverse = new Matrix4();
  private state: FlightPhase = 'perched';
  private u = 0;
  private flapPhase = 0;
  private beatHz: number = WINGBEAT.takeoff.hz;
  private beatAmp: number = WINGBEAT.takeoff.amp;
  private time = 0;
  private side = 1;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  /** 0 → 1 while he hovers: how much of his slow talking sway (head turn and tilt) shows. */
  private sway = 0;
  private readonly pos = new Vector3();
  private readonly from = new Vector3();
  private readonly fromQ = new Quaternion();
  private readonly perchPos = new Vector3();
  private readonly perchQ = new Quaternion();
  private readonly perchScale = new Vector3();
  private readonly target = new Vector3();
  private readonly flyQ = new Quaternion();

  /** Finds the hero's shoulder parrot; null for characters without one. */
  static attach(hero: Object3D, scene: Object3D): ParrotFlight | null {
    const perched = hero.getObjectByName('hero parrot');
    if (!(perched instanceof Mesh) || !(perched.geometry instanceof BufferGeometry)) return null;
    return new ParrotFlight(perched, scene);
  }

  private constructor(
    private readonly perched: Mesh,
    scene: Object3D,
  ) {
    const geometry = perched.geometry as BufferGeometry;
    const frame = bodyFrame(geometry);
    const material = perched.material as Material;
    const body = new Mesh(geometry, material);
    body.name = 'wingman body';
    body.castShadow = true;
    body.receiveShadow = true;
    this.align.rotation.y = -frame.yaw;
    this.align.position.copy(frame.hinge).multiplyScalar(-1);
    this.align.add(body);
    this.align.updateMatrix();
    this.alignInverse.copy(this.align.matrix).invert();

    const palette = PALETTES[geometry.name === 'macaw' ? 'macaw' : 'ernest'];
    const right = new Mesh(buildWing(palette, 1), material);
    const left = new Mesh(buildWing(palette, -1), material);
    right.position.set(frame.halfWidth, 0, 0);
    left.position.set(-frame.halfWidth, 0, 0);
    for (const w of [right, left]) {
      w.castShadow = true;
      w.name = 'wingman wing';
    }
    this.wings = [right, left];
    this.pose.add(this.align, right, left);
    this.root.add(this.pose);
    this.root.name = 'wingman flight';
    this.root.visible = false;
    // Hidden until he flies: shown to the world's warm-up so his wings don't upload mid-flight.
    this.root.userData.prewarm = true;
    // Like the captain he rides with, not in the harbour mirror (issue 236).
    unreflected.add(this.root);
    scene.add(this.root);
  }

  get phase(): FlightPhase {
    return this.state;
  }

  /** Lifts off the shoulder (no-op unless perched). */
  takeOff(view: FlightView): void {
    if (this.state !== 'perched') return;
    this.readPerch();
    // He hovers on the side his shoulder's on, as the camera sees it.
    this.side = perchSide(view, this.perchPos);
    this.from.copy(this.perchPos);
    this.fromQ.copy(this.perchQ);
    this.pos.copy(this.perchPos);
    TMP_E.setFromQuaternion(this.perchQ, 'YXZ');
    this.yaw = TMP_E.y;
    this.pitch = 0;
    this.roll = 0;
    this.sway = 0;
    this.u = 0;
    this.flapPhase = Math.PI;
    this.beatHz = WINGBEAT.takeoff.hz;
    this.beatAmp = WINGBEAT.takeoff.amp;
    this.state = 'takeoff';
    this.root.scale.copy(this.perchScale);
    this.place(0);
    this.root.visible = true;
    this.perched.visible = false;
  }

  /** Where he hovers for this view (framing a shot on him). */
  hoverAt(view: FlightView, out = new Vector3()): Vector3 {
    return hoverPoint(view, this.side, out);
  }

  /** Glides back to the shoulder from wherever he is. */
  land(): void {
    if (this.state !== 'takeoff' && this.state !== 'hover') return;
    this.from.copy(this.pos);
    this.u = 0;
    this.state = 'landing';
  }

  /** Back on the shoulder at once (boarding, travel, teardown). */
  landNow(): void {
    this.state = 'perched';
    this.root.visible = false;
    this.perched.visible = true;
  }

  update(dt: number, view: FlightView): void {
    if (this.state === 'perched' || dt <= 0) return;
    this.time += dt;
    this.readPerch();
    hoverPoint(view, this.side, this.target);
    this.target.x += Math.sin(this.time * 1.1) * 0.06;
    this.target.y += Math.sin(this.time * 1.9) * 0.05;
    const prev = TMP_V2.copy(this.pos);
    let open = 1;
    let beat: { readonly hz: number; readonly amp: number } = WINGBEAT.hover;
    if (this.state === 'takeoff') {
      this.u = Math.min(1, this.u + dt / TAKEOFF_S);
      const e = easeInOut(this.u);
      TMP_V.copy(this.target).sub(this.from).multiplyScalar(0.25).add(this.from).addScaledVector(UP, 0.75);
      bezier(this.from, TMP_V, this.target, e, this.pos);
      open = MathUtils.smoothstep(this.u, 0, 0.28);
      beat = WINGBEAT.takeoff;
      if (this.u >= 1) this.state = 'hover';
    } else if (this.state === 'hover') {
      this.pos.lerp(this.target, 1 - Math.exp(-3.5 * dt));
    } else {
      this.u = Math.min(1, this.u + dt / LANDING_S);
      const e = easeInOut(this.u);
      TMP_V.copy(this.from).add(this.perchPos).multiplyScalar(0.5).addScaledVector(UP, 0.45);
      bezier(this.from, TMP_V, this.perchPos, e, this.pos);
      open = 1 - MathUtils.smoothstep(this.u, 0.84, 1);
      // Glide in, then flare with a few fuller beats before touching down.
      beat = this.u < 0.62 ? WINGBEAT.glide : WINGBEAT.flare;
    }
    this.beatHz = MathUtils.damp(this.beatHz, beat.hz, BEAT_EASE, dt);
    this.beatAmp = MathUtils.damp(this.beatAmp, beat.amp, BEAT_EASE, dt);
    this.flapPhase += Math.PI * 2 * this.beatHz * dt;

    const vx = (this.pos.x - prev.x) / dt;
    const vy = (this.pos.y - prev.y) / dt;
    const vz = (this.pos.z - prev.z) / dt;
    const flat = Math.hypot(vx, vz);
    const faceYaw = Math.atan2(view.eye.x - this.pos.x, view.eye.z - this.pos.z);
    const travelYaw = flat > 0.25 ? Math.atan2(vx, vz) : this.yaw;
    // While he talks he doesn't stare: a slow look a little left and right, and a curious tilt.
    this.sway = MathUtils.damp(this.sway, this.state === 'hover' ? 1 : 0, 1.5, dt);
    const swayYaw = (Math.sin(this.time * 0.9) * 0.15 + Math.sin(this.time * 1.7 + 1.3) * 0.05) * this.sway;
    const swayRoll = Math.sin(this.time * 0.6 + 0.4) * 0.07 * this.sway;
    let yawTarget = faceYaw + swayYaw;
    if (this.state === 'takeoff')
      yawTarget = lerpAngle(travelYaw, faceYaw, MathUtils.smoothstep(this.u, 0.45, 0.95));
    else if (this.state === 'landing') yawTarget = travelYaw;
    else if (flat > 1.4) yawTarget = travelYaw;
    const before = this.yaw;
    this.yaw = dampAngle(this.yaw, yawTarget, 7, dt);
    const yawRate = wrapAngle(this.yaw - before) / dt;
    const pitchTarget =
      this.state === 'hover' && flat < 1.4 ? -0.42 : -0.12 - MathUtils.clamp(vy * 0.22, -0.3, 0.35);
    this.pitch = MathUtils.damp(this.pitch, pitchTarget, 5, dt);
    this.roll = MathUtils.damp(this.roll, -MathUtils.clamp(yawRate * 0.2, -0.5, 0.5) + swayRoll, 5, dt);
    TMP_E.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.flyQ.setFromEuler(TMP_E);

    this.root.position.copy(this.pos);
    if (this.state === 'takeoff')
      this.root.quaternion.slerpQuaternions(this.fromQ, this.flyQ, MathUtils.smoothstep(this.u, 0, 0.5));
    else if (this.state === 'landing')
      this.root.quaternion.slerpQuaternions(this.flyQ, this.perchQ, MathUtils.smoothstep(this.u, 0.55, 1));
    else this.root.quaternion.copy(this.flyQ);
    this.place(open, this.beatAmp);

    if (this.state === 'landing' && this.u >= 1) this.landNow();
  }

  dispose(): void {
    this.landNow();
    unreflected.delete(this.root);
    this.root.removeFromParent();
    for (const w of this.wings) w.geometry.dispose();
  }

  /** The perched parrot's world pose, as the flyer's root would need it (pose at rest). */
  private readPerch(): void {
    this.perched.updateWorldMatrix(true, false);
    TMP_M.multiplyMatrices(this.perched.matrixWorld, this.alignInverse);
    TMP_M.decompose(this.perchPos, this.perchQ, this.perchScale);
  }

  /** Wings and the body's bob for how open the wings are. */
  private place(open: number, amp = 0.85): void {
    const p = wingPose(this.flapPhase, open, amp);
    const [right, left] = this.wings;
    right.rotation.set(p.twist, p.sweep, p.flap, 'YZX');
    left.rotation.set(p.twist, -p.sweep, -p.flap, 'YZX');
    right.scale.setScalar(p.scale);
    left.scale.setScalar(p.scale);
    // He rises a touch on each downstroke, less on softer beats.
    this.pose.position.y = -Math.sin(this.flapPhase) * 0.042 * amp * open;
  }
}

/** The unit "in front" direction on the ground: the view's own, or from the camera to the captain. */
function aheadOf(view: FlightView): [x: number, z: number] {
  const fx = view.ahead ? view.ahead.x : view.captain.x - view.eye.x;
  const fz = view.ahead ? view.ahead.z : view.captain.z - view.eye.z;
  const len = Math.hypot(fx, fz) || 1;
  return [fx / len, fz / len];
}

/** Which side of the captain (screen-right +1, left -1) the perched parrot sits on. */
function perchSide(view: FlightView, perch: Vector3): number {
  const [ax, az] = aheadOf(view);
  const d = (perch.x - view.captain.x) * -az + (perch.z - view.captain.z) * ax;
  return d < 0 ? -1 : 1;
}

/**
 * The baked parrot's body axis (tail tip to beak tip, as a yaw), and its shoulder hinge centre and
 * half-width in the axis-aligned frame, from its vertices.
 */
export function bodyFrame(geometry: BufferGeometry): { yaw: number; hinge: Vector3; halfWidth: number } {
  const pos = geometry.getAttribute('position');
  let tail = 0;
  let beak = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < pos.getZ(tail)) tail = i;
    if (pos.getZ(i) > pos.getZ(beak)) beak = i;
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  const yaw = Math.atan2(pos.getX(beak) - pos.getX(tail), pos.getZ(beak) - pos.getZ(tail));
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  const ax = (i: number) => pos.getX(i) * c + pos.getZ(i) * s;
  const az = (i: number) => -pos.getX(i) * s + pos.getZ(i) * c;
  const z0 = az(tail);
  const z1 = az(beak);
  const hingeZ = z0 + (z1 - z0) * 0.52;
  const hingeY = minY + (maxY - minY) * 0.36;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(az(i) - hingeZ) > 0.06 || Math.abs(pos.getY(i) - hingeY) > 0.06) continue;
    lo = Math.min(lo, ax(i));
    hi = Math.max(hi, ax(i));
  }
  if (!Number.isFinite(lo)) {
    lo = -0.1;
    hi = 0.1;
  }
  return { yaw, hinge: new Vector3((lo + hi) / 2, hingeY, hingeZ), halfWidth: ((hi - lo) / 2) * 0.82 };
}

/** One spread wing (side +1 right, -1 left): a thin, faceted, cambered blade on the atlas cells. */
export function buildWing(palette: WingPalette, side: 1 | -1): BufferGeometry {
  const position: number[] = [];
  const uv: number[] = [];
  const hubTop: [number, number, number] = [HUB[0], 0.022, HUB[1]];
  const hubBottom: [number, number, number] = [HUB[0], -0.012, HUB[1]];
  const edge = (i: number): [number, number, number] => {
    const [x, z] = OUTLINE[i]!;
    // The leading edge is a little thicker than the feathers.
    return [x, i <= 4 ? 0.008 : 0, z];
  };
  const cellFor = (cx: number, cz: number): Cell => {
    const r = cx / WING_SPAN;
    if (cz < -0.1 && r > 0.45) return palette.tip;
    if (cz < -0.08) return palette.flight;
    if (r < 0.32) return palette.covert;
    return r < 0.55 ? palette.band : palette.flight;
  };
  const push = (a: number[], b: number[], c: number[]) => {
    const cell = cellFor((a[0]! + b[0]! + c[0]!) / 3, (a[2]! + b[2]! + c[2]!) / 3);
    const u = (cell[0] * 32 + 16) / 1024;
    const v = (cell[1] * 32 + 16) / 1024;
    // Mirroring x flips the winding, so the left wing swaps two corners.
    const tri = side === 1 ? [a, b, c] : [a, c, b];
    for (const p of tri) {
      position.push(p[0]! * side, p[1]!, p[2]!);
      uv.push(u, v);
    }
  };
  for (let i = 0; i < OUTLINE.length; i++) {
    const a = edge(i);
    const b = edge((i + 1) % OUTLINE.length);
    push(hubTop, a, b);
    push(hubBottom, b, a);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = 'wingman wing';
  return geometry;
}

function bezier(a: Vector3, c: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const s = 1 - t;
  return out.set(
    s * s * a.x + 2 * s * t * c.x + t * t * b.x,
    s * s * a.y + 2 * s * t * c.y + t * t * b.y,
    s * s * a.z + 2 * s * t * c.z + t * t * b.z,
  );
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

function dampAngle(a: number, b: number, rate: number, dt: number): number {
  return a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));
}
