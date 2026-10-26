import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three/webgpu';

/**
 * A path for a tentacle to lie along: control points through a centripetal Catmull-Rom spline,
 * sampled into a polyline. Every buffer is made once and refilled in place, so a frame that moves
 * the path allocates nothing.
 */
export class CurvePath {
  readonly ctrl: Float32Array;
  ctrlCount = 0;
  /** The sampled polyline (xyz per point). */
  readonly pts: Float32Array;
  count = 0;
  private readonly perSegment: number;

  constructor(maxControlPoints = 48, perSegment = 8) {
    this.ctrl = new Float32Array(maxControlPoints * 3);
    this.perSegment = perSegment;
    this.pts = new Float32Array(((maxControlPoints - 1) * perSegment + 1) * 3);
  }

  clear(): void {
    this.ctrlCount = 0;
  }

  /** Adds a control point (ignored once the path is full). */
  push(x: number, y: number, z: number): void {
    if (this.ctrlCount * 3 >= this.ctrl.length) return;
    const i = this.ctrlCount++ * 3;
    this.ctrl[i] = x;
    this.ctrl[i + 1] = y;
    this.ctrl[i + 2] = z;
  }

  /** Samples the spline through the control points into `pts`. */
  build(): void {
    const n = this.ctrlCount;
    const c = this.ctrl;
    const out = this.pts;
    this.count = 0;
    if (n === 0) return;
    if (n === 1) {
      out[0] = c[0]!;
      out[1] = c[1]!;
      out[2] = c[2]!;
      this.count = 1;
      return;
    }
    let k = 0;
    for (let s = 0; s < n - 1; s++) {
      const i1 = s * 3;
      const i2 = (s + 1) * 3;
      for (let a = 0; a < 3; a++) {
        const p1 = c[i1 + a]!;
        const p2 = c[i2 + a]!;
        // The ends' outer neighbours are reflections, so the curve leaves and ends straight.
        P0[a] = s > 0 ? c[i1 - 3 + a]! : 2 * p1 - p2;
        P1[a] = p1;
        P2[a] = p2;
        P3[a] = s + 2 < n ? c[i2 + 3 + a]! : 2 * p2 - p1;
      }
      const t1 = knot(P0, P1);
      const t2 = t1 + knot(P1, P2);
      const t3 = t2 + knot(P2, P3);
      const steps = this.perSegment;
      for (let j = s === 0 ? 0 : 1; j <= steps; j++) {
        const t = t1 + ((t2 - t1) * j) / steps;
        for (let a = 0; a < 3; a++) out[k + a] = barryGoldman(a, t, t1, t2, t3);
        k += 3;
      }
    }
    this.count = k / 3;
  }

  /** The polyline's length (m). */
  length(): number {
    let len = 0;
    const p = this.pts;
    for (let i = 1; i < this.count; i++) {
      const j = i * 3;
      len += Math.hypot(p[j]! - p[j - 3]!, p[j + 1]! - p[j - 2]!, p[j + 2]! - p[j - 1]!);
    }
    return len;
  }

  /** The distance from (x, y, z) to the polyline (tests). */
  distanceTo(x: number, y: number, z: number): number {
    const p = this.pts;
    if (this.count === 1) return Math.hypot(x - p[0]!, y - p[1]!, z - p[2]!);
    let best = Infinity;
    for (let i = 1; i < this.count; i++) {
      const j = i * 3;
      const ax = p[j - 3]!,
        ay = p[j - 2]!,
        az = p[j - 1]!;
      const dx = p[j]! - ax,
        dy = p[j + 1]! - ay,
        dz = p[j + 2]! - az;
      const ll = dx * dx + dy * dy + dz * dz;
      const s = ll > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / ll)) : 0;
      best = Math.min(best, Math.hypot(x - ax - dx * s, y - ay - dy * s, z - az - dz * s));
    }
    return best;
  }
}

const P0 = new Float64Array(3);
const P1 = new Float64Array(3);
const P2 = new Float64Array(3);
const P3 = new Float64Array(3);

/** Centripetal parameter step (alpha ½): no cusps or self-loops on uneven spacing. */
function knot(a: Float64Array, b: Float64Array): number {
  return Math.max(1e-4, Math.sqrt(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!)));
}

function barryGoldman(a: number, t: number, t1: number, t2: number, t3: number): number {
  const p0 = P0[a]!,
    p1 = P1[a]!,
    p2 = P2[a]!,
    p3 = P3[a]!;
  const a1 = ((t1 - t) / t1) * p0 + (t / t1) * p1;
  const a2 = ((t2 - t) / (t2 - t1)) * p1 + ((t - t1) / (t2 - t1)) * p2;
  const a3 = ((t3 - t) / (t3 - t2)) * p2 + ((t - t2) / (t3 - t2)) * p3;
  const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2;
  const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
  return ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
}

/**
 * Places a chain's joints along `path`: joint 0 at the path's start, and each next joint at chord
 * distance `lengths[i]` from the one before, on the polyline (so every joint lies on the path,
 * whatever its bends). Past the path's end the chain runs on straight along its last direction.
 * Writes `lengths.length + 1` joints (xyz) into `out`. Returns how much of the chain ran off the
 * path's end (m), or, when it all lies on it, minus how much path is left past its tip.
 */
export function followPath(path: CurvePath, lengths: ArrayLike<number>, out: Float32Array): number {
  const p = path.pts;
  const n = path.count;
  let px = p[0]!,
    py = p[1]!,
    pz = p[2]!;
  out[0] = px;
  out[1] = py;
  out[2] = pz;
  let seg = 1;
  let s0 = 0;
  let off = 0;
  for (let i = 0; i < lengths.length; i++) {
    const L = lengths[i]!;
    let found = false;
    while (seg < n) {
      const j = seg * 3;
      const ax = p[j - 3]!,
        ay = p[j - 2]!,
        az = p[j - 1]!;
      const s = farRoot(ax - px, ay - py, az - pz, p[j]! - ax, p[j + 1]! - ay, p[j + 2]! - az, L);
      if (s >= s0 && s <= 1) {
        px = ax + (p[j]! - ax) * s;
        py = ay + (p[j + 1]! - ay) * s;
        pz = az + (p[j + 2]! - az) * s;
        s0 = s;
        found = true;
        break;
      }
      seg++;
      s0 = 0;
    }
    if (!found) {
      // How much of this bone the path lacks: all of it once off the end, else what its end misses.
      if (seg >= n && off > 0) off += L;
      else {
        const j = (n - 1) * 3;
        off += Math.max(0, L - Math.hypot(p[j]! - px, p[j + 1]! - py, p[j + 2]! - pz));
      }
      // Off the end: straight on along the last segment's direction.
      let dx = 1,
        dy = 0,
        dz = 0;
      if (n >= 2) {
        const j = (n - 1) * 3;
        dx = p[j]! - p[j - 3]!;
        dy = p[j + 1]! - p[j - 2]!;
        dz = p[j + 2]! - p[j - 1]!;
        const d = Math.hypot(dx, dy, dz) || 1;
        dx /= d;
        dy /= d;
        dz /= d;
      }
      const ex = p[(n - 1) * 3]!,
        ey = p[(n - 1) * 3 + 1]!,
        ez = p[(n - 1) * 3 + 2]!;
      const u = farRoot(ex - px, ey - py, ez - pz, dx, dy, dz, L);
      const step = Number.isFinite(u) && u >= 0 ? u : L;
      const ox = Number.isFinite(u) && u >= 0 ? ex : px;
      const oy = Number.isFinite(u) && u >= 0 ? ey : py;
      const oz = Number.isFinite(u) && u >= 0 ? ez : pz;
      px = ox + dx * step;
      py = oy + dy * step;
      pz = oz + dz * step;
      seg = n;
    }
    out[(i + 1) * 3] = px;
    out[(i + 1) * 3 + 1] = py;
    out[(i + 1) * 3 + 2] = pz;
  }
  if (off > 0) return off;
  // The path left past the tip.
  let left = 0;
  for (let k = seg; k < n; k++) {
    const j = k * 3;
    left +=
      k === seg
        ? Math.hypot(p[j]! - px, p[j + 1]! - py, p[j + 2]! - pz)
        : Math.hypot(p[j]! - p[j - 3]!, p[j + 1]! - p[j - 2]!, p[j + 2]! - p[j - 1]!);
  }
  return -left;
}

/**
 * The larger s with |o + s·d| = L, where o is the segment's start less the current point (NaN if
 * none): the point where the segment leaves the sphere of radius L round the current point.
 */
function farRoot(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, L: number): number {
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-12) return NaN;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - L * L;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return NaN;
  return (-b + Math.sqrt(disc)) / (2 * a);
}

const _m = new Matrix4();
const _pq = new Quaternion();
const _pqInv = new Quaternion();
const _qw = new Quaternion();
const _qd = new Quaternion();
const _qp = new Quaternion();
const _v = new Vector3();
const _cur = new Vector3();
const _tgt = new Vector3();
const _pos = new Vector3();
const _scale = new Vector3();
const _want = new Vector3();
const _sk = new Vector3();
const _twist = new Vector3();
const _qt = new Quaternion();

/**
 * Which way an arm's sucker side should face at a point on it (`out`, world, any length): the poser
 * twists each bone about its own length so its suckers turn that way.
 */
export interface SuckerAim {
  aim(px: number, py: number, pz: number, out: Vector3): void;
}

/**
 * Suckers toward a line (a ship's centre line, a mast) or, with no direction, a point: an arm that
 * grips grips with its suckers.
 */
export class AxisAim implements SuckerAim {
  readonly point = new Vector3();
  readonly dir = new Vector3();

  set(px: number, py: number, pz: number, dx: number, dy: number, dz: number): this {
    this.point.set(px, py, pz);
    this.dir.set(dx, dy, dz);
    const l = this.dir.length();
    if (l > 1e-6) this.dir.multiplyScalar(1 / l);
    return this;
  }

  aim(px: number, py: number, pz: number, out: Vector3): void {
    out.set(this.point.x - px, this.point.y - py, this.point.z - pz);
    // Toward the nearest point on the line, not along it.
    out.addScaledVector(this.dir, -out.dot(this.dir));
  }
}

/**
 * Suckers to the inside of a free arm's curve: it bends (and its tip curls) toward `lean` (unit,
 * horizontal), in the plane of `lean` and up, so its inside at a point is along `lean` rotated by how
 * far the arm has turned there. The poser passes the point; the bone's own direction gives the turn.
 */
export class CurveAim implements SuckerAim {
  readonly lean = new Vector3(0, 0, 1);
  /** The bone direction at the point being aimed (set by the poser before each `aim`). */
  readonly along = new Vector3(0, 1, 0);

  set(leanX: number, leanZ: number): this {
    const l = Math.hypot(leanX, leanZ) || 1;
    this.lean.set(leanX / l, 0, leanZ / l);
    return this;
  }

  aim(_px: number, _py: number, _pz: number, out: Vector3): void {
    // The plane's normal (across the arm's way), then the inside: along × across (upright, it's `lean`).
    _side.set(-this.lean.z, 0, this.lean.x);
    out.crossVectors(this.along, _side);
    if (out.lengthSq() < 1e-8) out.copy(this.lean);
  }
}
const _side = new Vector3();

/**
 * Poses a bone chain along a path (curve follow): each bone turns, by the smallest rotation from
 * its pose now (the clip's), so its child lies on the path. `weight` blends the clip's pose (0) to
 * the path's (1). Bone lengths come from the bind pose (`measure`). Allocates nothing per pose.
 */
export class ChainPoser {
  readonly bones: readonly Bone[];
  /** Each bone's child direction in its own frame (unit). */
  private readonly dirs: Float32Array;
  /** Each bone's child offset in its own frame (bone-local units). */
  private readonly local: Float32Array;
  /** World lengths (m), from `measure`. */
  readonly lengths: Float32Array;
  /** The joints along the path (xyz), from the last `pose`. */
  readonly joints: Float32Array;
  /** How much of the chain ran off its path's end in the last `pose` (m), or minus the path left past its tip. */
  overflow = 0;
  /** Each bone's sucker side in its own frame (unit; `setSuckers`), or null: no twist. */
  private suckers: Float32Array | null = null;

  /** `tip` is the end's offset in the last bone's frame (its `_end` joint). */
  constructor(bones: readonly Bone[], tip: Vector3) {
    this.bones = bones;
    const n = bones.length;
    this.dirs = new Float32Array(n * 3);
    this.local = new Float32Array(n);
    this.lengths = new Float32Array(n);
    this.joints = new Float32Array((n + 1) * 3);
    for (let i = 0; i < n; i++) {
      const o = i + 1 < n ? bones[i + 1]!.position : tip;
      const len = o.length() || 1;
      this.local[i] = len;
      this.dirs[i * 3] = o.x / len;
      this.dirs[i * 3 + 1] = o.y / len;
      this.dirs[i * 3 + 2] = o.z / len;
    }
  }

  /** Each bone's sucker side in its own frame (unit xyz per bone): `pose` can then twist them to an aim. */
  setSuckers(local: Float32Array): void {
    this.suckers = local;
  }

  /** Bone `i`'s sucker side in world space now (after a pose), into `out`. */
  suckerWorld(i: number, out: Vector3): Vector3 {
    const s = this.suckers;
    if (!s) return out.set(0, 0, 0);
    this.bones[i]!.getWorldQuaternion(_qw);
    return out.set(s[i * 3]!, s[i * 3 + 1]!, s[i * 3 + 2]!).applyQuaternion(_qw);
  }

  /** World lengths from the chain's world scale (call once it's placed and scaled). */
  measure(root: Object3D): void {
    root.updateWorldMatrix(true, true);
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i]!.matrixWorld.decompose(_pos, _qw, _scale);
      this.lengths[i] = this.local[i]! * _scale.x;
    }
  }

  /** The chain's base in world space (where a path for it should start). */
  base(out: Vector3): Vector3 {
    const b = this.bones[0]!;
    b.parent!.updateWorldMatrix(true, false);
    return out.copy(b.position).applyMatrix4(b.parent!.matrixWorld);
  }

  /**
   * Lays the chain along `path` by `weight`; with `aim`, each bone also turns about its length so
   * its sucker side faces where `aim` says.
   */
  pose(path: CurvePath, weight: number, aim: SuckerAim | null = null): void {
    if (weight <= 0 || path.count < 1) return;
    const w = Math.min(1, weight);
    this.overflow = followPath(path, this.lengths, this.joints);
    const bones = this.bones;
    const first = bones[0]!;
    const parent = first.parent!;
    parent.updateWorldMatrix(true, false);
    _m.copy(parent.matrixWorld);
    _m.decompose(_v, _pq, _scale);
    _pos.copy(first.position).applyMatrix4(parent.matrixWorld);
    const J = this.joints;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i]!;
      _qw.multiplyQuaternions(_pq, b.quaternion);
      _cur.set(this.dirs[i * 3]!, this.dirs[i * 3 + 1]!, this.dirs[i * 3 + 2]!).applyQuaternion(_qw);
      _tgt.set(J[(i + 1) * 3]! - _pos.x, J[(i + 1) * 3 + 1]! - _pos.y, J[(i + 1) * 3 + 2]! - _pos.z);
      const d = _tgt.length();
      if (d > 1e-6) {
        _tgt.multiplyScalar(1 / d);
        _qd.setFromUnitVectors(_cur, _tgt);
        _qp.multiplyQuaternions(_qd, _qw);
        const su = this.suckers;
        if (aim && su) {
          // Twist about the bone so its suckers face the aim (at the bone's middle).
          const mx = (_pos.x + J[(i + 1) * 3]!) / 2;
          const my = (_pos.y + J[(i + 1) * 3 + 1]!) / 2;
          const mz = (_pos.z + J[(i + 1) * 3 + 2]!) / 2;
          if (aim instanceof CurveAim) aim.along.copy(_tgt);
          aim.aim(mx, my, mz, _want);
          _sk.set(su[i * 3]!, su[i * 3 + 1]!, su[i * 3 + 2]!).applyQuaternion(_qp);
          _want.addScaledVector(_tgt, -_want.dot(_tgt));
          _sk.addScaledVector(_tgt, -_sk.dot(_tgt));
          if (_want.lengthSq() > 1e-8 && _sk.lengthSq() > 1e-8) {
            const ang = Math.atan2(_twist.crossVectors(_sk, _want).dot(_tgt), _sk.dot(_want));
            _qt.setFromAxisAngle(_tgt, ang);
            _qp.premultiply(_qt);
          }
        }
        _pqInv.copy(_pq).invert();
        _qp.premultiply(_pqInv);
        if (w >= 1) b.quaternion.copy(_qp);
        else b.quaternion.slerp(_qp, w);
        b.quaternion.normalize();
      }
      _pq.multiply(b.quaternion);
      _v.set(this.dirs[i * 3]!, this.dirs[i * 3 + 1]!, this.dirs[i * 3 + 2]!).applyQuaternion(_pq);
      _pos.addScaledVector(_v, this.lengths[i]!);
    }
  }
}
