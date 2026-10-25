import { BufferAttribute, BufferGeometry, Group, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { sharedInstancedMesh } from '../../../engine/instancing';
import type { CircleObstacle, Tier } from '../../contracts';
import { ROCK_ASSETS } from '../../terrain/rock-assets';
import { createRockMaterial } from '../../terrain/terrain-material';
import { mulberry32 } from '../../../util/math';
import { keelhavenHeight } from './height';
import { KEELHAVEN as K, toFrame, toWorld } from './layout';
import { inTown } from './town';
import { inWorks } from './works';
import { KEELHAVEN_WRECKS } from './wrecks';

/**
 * Keelhaven's loose stone: basalt boulders fallen to the sea cliffs' feet round the outer coast (in
 * the surf), a scatter at the cove's two points and the beach's ends, heads of rock breaking the
 * water round the reef's wrecks, and rubble round the sea stacks' feet. In the shared rock material,
 * instanced (Thousand-Bough's look: no new shader).
 */
export interface RockSpot {
  asset: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
}

const F = { u: 0, v: 0 };

/** Every rock (seeded, pure): `lite` keeps only the big ones. */
export function keelhavenRockSpots(lite = false): RockSpot[] {
  const rand = mulberry32(0x6b0c);
  const out: RockSpot[] = [];
  const add = (x: number, z: number, size: number, flat: number) => {
    if (lite && size < 2.6) return;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (Math.max(o.sx, o.sz) + size) * 0.5)) return;
    const y = keelhavenHeight(x, z);
    out.push({
      asset: Math.floor(rand() * 3) % 3,
      x,
      y: y - size * flat * 0.3,
      z,
      sx: size * (0.8 + rand() * 0.5),
      sy: size * flat,
      sz: size * (0.8 + rand() * 0.5),
      yaw: rand() * Math.PI * 2,
    });
  };
  // At the sea cliffs' feet, in the surf: where the ground meets the sea under a steep face, out of
  // the cove (and off the reef's flat, which has its own).
  const b = K.bounds;
  for (let i = 0; i < 2600 && out.length < 70; i++) {
    const x = b.minX + 60 + rand() * (b.maxX - b.minX - 120);
    const z = b.minZ + 60 + rand() * (b.maxZ - b.minZ - 120);
    const h = keelhavenHeight(x, z);
    if (h < -1.6 || h > 1.2) continue;
    toFrame(x, z, F);
    if (F.u > -230 && Math.abs(F.v) < 105) continue;
    const up = Math.max(
      keelhavenHeight(x + 8, z),
      keelhavenHeight(x - 8, z),
      keelhavenHeight(x, z + 8),
      keelhavenHeight(x, z - 8),
    );
    if (up < h + 6) continue;
    const size = 1.6 + rand() * rand() * 5;
    add(x, z, size, 0.55 + rand() * 0.3);
    // A few smaller ones round it.
    for (let k = 0; k < 2; k++)
      if (rand() < 0.6)
        add(x + (rand() - 0.5) * size * 3, z + (rand() - 0.5) * size * 3, size * (0.35 + rand() * 0.3), 0.6);
  }
  // The cove's points and the beach's ends.
  for (const [u, v] of [
    [-236, -112],
    [-228, -104],
    [-246, 120],
    [-238, 112],
    [-18, -94],
    [-30, 90],
    [-24, 96],
  ] as const) {
    const p = toWorld(u, v);
    for (let k = 0; k < 4; k++) {
      const x = p.x + (rand() - 0.5) * 14;
      const z = p.z + (rand() - 0.5) * 14;
      toFrame(x, z, F);
      if (inWorks(F.u, F.v, 2) || inTown(F.u, F.v, 2)) continue;
      add(x, z, 1.2 + rand() * 2.6, 0.6);
    }
  }
  // Heads of rock breaking the water round the reef's wrecks.
  for (const w of KEELHAVEN_WRECKS)
    for (let k = 0; k < 4; k++) {
      const a = rand() * Math.PI * 2;
      const r = 12 + rand() * 14;
      add(w.pose.x + Math.cos(a) * r, w.pose.z + Math.sin(a) * r, 1.6 + rand() * 1.8, 0.7);
    }
  // Rubble round the sea stacks' feet.
  for (const st of K.seaStacks)
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI * 2;
      const r = st.radius * (1.05 + rand() * 0.3);
      add(st.x + Math.cos(a) * r, st.z + Math.sin(a) * r, Math.min(4, st.radius * 0.3) + rand(), 0.6);
    }
  return out;
}

export interface KeelhavenRocks {
  group: Group;
  /** The beach's and the points' boulders, for walkers (the surf's are out of reach). */
  circles: CircleObstacle[];
  dispose(): void;
}

const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const Y = new Vector3(0, 1, 0);

export function createKeelhavenRocks(tier: Tier): KeelhavenRocks {
  const group = new Group();
  group.name = 'keelhaven-rocks';
  const material = createRockMaterial({ basalt: true });
  const spots = keelhavenRockSpots(tier === 'lite');
  const circles: CircleObstacle[] = [];
  const geometries: BufferGeometry[] = [];
  for (let a = 0; a < 3; a++) {
    const asset = ROCK_ASSETS[a]!;
    const mine = spots.filter((s) => s.asset === a);
    if (mine.length === 0) continue;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(asset.normals, 3));
    geometry.setIndex(new BufferAttribute(asset.indices, 1));
    geometries.push(geometry);
    const mesh = sharedInstancedMesh(geometry, material, mine.length);
    mesh.name = `keelhaven-rocks-${asset.key}`;
    mine.forEach((s, i) => {
      Q.setFromAxisAngle(Y, s.yaw);
      mesh.setMatrixAt(i, M.compose(P.set(s.x, s.y, s.z), Q, S.set(s.sx, s.sy, s.sz)));
      if (s.y > -1)
        circles.push({
          x: s.x,
          z: s.z,
          r: Math.max(s.sx, s.sz) * 0.42,
          y0: s.y - 1,
          y1: s.y + s.sy,
          height: s.sy,
        });
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return {
    group,
    circles,
    dispose() {
      for (const g of geometries) g.dispose();
      material.dispose();
    },
  };
}
