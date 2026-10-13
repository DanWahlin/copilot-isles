import {
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  Sphere,
  Vector3,
  type Material,
} from 'three/webgpu';
import type { VillageKit } from '../../village/kit';
import { mergeWithRigidParts, type RigidParts } from '../../sites/rigid-parts';
import type { ChannelRoutingState, Crew, Flow, FlumeTerraceView } from './contract';
import { THOUSAND_BOUGH as TB } from './layout';
import { thousandBoughHeight } from './height';
import {
  PAINT,
  beam,
  box,
  cone,
  gridSurface,
  lanternPaint,
  makeBuckets,
  rod,
  type Buckets,
} from './village/pieces';
import type { BoxCollider } from '../../../game/collision';

/**
 * The Flume Terrace (spec §5.2): the 5 × 4 board of wooden flume tiles stepping down the shelf, the
 * header box with the three crews' gates and banners, the chutes from the outlets to the wheel-lifts,
 * and the Great Hall's sluice that catches whatever spills. It's the Channel Routing puzzle's view:
 * tiles turn, dyed water runs cell by cell, mud swirls where crews mix, wheels turn, and the crews'
 * houses light in their colours. Every moving part is a rigid part of a few merged meshes (one draw
 * each, the kit's materials, no new shader); the frame loop doesn't allocate.
 */

const F = TB.flume;
const TILE = F.tile;
const ROWS = 4;
const COLS = 5;
/** Tile-local heights: the floor's top, the water's surface, the walls' top. */
const FLOOR = 0.2;
const WATER = 0.4;
const WALL = 0.78;
const CHANNEL = 0.62;
/** Water runs along the tiles at 4 m/s (spec §5.4): this long per cell. */
const CELL_TIME = TILE / 4;

const CREWS: readonly Crew[] = ['feature', 'bugfix', 'docs'];
const DYE: Record<Crew | 'mixed', number> = {
  feature: PAINT.feature,
  bugfix: PAINT.bugfix,
  docs: PAINT.docs,
  mixed: 0x7a5a32,
};
const DYES = ['feature', 'bugfix', 'docs', 'mixed'] as const;
type Dye = (typeof DYES)[number];

export function tileCentre(row: number, col: number, out: Vector3): Vector3 {
  return out.set(F.cols[col]!, F.rowY[row]!, F.rows[row]!);
}

/** The board's tile kinds and rotations as numbers: where water enters and leaves (N E S W). */
const N = 0;
const E = 1;
const S = 2;
const W = 3;

/** The tile pieces, in tile-local space (rot 0: straight N–S, elbow N–E). */
function straightPiece(b: Buckets): void {
  box(b, 'wood', 0, FLOOR / 2, 0, TILE - 0.08, FLOOR, TILE - 0.08, 0, PAINT.teak);
  for (const s of [-1, 1])
    box(
      b,
      'wood',
      s * (CHANNEL + 0.06),
      (FLOOR + WALL) / 2,
      0,
      0.12,
      WALL - FLOOR,
      TILE - 0.1,
      0,
      PAINT.plank,
    );
}

function elbowPiece(b: Buckets): void {
  box(b, 'wood', 0, FLOOR / 2, 0, TILE - 0.08, FLOOR, TILE - 0.08, 0, PAINT.teak);
  // Walls round a quarter circle about the tile's north-east corner.
  const cx = TILE / 2;
  const cz = -TILE / 2;
  for (const r of [TILE / 2 - CHANNEL - 0.06, TILE / 2 + CHANNEL + 0.06]) {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI / 2 + (k / n) * (Math.PI / 2);
      const a1 = Math.PI / 2 + ((k + 1) / n) * (Math.PI / 2);
      const p0 = { x: cx + Math.cos(a0) * r, y: (FLOOR + WALL) / 2, z: cz + Math.sin(a0) * r };
      const p1 = { x: cx + Math.cos(a1) * r, y: (FLOOR + WALL) / 2, z: cz + Math.sin(a1) * r };
      // Clip the outer wall to the tile.
      if (Math.abs(p0.x) > TILE / 2 + 0.01 || Math.abs(p1.z) > TILE / 2 + 0.01) continue;
      beam(b, 'wood', p0, p1, 0.12, WALL - FLOOR, PAINT.plank);
    }
  }
}

function rockPiece(b: Buckets): void {
  box(b, 'stone', 0, 0.55, 0, 2.4, 1.3, 2.3, 0.4, PAINT.basalt);
  box(b, 'stone', 0.3, 1.2, -0.2, 1.5, 0.8, 1.4, 1.1, PAINT.basalt);
}

/** The water in a channel, as a dyed slab (rot 0 shapes). */
function straightWater(b: Buckets, dye: number): void {
  const g = box(b, 'glow', 0, WATER, 0, CHANNEL * 2 - 0.04, 0.05, TILE - 0.06, 0, 0xffffff);
  lanternPaint(g, 1);
  tintGlow(g, dye);
}

function elbowWater(b: Buckets, dye: number): void {
  const cx = TILE / 2;
  const cz = -TILE / 2;
  const pts: { x: number; y: number; z: number }[] = [];
  const n = 6;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI / 2 + (k / n) * (Math.PI / 2);
    for (const r of [TILE / 2 - CHANNEL + 0.02, TILE / 2 + CHANNEL - 0.02])
      pts.push({ x: cx + Math.cos(a) * r, y: WATER, z: cz + Math.sin(a) * r });
  }
  const g = gridSurface(b, 'glow', pts, n + 1, 2, 0xffffff);
  tintGlow(g, dye);
}

/** The kit's glow material shows its paint × 0.18 by day: dye the water bright enough to read. */
function tintGlow(g: BufferGeometry, dye: number): void {
  const c = g.getAttribute('color');
  const r = ((dye >> 16) & 255) / 255;
  const gg = ((dye >> 8) & 255) / 255;
  const bb = (dye & 255) / 255;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, r * 4.6, gg * 4.6, bb * 4.6);
  c.needsUpdate = true;
}

const TMP = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const ONE = new Vector3(1, 1, 1);
const ZERO = new Matrix4().makeScale(0, 0, 0);
const UPV = new Vector3(0, 1, 0);
const XV = new Vector3(1, 0, 0);
const Q2 = new Quaternion();

function tileMatrix(row: number, col: number, rot: number, out: Matrix4, lift = 0): Matrix4 {
  Q.setFromAxisAngle(UPV, -rot * (Math.PI / 2));
  return out.compose(V.set(F.cols[col]!, F.rowY[row]! - FLOOR + lift, F.rows[row]!), Q, ONE);
}

interface Run {
  flows: readonly Flow[];
  t: number;
  done: () => void;
  /** Seconds each flow takes (its cells, then its end). */
  length: number;
}

export interface FlumeTerrace extends FlumeTerraceView {
  group: Group;
  /** Static structure for the village's merged meshes was added to its buckets. */
  colliders: BoxCollider[];
  update(dt: number): void;
  dispose(): void;
}

/**
 * Builds the terrace. Static pieces (header, chutes, trestles, sluice, banners) go into `statics`
 * (the village's buckets); the moving parts are its own meshes.
 */
export function createFlumeTerrace(
  kit: VillageKit,
  statics: Buckets,
  wheelAxles: readonly { x: number; y: number; z: number; yaw: number; crew: string }[],
): FlumeTerrace {
  const group = new Group();
  group.name = 'thousand-bough-flume';
  const colliders: BoxCollider[] = [];
  buildStatics(statics, colliders);

  // Rigid parts: wood (straight and elbow per cell, the gates, the demo trough), stone (rocks, the
  // boulder), glow (water per cell, kind and dye; the cursor and pulse frames; the crews' lights).
  const wood: BufferGeometry[] = [];
  const stone: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  const take = (fn: (b: Buckets) => void, key: 'wood' | 'stone' | 'glow', into: BufferGeometry[]) => {
    const b = makeBuckets();
    fn(b);
    const parts = b[key];
    const merged = mergeParts(parts);
    into.push(merged);
  };
  const woodIndex = { straight: [] as number[], elbow: [] as number[], gates: [] as number[], trough: -1 };
  for (let i = 0; i < ROWS * COLS; i++) {
    woodIndex.straight.push(wood.length);
    take(straightPiece, 'wood', wood);
    woodIndex.elbow.push(wood.length);
    take(elbowPiece, 'wood', wood);
  }
  for (let g = 0; g < 3; g++) {
    woodIndex.gates.push(wood.length);
    take((b) => box(b, 'wood', 0, 0.45, 0, CHANNEL * 2 + 0.3, 0.9, 0.1, 0, PAINT.teakDark), 'wood', wood);
  }
  // The three wheels, as wood parts too (they turn by rewriting their own vertices).
  const wheelPart: number[] = [];
  for (let k = 0; k < wheelAxles.length; k++) {
    wheelPart.push(wood.length);
    wood.push(wheelGeometry());
  }
  woodIndex.trough = wood.length;
  take(
    (b) => {
      box(b, 'wood', 0, 0.12, 0, COLS * TILE + 0.4, 0.24, ROWS * TILE + 0.4, 0, PAINT.weathered);
      for (const s of [-1, 1])
        box(b, 'wood', s * (COLS * TILE * 0.5 + 0.1), 0.6, 0, 0.2, 0.9, ROWS * TILE + 0.4, 0, PAINT.teakDark);
    },
    'wood',
    wood,
  );
  const stoneIndex = { rocks: [] as number[], boulder: -1 };
  for (let i = 0; i < ROWS * COLS; i++) {
    stoneIndex.rocks.push(stone.length);
    take(rockPiece, 'stone', stone);
  }
  stoneIndex.boulder = stone.length;
  take((b) => box(b, 'stone', 0, 0.8, 0, 1.9, 1.6, 1.8, 0.7, PAINT.basalt), 'stone', stone);
  const glowIndex: Record<Dye, { straight: number[]; elbow: number[] }> = {
    feature: { straight: [], elbow: [] },
    bugfix: { straight: [], elbow: [] },
    docs: { straight: [], elbow: [] },
    mixed: { straight: [], elbow: [] },
  };
  for (const dye of DYES)
    for (let i = 0; i < ROWS * COLS; i++) {
      glowIndex[dye].straight.push(glow.length);
      take((b) => straightWater(b, DYE[dye]), 'glow', glow);
      glowIndex[dye].elbow.push(glow.length);
      take((b) => elbowWater(b, DYE[dye]), 'glow', glow);
    }
  const frame = (colour: number) => (b: Buckets) => {
    for (const [x, z, w, d] of [
      [0, -TILE / 2, TILE, 0.12],
      [0, TILE / 2, TILE, 0.12],
      [-TILE / 2, 0, 0.12, TILE],
      [TILE / 2, 0, 0.12, TILE],
    ] as const) {
      const g = box(b, 'glow', x, WALL + 0.05, z, w, 0.08, d, 0, 0xffffff);
      tintGlow(g, colour);
    }
  };
  const cursorPart = glow.length;
  take(frame(0xffe08a), 'glow', glow);
  const pulsePart = glow.length;
  take(frame(0xff5a3a), 'glow', glow);
  // The demo's shared trough: a wide sheet of muddy water over the board.
  const demoWater = glow.length;
  take(
    (b) => {
      const g = box(b, 'glow', 0, 0.42, 0, COLS * TILE, 0.05, ROWS * TILE, 0, 0xffffff);
      tintGlow(g, DYE.mixed);
    },
    'glow',
    glow,
  );

  const woodParts = mergeWithRigidParts([], wood);
  const stoneParts = mergeWithRigidParts([], stone);
  const glowParts = mergeWithRigidParts([], glow);
  // The parts are built at the origin and placed on the terrace: a fixed bound round the terrace (and
  // the boulder's run in from the north) lets the renderer cull them.
  for (const p of [woodParts, stoneParts, glowParts])
    p.geometry.boundingSphere = new Sphere(new Vector3(F.center.x + 2, F.rowY[1]! - 2, F.center.z + 14), 40);
  const mesh = (p: RigidParts, key: 'wood' | 'stone' | 'glow') => {
    const m = new Mesh(p.geometry, kit.materials[key] as Material);
    m.name = `thousand-bough-flume-${key}`;
    m.castShadow = key !== 'glow';
    m.receiveShadow = key !== 'glow';
    group.add(m);
    return m;
  };
  mesh(woodParts, 'wood');
  mesh(stoneParts, 'stone');
  mesh(glowParts, 'glow');

  const wheels = wheelAxles.map((a, k) => ({
    part: wheelPart[k]!,
    axle: a,
    crew: a.crew as Crew,
    spin: 0,
    speed: 0,
    target: 0,
  }));
  const placeWheel = (w: (typeof wheels)[number]) => {
    Q.setFromAxisAngle(UPV, w.axle.yaw);
    Q2.setFromAxisAngle(XV, -w.spin);
    Q.multiply(Q2);
    woodParts.set(w.part, TMP.compose(V.set(w.axle.x, w.axle.y, w.axle.z), Q, ONE));
  };

  // State.
  const board: { kind: 'straight' | 'elbow' | 'rock'; rot: number; shown: number; from: number }[] = [];
  for (let i = 0; i < ROWS * COLS; i++) board.push({ kind: 'straight', rot: 0, shown: 0, from: 0 });
  let cursor: readonly [number, number] | null = null;
  let run: Run | null = null;
  let pulse: readonly [number, number] | null = null;
  let pulseT = 0;
  let demo: { t: number; done: () => void } | null = null;
  let boulder: { t: number; done: () => void } | null = null;
  let round = 1;
  let time = 0;
  /** What water each cell shows: its dye index (−1 none) and since when. */
  const water = new Int8Array(ROWS * COLS).fill(-1);

  const placeTiles = () => {
    for (let i = 0; i < ROWS * COLS; i++) {
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const t = board[i]!;
      const rot = t.from + (t.rot - t.from) * Math.min(1, t.shown);
      woodParts.set(woodIndex.straight[i]!, t.kind === 'straight' ? tileMatrix(r, c, rot, TMP) : ZERO);
      woodParts.set(woodIndex.elbow[i]!, t.kind === 'elbow' ? tileMatrix(r, c, rot, TMP) : ZERO);
      const rockShown = t.kind === 'rock' && !(round === 3 && r === 2 && c === 2 && boulder);
      stoneParts.set(stoneIndex.rocks[i]!, rockShown ? tileMatrix(r, c, 0, TMP) : ZERO);
      for (const dye of DYES) {
        const d = DYES.indexOf(dye);
        const on = water[i] === d;
        glowParts.set(
          glowIndex[dye].straight[i]!,
          on && t.kind === 'straight' ? tileMatrix(r, c, t.rot, TMP) : ZERO,
        );
        glowParts.set(
          glowIndex[dye].elbow[i]!,
          on && t.kind === 'elbow' ? tileMatrix(r, c, t.rot, TMP) : ZERO,
        );
      }
    }
    glowParts.set(cursorPart, cursor ? tileMatrix(cursor[0], cursor[1], 0, TMP) : ZERO);
    const blink = pulse && Math.sin(pulseT * 9) > -0.2;
    glowParts.set(pulsePart, pulse && blink ? tileMatrix(pulse[0], pulse[1], 0, TMP, 0.03) : ZERO);
  };

  const placeGates = () => {
    for (let g = 0; g < 3; g++) {
      const crew = CREWS[g]!;
      const col = F.gates[crew];
      const open = run && run.flows.some((f) => f.crew === crew) ? Math.min(1, run.t * 2) : 0;
      Q.identity();
      TMP.compose(V.set(F.cols[col]!, F.rowY[0]! + 0.55 + open * 0.75, F.rows[0]! - TILE / 2 - 0.25), Q, ONE);
      woodParts.set(woodIndex.gates[g]!, TMP);
    }
  };

  const centre = new Vector3(F.center.x, F.rowY[1]! + 0.15, F.center.z);
  const placeDemo = () => {
    if (demo) {
      const lift = Math.max(0, demo.t - 14) * 1.2;
      Q.identity();
      TMP.compose(V.set(centre.x, centre.y + lift, centre.z), Q, ONE);
      const shown = demo.t < 17;
      woodParts.set(woodIndex.trough, shown ? TMP : ZERO);
      glowParts.set(demoWater, shown && demo.t > 2 ? TMP : ZERO);
    } else {
      woodParts.set(woodIndex.trough, ZERO);
      glowParts.set(demoWater, ZERO);
    }
    if (boulder || round === 3) {
      const t = boulder ? Math.min(1, boulder.t / 1.6) : 1;
      const r2 = tileCentre(2, 2, V);
      const startZ = F.rows[0]! - 9;
      const x = r2.x;
      const z = startZ + (r2.z - startZ) * t;
      const y = r2.y + 0.2 + Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 1.6 + (1 - t) * 1.5;
      Q.setFromAxisAngle(V.set(1, 0, 0), t * 9);
      TMP.compose(V.set(x, y, z), Q, ONE);
      stoneParts.set(stoneIndex.boulder, TMP);
    } else stoneParts.set(stoneIndex.boulder, ZERO);
  };

  const dyeOf = (f: Flow, cellIndex: number): number => {
    if (
      f.end === 'mixed' &&
      f.at &&
      f.cells[cellIndex]?.[0] === f.at[0] &&
      f.cells[cellIndex]?.[1] === f.at[1]
    )
      return 3;
    return CREWS.indexOf(f.crew);
  };

  const view: FlumeTerrace = {
    group,
    colliders,
    async setRound(r) {
      round = r;
      if (r === 3) {
        await new Promise<void>((done) => {
          boulder = { t: 0, done };
        });
      }
    },
    setBoard(b: ChannelRoutingState['board'], animate) {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const tile = b[r]?.[c];
          if (!tile) continue;
          const t = board[r * COLS + c]!;
          const turned = t.kind === tile.kind && t.rot !== tile.rot;
          // Turn the short way round (clockwise is +1).
          let from = t.from + (t.rot - t.from) * Math.min(1, t.shown);
          if (turned && animate) {
            let d = tile.rot - from;
            while (d > 2) d -= 4;
            while (d < -2) d += 4;
            from = tile.rot - d;
          }
          t.kind = tile.kind;
          t.rot = tile.rot;
          t.from = animate && turned ? from : tile.rot;
          t.shown = animate && turned ? 0 : 1;
        }
      placeTiles();
    },
    setCursor(cell) {
      cursor = cell;
      placeTiles();
    },
    tileCenter: (row, col, out) => tileCentre(row, col, out),
    demoSharedTrough() {
      return new Promise<void>((done) => {
        demo = { t: 0, done };
        for (const w of wheels) w.target = 0;
      });
    },
    runFlows(flows) {
      water.fill(-1);
      pulse = null;
      let longest = 0;
      for (const f of flows) longest = Math.max(longest, f.cells.length * CELL_TIME + 1.4);
      return new Promise<void>((done) => {
        run = { flows, t: 0, done, length: longest };
      });
    },
    resetWater() {
      water.fill(-1);
      pulse = null;
      run?.done();
      run = null;
      for (const w of wheels) w.target = 0;
      placeTiles();
      placeGates();
    },
    update(dt) {
      time += dt;
      let moved = false;
      for (const t of board)
        if (t.shown < 1) {
          t.shown = Math.min(1, t.shown + dt / 0.28);
          moved = true;
        }
      if (run) {
        run.t += dt;
        // Each flow fills its cells in order from its gate; a problem pulses where it happened.
        for (const f of run.flows) {
          const n = Math.min(f.cells.length, Math.floor(run.t / CELL_TIME));
          for (let i = 0; i < n; i++) {
            const [r, c] = f.cells[i]!;
            const idx = r * COLS + c;
            const d = dyeOf(f, i);
            // Two crews in one tile: mud.
            water[idx] = water[idx] !== -1 && water[idx] !== d ? 3 : d;
          }
          if (n >= f.cells.length && f.end !== 'wheel' && f.at) pulse = f.at;
          for (const w of wheels)
            if (f.wheel === w.crew && n >= f.cells.length) w.target = f.end === 'wheel' ? 1 : 0.25;
        }
        moved = true;
        if (run.t >= run.length) {
          const r = run;
          run = null;
          r.done();
        }
      }
      if (pulse) {
        pulseT += dt;
        moved = true;
      }
      if (demo) {
        demo.t += dt;
        moved = true;
        if (demo.t > 18) {
          const d = demo;
          demo = null;
          d.done();
        }
      }
      if (boulder) {
        boulder.t += dt;
        moved = true;
        if (boulder.t > 1.8) {
          const b = boulder;
          boulder = null;
          b.done();
        }
      }
      if (moved) {
        placeTiles();
        placeGates();
        placeDemo();
      }
      for (const w of wheels) {
        w.speed += (w.target - w.speed) * Math.min(1, dt * 1.5);
        if (w.speed > 0.001) {
          w.spin += w.speed * dt * 1.6;
          placeWheel(w);
        }
      }
      woodParts.commit();
      stoneParts.commit();
      glowParts.commit();
      void time;
    },
    dispose() {
      woodParts.geometry.dispose();
      stoneParts.geometry.dispose();
      glowParts.geometry.dispose();
    },
  };
  placeTiles();
  placeGates();
  placeDemo();
  for (const w of wheels) placeWheel(w);
  woodParts.commit();
  stoneParts.commit();
  glowParts.commit();
  return view;
}

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  if (flat.length === 1) return flat[0]!;
  const b = makeBuckets();
  void b;
  let count = 0;
  for (const g of flat) count += g.getAttribute('position').count;
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color'] as const) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of flat) {
      const a = g.getAttribute(name);
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(
      name,
      new (flat[0]!.getAttribute(name).constructor as typeof import('three/webgpu').BufferAttribute)(
        arr,
        size,
      ),
    );
  }
  return out;
}

/** A water wheel: two rims, spokes and paddles, round its axle (local x is the axle). */
function wheelGeometry(): BufferGeometry {
  const b = makeBuckets();
  const R = 2.2;
  for (const s of [-0.45, 0.45]) {
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2;
      const a1 = ((k + 1) / 16) * Math.PI * 2;
      beam(
        b,
        'wood',
        { x: s, y: Math.cos(a0) * R, z: Math.sin(a0) * R },
        { x: s, y: Math.cos(a1) * R, z: Math.sin(a1) * R },
        0.12,
        0.18,
        PAINT.teakDark,
      );
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      beam(
        b,
        'wood',
        { x: s, y: 0, z: 0 },
        { x: s, y: Math.cos(a) * R, z: Math.sin(a) * R },
        0.08,
        0.1,
        PAINT.teakDark,
      );
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    box(b, 'wood', 0, Math.cos(a) * (R - 0.15), Math.sin(a) * (R - 0.15), 1.0, 0.45, 0.06, 0, PAINT.plank, a);
  }
  rod(b, 'wood', { x: -0.8, y: 0, z: 0 }, { x: 0.8, y: 0, z: 0 }, 0.12, 8, PAINT.weathered);
  return mergeParts(b.wood);
}

/** The terrace's walker fences (for tests and audits), without building it. */
export function flumeColliders(): BoxCollider[] {
  const out: BoxCollider[] = [];
  const b = makeBuckets();
  buildStatics(b, out);
  for (const list of Object.values(b)) for (const g of list) g.dispose();
  return out;
}

/** The header box over the north edge, the chutes to the wheels, the trestles, the catch sluice, the banners. */
function buildStatics(b: Buckets, colliders: BoxCollider[]): void {
  const x0 = F.cols[0]! - TILE / 2;
  const x1 = F.cols[COLS - 1]! + TILE / 2;
  const zN = F.rows[0]! - TILE / 2;
  const zS = F.rows[ROWS - 1]! + TILE / 2;
  // Trestles under every tile's corners.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS; c++) {
      const x = x0 + c * TILE;
      const z = F.rows[r]!;
      const ground = thousandBoughHeight(x, z);
      const top = F.rowY[r]! - FLOOR - 0.02;
      if (top - ground > 0.15)
        rod(b, 'wood', { x, y: ground - 0.3, z }, { x, y: top, z }, 0.14, 6, PAINT.weathered);
    }
  // The header box: a long trough over the gates, fed by the Header Race from the Upper Pool.
  const hy = F.rowY[0]! + 0.2;
  const hz = zN - 1.3;
  box(b, 'wood', (x0 + x1) / 2, hy, hz, x1 - x0 + 1, 0.2, 1.8, 0, PAINT.teak);
  for (const s of [-1, 1])
    box(b, 'wood', (x0 + x1) / 2, hy + 0.5, hz + s * 0.85, x1 - x0 + 1, 0.9, 0.12, 0, PAINT.plank);
  for (const s of [-1, 1])
    box(b, 'wood', s < 0 ? x0 - 0.45 : x1 + 0.45, hy + 0.5, hz, 0.12, 0.9, 1.8, 0, PAINT.plank);
  const race = TB.water.headerRace;
  const raceTop = TB.pools.upper.level + 0.1;
  beam(
    b,
    'wood',
    { x: race.from.x, y: raceTop, z: race.from.z },
    { x: race.to.x, y: hy + 0.15, z: hz - 0.9 },
    race.width,
    0.2,
    PAINT.teak,
  );
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const x = race.from.x + (race.to.x - race.from.x) * t;
    const z = race.from.z + (race.to.z - race.from.z) * t;
    const y = raceTop + (hy + 0.15 - raceTop) * t;
    const ground = thousandBoughHeight(x, z);
    if (y - ground > 0.3)
      rod(b, 'wood', { x, y: ground - 0.3, z }, { x, y: y - 0.1, z }, 0.12, 5, PAINT.weathered);
  }
  // The crews' gate posts, banners and dye buckets.
  for (const crew of CREWS) {
    const col = F.gates[crew];
    const x = F.cols[col]!;
    for (const s of [-1, 1])
      rod(
        b,
        'wood',
        { x: x + s * (CHANNEL + 0.3), y: hy - 0.1, z: zN - 0.25 },
        { x: x + s * (CHANNEL + 0.3), y: hy + 2.6, z: zN - 0.25 },
        0.09,
        6,
        PAINT.teakDark,
      );
    beam(
      b,
      'wood',
      { x: x - CHANNEL - 0.4, y: hy + 2.6, z: zN - 0.25 },
      { x: x + CHANNEL + 0.4, y: hy + 2.6, z: zN - 0.25 },
      0.12,
      0.14,
      PAINT.teakDark,
    );
    gridSurface(
      b,
      'cloth',
      [
        { x: x - CHANNEL - 0.25, y: hy + 2.5, z: zN - 0.3 },
        { x: x + CHANNEL + 0.25, y: hy + 2.5, z: zN - 0.3 },
        { x: x - CHANNEL - 0.25, y: hy + 1.25, z: zN - 0.3 },
        { x: x + CHANNEL + 0.25, y: hy + 1.25, z: zN - 0.3 },
      ],
      2,
      2,
      DYE[crew],
    );
    // The dye bucket beside the gate.
    rod(
      b,
      'wood',
      { x: x + CHANNEL + 0.9, y: hy - 0.1, z: zN - 0.9 },
      { x: x + CHANNEL + 0.9, y: hy + 0.55, z: zN - 0.9 },
      0.32,
      10,
      PAINT.weathered,
      0.36,
    );
    const dye = box(b, 'glow', x + CHANNEL + 0.9, hy + 0.5, zN - 0.9, 0.5, 0.04, 0.5, 0, 0xffffff);
    tintGlow(dye, DYE[crew]);
  }
  // The catch sluice under the south edge (the Great Hall's "main" spillway) and its side gutters.
  const sy = F.rowY[ROWS - 1]! - FLOOR - 0.35;
  box(b, 'stone', (x0 + x1) / 2, sy, zS + 0.9, x1 - x0 + 1.4, 0.3, 1.8, 0, PAINT.stone);
  for (const s of [-1, 1])
    box(b, 'stone', (x0 + x1) / 2, sy + 0.4, zS + 0.9 + s * 0.85, x1 - x0 + 1.4, 0.6, 0.18, 0, PAINT.stone);
  for (const s of [-1, 1]) {
    const x = s < 0 ? x0 - 0.7 : x1 + 0.7;
    box(
      b,
      'stone',
      x,
      (F.rowY[0]! + F.rowY[ROWS - 1]!) / 2 - FLOOR - 0.4,
      F.center.z,
      1.0,
      0.3,
      ROWS * TILE + 1,
      0,
      PAINT.stone,
    );
  }
  // Chutes from the wheel outlets (c0, c2, c4) down to the wheels at the trunk's foot.
  for (const w of TB.water.wheels) {
    const col = F.outlets[w.crew as Crew];
    const a = (w.bearing * Math.PI) / 180;
    const wx = TB.tree.x + Math.sin(a) * w.r;
    const wz = TB.tree.z - Math.cos(a) * w.r;
    const ground = thousandBoughHeight(wx, wz);
    const startY = F.rowY[ROWS - 1]! - FLOOR - 0.05;
    const start = { x: F.cols[col]!, y: startY, z: zS + 1.9 };
    const dl = Math.hypot(wx - start.x, wz - start.z);
    const end = { x: wx - ((wx - start.x) / dl) * 2.3, y: ground + 2.9, z: wz - ((wz - start.z) / dl) * 2.3 };
    beam(b, 'wood', start, end, 1.3, 0.14, PAINT.teak);
    for (const s of [-1, 1]) {
      const off = 0.62 * s;
      beam(
        b,
        'wood',
        { ...start, x: start.x + off, y: start.y + 0.3 },
        { ...end, x: end.x + off, y: end.y + 0.3 },
        0.1,
        0.5,
        PAINT.plank,
      );
    }
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    for (let s = 4; s < len - 1; s += 5) {
      const t = s / len;
      const x = start.x + (end.x - start.x) * t;
      const z = start.z + (end.z - start.z) * t;
      const y = start.y + (end.y - start.y) * t;
      const g = thousandBoughHeight(x, z);
      if (y - g > 0.4) rod(b, 'wood', { x, y: g - 0.3, z }, { x, y: y - 0.08, z }, 0.12, 5, PAINT.weathered);
    }
  }
  // Dry-stone retaining walls down both sides, stepping with the rows, mossy along their tops: the
  // terrace is built into the shelf, not standing on stilts in the dirt.
  for (const [wx, sgn] of [
    [x0 - 0.3, -1],
    [x1 + 0.3, 1],
  ] as const)
    for (let r = 0; r < ROWS; r++) {
      const top = F.rowY[r]! - FLOOR - 0.04;
      const z = F.rows[r]!;
      const ground = Math.min(thousandBoughHeight(wx, z - TILE / 2), thousandBoughHeight(wx, z + TILE / 2));
      if (top - ground < 0.15) continue;
      const h = top - ground + 0.5;
      box(b, 'stone', wx, top - h / 2, z, 0.55, h, TILE + 0.02, 0, r % 2 ? PAINT.stone : PAINT.basalt);
      box(b, 'stone', wx + sgn * 0.04, top + 0.03, z, 0.6, 0.08, TILE, 0, PAINT.moss);
    }
  // The front wall under the last row, above the sluice.
  {
    const top = F.rowY[ROWS - 1]! - FLOOR - 0.04;
    const ground = thousandBoughHeight(F.center.x, zS);
    if (top - ground > 0.15) {
      const h = top - ground + 0.5;
      box(b, 'stone', (x0 + x1) / 2, top - h / 2, zS + 0.05, x1 - x0 + 1.1, h, 0.5, 0, PAINT.basalt);
    }
  }
  // Flowers along the header's top at both ends (planters on the trough's rim).
  for (const ex of [x0 - 0.1, x1 + 0.1])
    for (let k = 0; k < 3; k++)
      cone(
        b,
        'cloth',
        ex + (ex < F.center.x ? 0.35 : -0.35) * k,
        hy + 0.98,
        hz + (k - 1) * 0.5,
        0.16,
        0.28,
        5,
        k === 1 ? PAINT.orchid : PAINT.heliconia,
      );
  // Nobody walks on the board: a low fence of its trestles' rails.
  colliders.push({
    x: F.center.x,
    z: F.center.z,
    hx: (x1 - x0) / 2 + 0.5,
    hz: (zS - zN) / 2 + 1.6,
    rot: 0,
    y0: 18,
    y1: 25,
    height: 3,
  });
}

export { N, E, S, W };
