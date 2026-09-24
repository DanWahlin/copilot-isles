import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { WaveField } from './waves';
import type { Brigantine } from '../ship';
import { COVE } from '../layout';

interface FlotsamItem {
  x: number;
  z: number;
  vx: number;
  vz: number;
  rot: number;
  spin: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  kind: 'box' | 'cylinder';
}

const HARBOR_X = COVE.harbor.center.x;
const HARBOR_Z = COVE.harbor.center.z;
const HARBOR_R = COVE.harbor.radius - 8;
const BOX_COUNT = 4;
const CYL_COUNT = 3;

export class HarborFlotsam {
  readonly group = new Group();
  readonly boxMesh: InstancedMesh;
  readonly cylinderMesh: InstancedMesh;
  private readonly items: FlotsamItem[];
  private readonly mat = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'XYZ');
  private readonly scale = new Vector3();
  private readonly waveVelocity = new Float32Array(2);
  private readonly capsules: Float32Array;

  constructor(tier: TierSettings) {
    const enabled = tier.tier !== 'lite';
    this.items = enabled
      ? [
          {
            kind: 'box',
            x: -119,
            z: -120,
            vx: 0.015,
            vz: 0.006,
            rot: 0.3,
            spin: 0.07,
            scaleX: 1.05,
            scaleY: 0.45,
            scaleZ: 0.72,
          },
          {
            kind: 'box',
            x: -91,
            z: -126,
            vx: -0.01,
            vz: 0.013,
            rot: 1.1,
            spin: -0.05,
            scaleX: 1.45,
            scaleY: 0.14,
            scaleZ: 0.3,
          },
          {
            kind: 'box',
            x: -132,
            z: -108,
            vx: 0.012,
            vz: -0.008,
            rot: 2.0,
            spin: 0.04,
            scaleX: 1.7,
            scaleY: 0.12,
            scaleZ: 0.32,
          },
          {
            kind: 'box',
            x: -106,
            z: -137,
            vx: 0.006,
            vz: 0.01,
            rot: 0.7,
            spin: 0.03,
            scaleX: 0.72,
            scaleY: 0.52,
            scaleZ: 0.72,
          },
          {
            kind: 'cylinder',
            x: -125,
            z: -132,
            vx: 0.008,
            vz: -0.012,
            rot: 0.1,
            spin: 0.1,
            scaleX: 0.65,
            scaleY: 0.8,
            scaleZ: 0.65,
          },
          {
            kind: 'cylinder',
            x: -87,
            z: -113,
            vx: -0.014,
            vz: -0.006,
            rot: 1.4,
            spin: -0.08,
            scaleX: 0.48,
            scaleY: 0.55,
            scaleZ: 0.48,
          },
          {
            kind: 'cylinder',
            x: -113,
            z: -94,
            vx: 0.01,
            vz: 0.006,
            rot: 2.2,
            spin: 0.06,
            scaleX: 0.32,
            scaleY: 0.5,
            scaleZ: 0.32,
          },
        ]
      : [];
    const boxMaterial = new MeshStandardNodeMaterial({ color: 0x8a5f32, roughness: 0.82, metalness: 0.02 });
    const cylinderMaterial = new MeshStandardNodeMaterial({
      color: 0x9a5a2a,
      roughness: 0.78,
      metalness: 0.02,
    });
    this.boxMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), boxMaterial, BOX_COUNT);
    this.cylinderMesh = new InstancedMesh(
      new CylinderGeometry(0.5, 0.5, 1, 10, 1),
      cylinderMaterial,
      CYL_COUNT,
    );
    this.boxMesh.name = 'harbor flotsam boxes planks crate';
    this.cylinderMesh.name = 'harbor flotsam barrels buoy';
    this.boxMesh.count = enabled ? BOX_COUNT : 0;
    this.cylinderMesh.count = enabled ? CYL_COUNT : 0;
    this.group.name = 'harbor flotsam';
    this.group.add(this.boxMesh, this.cylinderMesh);
    this.capsules = new Float32Array(10 * 3);
  }

  update(dt: number, t: number, waves: WaveField, ship: Brigantine): void {
    if (this.items.length === 0) return;
    ship.dynamics.writeWorldCapsules(this.capsules);
    let bi = 0;
    let ci = 0;
    for (const item of this.items) {
      waves.velocityAt(item.x, item.z, t, this.waveVelocity);
      item.vx += this.waveVelocity[0] * 0.012 * dt + Math.sin(t * 0.07 + item.rot) * 0.004 * dt;
      item.vz += this.waveVelocity[1] * 0.012 * dt + Math.cos(t * 0.061 + item.rot) * 0.004 * dt;
      const dx = item.x - HARBOR_X;
      const dz = item.z - HARBOR_Z;
      const d = Math.hypot(dx, dz);
      if (d > HARBOR_R) {
        item.vx -= (dx / Math.max(0.001, d)) * (d - HARBOR_R) * 0.08 * dt;
        item.vz -= (dz / Math.max(0.001, d)) * (d - HARBOR_R) * 0.08 * dt;
      }
      for (let i = 0; i < this.capsules.length; i += 3) {
        const cx = this.capsules[i]!;
        const cz = this.capsules[i + 1]!;
        const r = this.capsules[i + 2]! + 1.1;
        const sx = item.x - cx;
        const sz = item.z - cz;
        const sd = Math.hypot(sx, sz);
        if (sd > 0.001 && sd < r) {
          const push = (r - sd) * 0.32 * dt;
          item.vx += (sx / sd) * push;
          item.vz += (sz / sd) * push;
        }
      }
      item.vx *= Math.exp(-0.18 * dt);
      item.vz *= Math.exp(-0.18 * dt);
      item.x += item.vx * dt;
      item.z += item.vz * dt;
      item.rot += item.spin * dt;
      const y = waves.heightAt(item.x, item.z, t) + 0.18 + Math.sin(t * 0.9 + item.rot) * 0.05;
      this.pos.set(item.x, y, item.z);
      this.euler.set(Math.sin(t + item.rot) * 0.08, item.rot, Math.cos(t * 0.7 + item.rot) * 0.08, 'XYZ');
      this.quat.setFromEuler(this.euler);
      this.scale.set(item.scaleX, item.scaleY, item.scaleZ);
      this.mat.compose(this.pos, this.quat, this.scale);
      if (item.kind === 'box') this.boxMesh.setMatrixAt(bi++, this.mat);
      else this.cylinderMesh.setMatrixAt(ci++, this.mat);
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.cylinderMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.boxMesh.geometry.dispose();
    this.cylinderMesh.geometry.dispose();
    if (Array.isArray(this.boxMesh.material)) for (const m of this.boxMesh.material) m.dispose();
    else this.boxMesh.material.dispose();
    if (Array.isArray(this.cylinderMesh.material)) for (const m of this.cylinderMesh.material) m.dispose();
    else this.cylinderMesh.material.dispose();
  }
}
