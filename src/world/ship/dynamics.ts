import type { CircleObstacle, HeightField, WaveSampler } from '../contracts';
import { windAt } from '../wind';
import {
  BRIGANTINE_BEAM,
  BRIGANTINE_CAPSULES,
  BRIGANTINE_DRAFT,
  BRIGANTINE_HALF_LENGTH,
  BRIGANTINE_STATIONS,
  type BuoyancyStation,
  type HullCapsule,
} from './lines';
import { clamp, smoothstep } from '../../util/math';

interface ShipInput {
  trim: number;
  rudder: number;
}

export interface ShipEnv {
  waves: WaveSampler;
  ground: HeightField | null;
  obstacles: readonly CircleObstacle[];
  t: number;
}

interface DockTarget {
  x: number;
  z: number;
  heading: number;
}

interface SplinePoint {
  x: number;
  z: number;
}

interface ShipPose {
  x: number;
  z: number;
  heading: number;
  heave: number;
  pitch: number;
  roll: number;
  speed: number;
  luff: number;
  shake: number;
}

interface Command {
  trim: number;
  rudder: number;
  targetSpeedOverride: number;
  targetYawOverride: number;
  correctionX: number;
  correctionZ: number;
}

const STEP = 1 / 60;
const MAX_SUBSTEPS = 10;
const MAX_SPEED = 7.2;
const MAX_YAW_RATE = 0.42;
/** Steerage while the hull touches an obstacle, and how long it lasts after the last contact (s). */
const FEND_OFF_STEERAGE = 0.75;
const FEND_OFF_HOLD = 0.6;
const TWO_PI = Math.PI * 2;
const EPS = 1e-6;

function angleDiff(target: number, current: number): number {
  let d = (target - current + Math.PI) % TWO_PI;
  if (d < 0) d += TWO_PI;
  return d - Math.PI;
}

function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(b, a) * t;
}

function finite(v: number): boolean {
  return Number.isFinite(v);
}

/** dot(forward, windDirectionToward) => 0 head-to-wind when ≈ -1, peak on a broad reach. */
export function pointOfSailCurve(forwardDotWind: number): number {
  const d = clamp(forwardDotWind, -1, 1);
  const noGo = smoothstep(-0.78, -0.34, d);
  const broadReachPeak = 0.58 + 0.46 * Math.exp(-Math.pow((d - 0.42) / 0.5, 2));
  const runningPenalty = 1 - 0.25 * smoothstep(0.72, 1, d);
  return clamp(noGo * broadReachPeak * runningPenalty, 0, 1.05);
}

export type PointOfSail = 'in-irons' | 'close-hauled' | 'beam-reach' | 'broad-reach' | 'running';

/**
 * Where the wind comes from relative to the bow (radians; 0 dead ahead, +π/2 the starboard beam)
 * and the point of sail that gives. The in-irons band matches `pointOfSailCurve`'s no-go zone.
 */
export function windOnBow(
  heading: number,
  windX: number,
  windZ: number,
): { angle: number; point: PointOfSail } {
  const len = Math.hypot(windX, windZ) || 1;
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  const ahead = -(s * windX + c * windZ) / len;
  const starboard = (c * windX - s * windZ) / len;
  const angle = Math.atan2(starboard, ahead);
  const off = (Math.abs(angle) * 180) / Math.PI;
  const point: PointOfSail =
    off < 40
      ? 'in-irons'
      : off < 70
        ? 'close-hauled'
        : off < 110
          ? 'beam-reach'
          : off < 155
            ? 'broad-reach'
            : 'running';
  return { angle, point };
}

function integrateSpring(
  current: number,
  velocity: number,
  target: number,
  hz: number,
  zeta: number,
  dt: number,
): [number, number] {
  const omega = TWO_PI * hz;
  const accel = (target - current) * omega * omega - 2 * zeta * omega * velocity;
  const nextVelocity = velocity + accel * dt;
  return [current + nextVelocity * dt, nextVelocity];
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export class ShipDynamics {
  readonly pose: ShipPose = {
    x: 0,
    z: 0,
    heading: 0,
    heave: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    luff: 0,
    shake: 0,
  };
  readonly measuredAcceleration = new Float32Array(3);
  readonly control: ShipInput = { trim: 0, rudder: 0 };
  readonly stations: readonly BuoyancyStation[] = BRIGANTINE_STATIONS;
  readonly capsules: readonly HullCapsule[] = BRIGANTINE_CAPSULES;

  forwardSpeed = 0;
  lateralSpeed = 0;
  headingRate = 0;
  crewOffset = 0;
  /** Seconds left of "fending off": the hull touched a pile or boat, so the helm keeps steerage. */
  private fendOff = 0;
  autopilotComplete = true;
  dockComplete = false;
  passedWaypointCount = 0;

  private heaveVelocity = 0;
  private pitchVelocity = 0;
  private rollVelocity = 0;
  private prevVx = 0;
  private prevVz = 0;
  private readonly wind = new Float32Array(2);
  private readonly waveVelocity = new Float32Array(2);
  private readonly groundNormal = new Float32Array(3);
  private readonly command: Command = {
    trim: 0,
    rudder: 0,
    targetSpeedOverride: Number.NaN,
    targetYawOverride: Number.NaN,
    correctionX: 0,
    correctionZ: 0,
  };
  private dockTarget: DockTarget | null = null;
  private pathPoints = new Float32Array(0);
  private densePath = new Float32Array(0);
  private waypointPassed = new Uint8Array(0);
  private pathCursor = 0;

  constructor(x = 0, z = 0, heading = 0) {
    this.reset(x, z, heading);
  }

  reset(x = 0, z = 0, heading = 0): void {
    this.pose.x = x;
    this.pose.z = z;
    this.pose.heading = heading;
    this.pose.heave = 0;
    this.pose.pitch = 0;
    this.pose.roll = 0;
    this.pose.speed = 0;
    this.pose.luff = 0;
    this.pose.shake = 0;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.headingRate = 0;
    this.crewOffset = 0;
    this.fendOff = 0;
    this.heaveVelocity = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.prevVx = 0;
    this.prevVz = 0;
    this.measuredAcceleration.fill(0);
    this.clearDockAssist();
    this.clearAutopilot();
  }

  setInput(input: ShipInput): void {
    this.control.trim = clamp(input.trim, 0, 1);
    this.control.rudder = clamp(input.rudder, -1, 1);
  }

  setCrewOffset(lateralMetres: number): void {
    this.crewOffset = clamp(lateralMetres, -BRIGANTINE_BEAM * 0.5, BRIGANTINE_BEAM * 0.5);
  }

  dockAssist(target: DockTarget): void {
    this.dockTarget = { x: target.x, z: target.z, heading: target.heading };
    this.dockComplete = false;
    this.clearAutopilot();
  }

  clearDockAssist(): void {
    this.dockTarget = null;
    this.dockComplete = false;
  }

  followSpline(points: readonly SplinePoint[]): void {
    if (points.length < 2) {
      this.clearAutopilot();
      return;
    }
    this.pathPoints = new Float32Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      this.pathPoints[i * 2] = points[i]?.x ?? 0;
      this.pathPoints[i * 2 + 1] = points[i]?.z ?? 0;
    }
    const samplesPerSegment = 22;
    const segments = points.length - 1;
    this.densePath = new Float32Array((segments * samplesPerSegment + 1) * 2);
    let out = 0;
    for (let seg = 0; seg < segments; seg++) {
      const p0 = Math.max(0, seg - 1);
      const p1 = seg;
      const p2 = seg + 1;
      const p3 = Math.min(points.length - 1, seg + 2);
      for (let s = 0; s < samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        this.densePath[out++] = catmull(
          this.pathPoints[p0 * 2],
          this.pathPoints[p1 * 2],
          this.pathPoints[p2 * 2],
          this.pathPoints[p3 * 2],
          t,
        );
        this.densePath[out++] = catmull(
          this.pathPoints[p0 * 2 + 1],
          this.pathPoints[p1 * 2 + 1],
          this.pathPoints[p2 * 2 + 1],
          this.pathPoints[p3 * 2 + 1],
          t,
        );
      }
    }
    const last = points.length - 1;
    this.densePath[out++] = this.pathPoints[last * 2] ?? 0;
    this.densePath[out] = this.pathPoints[last * 2 + 1] ?? 0;
    this.waypointPassed = new Uint8Array(points.length);
    this.pathCursor = 0;
    this.passedWaypointCount = 0;
    this.autopilotComplete = false;
    this.clearDockAssist();
  }

  clearAutopilot(): void {
    this.pathPoints = new Float32Array(0);
    this.densePath = new Float32Array(0);
    this.waypointPassed = new Uint8Array(0);
    this.pathCursor = 0;
    this.passedWaypointCount = 0;
    this.autopilotComplete = true;
  }

  step(dt: number, input: ShipInput, env: ShipEnv): void {
    if (!(dt > 0) || !finite(dt)) return;
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / STEP)));
    const h = Math.min(STEP, dt / steps);
    for (let i = 0; i < steps; i++) {
      this.advanceHorizontal(h, input, env);
      this.updateAttitudeOnly(h, env);
      this.pose.shake *= Math.exp(-5.2 * h);
      this.sanitize();
    }
  }

  updateAttitudeOnly(dt: number, env: ShipEnv): void {
    if (!(dt > 0) || !finite(dt)) return;
    const s = Math.sin(this.pose.heading);
    const c = Math.cos(this.pose.heading);
    const rightX = c;
    const rightZ = -s;
    const fwdX = s;
    const fwdZ = c;
    let sumY = 0;
    let sumXY = 0;
    let sumZY = 0;
    let sumX2 = 0;
    let sumZ2 = 0;
    for (const station of this.stations) {
      const wx = this.pose.x + rightX * station.x + fwdX * station.z;
      const wz = this.pose.z + rightZ * station.x + fwdZ * station.z;
      const y = env.waves.heightAt(wx, wz, env.t);
      sumY += y;
      sumXY += station.x * y;
      sumZY += station.z * y;
      sumX2 += station.x * station.x;
      sumZ2 += station.z * station.z;
    }
    const targetHeave = clamp(sumY / this.stations.length, -1.5, 1.5);
    const waveRoll = clamp(Math.atan2(sumXY, Math.max(EPS, sumX2)), -0.23, 0.23);
    const wavePitch = clamp(-Math.atan2(sumZY, Math.max(EPS, sumZ2)), -0.2, 0.2);

    windAt(this.pose.x, this.pose.z, env.t, this.wind);
    const vx = fwdX * this.forwardSpeed + rightX * this.lateralSpeed;
    const vz = fwdZ * this.forwardSpeed + rightZ * this.lateralSpeed;
    const apparentX = this.wind[0] - vx;
    const apparentZ = this.wind[1] - vz;
    const apparentSide = apparentX * rightX + apparentZ * rightZ;
    const sailHeel = -clamp(apparentSide / 16, -1, 1) * this.control.trim * 0.13;
    const turnHeel = -clamp(this.headingRate / MAX_YAW_RATE, -1, 1) * 0.08;
    const crewHeel = -this.crewOffset * 0.026;
    const targetRoll = clamp(waveRoll + sailHeel + turnHeel + crewHeel, -0.33, 0.33);

    [this.pose.heave, this.heaveVelocity] = integrateSpring(
      this.pose.heave,
      this.heaveVelocity,
      targetHeave,
      0.64,
      0.62,
      dt,
    );
    [this.pose.pitch, this.pitchVelocity] = integrateSpring(
      this.pose.pitch,
      this.pitchVelocity,
      wavePitch,
      0.82,
      0.7,
      dt,
    );
    [this.pose.roll, this.rollVelocity] = integrateSpring(
      this.pose.roll,
      this.rollVelocity,
      targetRoll,
      0.72,
      0.66,
      dt,
    );
    this.pose.heave = clamp(this.pose.heave, -2, 2);
    this.pose.pitch = clamp(this.pose.pitch, -0.34, 0.34);
    this.pose.roll = clamp(this.pose.roll, -0.42, 0.42);
  }

  writeWorldCapsules(out: Float32Array | number[]): Float32Array | number[] {
    const s = Math.sin(this.pose.heading);
    const c = Math.cos(this.pose.heading);
    for (let i = 0; i < this.capsules.length; i++) {
      const cap = this.capsules[i]!;
      out[i * 3] = this.pose.x + s * cap.z;
      out[i * 3 + 1] = this.pose.z + c * cap.z;
      out[i * 3 + 2] = cap.radius;
    }
    return out;
  }

  private advanceHorizontal(dt: number, input: ShipInput, env: ShipEnv): void {
    const command = this.resolveCommand(input);
    this.control.trim = command.trim;
    this.control.rudder = command.rudder;

    const s0 = Math.sin(this.pose.heading);
    const c0 = Math.cos(this.pose.heading);
    windAt(this.pose.x, this.pose.z, env.t, this.wind);
    const windSpeed = Math.hypot(this.wind[0], this.wind[1]);
    const windDirX = windSpeed > EPS ? this.wind[0] / windSpeed : 0;
    const windDirZ = windSpeed > EPS ? this.wind[1] / windSpeed : 1;
    const pointOfSail = pointOfSailCurve(s0 * windDirX + c0 * windDirZ);
    const noGo = 1 - smoothstep(-0.82, -0.28, s0 * windDirX + c0 * windDirZ);
    this.pose.luff = clamp(noGo * command.trim, 0, 1);

    const windScale = Math.pow(clamp(windSpeed / 6.5, 0, 2.2), 0.72);
    let targetSpeed = MAX_SPEED * command.trim * pointOfSail * windScale;
    // Pinned against a pile or boat the crew fends off, so the helm can still swing her clear.
    this.fendOff = Math.max(0, this.fendOff - dt);
    const steerage = Math.max(
      clamp((Math.abs(this.forwardSpeed) + 0.8) / 4.5, 0.18, 1),
      this.fendOff > 0 ? FEND_OFF_STEERAGE : 0,
    );
    let targetYaw = command.rudder * MAX_YAW_RATE * steerage * (0.45 + command.trim * 0.55);
    if (finite(command.targetSpeedOverride)) targetSpeed = command.targetSpeedOverride;
    if (finite(command.targetYawOverride)) targetYaw = command.targetYawOverride;

    this.headingRate += (targetYaw - this.headingRate) * clamp(3.8 * dt, 0, 1);
    this.headingRate = clamp(this.headingRate, -MAX_YAW_RATE, MAX_YAW_RATE);
    this.pose.heading += this.headingRate * dt;

    const s = Math.sin(this.pose.heading);
    const c = Math.cos(this.pose.heading);
    const rightX = c;
    const rightZ = -s;
    const speedResponse = 0.65 + command.trim * 0.85;
    this.forwardSpeed += (targetSpeed - this.forwardSpeed) * clamp(speedResponse * dt, 0, 1);
    this.forwardSpeed -= this.forwardSpeed * Math.abs(this.forwardSpeed) * 0.013 * dt;
    this.lateralSpeed -= this.lateralSpeed * clamp((2.7 + Math.abs(this.lateralSpeed) * 0.2) * dt, 0, 0.92);

    env.waves.velocityAt(this.pose.x, this.pose.z, env.t, this.waveVelocity);
    let vx =
      s * this.forwardSpeed + rightX * this.lateralSpeed + this.waveVelocity[0] * 0.045 + command.correctionX;
    let vz =
      c * this.forwardSpeed + rightZ * this.lateralSpeed + this.waveVelocity[1] * 0.045 + command.correctionZ;
    vx = clamp(vx, -9, 9);
    vz = clamp(vz, -9, 9);
    this.pose.x += vx * dt;
    this.pose.z += vz * dt;

    this.depenetrate(env, s, c);
    this.applyGrounding(env, s, c, rightX, rightZ, dt);

    const actualVx = s * this.forwardSpeed + rightX * this.lateralSpeed;
    const actualVz = c * this.forwardSpeed + rightZ * this.lateralSpeed;
    this.measuredAcceleration[0] = (actualVx - this.prevVx) / dt;
    this.measuredAcceleration[1] = this.heaveVelocity;
    this.measuredAcceleration[2] = (actualVz - this.prevVz) / dt;
    this.prevVx = actualVx;
    this.prevVz = actualVz;
    this.pose.speed = Math.hypot(actualVx, actualVz);
  }

  private resolveCommand(input: ShipInput): Command {
    const cmd = this.command;
    cmd.trim = clamp(input.trim, 0, 1);
    cmd.rudder = clamp(input.rudder, -1, 1);
    cmd.targetSpeedOverride = Number.NaN;
    cmd.targetYawOverride = Number.NaN;
    cmd.correctionX = 0;
    cmd.correctionZ = 0;

    if (this.dockTarget) {
      this.applyDockCommand(cmd);
      return cmd;
    }
    if (!this.autopilotComplete && this.densePath.length >= 4) {
      this.applyAutopilotCommand(cmd);
    }
    return cmd;
  }

  private applyDockCommand(cmd: Command): void {
    const target = this.dockTarget;
    if (!target) return;
    const dx = target.x - this.pose.x;
    const dz = target.z - this.pose.z;
    const dist = Math.hypot(dx, dz);
    const finalErr = angleDiff(target.heading, this.pose.heading);
    if (dist < 0.42 && Math.abs(finalErr) < (5 * Math.PI) / 180) {
      this.dockComplete = true;
      cmd.trim = 0;
      cmd.targetSpeedOverride = 0;
      cmd.targetYawOverride = finalErr * 1.2;
      this.forwardSpeed *= 0.86;
      this.lateralSpeed *= 0.78;
      return;
    }
    const toTargetHeading = Math.atan2(dx, dz);
    const settle = smoothstep(10, 1.5, dist);
    const desiredHeading = lerpAngle(toTargetHeading, target.heading, settle);
    const headingError = angleDiff(desiredHeading, this.pose.heading);
    cmd.trim = clamp(dist / 14, 0.08, 0.5);
    cmd.rudder = clamp(headingError * 2.4, -1, 1);
    cmd.targetSpeedOverride = clamp(dist * 0.38, 0, 3.1) * (1 - settle * 0.58);
    cmd.targetYawOverride = clamp(headingError * 1.9 + finalErr * settle * 0.9, -0.46, 0.46);
    if (dist < 12) {
      const gain = 0.32 + 0.82 * smoothstep(12, 0.4, dist);
      cmd.correctionX = clamp(dx * gain, -3.0, 3.0);
      cmd.correctionZ = clamp(dz * gain, -3.0, 3.0);
    }
  }

  private applyAutopilotCommand(cmd: Command): void {
    const denseCount = this.densePath.length / 2;
    let best = this.pathCursor;
    let bestD2 = Number.POSITIVE_INFINITY;
    const scanEnd = Math.min(denseCount - 1, this.pathCursor + 52);
    for (let i = this.pathCursor; i <= scanEnd; i++) {
      const dx = (this.densePath[i * 2] ?? 0) - this.pose.x;
      const dz = (this.densePath[i * 2 + 1] ?? 0) - this.pose.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    this.pathCursor = Math.max(this.pathCursor, best);

    for (let i = 0; i < this.pathPoints.length / 2; i++) {
      if (this.waypointPassed[i]) continue;
      const dx = (this.pathPoints[i * 2] ?? 0) - this.pose.x;
      const dz = (this.pathPoints[i * 2 + 1] ?? 0) - this.pose.z;
      if (dx * dx + dz * dz < 7.5 * 7.5) {
        this.waypointPassed[i] = 1;
        this.passedWaypointCount += 1;
      }
    }

    const lastX = this.pathPoints[this.pathPoints.length - 2] ?? this.pose.x;
    const lastZ = this.pathPoints[this.pathPoints.length - 1] ?? this.pose.z;
    const finalDist = Math.hypot(lastX - this.pose.x, lastZ - this.pose.z);
    if (this.pathCursor >= denseCount - 3 && finalDist < 3.2) {
      this.autopilotComplete = true;
      cmd.trim = 0;
      cmd.rudder = 0;
      cmd.targetSpeedOverride = 0;
      return;
    }

    let look = this.pathCursor;
    let travelled = 0;
    const lookAhead = 12 + clamp(this.pose.speed, 0, 6) * 1.8;
    while (look < denseCount - 1 && travelled < lookAhead) {
      const ax = this.densePath[look * 2] ?? 0;
      const az = this.densePath[look * 2 + 1] ?? 0;
      const bx = this.densePath[(look + 1) * 2] ?? ax;
      const bz = this.densePath[(look + 1) * 2 + 1] ?? az;
      travelled += Math.hypot(bx - ax, bz - az);
      look += 1;
    }
    const tx = this.densePath[look * 2] ?? lastX;
    const tz = this.densePath[look * 2 + 1] ?? lastZ;
    const desired = Math.atan2(tx - this.pose.x, tz - this.pose.z);
    const err = angleDiff(desired, this.pose.heading);
    const slowForEnd = smoothstep(24, 6, finalDist);
    cmd.trim = clamp(0.78 * (1 - slowForEnd * 0.55), 0.22, 0.86);
    cmd.rudder = clamp(err * 2.15, -1, 1);
  }

  private depenetrate(env: ShipEnv, fwdX: number, fwdZ: number): void {
    const obstacles = env.obstacles;
    if (obstacles.length === 0) return;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const cap of this.capsules) {
        const cx = this.pose.x + fwdX * cap.z;
        const cz = this.pose.z + fwdZ * cap.z;
        for (const obstacle of obstacles) {
          const dx = cx - obstacle.x;
          const dz = cz - obstacle.z;
          const minDist = cap.radius + obstacle.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minDist * minDist) continue;
          const d = Math.sqrt(Math.max(d2, EPS));
          const nx = d > EPS ? dx / d : -fwdX;
          const nz = d > EPS ? dz / d : -fwdZ;
          const push = (minDist - d) * 0.72;
          this.pose.x += nx * push;
          this.pose.z += nz * push;
          moved = true;
          this.fendOff = FEND_OFF_HOLD;
          const bowHit =
            cap.z > BRIGANTINE_HALF_LENGTH * 0.42 &&
            nx * fwdX + nz * fwdZ < -0.28 &&
            this.forwardSpeed > 0.35;
          if (bowHit) {
            this.forwardSpeed = -Math.max(0.45, this.forwardSpeed * 0.24);
            this.headingRate += clamp((nx * -fwdZ + nz * fwdX) * 0.09, -0.08, 0.08);
            this.pose.shake = Math.max(this.pose.shake, clamp((minDist - d) * 0.3, 0.08, 0.55));
          } else {
            this.forwardSpeed *= 0.95;
            this.lateralSpeed *= 0.72;
          }
        }
      }
      if (!moved) return;
    }
  }

  private applyGrounding(
    env: ShipEnv,
    fwdX: number,
    fwdZ: number,
    rightX: number,
    rightZ: number,
    dt: number,
  ): void {
    if (!env.ground) return;
    let worst = 0;
    let pushX = 0;
    let pushZ = 0;
    for (const cap of this.capsules) {
      const x = this.pose.x + fwdX * cap.z;
      const z = this.pose.z + fwdZ * cap.z;
      const groundY = env.ground.heightAt(x, z);
      const shoal = groundY + BRIGANTINE_DRAFT;
      if (shoal > worst) {
        worst = shoal;
        env.ground.normalAt(x, z, this.groundNormal);
        pushX = this.groundNormal[0];
        pushZ = this.groundNormal[2];
      }
    }
    if (worst <= 0) return;
    const len = Math.hypot(pushX, pushZ);
    if (len > EPS) {
      const amount = clamp(worst * 0.42 * dt * 60, 0, 1.2);
      this.pose.x += (pushX / len) * amount;
      this.pose.z += (pushZ / len) * amount;
    }
    const drag = clamp(1 - worst * 0.18, 0.1, 0.82);
    this.forwardSpeed *= drag;
    this.lateralSpeed *= drag * 0.6;
    const downhillForward = pushX * fwdX + pushZ * fwdZ;
    const downhillSide = pushX * rightX + pushZ * rightZ;
    this.forwardSpeed += downhillForward * worst * 0.035;
    this.lateralSpeed += downhillSide * worst * 0.02;
  }

  private sanitize(): void {
    const pose = this.pose;
    if (!finite(pose.x) || !finite(pose.z) || !finite(pose.heading)) {
      this.reset(0, 0, 0);
      return;
    }
    pose.heading = ((pose.heading % TWO_PI) + TWO_PI) % TWO_PI;
    pose.x = clamp(pose.x, -10000, 10000);
    pose.z = clamp(pose.z, -10000, 10000);
    pose.heave = finite(pose.heave) ? clamp(pose.heave, -2, 2) : 0;
    pose.pitch = finite(pose.pitch) ? clamp(pose.pitch, -0.5, 0.5) : 0;
    pose.roll = finite(pose.roll) ? clamp(pose.roll, -0.55, 0.55) : 0;
    this.forwardSpeed = finite(this.forwardSpeed) ? clamp(this.forwardSpeed, -3, 9) : 0;
    this.lateralSpeed = finite(this.lateralSpeed) ? clamp(this.lateralSpeed, -5, 5) : 0;
    this.headingRate = finite(this.headingRate) ? clamp(this.headingRate, -MAX_YAW_RATE, MAX_YAW_RATE) : 0;
    pose.speed = finite(pose.speed) ? clamp(pose.speed, 0, 10) : 0;
    pose.luff = finite(pose.luff) ? clamp(pose.luff, 0, 1) : 0;
    pose.shake = finite(pose.shake) ? clamp(pose.shake, 0, 1) : 0;
  }
}
