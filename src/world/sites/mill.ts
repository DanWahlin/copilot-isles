import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu';
import { color, float, mix, positionWorld, sin, uniform } from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { COVE } from '../layout';
import { ROCK_ASSETS } from '../terrain/rock-assets';
import { createRockMaterial } from '../terrain/terrain-material';
import { world } from '../uniforms';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village';
import { box, cylinder, merge, plank, TRIM } from './geo';
import { WaterStrips } from './water';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

export type MillTileKind = 'straight' | 'corner' | 'cap' | 'blank';

/** What the sluice logic says about one cell's water (mirrors game/puzzles/sluice-logic CellFlow). */
export interface MillCellWater {
  wet: boolean;
  /** Side the water enters through (0 N, 1 E, 2 S, 3 W). */
  entry: number | null;
  /** Open sides at the current rotation (bitmask). */
  mask: number;
  through: number;
  pooled: number;
  distance: number;
}

export interface MillSite {
  readonly group: Group;
  /** Terrace deck height. */
  readonly top: number;
  readonly rows: number;
  readonly cols: number;
  /** Walkable deck and stairs (null elsewhere). */
  heightAt(x: number, z: number): number | null;
  readonly colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  readonly anchors: Record<string, VillageAnchor>;
  /** Everything vegetation should keep off (the terrace, stairs, pool, and spring rocks). */
  excludes(x: number, z: number): boolean;
  cellCenter(i: number): { x: number; z: number };
  /** Grid cell under (x, z), or -1. */
  cellAt(x: number, z: number): number;
  /** Turns a tile to `quarterTurns` clockwise; animated unless `snap`. */
  setRotation(i: number, quarterTurns: number, snap?: boolean): void;
  /** True while any tile is still turning. */
  readonly turning: boolean;
  /** The subtle outline on the tile you're facing, and the gold pulse used by hints. */
  setFocus(i: number): void;
  setHint(i: number): void;
  /** The logic's view of the water; the site animates draining and filling toward it. */
  setWater(cells: readonly MillCellWater[], gateOpen: boolean, solved: boolean): void;
  setLever(pulled: boolean, snap?: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

export interface MillOptions {
  tier: TierSettings;
  heightField: HeightField;
  kit: VillageKit;
  kinds: readonly MillTileKind[];
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

const TILE_H = 0.5;
const TROUGH = 0.6;
const TROUGH_D = 0.28;
const GAP = 0.1;
/** The kit's rubble texture repeats every 2 m, so its stones read at the village's scale. */
const SUV = 0.5;
// Tints multiply the kit's painted textures, so they stay close to white.
const STONE = 0xf6e6ca;
const STONE_DARK = 0xdcc9aa;
const STONE_WET = 0x9d9282;
const COPING = 0xfff6e2;
const TILE = 0xe9dcc4;
const STUD = 0x7a6248;
const WOOD = 0xf2e4d2;
const WOOD_DARK = 0xe2cfb9;
const IRON = 0x3a3836;

const sbox = (w: number, h: number, d: number, p: Parameters<typeof box>[3], hex: number) =>
  box(w, h, d, p, hex, SUV);

/**
 * P0.1's set piece (POC §4.5): a low limestone terrace with a 3 × 4 grid of rotatable channel
 * tiles, the Actions spring spouting from rocks into a gated basin, an outlet flume feeding a
 * breastshot waterwheel in a tail pool, four lanterns, painted signs, and west stairs. Draws:
 * terrace, wood, iron, tiles (one per cell), wheel, gate, lever, lanterns, rocks, water, signs, and
 * two outline frames.
 */
export function createMill(o: MillOptions): MillSite {
  const { heightField: hf, kit } = o;
  const M = COVE.mill;
  const T = M.tile;
  const rows = M.rows,
    cols = M.cols;
  const group = new Group();
  group.name = 'mill race (P0.1)';

  const gx0 = M.x - (cols / 2) * T,
    gx1 = M.x + (cols / 2) * T;
  const gz0 = M.z - (rows / 2) * T,
    gz1 = M.z + (rows / 2) * T;
  const tx0 = gx0 - 0.6,
    tx1 = gx1 + 0.6,
    tz0 = gz0 - 0.6,
    tz1 = gz1 + 1.6;
  const cellX = (c: number) => M.x + (c - (cols - 1) / 2) * T;
  const cellZ = (r: number) => M.z + ((rows - 1) / 2 - r) * T;
  const src = { c: cols - 1 };
  const cx = cellX(src.c);
  const basin = { x0: cx - T / 2, x1: cx + T / 2, z0: gz1, z1: gz1 + 2.2 };

  // Deck height: a hand's width above the highest ground it covers (the slope falls north, so the
  // north wall stands about 1.4 m and the south edge meets the hillside).
  let maxG = -Infinity,
    minG = Infinity;
  for (let x = tx0; x <= tx1 + 1e-6; x += 0.8)
    for (let z = tz0; z <= Math.max(tz1, basin.z1) + 1e-6; z += 0.8) {
      const h = hf.heightAt(x, z);
      maxG = Math.max(maxG, h);
      minG = Math.min(minG, h);
    }
  const top = maxG + 0.3;
  const base = minG - 0.6;

  const stone: BufferGeometry[] = [];
  const wood: BufferGeometry[] = [];
  const iron: BufferGeometry[] = [];

  // Outlet position (needed to cut the north rim).
  const out = { x: cellX(0), z0: gz0, z1: tz0 };
  const flumeY = top - TROUGH_D;

  // Terrace body (under the tiles), a footing course, and the deck around the grid.
  stone.push(
    sbox(tx1 - tx0, top - TILE_H - base, tz1 - tz0, { x: M.x, y: base, z: (tz0 + tz1) / 2 }, STONE_DARK),
  );
  stone.push(
    sbox(
      tx1 - tx0 + 0.24,
      minG + 0.42 - base,
      tz1 - tz0 + 0.24,
      { x: M.x, y: base, z: (tz0 + tz1) / 2 },
      STONE_WET,
    ),
  );
  const deck = (x0: number, x1: number, z0: number, z1: number) =>
    stone.push(
      sbox(x1 - x0, TILE_H, z1 - z0, { x: (x0 + x1) / 2, y: top - TILE_H, z: (z0 + z1) / 2 }, STONE),
    );
  deck(tx0, gx0, tz0, gz1); // west rim
  deck(gx1, tx1, tz0, gz1); // east rim
  deck(gx0, out.x - TROUGH / 2, tz0, gz0); // north rim, either side of the outlet
  deck(out.x + TROUGH / 2, gx1, tz0, gz0);
  deck(tx0, basin.x0, gz1, tz1); // south walk, west of the basin
  deck(basin.x1, tx1, gz1, tz1); // south walk, east of the basin
  // The outlet channel's bed through the north rim.
  stone.push(
    sbox(TROUGH, TILE_H - TROUGH_D, gz0 - tz0, { x: out.x, y: top - TILE_H, z: (gz0 + tz0) / 2 }, STONE_WET),
  );
  // Coping course round the outer edge, a shade lighter and a hand's width proud (broken by the outlet).
  const cope = 0.12;
  const coping = (x0: number, x1: number, z0: number, z1: number) =>
    stone.push(
      sbox(x1 - x0, cope, z1 - z0, { x: (x0 + x1) / 2, y: top - cope + 0.001, z: (z0 + z1) / 2 }, COPING),
    );
  coping(tx0 - 0.08, out.x - TROUGH / 2, tz0 - 0.08, tz0 + 0.3);
  coping(out.x + TROUGH / 2, tx1 + 0.08, tz0 - 0.08, tz0 + 0.3);
  coping(tx0 - 0.08, tx0 + 0.3, tz0, tz1 + 0.08);
  coping(tx1 - 0.3, tx1 + 0.08, tz0, tz1 + 0.08);

  // Basin: floor, three walls, and a low parapet (the gate closes its north side).
  stone.push(
    sbox(
      basin.x1 - basin.x0,
      top - 0.55 - base,
      basin.z1 - basin.z0,
      { x: cx, y: base, z: (basin.z0 + basin.z1) / 2 },
      STONE_WET,
    ),
  );
  const wallH = top + 0.35 - base;
  const basinZ = (basin.z0 + basin.z1) / 2 + 0.14;
  stone.push(
    sbox(0.28, wallH, basin.z1 - basin.z0 + 0.28, { x: basin.x0 - 0.14, y: base, z: basinZ }, STONE),
  );
  stone.push(
    sbox(0.28, wallH, basin.z1 - basin.z0 + 0.28, { x: basin.x1 + 0.14, y: base, z: basinZ }, STONE),
  );
  stone.push(sbox(basin.x1 - basin.x0, wallH, 0.28, { x: cx, y: base, z: basin.z1 + 0.14 }, STONE));
  for (const x of [basin.x0 - 0.14, basin.x1 + 0.14])
    stone.push(sbox(0.36, 0.08, basin.z1 - basin.z0 + 0.36, { x, y: base + wallH, z: basinZ }, COPING));
  stone.push(
    sbox(basin.x1 - basin.x0 + 0.64, 0.08, 0.36, { x: cx, y: base + wallH, z: basin.z1 + 0.14 }, COPING),
  );

  // West stairs down to the path from the quay.
  const stairs = { x1: tx0, z0: M.z - 1.1, z1: M.z + 1.1, rise: 0.22, tread: 0.36 };
  const footY = hf.heightAt(tx0 - 3, M.z);
  const steps = Math.max(1, Math.ceil((top - footY) / stairs.rise));
  const stairX0 = stairs.x1 - steps * stairs.tread;
  for (let s = 0; s < steps; s++) {
    const h = top - (s + 1) * stairs.rise;
    const x = stairs.x1 - (s + 0.5) * stairs.tread;
    stone.push(
      sbox(stairs.tread + 0.02, h - base + stairs.rise, stairs.z1 - stairs.z0, { x, y: base, z: M.z }, STONE),
    );
    // A lighter nosing on each tread.
    stone.push(
      sbox(
        0.12,
        0.05,
        stairs.z1 - stairs.z0,
        { x: x - stairs.tread / 2 + 0.06, y: h + stairs.rise - 0.04, z: M.z },
        COPING,
      ),
    );
  }
  // Cheek walls either side of the flight, stepping down with it.
  for (const z of [stairs.z0 - 0.15, stairs.z1 + 0.15])
    for (let s = 0; s < steps; s++) {
      const h = top + 0.25 - s * stairs.rise;
      const x = stairs.x1 - (s + 0.5) * stairs.tread;
      stone.push(sbox(stairs.tread + 0.01, h - base, 0.3, { x, y: base, z }, STONE_DARK));
    }

  // Breastshot waterwheel: fed at axle height by a short timber flume from the outlet channel, its
  // lower paddles dipping in the tail pool against the north wall.
  const wheel = { x: out.x, z: 0, r: 1.45, w: 0.9 };
  wheel.z = tz0 - 0.55 - wheel.r;
  const pool = { x0: wheel.x - 1.3, x1: wheel.x + 1.3, z0: wheel.z - wheel.r - 0.55, z1: tz0 - 0.02 };
  let poolG = Infinity,
    poolMax = -Infinity;
  for (let x = pool.x0; x <= pool.x1 + 1e-6; x += 0.5)
    for (let z = pool.z0; z <= pool.z1 + 1e-6; z += 0.5) {
      const h = hf.heightAt(x, z);
      poolG = Math.min(poolG, h);
      poolMax = Math.max(poolMax, h);
    }
  const poolY = poolMax + 0.12;
  const wheelY = poolY + wheel.r - 0.42;
  const feed = { z: wheel.z + wheel.r + 0.12, y: Math.min(flumeY, wheelY + 0.45) };
  // Flume: floor and sides, tilted from the wall to the wheel, on two knee braces.
  const flumeLen = tz0 - feed.z + 0.25;
  const flumeTilt = Math.atan2(flumeY - feed.y, flumeLen);
  const flumeZ = (tz0 + 0.25 + feed.z) / 2;
  const flumeMidY = (flumeY + feed.y) / 2;
  wood.push(
    plank(
      TROUGH + 0.24,
      0.08,
      flumeLen,
      { x: out.x, y: flumeMidY - 0.08, z: flumeZ, rx: -flumeTilt },
      WOOD_DARK,
      TRIM.dark,
    ),
  );
  for (const sx of [-1, 1])
    wood.push(
      plank(
        0.08,
        0.34,
        flumeLen,
        { x: out.x + sx * (TROUGH / 2 + 0.08), y: flumeMidY - 0.08, z: flumeZ, rx: -flumeTilt },
        WOOD_DARK,
        TRIM.dark,
      ),
    );
  for (const sx of [-1, 1])
    wood.push(
      plank(
        0.08,
        0.08,
        0.8,
        { x: out.x + sx * (TROUGH / 2 + 0.08), y: flumeMidY - 0.62, z: tz0 - 0.22, rx: 0.8 },
        WOOD_DARK,
        TRIM.dark,
      ),
    );

  // Tail pool round the wheel's foot, and its bearing piers.
  const rimTop = poolY + 0.32;
  const pb = Math.min(poolG, poolY) - 0.8;
  const poolMidZ = (pool.z0 + pool.z1) / 2 - 0.15;
  stone.push(
    sbox(pool.x1 - pool.x0 + 0.6, rimTop - pb, 0.3, { x: wheel.x, y: pb, z: pool.z0 - 0.15 }, STONE),
  );
  stone.push(
    sbox(0.3, rimTop - pb, pool.z1 - pool.z0 + 0.3, { x: pool.x0 - 0.15, y: pb, z: poolMidZ }, STONE),
  );
  stone.push(
    sbox(0.3, rimTop - pb, pool.z1 - pool.z0 + 0.3, { x: pool.x1 + 0.15, y: pb, z: poolMidZ }, STONE),
  );
  stone.push(
    sbox(pool.x1 - pool.x0 + 0.72, 0.08, 0.42, { x: wheel.x, y: rimTop, z: pool.z0 - 0.15 }, COPING),
  );
  for (const x of [pool.x0 - 0.15, pool.x1 + 0.15])
    stone.push(sbox(0.42, 0.08, pool.z1 - pool.z0 + 0.42, { x, y: rimTop, z: poolMidZ }, COPING));
  stone.push(
    sbox(
      pool.x1 - pool.x0,
      0.1,
      pool.z1 - pool.z0,
      { x: wheel.x, y: pb, z: (pool.z0 + pool.z1) / 2 },
      STONE_WET,
    ),
  );
  for (const sx of [-1, 1]) {
    const px = wheel.x + sx * (wheel.w / 2 + 0.28);
    stone.push(sbox(0.36, wheelY - pb, 0.6, { x: px, y: pb, z: wheel.z }, STONE_DARK));
    iron.push(box(0.4, 0.18, 0.4, { x: px, y: wheelY - 0.12, z: wheel.z }, IRON));
  }

  // Gate frame at the basin mouth, lintel, and the painted sign above it.
  const gateY = top - TROUGH_D;
  for (const sx of [-1, 1])
    wood.push(
      plank(
        0.16,
        1.9,
        0.2,
        { x: cx + sx * (TROUGH / 2 + 0.18), y: gateY - 0.1, z: gz1 + 0.05 },
        WOOD_DARK,
        TRIM.dark,
      ),
    );
  wood.push(plank(TROUGH + 0.7, 0.18, 0.24, { x: cx, y: gateY + 1.72, z: gz1 + 0.05 }, WOOD_DARK, TRIM.dark));
  // Lever stand and plaque lectern.
  const lever = { x: cellX(1) - 0.3, z: gz1 + 0.85 };
  wood.push(plank(0.22, 0.95, 0.22, { x: lever.x, y: top, z: lever.z }, WOOD_DARK, TRIM.dark));
  iron.push(box(0.3, 0.12, 0.3, { x: lever.x, y: top + 0.9, z: lever.z }, IRON));
  const plaque = { x: lever.x - 1.05, z: gz1 + 0.95 };
  wood.push(plank(0.12, 0.95, 0.12, { x: plaque.x, y: top, z: plaque.z }, WOOD_DARK, TRIM.dark));

  // Lantern posts at the terrace corners (heads light when the wheel turns).
  const lanterns: [number, number][] = [
    [tx0 + 0.3, tz0 + 0.3],
    [tx1 - 0.3, tz0 + 0.3],
    [tx0 + 0.3, tz1 - 0.3],
    [tx1 - 0.3, tz1 - 0.3],
  ];
  const glowParts: BufferGeometry[] = [];
  for (const [lx, lz] of lanterns) {
    stone.push(sbox(0.34, 0.22, 0.34, { x: lx, y: top, z: lz }, COPING));
    wood.push(plank(0.14, 2.1, 0.14, { x: lx, y: top + 0.2, z: lz }, WOOD_DARK, TRIM.dark));
    iron.push(box(0.34, 0.06, 0.34, { x: lx, y: top + 2.3, z: lz }, IRON));
    iron.push(box(0.3, 0.05, 0.3, { x: lx, y: top + 1.95, z: lz }, IRON));
    glowParts.push(box(0.24, 0.3, 0.24, { x: lx, y: top + 2.0, z: lz }, 0xffd9a0, 1, true));
    iron.push(cylinder(0.02, 0.2, 0.12, { x: lx, y: top + 2.36, z: lz }, IRON, 6));
  }

  // Signpost at the foot of the stairs.
  const post = { x: stairX0 - 0.7, z: M.z + 1.9 };
  const postY = hf.heightAt(post.x, post.z);
  wood.push(plank(0.14, 1.9, 0.14, { x: post.x, y: postY - 0.2, z: post.z }, WOOD_DARK, TRIM.dark));

  const stoneMesh = new Mesh(merge(stone), kit.materials.stone);
  stoneMesh.name = 'mill terrace';
  const woodMesh = new Mesh(merge(wood), kit.materials.wood);
  woodMesh.name = 'mill timber';
  const ironMesh = new Mesh(merge(iron), kit.materials.metal);
  ironMesh.name = 'mill ironwork';
  for (const m of [stoneMesh, woodMesh, ironMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(stoneMesh, woodMesh, ironMesh);

  // Lantern glass: dim by day, warm once the wheel turns (and brighter at night).
  const lit = uniform(0);
  const glowMat = new MeshBasicNodeMaterial({ transparent: true });
  const flicker = sin(world.time.mul(6.3).add((positionWorld as AnyNode).x.mul(1.7)))
    .mul(0.06)
    .add(0.94);
  glowMat.colorNode = mix(
    color(0x6b5a45),
    color(0xffc070).mul(float(1.3).add(world.night.mul(0.9))),
    lit.mul(flicker),
  ) as AnyNode;
  const glowMesh = new Mesh(merge(glowParts), glowMat);
  glowMesh.name = 'mill lanterns';
  group.add(glowMesh);

  // Channel tiles: one mesh per cell, sharing one geometry per kind.
  const kindGeo = new Map<MillTileKind, BufferGeometry>();
  const tileGeo = (kind: MillTileKind) => {
    let g = kindGeo.get(kind);
    if (!g) kindGeo.set(kind, (g = buildTile(kind)));
    return g;
  };
  const tiles: { mesh: Mesh; angle: number; target: number }[] = [];
  for (let i = 0; i < rows * cols; i++) {
    const kind = o.kinds[i] ?? 'blank';
    const mesh = new Mesh(tileGeo(kind), kit.materials.stone);
    mesh.name = `mill tile ${i} (${kind})`;
    mesh.position.set(cellX(i % cols), top, cellZ(Math.floor(i / cols)));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    tiles.push({ mesh, angle: 0, target: 0 });
  }

  // Outline frames: focus (soft white) and hint (gold pulse).
  const frameGeo = buildFrame(T - GAP + 0.04, 0.07);
  const frameMat = (hex: number, opacity: number) => {
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    m.color.setHex(hex);
    m.opacity = opacity;
    return m;
  };
  const focusMat = frameMat(0xfff4dd, 0.45);
  const hintMat = frameMat(0xffc45a, 0.8);
  const focusFrame = new Mesh(frameGeo, focusMat);
  const hintFrame = new Mesh(frameGeo, hintMat);
  focusFrame.visible = hintFrame.visible = false;
  focusFrame.renderOrder = hintFrame.renderOrder = 3;
  group.add(focusFrame, hintFrame);

  // The waterwheel.
  const wheelGroup = new Group();
  wheelGroup.position.set(wheel.x, wheelY, wheel.z);
  const wheelMesh = new Mesh(buildWheel(wheel.r, wheel.w), kit.materials.wood);
  wheelMesh.castShadow = true;
  wheelMesh.receiveShadow = true;
  wheelGroup.add(wheelMesh);
  group.add(wheelGroup);

  // Gate board (slides up) and the lever arm (pivots toward the grid when pulled).
  const gateBoard = new Mesh(
    merge([
      plank(TROUGH + 0.12, 0.72, 0.1, { y: 0 }, WOOD, TRIM.light),
      box(TROUGH + 0.16, 0.08, 0.13, { y: 0.62 }, 0x5a4a3a),
    ]),
    kit.materials.wood,
  );
  gateBoard.position.set(cx, gateY - 0.02, gz1 + 0.05);
  gateBoard.castShadow = true;
  group.add(gateBoard);
  const leverPivot = new Group();
  leverPivot.position.set(lever.x, top + 0.98, lever.z);
  const leverArm = new Mesh(
    merge([
      plank(0.07, 0.85, 0.07, { y: 0 }, WOOD, TRIM.light),
      plank(0.14, 0.14, 0.14, { y: 0.82 }, 0x6b5a4a, TRIM.dark),
    ]),
    kit.materials.wood,
  );
  leverArm.castShadow = true;
  leverPivot.add(leverArm);
  group.add(leverPivot);

  // Spring rocks (instanced, sharing the coastal rock material).
  const rockGeo = rockGeometry(0);
  const rockMat = createRockMaterial();
  const springZ = basin.z1 + 1.6;
  const rockSpots = [
    { x: cx + 0.2, z: springZ, s: [3.4, 2.4, 2.6], yaw: 0.4 },
    { x: cx - 2.6, z: springZ + 0.3, s: [2.4, 1.6, 2.2], yaw: 2.1 },
    { x: cx + 2.7, z: springZ - 0.2, s: [2.2, 1.5, 2.0], yaw: 4.0 },
  ];
  const rocks = new InstancedMesh(rockGeo, rockMat, rockSpots.length);
  const mtx = new Matrix4();
  const quat = new Quaternion();
  rockSpots.forEach((r, k) => {
    const y = hf.heightAt(r.x, r.z) - 0.35;
    quat.setFromAxisAngle(new Vector3(0, 1, 0), r.yaw);
    mtx.compose(new Vector3(r.x, y, r.z), quat, new Vector3(...(r.s as [number, number, number])));
    rocks.setMatrixAt(k, mtx);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.name = 'mill spring rocks';
  group.add(rocks);
  // The carved spout lip that pokes out of the main rock over the basin.
  const spoutY = top + 0.95;
  const spout = { x: cx, z: basin.z1 - 0.1 };
  const spoutMesh = new Mesh(
    sbox(0.46, 0.18, 1.1, { x: spout.x, y: spoutY - 0.18, z: spout.z + 0.35 }, STONE),
    kit.materials.stone,
  );
  spoutMesh.castShadow = true;
  group.add(spoutMesh);

  // Painted signs.
  const signs: Mesh[] = [];
  const addSign = (mesh: Mesh, x: number, y: number, z: number, ry: number, tilt = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.set(tilt, ry, 0, 'YXZ');
    group.add(mesh);
    signs.push(mesh);
  };
  addSign(
    paintedSign(['Workflows aren’t being run', 'on this forked repository.'], 2.1, 0.62),
    cx,
    gateY + 1.55,
    gz1 - 0.1,
    Math.PI,
  );
  addSign(
    paintedSign(['I understand my workflows,', 'go ahead and enable them.'], 0.95, 0.5, { size: 0.19 }),
    plaque.x,
    top + 1.08,
    plaque.z - 0.05,
    Math.PI,
    -0.5,
  );
  addSign(
    paintedSign(['The Actions Spring', '· mill race ·'], 1.3, 0.52),
    post.x - 0.085,
    postY + 1.4,
    post.z,
    -Math.PI / 2,
  );
  addSign(
    paintedSign(['The Actions Spring', '· mill race ·'], 1.3, 0.52),
    post.x + 0.085,
    postY + 1.4,
    post.z,
    Math.PI / 2,
  );

  // Water.
  const water = new WaterStrips(320);
  group.add(water.mesh);

  // Walkable surface.
  const heightAt = (x: number, z: number): number | null => {
    if (x >= tx0 && x <= tx1 && z >= tz0 && z <= tz1) {
      if (x > basin.x0 - 0.3 && x < basin.x1 + 0.3 && z > basin.z0 && z <= basin.z1 + 0.3) return null;
      return top;
    }
    if (x >= stairX0 && x < stairs.x1 && z >= stairs.z0 && z <= stairs.z1) {
      const s = Math.floor((stairs.x1 - x) / stairs.tread);
      return Math.max(footY, top - (s + 1) * stairs.rise);
    }
    return null;
  };

  const circles: CircleObstacle[] = [
    { x: lever.x, z: lever.z, r: 0.28 },
    { x: plaque.x, z: plaque.z, r: 0.22 },
    { x: post.x, z: post.z, r: 0.2 },
    ...lanterns.map(([x, z]) => ({ x, z, r: 0.2 })),
    ...rockSpots.map((r) => ({ x: r.x, z: r.z, r: r.s[0]! * 0.42 })),
  ];
  const boxes: VillageBoxCollider[] = [
    {
      x: cx,
      z: (basin.z0 + basin.z1) / 2 + 0.14,
      hx: T / 2 + 0.28,
      hz: (basin.z1 - basin.z0) / 2 + 0.14,
      rot: 0,
      height: 0.8,
    },
    {
      x: wheel.x,
      z: (pool.z0 + pool.z1) / 2 - 0.15,
      hx: (pool.x1 - pool.x0) / 2 + 0.3,
      hz: (pool.z1 - pool.z0) / 2 + 0.15,
      rot: 0,
      height: 3,
    },
    // The stair cheek walls.
    {
      x: (stairX0 + stairs.x1) / 2,
      z: stairs.z0 - 0.15,
      hx: (stairs.x1 - stairX0) / 2,
      hz: 0.15,
      rot: 0,
      height: 1,
    },
    {
      x: (stairX0 + stairs.x1) / 2,
      z: stairs.z1 + 0.15,
      hx: (stairs.x1 - stairX0) / 2,
      hz: 0.15,
      rot: 0,
      height: 1,
    },
  ];

  const anchors: Record<string, VillageAnchor> = {
    suri: { x: tx0 + 1.1, y: top, z: gz1 + 0.8, heading: -2.3 },
    millLever: { x: lever.x, y: top, z: lever.z, heading: Math.PI },
    millStairs: { x: stairX0 - 1.2, y: footY, z: M.z, heading: Math.PI / 2 },
    millWheel: { x: wheel.x, y: poolY, z: wheel.z, heading: 0 },
    millGate: { x: cx, y: top, z: gz1, heading: 0 },
  };

  const excludes = (x: number, z: number) =>
    (x >= Math.min(stairX0, post.x) - 1 && x <= tx1 + 1 && z >= pool.z0 - 1 && z <= basin.z1 + 1) ||
    rockSpots.some((r) => Math.hypot(x - r.x, z - r.z) < r.s[0]! * 0.55);

  // Water state (the logic's target vs what's shown).
  interface CellShown {
    mask: number;
    entry: number | null;
    through: number;
    pooled: number;
    distance: number;
    fill: number;
    delay: number;
  }
  const shown: CellShown[] = tiles.map(() => ({
    mask: 0,
    entry: null,
    through: 0,
    pooled: 0,
    distance: 0,
    fill: 0,
    delay: 0,
  }));
  let targetCells: readonly MillCellWater[] = tiles.map(() => ({
    wet: false,
    entry: null,
    mask: 0,
    through: 0,
    pooled: 0,
    distance: 0,
  }));
  let gate = false,
    solved = false;
  let gateLift = 0,
    outletFill = 0,
    wheelSpeed = 0,
    wheelAngle = 0,
    leverAngle = 0,
    leverTarget = 0,
    litValue = 0;
  let dirty = true;
  let focusIdx = -1,
    hintIdx = -1;

  const same = (a: CellShown, b: MillCellWater) =>
    a.mask === b.mask && a.entry === b.entry && a.through === b.through && a.pooled === b.pooled;

  function rebuildWater(): void {
    water.begin();
    const chY = (fill: number) => top - TROUGH_D + 0.035 + 0.15 * fill;
    // The spring spout and basin always run.
    water.strip(spout.x, spout.z + 0.9, spout.x, spout.z - 0.2, spoutY + 0.012, 0.3, -1.1, {
      fill: 1,
      speed: 1.2,
    });
    water.fall(spout.x, spout.z - 0.2, spoutY + 0.01, top - 0.14, 1, 0, 0.3, { x: 0, z: -0.25 }, 0, {
      fill: 1,
      speed: 3.2,
      foam: 0.45,
    });
    const basinFlow = gate ? 0.6 : 0.05;
    water.strip(cx, basin.z1, cx, basin.z0 + 0.05, top - 0.14, basin.x1 - basin.x0 - 0.02, 0, {
      fill: 1,
      speed: basinFlow,
    });
    // Tiles.
    for (let i = 0; i < shown.length; i++) {
      const s = shown[i]!;
      if (s.fill <= 0.001 || s.entry === null) continue;
      const x = cellX(i % cols),
        z = cellZ(Math.floor(i / cols));
      const y = chY(s.fill);
      const half = T / 2;
      const w = TROUGH - 0.08;
      const moving = s.through !== 0;
      for (let d = 0; d < 4; d++) {
        if (!(s.mask & (1 << d))) continue;
        const [dx, dz] = DIRS[d]!;
        const ex = x + dx * half,
          ez = z + dz * half;
        if (d === s.entry) {
          water.strip(ex, ez, x - dx * (w / 2), z - dz * (w / 2), y, w, s.distance, {
            fill: s.fill,
            speed: moving ? 1 : 0.06,
          });
        } else {
          const flowing = (s.through & (1 << d)) !== 0;
          water.strip(x + dx * (w / 2), z + dz * (w / 2), ex, ez, y, w, s.distance + half + w / 2, {
            fill: s.fill,
            speed: flowing ? 1 : 0.05,
            foam: flowing ? 0 : 0.12,
          });
        }
      }
    }
    // Outlet channel, the sloping flume, the spill onto the wheel's south paddles, and the tail pool.
    if (outletFill > 0.001) {
      const y = chY(outletFill);
      const w = TROUGH - 0.08;
      const f = { fill: outletFill, speed: 1.2 };
      water.strip(out.x, out.z0, out.x, out.z1, y, w, 20, f);
      const fy = feed.y + (y - flumeY);
      water.quad(
        [out.x - w / 2, y, out.z1],
        [out.x + w / 2, y, out.z1],
        [out.x - w / 2, fy, feed.z],
        [out.x + w / 2, fy, feed.z],
        20 + out.z0 - out.z1,
        20 + out.z0 - feed.z,
        { fill: outletFill, speed: 1.6 },
      );
      water.fall(out.x, feed.z, fy, poolY + 0.02, 1, 0, w, { x: 0, z: -0.28 }, 22, {
        fill: outletFill,
        speed: 3,
        foam: 0.4,
      });
    }
    const churn = 0.04 + wheelSpeed * 0.25;
    water.quad(
      [pool.x0, poolY, pool.z1],
      [pool.x1, poolY, pool.z1],
      [pool.x0, poolY, pool.z0],
      [pool.x1, poolY, pool.z0],
      0,
      pool.z1 - pool.z0,
      { fill: 1, speed: churn, foam: wheelSpeed * 0.25 },
    );
    water.end();
  }

  let turning = 0;
  const site: MillSite = {
    group,
    top,
    rows,
    cols,
    heightAt,
    colliders: { circles, boxes },
    anchors,
    excludes,
    cellCenter: (i) => ({ x: cellX(i % cols), z: cellZ(Math.floor(i / cols)) }),
    cellAt(x, z) {
      if (x < gx0 || x >= gx1 || z < gz0 || z >= gz1) return -1;
      const c = Math.floor((x - gx0) / T);
      const r = rows - 1 - Math.floor((z - gz0) / T);
      return r * cols + c;
    },
    setRotation(i, q, snap = false) {
      const tile = tiles[i];
      if (!tile) return;
      // Clockwise from above is negative yaw; keep turning forward (no unwinding).
      let target = -q * (Math.PI / 2);
      while (target > tile.target + 1e-6) target -= Math.PI * 2;
      while (target < tile.target - Math.PI * 2 + 1e-6) target += Math.PI * 2;
      tile.target = target;
      if (snap) {
        tile.angle = target;
        tile.mesh.rotation.y = target;
      }
      // The water in a turning tile drains straight away.
      shown[i]!.fill = snap ? shown[i]!.fill : Math.min(shown[i]!.fill, 0.35);
      dirty = true;
    },
    get turning() {
      return turning > 0;
    },
    setFocus(i) {
      focusIdx = i;
    },
    setHint(i) {
      hintIdx = i;
    },
    setWater(cells, gateOpen, isSolved) {
      targetCells = cells;
      gate = gateOpen;
      solved = isSolved;
      dirty = true;
    },
    setLever(pulled, snap = false) {
      leverTarget = pulled ? 1 : 0;
      if (snap) leverAngle = leverTarget;
    },
    update(dt, t) {
      // Tiles turn with a heavy ease and a small settle.
      turning = 0;
      for (const tile of tiles) {
        const d = tile.target - tile.angle;
        if (Math.abs(d) > 1e-4) {
          turning++;
          const step = Math.sign(d) * Math.min(Math.abs(d), dt * 5.2);
          tile.angle += step;
          if (Math.abs(tile.target - tile.angle) < 1e-4) tile.angle = tile.target;
          tile.mesh.rotation.y = tile.angle;
          tile.mesh.position.y =
            top + Math.sin((Math.abs(tile.target - tile.angle) / (Math.PI / 2)) * Math.PI) * 0.035;
        }
      }
      // Water: drain cells whose shape changed (or that are turning), then fill toward the target.
      let changed = dirty;
      for (let i = 0; i < shown.length; i++) {
        const s = shown[i]!;
        const tgt = targetCells[i]!;
        const busy = Math.abs(tiles[i]!.target - tiles[i]!.angle) > 1e-4;
        const want = tgt.wet && !busy ? 1 : 0;
        if (want === 0 || !same(s, tgt)) {
          if (s.fill > 0) {
            s.fill = Math.max(0, s.fill - dt * 3.5);
            changed = true;
          }
          if (s.fill === 0 && !busy) {
            s.mask = tgt.mask;
            s.entry = tgt.entry;
            s.through = tgt.through;
            s.pooled = tgt.pooled;
            s.distance = tgt.distance;
            s.delay = tgt.wet ? tgt.distance / 7 : 0;
          }
        } else if (s.fill < 1) {
          if (s.delay > 0) s.delay -= dt;
          else s.fill = Math.min(1, s.fill + dt * 1.6);
          changed = true;
        }
      }
      // Gate board, outlet, wheel, lever, lanterns.
      const gateTarget = gate ? 1 : 0;
      if (gateLift !== gateTarget) {
        gateLift += Math.sign(gateTarget - gateLift) * Math.min(Math.abs(gateTarget - gateLift), dt * 0.8);
        gateBoard.position.y = gateY - 0.02 + gateLift * 0.78;
        changed = true;
      }
      const outTarget = solved ? 1 : 0;
      if (outletFill !== outTarget) {
        outletFill +=
          Math.sign(outTarget - outletFill) * Math.min(Math.abs(outTarget - outletFill), dt * 0.9);
        changed = true;
      }
      const wheelTarget = solved ? 0.85 : 0;
      wheelSpeed += (wheelTarget - wheelSpeed) * (1 - Math.exp(-dt * 0.6));
      if (wheelSpeed > 1e-3) {
        // Fed on its south side, so the south paddles go down (positive turn about +x).
        wheelAngle += wheelSpeed * dt;
        wheelGroup.rotation.x = wheelAngle;
      }
      if (leverAngle !== leverTarget) {
        leverAngle +=
          Math.sign(leverTarget - leverAngle) * Math.min(Math.abs(leverTarget - leverAngle), dt * 3);
      }
      leverPivot.rotation.x = 0.55 - leverAngle * 1.1;
      const litTarget = solved ? 1 : 0;
      litValue += (litTarget - litValue) * (1 - Math.exp(-dt * 1.2));
      lit.value = litValue;
      if (changed || wheelSpeed > 1e-3) rebuildWater();
      dirty = false;
      // Outlines.
      const place = (frame: Mesh, i: number) => {
        frame.visible = i >= 0;
        if (i >= 0) frame.position.set(cellX(i % cols), top + 0.02, cellZ(Math.floor(i / cols)));
      };
      place(focusFrame, focusIdx === hintIdx ? -1 : focusIdx);
      place(hintFrame, hintIdx);
      hintMat.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 5));
    },
    dispose() {
      group.removeFromParent();
      for (const m of [stoneMesh, woodMesh, ironMesh, glowMesh, gateBoard, leverArm, wheelMesh, spoutMesh])
        m.geometry.dispose();
      for (const g of kindGeo.values()) g.dispose();
      frameGeo.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      glowMat.dispose();
      focusMat.dispose();
      hintMat.dispose();
      for (const s of signs) {
        s.geometry.dispose();
        const mat = s.material as MeshStandardNodeMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
      water.dispose();
    },
  };
  // First frame: dry grid, closed gate.
  rebuildWater();
  return site;
}

/**
 * One channel tile at rotation 0 (openings at local N = −z, E = +x, S = +z, W = −x): a base slab
 * whose top is the channel bed, plus a 3 × 3 grid of top blocks with the channel cells left out.
 * Tiles that turn carry four dark pivot studs at their corners; blank tiles are plain and darker.
 */
function buildTile(kind: MillTileKind): BufferGeometry {
  const s = COVE.mill.tile - GAP;
  const side = (s - TROUGH) / 2;
  const open = { straight: [0, 2], corner: [0, 1], cap: [0], blank: [] as number[] }[kind];
  const parts: BufferGeometry[] = [sbox(s, TILE_H - TROUGH_D, s, { y: -TILE_H }, STONE_WET)];
  const spans = [
    [-s / 2, -s / 2 + side],
    [-TROUGH / 2, TROUGH / 2],
    [s / 2 - side, s / 2],
  ] as const;
  // Which sub-block is which side: (1,0) N, (2,1) E, (1,2) S, (0,1) W, (1,1) centre.
  const sideOf = (i: number, j: number) =>
    i === 1 && j === 0 ? 0 : i === 2 && j === 1 ? 1 : i === 1 && j === 2 ? 2 : i === 0 && j === 1 ? 3 : -1;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const d = sideOf(i, j);
      const centre = i === 1 && j === 1;
      if ((d >= 0 && open.includes(d)) || (centre && open.length > 0)) continue;
      const [x0, x1] = spans[i]!;
      const [z0, z1] = spans[j]!;
      parts.push(
        sbox(
          x1 - x0,
          TROUGH_D,
          z1 - z0,
          { x: (x0 + x1) / 2, y: -TROUGH_D, z: (z0 + z1) / 2 },
          kind === 'blank' ? STONE_DARK : TILE,
        ),
      );
    }
  if (kind !== 'blank') {
    const k = s / 2 - 0.2;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      parts.push(box(0.12, 0.03, 0.12, { x: sx * k, y: 0, z: sz * k }, STUD, SUV));
  }
  return merge(parts);
}

/** A square outline (four thin bars) lying flat, `size` across. */
function buildFrame(size: number, bar: number): BufferGeometry {
  const h = size / 2;
  const parts = [
    box(size, 0.01, bar, { z: -h }, 0xffffff, 1, true),
    box(size, 0.01, bar, { z: h }, 0xffffff, 1, true),
    box(bar, 0.01, size, { x: -h }, 0xffffff, 1, true),
    box(bar, 0.01, size, { x: h }, 0xffffff, 1, true),
  ];
  return merge(parts);
}

/** A two-rimmed paddle wheel turning about local x: rims, spokes, paddles, hub, and axle. */
function buildWheel(r: number, w: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const n = 16;
  const rimT = 0.12;
  for (const sx of [-1, 1]) {
    const x = (sx * (w - 0.1)) / 2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const seg = 2 * r * Math.sin(Math.PI / n) + 0.02;
      const phi = a + Math.PI / n;
      const g = plank(0.08, rimT, seg, { y: -rimT / 2 }, WOOD_DARK, TRIM.dark);
      g.rotateX(phi);
      g.translate(x, Math.cos(phi) * (r - rimT / 2), Math.sin(phi) * (r - rimT / 2));
      parts.push(g);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const g = plank(0.07, r - 0.1, 0.08, { y: 0.05 }, WOOD, TRIM.light);
      g.rotateX(a);
      g.translate(x, 0, 0);
      parts.push(g);
    }
  }
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const g = plank(w - 0.06, 0.42, 0.06, { y: r - 0.44 }, WOOD, TRIM.light);
    g.rotateX(a);
    parts.push(g);
  }
  const hub = cylinder(0.22, 0.22, w + 0.1, { rz: Math.PI / 2, x: (w + 0.1) / 2 }, WOOD_DARK, 10);
  const axle = cylinder(0.08, 0.08, w + 1.3, { rz: Math.PI / 2, x: (w + 1.3) / 2 }, IRON, 8);
  parts.push(hub, axle);
  return merge(parts);
}

function rockGeometry(index: number): BufferGeometry {
  const a = ROCK_ASSETS[index % ROCK_ASSETS.length]!;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(a.positions.slice(), 3));
  g.setAttribute('normal', new BufferAttribute(a.normals.slice(), 3));
  g.setIndex(new BufferAttribute(a.indices.slice(), 1));
  g.computeBoundingSphere();
  return g;
}

/** A painted wooden board with carved-looking serif text (canvas texture). */
function paintedSign(lines: string[], w: number, h: number, o: { size?: number } = {}): Mesh {
  const px = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * h) / w);
  const ctx = canvas.getContext('2d')!;
  const ch = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, '#9a6b43');
  grad.addColorStop(1, '#7a5031');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, px, ch);
  // Plank seams and grain.
  ctx.strokeStyle = 'rgba(40, 22, 10, 0.35)';
  ctx.lineWidth = 2;
  for (let y = ch / 3; y < ch; y += ch / 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(px, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 230, 190, 0.06)';
  for (let k = 0; k < 40; k++) {
    const y = (k * 37) % ch;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(px * 0.3, y + 3, px * 0.6, y - 3, px, y + 1);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(30, 16, 6, 0.8)';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, px - 14, ch - 14);
  // Shrink the lettering until the longest line fits inside the frame (and the lines fit the height).
  let size = Math.round(px * (o.size ?? 0.085));
  const font = (sz: number) => `600 ${sz}px Georgia, 'Times New Roman', serif`;
  ctx.font = font(size);
  const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  while (size > 10 && (widest() > px * 0.88 || lines.length * size * 1.18 > ch * 0.84)) {
    size -= 2;
    ctx.font = font(size);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.18;
  const y0 = ch / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, k) => {
    ctx.fillStyle = 'rgba(255, 236, 200, 0.35)';
    ctx.fillText(line, px / 2, y0 + k * lh + 3);
    ctx.fillStyle = '#f3e3c2';
    ctx.fillText(line, px / 2, y0 + k * lh);
  });
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new MeshStandardNodeMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  const board = new Mesh(new PlaneGeometry(w, h), mat);
  board.castShadow = true;
  board.name = `sign: ${lines[0]}`;
  return board;
}
