import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
  type Material,
} from 'three/webgpu';
import { sharedInstancedMesh } from '../../../engine/instancing';
import type { CircleObstacle, HeightField } from '../../contracts';
import { ROCK_ASSETS } from '../../terrain/rock-assets';
import { createRockMaterial } from '../../terrain/terrain-material';
import type { CameraBlockerBox } from '../../terrain/camera-blockers';
import { meshCameraBlockers } from '../../terrain/camera-blockers';
import { mulberry32 } from '../../../util/math';
import { villageWalkable } from './village/surfaces';
import { THOUSAND_BOUGH as TB } from './layout';
import { fernWalkAt, thousandBoughHeight, thousandBoughWater } from './height';
import { WalkClearance } from './village/clearance';
import { SPIRE_LEDGE, SPIRE_TOP } from './village/surfaces';

/**
 * Thousand-Bough's stone: mossy boulders round the Booth Pools (one carries a starfish), round the
 * falls' pools, at the cliffs' feet and through the jungle; the rock lintel that roofs the cave behind
 * Great Falls; and the Spire, a cluster of basalt columns with its flat top (Lookout 5173) and south
 * ledge (Lookout 5174). All in the shared rock material, instanced (no new shader).
 */

export interface RockSpot {
  asset: number;
  x: number;
  y: number;
  z: number;
  /** Size (m) along x, y, z, and yaw. */
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  /** Sunk this share of its height into the ground. */
  sink: number;
}

/** The starfish's mossy stone by the Booth Pools: its top is the starfish's height. */
export const STARFISH_STONE = (() => {
  const s = TB.starfish.find((f) => f.id === 'sf.t.booths')!;
  return { x: s.x, z: s.z, top: s.y };
})();

/** The rock lintel roofing the cave behind Great Falls. */
export const CAVE_ROOF = (() => {
  const c = TB.cave;
  return { x: c.mouth.x, z: c.mouth.z - c.depth / 2 - 0.5, bottom: c.floor + c.height };
})();

/** Each rock asset's height at scale 1 (its base is at y 0). */
export const ROCK_HEIGHTS: readonly number[] = ROCK_ASSETS.map((a) => {
  let top = -Infinity;
  for (let i = 1; i < a.positions.length; i += 3) top = Math.max(top, a.positions[i]!);
  return top;
});

/** The world height of a rock's top. */
export function rockTop(s: RockSpot): number {
  return s.y - s.sy * s.sink + s.sy * ROCK_HEIGHTS[s.asset]!;
}

/** Every rock spot (seeded, pure): the tests audit them against the ground and the walks. */
export function thousandBoughRockSpots(clearance: WalkClearance = new WalkClearance()): RockSpot[] {
  const rand = mulberry32(0x60c5);
  const water = thousandBoughWater();
  const out: RockSpot[] = [];
  const free = (x: number, z: number, r: number, y: number, h: number) =>
    Math.hypot(x - STARFISH_STONE.x, z - STARFISH_STONE.z) > r + 2.5 &&
    !clearance.conflict(x, y + h / 2, z, Math.max(r, h / 2), { beside: 1.4, above: 2, below: 1.5 }) &&
    !out.some((o) => Math.hypot(o.x - x, o.z - z) < (Math.max(o.sx, o.sz) + r * 2) * 0.5);
  const add = (asset: number, x: number, z: number, size: number, flat = 0.7, sink = 0.3) => {
    const ground = thousandBoughHeight(x, z);
    const sx = size * (0.9 + rand() * 0.4);
    const sz = size * (0.8 + rand() * 0.4);
    const sy = (size * flat * (0.8 + rand() * 0.3)) / ROCK_HEIGHTS[asset]!;
    if (!free(x, z, Math.max(sx, sz) * 0.5, ground, sy * ROCK_HEIGHTS[asset]!)) return false;
    out.push({ asset, x, y: ground, z, sx, sy, sz, yaw: rand() * Math.PI * 2, sink });
    return true;
  };
  // The starfish lies in the glade's moss, clear for 2.5 m round (no stone where you'd stand to reach it).
  void STARFISH_STONE;
  // Round the Booth Pools and the falls' pools.
  for (const p of [...TB.pools.booths, TB.pools.upper, TB.pools.mirror, TB.pools.silver]) {
    const n = p.r < 6 ? 4 : 10;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.5;
      const rr = p.r * (1.08 + rand() * 0.2) + 0.6;
      const x = p.x + Math.cos(a) * rr;
      const z = p.z + Math.sin(a) * rr;
      if (water.shoreDistance(x, z, 4) < 0.4) continue;
      add(k % 3, x, z, p.r < 6 ? 1.1 + rand() * 0.8 : 2 + rand() * 2.4, 0.6);
    }
  }
  // At the cliffs' feet (where the valley meets the fluted faces) and through the jungle.
  for (let tries = 0; tries < 900 && out.length < 120; tries++) {
    const x = 1800 + rand() * 480;
    const z = -1700 + rand() * 430;
    const h = thousandBoughHeight(x, z);
    if (h < 5 || h > 40) continue;
    const e = 3;
    const slope =
      Math.hypot(
        thousandBoughHeight(x + e, z) - thousandBoughHeight(x - e, z),
        thousandBoughHeight(x, z + e) - thousandBoughHeight(x, z - e),
      ) /
      (2 * e);
    const foot = slope > 0.35 && slope < 0.9;
    if (!foot && rand() > 0.18) continue;
    if (water.shoreDistance(x, z, 4) < 1.5) continue;
    if (Math.hypot(x - TB.spire.x, z - TB.spire.z) < 12) continue;
    if (Math.hypot(x - TB.tree.x, z - TB.tree.z) < 30) continue;
    add(Math.floor(rand() * 3), x, z, foot ? 2.4 + rand() * 4 : 1.2 + rand() * 1.8, foot ? 0.75 : 0.55);
  }
  // Low edging stones along both sides of the Fern Walk (every 2.4 m or so, now and then a gap), so
  // the path reads as made: just off its edge, never on it, a walk surface or the water.
  const fw = TB.fernWalk;
  const half = fw.width / 2;
  for (let i = 0; i < fw.points.length - 1; i++) {
    const a = fw.points[i]!;
    const b = fw.points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    for (let d = 1.2; d < len - 1.2; d += 2.1 + rand() * 0.8)
      for (const side of [-1, 1]) {
        if (rand() < 0.18) continue;
        const off = half + 0.5 + rand() * 0.25;
        const x = a.x + ux * d - uz * off * side;
        const z = a.z + uz * d + ux * off * side;
        const ground = thousandBoughHeight(x, z);
        if (ground < 3) continue;
        if (Math.hypot(x - TB.tree.x, z - TB.tree.z) < TB.rootHall.rOuter + 3) continue;
        if (water.shoreDistance(x, z, 4) < 1) continue;
        const walk = fernWalkAt(x, z);
        if (walk && walk.d < half + 0.3) continue;
        if (villageWalkable(x, z) !== null) continue;
        if (Object.values(TB.anchors).some((p) => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (Math.max(o.sx, o.sz) + 0.7) * 0.6)) continue;
        if (Math.hypot(x - STARFISH_STONE.x, z - STARFISH_STONE.z) < 3) continue;
        const size = 0.45 + rand() * 0.3;
        out.push({
          asset: Math.floor(rand() * 3),
          x,
          y: ground,
          z,
          sx: size,
          sy: (size * 0.5) / ROCK_HEIGHTS[0]!,
          sz: size * (0.8 + rand() * 0.3),
          yaw: rand() * Math.PI * 2,
          sink: 0.35,
        });
      }
  }
  return out;
}

const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const Y = new Vector3(0, 1, 0);

function rockMatrix(s: RockSpot, out: Matrix4): Matrix4 {
  Q.setFromAxisAngle(Y, s.yaw);
  // The kit rocks are about a metre across, their base at y 0.
  P.set(s.x, s.y - s.sy * s.sink, s.z);
  S.set(s.sx, s.sy, s.sz);
  return out.compose(P, Q, S);
}

/** The Spire: a cluster of hexagonal basalt columns, flat on top at 27 and stepped to the ledge at 24.5. */
export function spireGeometry(): BufferGeometry {
  const rand = mulberry32(0x5b17);
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const col = 1.25;
  const base = TB.spire.ground - 1.5;
  const prism = (cx: number, cz: number, top: number, r: number) => {
    const start = pos.length / 3;
    const corners: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.1;
      corners.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    // Sides (flat-shaded quads) up to a chamfer, the chamfer's bevel, then the inset cap: a basalt
    // column's worn edge (not a crate's square one).
    const bevel = Math.min(0.28, r * 0.22);
    const sideTop = top - bevel;
    const inner = corners.map(
      ([x, z]) => [cx + (x - cx) * (1 - bevel / r), cz + (z - cz) * (1 - bevel / r)] as const,
    );
    for (let k = 0; k < 6; k++) {
      const [ax, az] = corners[k]!;
      const [bx, bz] = corners[(k + 1) % 6]!;
      const l = Math.hypot(bx - ax, bz - az);
      // Outward (the corners run anticlockwise in x, z).
      const nx = (bz - az) / l;
      const nz = (ax - bx) / l;
      const v = pos.length / 3;
      pos.push(ax, base, az, bx, base, bz, ax, sideTop, az, bx, sideTop, bz);
      for (let i = 0; i < 4; i++) nrm.push(nx, 0, nz);
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      const [ix, iz] = inner[k]!;
      const [jx, jz] = inner[(k + 1) % 6]!;
      const c = pos.length / 3;
      pos.push(ax, sideTop, az, bx, sideTop, bz, ix, top, iz, jx, top, jz);
      const bl = Math.hypot(nx, 1, nz);
      for (let i = 0; i < 4; i++) nrm.push(nx / bl, 1 / bl, nz / bl);
      idx.push(c, c + 2, c + 1, c + 1, c + 2, c + 3);
    }
    // The cap.
    const c = pos.length / 3;
    pos.push(cx, top, cz);
    nrm.push(0, 1, 0);
    for (const [x, z] of inner) {
      pos.push(x, top, z);
      nrm.push(0, 1, 0);
    }
    for (let k = 0; k < 6; k++) idx.push(c, c + 1 + ((k + 1) % 6), c + 1 + k);
    void start;
  };
  const step = col * Math.sqrt(3);
  for (let q = -4; q <= 4; q++)
    for (let r = -4; r <= 4; r++) {
      const x = TB.spire.x + step * (q + r * 0.5);
      const z = TB.spire.z + col * 1.5 * r;
      const d = Math.hypot(x - TB.spire.x, z - TB.spire.z);
      const onTop = d <= SPIRE_TOP.r - 0.2;
      const lx = x - SPIRE_LEDGE.x;
      const lz = z - SPIRE_LEDGE.z;
      const onLedge = Math.abs(lx) <= SPIRE_LEDGE.hu + 0.4 && Math.abs(lz) <= SPIRE_LEDGE.hv + 0.4 && !onTop;
      if (d > TB.spire.radius + 1.2 && !onLedge) continue;
      // The walk surfaces' columns are flush with them (2 cm under, the boards and the moss on top);
      // round the rim they stand a little lower and break up the outline.
      let top: number;
      if (onTop) top = SPIRE_TOP.y - 0.02;
      else if (onLedge) top = TB.spire.ledge.y - 0.25;
      else top = SPIRE_TOP.y - 0.8 - Math.pow(rand(), 0.7) * 7;
      prism(x, z, top, col * (onTop || onLedge ? 0.99 : 0.9 + rand() * 0.15));
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Maximum flume stones of one asset shown at a time. */
const FLUME_STONE_SLOTS = 4;

/**
 * The Flume Terrace's stones (its rock tiles, Round 3's boulder and the chips it knocks loose). The
 * flume creates and owns its own meshes, using these shared island geometries and material.
 */
export interface FlumeStones {
  /** One geometry per rock asset (`ROCK_ASSETS` order). */
  geometries: BufferGeometry[];
  /** The same rock material used by the island batches. */
  readonly material: Material;
  /** Instance capacity of each flume mesh. */
  readonly slots: number;
  /** Lite: the boulder takes the cheapest rock and knocks no chips loose. */
  readonly cheap: boolean;
  /** Whether the island's rock batches cast the sun's shadow on this tier. */
  readonly shadows: boolean;
}

export interface ThousandBoughRocks {
  group: Group;
  circles: CircleObstacle[];
  cameraBoxes: CameraBlockerBox[];
  flumeStones: FlumeStones;
}

/** The rocks and the Spire, instanced in the shared rock material. */
export function createThousandBoughRocks(
  heightField: HeightField,
  clearance?: WalkClearance,
  /** The share of the small stones kept (Lite and Low thin them; the boulders all stay). */
  smallKept = 1,
  /** Whether the boulders cast the sun's shadow (the Spire always does). */
  shadows = true,
): ThousandBoughRocks {
  void heightField;
  const group = new Group();
  group.name = 'thousand-bough-rocks';
  const material = createRockMaterial({ basalt: true });
  let small = 0;
  const spots = thousandBoughRockSpots(clearance).filter((s) => {
    if (Math.max(s.sx, s.sz) >= 2.2) return true;
    small += smallKept;
    if (small < 1) return false;
    small -= 1;
    return true;
  });
  const circles: CircleObstacle[] = [];
  const cameraBoxes: CameraBlockerBox[] = [];
  const flumeStones: FlumeStones = {
    geometries: [],
    material,
    slots: FLUME_STONE_SLOTS,
    cheap: smallKept < 0.25,
    shadows,
  };
  for (let a = 0; a < 3; a++) {
    const asset = ROCK_ASSETS[a]!;
    const mine = spots.filter((s) => s.asset === a);
    // The cave's roof: two great slabs across the notch, in the first asset's batch.
    const roof = a === 0 ? 2 : 0;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(asset.normals, 3));
    geometry.setIndex(new BufferAttribute(asset.indices, 1));
    flumeStones.geometries.push(geometry);
    const mesh = sharedInstancedMesh(geometry, material, mine.length + roof);
    mesh.name = `thousand-bough-rocks-${asset.key}`;
    mine.forEach((s, i) => {
      mesh.setMatrixAt(i, rockMatrix(s, M));
      circles.push({
        x: s.x,
        z: s.z,
        r: Math.max(s.sx, s.sz) * 0.42,
        y0: s.y - 1,
        y1: rockTop(s),
        height: rockTop(s) - s.y,
      });
      meshCameraBlockers(asset.positions, M, cameraBoxes, 2);
    });
    for (let k = 0; k < roof; k++) {
      const c = CAVE_ROOF;
      Q.setFromAxisAngle(Y, 0.3 + k * 1.2);
      P.set(c.x + (k - 0.5) * 4, c.bottom, c.z - k * 2);
      S.set(16, 9, 14);
      mesh.setMatrixAt(mine.length + k, M.compose(P, Q, S));
      meshCameraBlockers(asset.positions, M, cameraBoxes, 3);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const spire = sharedInstancedMesh(spireGeometry(), material, 1);
  spire.name = 'thousand-bough-spire';
  spire.setMatrixAt(0, M.identity());
  spire.instanceMatrix.needsUpdate = true;
  spire.computeBoundingSphere();
  spire.castShadow = true;
  spire.receiveShadow = true;
  group.add(spire);
  // The Spire's sides keep walkers and the camera off.
  circles.push({
    x: TB.spire.x,
    z: TB.spire.z,
    r: TB.spire.radius + 0.9,
    y0: TB.spire.ground - 3,
    y1: TB.spire.ledge.y - 0.6,
    height: 12,
  });
  // Under the ledge the outer columns reach about 9.5 m out: three crossed boxes (a hexagon) there.
  const under = TB.spire.ledge.y - 0.8;
  for (let y = TB.spire.ground; y < under; y += 3)
    for (let k = 0; k < 3; k++)
      cameraBoxes.push({
        x: TB.spire.x,
        z: TB.spire.z,
        hx: 9.2,
        hz: 7.2,
        rot: 0.1 + (k * Math.PI) / 3,
        y0: y,
        y1: Math.min(under, y + 3),
      });
  for (let y = TB.spire.ground; y < TB.spire.top; y += 3)
    cameraBoxes.push({
      x: TB.spire.x,
      z: TB.spire.z,
      hx: 6.2,
      hz: 6.2,
      rot: 0.4,
      y0: y,
      y1: Math.min(TB.spire.top - 0.2, y + 3),
    });
  return { group, circles, cameraBoxes, flumeStones };
}
