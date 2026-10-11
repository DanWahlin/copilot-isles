import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type MeshStandardNodeMaterial,
} from 'three/webgpu';
import type { HeightField, Tier } from '../contracts';
import { clamp01, smoothstep } from '../../util/math';
import { COVE } from '../layout';
import { headlandCliffEdge } from './cove-height';
import { ROCK_ASSETS } from './rock-assets';
import {
  HEADLAND_CAVE_BULGE,
  HEADLAND_CLIFF_BASE_Y,
  PROFILE_SAMPLES,
  caveArch,
  caveBulge,
  cliffGroove,
  cliffOffset,
  headlandCliffFrame,
  profileCrossing,
  stationAt,
  stationProfile,
  type CliffStation,
} from './headland-cliff-shape';
import { meshCameraBlockers, type CameraBlockerBox } from './camera-blockers';

/** Mesh density per tier: station spacing along the cliff and row spacing up it (m), and loose blocks. */
export interface CliffDetail {
  spacing: number;
  rowStep: number;
  talus: number;
  fallen: number;
  /** Limestone outcrops half-buried in the clifftop. */
  outcrops: number;
}

export const HEADLAND_CLIFF_DETAIL: Record<Tier, CliffDetail> = {
  lite: { spacing: 4, rowStep: 3, talus: 0, fallen: 2, outcrops: 2 },
  low: { spacing: 2.6, rowStep: 2, talus: 4, fallen: 4, outcrops: 5 },
  medium: { spacing: 2, rowStep: 1.5, talus: 24, fallen: 8, outcrops: 14 },
  high: { spacing: 1.5, rowStep: 1.2, talus: 36, fallen: 10, outcrops: 18 },
  ultra: { spacing: 1.2, rowStep: 1, talus: 44, fallen: 10, outcrops: 18 },
};

/** Texture `u` per metre along the cliff: the sea stack's streak density (its girth is about 66 m). */
const U_PER_METRE = 1 / 66;
/** Steepest outward lean of the mesh's foot below the height field's toe (m per m). */
const TOE_SPREAD = 2.5;

function hash(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

interface BlockPart {
  pos: Float32Array;
  nrm: Float32Array;
  idx: ArrayLike<number>;
  s: number;
  /** On the clifftop (moss on its top), not at the foot. */
  top: boolean;
}

/** Bakes one rock asset into world space with the given pose. */
function placeRock(
  assetIndex: number,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
  s: number,
  top: boolean,
): BlockPart {
  const m = new Matrix4().compose(position, rotation, scale);
  const nm = new Matrix4().extractRotation(m);
  const v = new Vector3();
  const asset = ROCK_ASSETS[assetIndex % 3]!;
  const n = asset.positions.length / 3;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromArray(asset.positions, i * 3)
      .applyMatrix4(m)
      .toArray(pos, i * 3);
    v.fromArray(asset.normals, i * 3)
      .applyMatrix4(nm)
      .normalize()
      .toArray(nrm, i * 3);
  }
  return { pos, nrm, idx: asset.indices, s, top };
}

/** Limestone outcrops on the clifftop and shoulders, half-buried so they grow out of the ground. */
function topOutcrops(frame: ReturnType<typeof headlandCliffFrame>, detail: CliffDetail): BlockPart[] {
  const parts: BlockPart[] = [];
  const p = new Vector3();
  const q = new Quaternion();
  const e = new Euler();
  const sc = new Vector3();
  for (let tries = 0; parts.length < detail.outcrops && tries < detail.outcrops * 30; tries++) {
    const x = COVE.headland.x0 + hash(tries, 31) * (COVE.headland.x1 - COVE.headland.x0 + 5);
    const z = COVE.headland.z0 - 15 + hash(tries, 32) * (COVE.headland.z1 - COVE.headland.z0 + 30);
    if (headlandCliffEdge(x, z) < 5) continue;
    const y = frame.heightAt(x, z);
    if (y < 8) continue;
    const slope =
      Math.hypot(
        frame.heightAt(x + 1.5, z) - frame.heightAt(x - 1.5, z),
        frame.heightAt(x, z + 1.5) - frame.heightAt(x, z - 1.5),
      ) / 3;
    if (slope > 0.8) continue;
    const size = 1.8 + hash(tries, 33) * 2.4;
    const sy = size * (0.8 + hash(tries, 34) * 0.5);
    p.set(x, y - sy * 0.65 * 0.5, z);
    e.set((hash(tries, 35) - 0.5) * 0.3, hash(tries, 36) * Math.PI * 2, (hash(tries, 37) - 0.5) * 0.3, 'YXZ');
    q.setFromEuler(e);
    sc.set(size * (1 + hash(tries, 38) * 0.6), sy, size);
    parts.push(placeRock(Math.floor(hash(tries, 39) * 3), p, q, sc, x + z, true));
  }
  return parts;
}

/**
 * Fallen blocks and a talus apron along the foot, seated in the water (never in the cave's mouth).
 */
function footBlocks(
  frame: ReturnType<typeof headlandCliffFrame>,
  detail: CliffDetail,
  profile: Float32Array,
): BlockPart[] {
  const parts: BlockPart[] = [];
  const st: CliffStation = { ...frame.stations[0]! };
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const sc = new Vector3();
  const total = detail.fallen + detail.talus;
  for (let b = 0, tries = 0; b < total && tries < total * 6; tries++) {
    const big = b < detail.fallen;
    const s = (hash(tries, 1) * 0.94 + 0.03) * frame.length;
    stationAt(frame, s, st);
    if (st.strength < 0.8) continue;
    if (frame.caveS >= 0 && Math.abs(s - frame.caveS) < 7) continue;
    stationProfile(frame.heightAt, st, profile);
    const toe = profileCrossing(profile, 0);
    const size = big ? 2.6 + hash(tries, 2) * 1.8 : 0.9 + hash(tries, 2) * 1.4;
    const out = toe + 1.2 + caveBulge(frame, s) * HEADLAND_CAVE_BULGE + hash(tries, 3) * (big ? 4.5 : 3.2);
    p.set(st.x + st.nx * out, -0.8 - hash(tries, 4) * 0.5 + size * (big ? 0.16 : 0.05), st.z + st.nz * out);
    e.set((hash(tries, 5) - 0.5) * 0.35, hash(tries, 6) * Math.PI * 2, (hash(tries, 7) - 0.5) * 0.4, 'YXZ');
    q.setFromEuler(e);
    sc.set(size * (1.1 + hash(tries, 8) * 0.4), size * (0.7 + hash(tries, 9) * 0.3), size);
    parts.push(placeRock(Math.floor(hash(tries, 10) * 3), p, q, sc, s, false));
    b++;
  }
  return parts;
}

/** Below this height (m) the sea hides the face's foot, so ground in front of it doesn't matter. */
const COVER_MIN_Y = -0.3;
/** The gap (m) the face keeps in front of the drawn ground. */
const COVER_GAP = 0.15;
/**
 * Ground counts as poking through only if it's `COVER_DROP` m lower again this far out: not the
 * beach or seabed the foot stands in.
 */
const COVER_OPEN = 4;
const COVER_DROP = 0.5;
/** Faces this faded or more are left alone: there the rock sinks into the slope on purpose. */
const COVER_STRENGTH = 0.95;
/** How far in front of the face (m) ground above it counts as poking through, and the scan step. */
const COVER_NEAR = 2;
const COVER_STEP = 0.25;
/** Quad samples are at most this far apart (m) for the first look, and for the close look. */
const COVER_SPACING = 0.5;
const COVER_FINE = 0.2;
/**
 * A quad whose samples all have their ground at the face, halfway out and `COVER_NEAR` out this far
 * (m) below the gap is clear. Any other quad gets the close look.
 */
const COVER_CLEAR = 1;
/** The most times the pass pushes a quad out. */
const COVER_PASSES = 6;
/** The pass yields after this many ms of work, so the island's build keeps the screen moving. */
const COVER_SLICE_MS = 4;

/**
 * How far (m) a face point at (x, y, z), facing out along (nx, nz), must move out so the drawn ground
 * (`ground`) doesn't poke through in front of it, or 0. The cover pass and the camera blockers share it.
 */
function coverPush(
  x: number,
  y: number,
  z: number,
  nx: number,
  nz: number,
  ground: (x: number, z: number) => number,
): number {
  if (y < COVER_MIN_Y) return 0;
  const top = y - COVER_GAP;
  // Ground at or just in front of the face, above it, with open air further out.
  let d = -1;
  for (let e = COVER_NEAR; e >= 0; e -= COVER_STEP) {
    if (ground(x + nx * e, z + nz * e) > top) {
      d = e;
      break;
    }
  }
  if (d < 0 || ground(x + nx * COVER_OPEN, z + nz * COVER_OPEN) > top - COVER_DROP) return 0;
  // Out past the last ground above it before the open air (a wavy slope can rise again).
  for (let e = COVER_OPEN - COVER_STEP; e > d; e -= COVER_STEP) {
    if (ground(x + nx * e, z + nz * e) > top) {
      d = e;
      break;
    }
  }
  return d + COVER_STEP;
}

/**
 * Pushes full-strength face quads out along their columns' normals wherever the drawn ground
 * (`ground`, the terrain mesh's own height) comes in front of them, so no sliver of terrain shows on
 * the rock. The profile keeps the face clear of the ground only along each column; between columns
 * and rows the terrain's triangles can still bulge through. The roll over the lip moves with the top.
 */
function* coverGround(
  pos: Float32Array,
  columnNormal: Float32Array,
  columnStrength: Float32Array,
  columns: number,
  rows: number,
  faceRows: number,
  ground: (x: number, z: number) => number,
  blockers: CameraBlockerBox[],
): Generator<void, void, void> {
  let sliceEnd = performance.now() + COVER_SLICE_MS;
  const need = new Float32Array((columns + 1) * rows);
  const total = new Float32Array((columns + 1) * rows);
  // After the first pass only quads with a corner that moved are checked again.
  const moved = new Uint8Array((columns + 1) * rows).fill(1);
  const moveVertex = (c: number, v: number, d: number): void => {
    pos[v * 3] = pos[v * 3]! + columnNormal[c * 2]! * d;
    pos[v * 3 + 2] = pos[v * 3 + 2]! + columnNormal[c * 2 + 1]! * d;
  };
  const edge = (v: number, w: number): number =>
    Math.hypot(
      pos[w * 3]! - pos[v * 3]!,
      pos[w * 3 + 1]! - pos[v * 3 + 1]!,
      pos[w * 3 + 2]! - pos[v * 3 + 2]!,
    );
  /**
   * Samples quad (c, j) on a grid at most `spacing` apart. With `scan` false it returns 1 if any sample
   * has ground near it (else 0); with `scan` true, how far (m) the quad must move out to clear it.
   */
  const sampleQuad = (c: number, j: number, spacing: number, scan: boolean): number => {
    const v00 = c * rows + j;
    const v10 = v00 + rows;
    const na = Math.max(1, Math.ceil(Math.max(edge(v00, v10), edge(v00 + 1, v10 + 1)) / spacing));
    const nb = Math.max(1, Math.ceil(Math.max(edge(v00, v00 + 1), edge(v10, v10 + 1)) / spacing));
    let quad = 0;
    for (let a = 0; a <= na; a++) {
      const u = a / na;
      let nx = columnNormal[c * 2]! * (1 - u) + columnNormal[c * 2 + 2]! * u;
      let nz = columnNormal[c * 2 + 1]! * (1 - u) + columnNormal[c * 2 + 3]! * u;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      for (let b = 0; b <= nb; b++) {
        const t = b / nb;
        const w00 = (1 - u) * (1 - t);
        const w01 = (1 - u) * t;
        const w10 = u * (1 - t);
        const w11 = u * t;
        const y =
          pos[v00 * 3 + 1]! * w00 +
          pos[v00 * 3 + 4]! * w01 +
          pos[v10 * 3 + 1]! * w10 +
          pos[v10 * 3 + 4]! * w11;
        if (y < COVER_MIN_Y) continue;
        const x =
          pos[v00 * 3]! * w00 + pos[v00 * 3 + 3]! * w01 + pos[v10 * 3]! * w10 + pos[v10 * 3 + 3]! * w11;
        const z =
          pos[v00 * 3 + 2]! * w00 +
          pos[v00 * 3 + 5]! * w01 +
          pos[v10 * 3 + 2]! * w10 +
          pos[v10 * 3 + 5]! * w11;
        if (!scan) {
          const clear = y - COVER_GAP - COVER_CLEAR;
          const half = COVER_NEAR / 2;
          if (
            ground(x, z) >= clear ||
            ground(x + nx * half, z + nz * half) >= clear ||
            ground(x + nx * COVER_NEAR, z + nz * COVER_NEAR) >= clear
          ) {
            return 1;
          }
          continue;
        }
        quad = Math.max(quad, coverPush(x, y, z, nx, nz, ground));
      }
    }
    return quad;
  };
  for (let pass = 0; pass < COVER_PASSES; pass++) {
    need.fill(0);
    let any = false;
    for (let c = 0; c < columns; c++) {
      if (Math.min(columnStrength[c]!, columnStrength[c + 1]!) < COVER_STRENGTH) continue;
      for (let j = 0; j < faceRows; j++) {
        const v00 = c * rows + j;
        const v10 = v00 + rows;
        if (!(moved[v00]! | moved[v00 + 1]! | moved[v10]! | moved[v10 + 1]!)) continue;
        if (performance.now() > sliceEnd) {
          yield;
          sliceEnd = performance.now() + COVER_SLICE_MS;
        }
        if (sampleQuad(c, j, COVER_SPACING, false) === 0) continue;
        const quad = sampleQuad(c, j, COVER_FINE, true);
        if (quad <= 0) continue;
        any = true;
        need[v00] = Math.max(need[v00]!, quad);
        need[v00 + 1] = Math.max(need[v00 + 1]!, quad);
        need[v10] = Math.max(need[v10]!, quad);
        need[v10 + 1] = Math.max(need[v10 + 1]!, quad);
      }
    }
    if (!any) break;
    moved.fill(0);
    for (let c = 0; c <= columns; c++) {
      for (let j = 0; j <= faceRows; j++) {
        const v = c * rows + j;
        if (need[v]! <= 0) continue;
        moveVertex(c, v, need[v]!);
        total[v] = total[v]! + need[v]!;
        moved[v] = 1;
      }
    }
  }
  // The roll over the lip stays outside the top of the face.
  for (let c = 0; c <= columns; c++) {
    const top = c * rows + faceRows;
    if (total[top]! > 0) {
      moveVertex(c, top + 1, total[top]!);
      total[top + 1] = total[top]!;
    }
  }
  coverCameraBlockers(pos, columnNormal, total, columns, rows, faceRows, blockers);
}

/** Quads moved less than this (m) keep to the cliff's own camera blockers. */
const COVER_BLOCKER_MIN = 0.05;
/** The cover blockers' slice height (m): thin, so a sloping foot's boxes don't reach over the beach. */
const COVER_BLOCKER_SLICE = 0.5;

/**
 * Camera-only blockers for the face quads the cover pass moved (the cliff's own blockers follow the
 * height field's profile, so they don't know about it): each moved quad in slices up to
 * `COVER_BLOCKER_SLICE` m tall, each box from 1 m behind where the face was out to where it is now.
 */
function coverCameraBlockers(
  pos: Float32Array,
  columnNormal: Float32Array,
  total: Float32Array,
  columns: number,
  rows: number,
  faceRows: number,
  out: CameraBlockerBox[],
): void {
  for (let c = 0; c < columns; c++) {
    let nx = columnNormal[c * 2]! + columnNormal[c * 2 + 2]!;
    let nz = columnNormal[c * 2 + 1]! + columnNormal[c * 2 + 3]!;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    // How far back each column's push is along this quad's normal.
    const back0 = columnNormal[c * 2]! * nx + columnNormal[c * 2 + 1]! * nz;
    const back1 = columnNormal[c * 2 + 2]! * nx + columnNormal[c * 2 + 3]! * nz;
    // Rows 0..faceRows are the face's quads; quad faceRows is the roll over the lip.
    for (let j = 0; j <= faceRows; j++) {
      const a0 = c * rows + j;
      const b0 = (c + 1) * rows + j;
      if (Math.max(total[a0]!, total[a0 + 1]!, total[b0]!, total[b0 + 1]!) <= COVER_BLOCKER_MIN) continue;
      const ox = pos[a0 * 3]!;
      const oz = pos[a0 * 3 + 2]!;
      let lx0 = 0,
        lx1 = 0,
        lz0 = 0,
        lz1 = 0,
        y0 = 0,
        y1 = 0;
      // A point `t` of the way up the edge from v to v + 1; local x along the face, z out (`rot`).
      const take = (v: number, t: number, back: number, first: boolean): void => {
        const x = pos[v * 3]! + (pos[v * 3 + 3]! - pos[v * 3]!) * t;
        const y = pos[v * 3 + 1]! + (pos[v * 3 + 4]! - pos[v * 3 + 1]!) * t;
        const z = pos[v * 3 + 2]! + (pos[v * 3 + 5]! - pos[v * 3 + 2]!) * t;
        const lx = (x - ox) * nz - (z - oz) * nx;
        const lz = (x - ox) * nx + (z - oz) * nz;
        const was = lz - (total[v]! + (total[v + 1]! - total[v]!) * t) * back;
        lx0 = first ? lx : Math.min(lx0, lx);
        lx1 = first ? lx : Math.max(lx1, lx);
        lz0 = first ? was : Math.min(lz0, was);
        lz1 = first ? lz : Math.max(lz1, lz);
        y0 = first ? y : Math.min(y0, y);
        y1 = first ? y : Math.max(y1, y);
      };
      const rise = Math.max(
        Math.abs(pos[a0 * 3 + 4]! - pos[a0 * 3 + 1]!),
        Math.abs(pos[b0 * 3 + 4]! - pos[b0 * 3 + 1]!),
      );
      const slices = Math.max(1, Math.ceil(rise / COVER_BLOCKER_SLICE));
      for (let k = 0; k < slices; k++) {
        const t0 = k / slices;
        const t1 = (k + 1) / slices;
        take(a0, t0, back0, true);
        take(a0, t1, back0, false);
        take(b0, t0, back1, false);
        take(b0, t1, back1, false);
        // Into the rock behind where the face was, so a camera can't slip in behind the box.
        const zIn = lz0 - 1;
        const cx = (lx0 + lx1) * 0.5;
        const cz = (zIn + lz1) * 0.5;
        out.push({
          x: ox + cx * nz + cz * nx,
          z: oz - cx * nx + cz * nz,
          hx: (lx1 - lx0) * 0.5 + 0.1,
          hz: (lz1 - zIn) * 0.5,
          rot: Math.atan2(nx, nz),
          y0,
          y1,
        });
      }
    }
  }
}

/**
 * Builds the cliff: a grid of stations along the cliff by rows up the face, from under the sea to the
 * clifftop edge, then two rows that roll back over the edge and tuck under the clifftop. Fallen blocks
 * are merged in, so it's one draw. Per-vertex `karst` = (cavity AO, run-off flow, moss, flute depth),
 * the same attribute the sea stack bakes, so both share one material. With `cover`, the face then moves
 * out wherever the drawn ground (`heightAt`) would show in front of it.
 */
export function buildHeadlandCliffGeometry(
  heightField: Pick<HeightField, 'heightAt' | 'shapeField'>,
  detail: CliffDetail,
  cover = false,
): BufferGeometry | null {
  const steps = headlandCliffGeometrySteps(heightField, detail, cover);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * The same cliff, yielding while it moves the face clear of the drawn ground (`cover`: the game's
 * cliff; the chart's miniature skips it).
 */
function* headlandCliffGeometrySteps(
  heightField: Pick<HeightField, 'heightAt' | 'shapeField'>,
  detail: CliffDetail,
  cover: boolean,
  blockers: CameraBlockerBox[] = [],
): Generator<void, BufferGeometry | null, void> {
  const frame = headlandCliffFrame(heightField);
  if (frame.stations.length < 2) return null;
  const columns = Math.max(2, Math.round(frame.length / detail.spacing));
  let maxLip = 0;
  for (const st of frame.stations) maxLip = Math.max(maxLip, st.lipY);
  const faceRows = Math.max(4, Math.ceil((maxLip - HEADLAND_CLIFF_BASE_Y) / detail.rowStep));
  const rows = faceRows + 3;
  const gridCount = (columns + 1) * rows;
  const profile = new Float32Array(PROFILE_SAMPLES);
  const blocks = [...footBlocks(frame, detail, profile), ...topOutcrops(frame, detail)];
  const blockCount = blocks.reduce((sum, b) => sum + b.pos.length / 3, 0);
  const vertexCount = gridCount + blockCount;
  const pos = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const karst = new Float32Array(vertexCount * 4);
  const shelf = new Float32Array(gridCount);
  const ds = new Float32Array(faceRows + 1);
  const ys = new Float32Array(faceRows + 1);
  const st: CliffStation = { ...frame.stations[0]! };
  const columnNormal = new Float32Array((columns + 1) * 2);
  const columnStrength = new Float32Array(columns + 1);

  for (let c = 0; c <= columns; c++) {
    const s = (c / columns) * frame.length;
    stationAt(frame, s, st);
    columnNormal[c * 2] = st.nx;
    columnNormal[c * 2 + 1] = st.nz;
    columnStrength[c] = st.strength;
    stationProfile(frame.heightAt, st, profile);
    for (let j = 0; j <= faceRows; j++) {
      ys[j] = HEADLAND_CLIFF_BASE_Y + (st.lipY - HEADLAND_CLIFF_BASE_Y) * (j / faceRows);
      ds[j] = profileCrossing(profile, ys[j]!);
    }
    // Under the seabed the crossing runs off seaward; keep the foot steep instead.
    for (let j = faceRows - 1; j >= 0; j--) {
      ds[j] = Math.min(ds[j]!, ds[j + 1]! + (ys[j + 1]! - ys[j]!) * TOE_SPREAD);
    }
    const base = c * rows;
    const u = s * U_PER_METRE;
    for (let j = 0; j <= faceRows; j++) {
      const d = ds[j]! + cliffOffset(frame, s, ys[j]!, st.lipY, st.strength);
      const v = base + j;
      pos[v * 3] = st.x + st.nx * d;
      pos[v * 3 + 1] = ys[j]!;
      pos[v * 3 + 2] = st.z + st.nz * d;
      uvs[v * 2] = u;
      uvs[v * 2 + 1] = ys[j]!;
    }
    // Roll back over the edge (out over the cave buttress, which has a flat, planted top) and tuck under.
    const top = ds[faceRows]!;
    const k = st.strength;
    const bulge = caveBulge(frame, s) * HEADLAND_CAVE_BULGE;
    const rollD = [top + (0.35 + bulge) * k - 0.9 * (1 - k), top - 3.5];
    const inland = frame.heightAt(st.x + st.nx * rollD[1]!, st.z + st.nz * rollD[1]!);
    const rollY = [st.lipY + 0.3 * k - 0.6 * (1 - k), Math.min(st.lipY, inland) - 0.8];
    for (let r = 0; r < 2; r++) {
      const v = base + faceRows + 1 + r;
      pos[v * 3] = st.x + st.nx * rollD[r]!;
      pos[v * 3 + 1] = rollY[r]!;
      pos[v * 3 + 2] = st.z + st.nz * rollD[r]!;
      uvs[v * 2] = u;
      uvs[v * 2 + 1] = rollY[r]!;
    }

    // Cavity AO and run-off: look up the column for overhangs (the visor, ledge lips, the cave roof).
    // Run-off streaks are accents here (a cliff this long, streaked like the stack, reads charcoal).
    let flow = 0.35;
    for (let j = faceRows; j >= 0; j--) {
      const v = base + j;
      const y = pos[v * 3 + 1]!;
      let occ = 0;
      let lip = 0;
      for (let kk = j + 1; kk <= faceRows; kk++) {
        const w = base + kk;
        const dy = pos[w * 3 + 1]! - y;
        if (dy > 16) break;
        const e = (pos[w * 3]! - pos[v * 3]!) * st.nx + (pos[w * 3 + 2]! - pos[v * 3 + 2]!) * st.nz;
        const o = e / Math.max(0.05, dy);
        if (o > occ) occ = o;
        if (dy < 2.6 && o > lip) lip = o;
      }
      let ledge = 0;
      let dy = 0;
      if (j < faceRows) {
        const w = v + 1;
        dy = pos[w * 3 + 1]! - y;
        const e = (pos[w * 3]! - pos[v * 3]!) * st.nx + (pos[w * 3 + 2]! - pos[v * 3 + 2]!) * st.nz;
        ledge = smoothstep(0.4, 1.4, -e / Math.max(0.01, dy));
      }
      flow = Math.max(flow * Math.exp(-dy / 8), smoothstep(0.2, 0.75, lip) * 0.7, ledge * 0.45);
      const groove = cliffGroove(s, y, st.lipY) * k;
      let ao = 1 - 0.62 * smoothstep(0.06, 0.95, occ);
      ao *= 1 - 0.3 * groove;
      ao *= 1 - 0.35 * smoothstep(0, -6, y);
      ao *= 1 - 0.82 * caveArch(frame, s, y) * k;
      karst[v * 4] = clamp01(ao);
      karst[v * 4 + 1] = clamp01(flow) * smoothstep(1.5, 4.5, y);
      karst[v * 4 + 3] = groove;
      shelf[v] = ledge;
    }
    for (let r = 1; r <= 2; r++) {
      const v = base + faceRows + r;
      karst[v * 4] = 0.86;
      shelf[v] = 1;
    }
  }

  if (cover) {
    yield;
    yield* coverGround(
      pos,
      columnNormal,
      columnStrength,
      columns,
      rows,
      faceRows,
      (x, z) => heightField.heightAt(x, z),
      blockers,
    );
  }

  const indices: number[] = [];
  // Wind the faces seaward whichever way the stations run.
  const s0 = frame.stations[0]!;
  const s1 = frame.stations[1]!;
  const seaward = -(s1.z - s0.z) * s0.nx + (s1.x - s0.x) * s0.nz >= 0;
  for (let c = 0; c < columns; c++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = c * rows + j;
      const b = a + rows;
      if (seaward) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  // Fallen blocks: the sea stack's block shading (darker toward the water, a little run-off).
  let offset = gridCount;
  for (const part of blocks) {
    const n = part.pos.length / 3;
    pos.set(part.pos, offset * 3);
    for (let i = 0; i < n; i++) {
      const y = part.pos[i * 3 + 1]!;
      uvs[(offset + i) * 2] = part.s * U_PER_METRE + part.pos[i * 3]! * 0.01;
      uvs[(offset + i) * 2 + 1] = y;
      const ny = part.nrm[i * 3 + 1]!;
      karst[(offset + i) * 4] = 0.62 + 0.3 * smoothstep(-1.5, 1.5, y) * clamp01(ny + 0.6);
      karst[(offset + i) * 4 + 1] = 0.15;
      karst[(offset + i) * 4 + 2] = part.top ? smoothstep(0.35, 0.85, ny) * 0.75 : 0;
      karst[(offset + i) * 4 + 3] = 0.2;
    }
    for (let i = 0; i < part.idx.length; i++) indices.push(part.idx[i]! + offset);
    offset += n;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('karst', new BufferAttribute(karst, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  const nArr = normal.array as Float32Array;
  // The blocks keep their own (flat-shaded) normals.
  offset = gridCount;
  for (const part of blocks) {
    nArr.set(part.nrm, offset * 3);
    offset += part.nrm.length / 3;
  }
  // Moss on up-facing ledges and the clifftop roll; soil spills over each shelf's lip.
  for (let v = 0; v < gridCount; v++) {
    const ny =
      nArr[v * 3 + 1]! / Math.max(1e-6, Math.hypot(nArr[v * 3]!, nArr[v * 3 + 1]!, nArr[v * 3 + 2]!));
    const y = pos[v * 3 + 1]!;
    karst[v * 4 + 2] = Math.max(smoothstep(0.42, 0.8, ny), shelf[v]! * 0.85) * smoothstep(4, 8.5, y);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Camera blockers for the face the game's cliff moved clear of the drawn ground, by the height field
 * it was built on (`headlandCliffCameraBlockers` adds them).
 */
const coverBlockers = new WeakMap<object, CameraBlockerBox[]>();

/** The headland's sea cliff: one draw, sharing the sea stack's karst material. Yields while it builds. */
export function* createHeadlandCliff(
  heightField: Pick<HeightField, 'heightAt' | 'shapeField'>,
  tier: Tier,
  material: MeshStandardNodeMaterial,
): Generator<void, Mesh | null, void> {
  const blockers: CameraBlockerBox[] = [];
  const geometry = yield* headlandCliffGeometrySteps(
    heightField,
    HEADLAND_CLIFF_DETAIL[tier],
    true,
    blockers,
  );
  if (!geometry) return null;
  coverBlockers.set(heightField, blockers);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain-rocks-headland-cliff';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** Column spacing and band height (m) of the cliff's camera blockers. */
const BLOCKER_SPACING = 2;
const BLOCKER_BAND = 1.6;
const BLOCKER_SAMPLES = 5;

/**
 * Camera-only blockers for the cliff: the mesh stands 1-7 m out past the height field's face (ledges,
 * the visor, the cave buttress, the roll over the edge), where the follow camera's ground test sees
 * open air. One box per column and band of height, from inside the height field's face out to the
 * mesh, plus a fitted stack for each fallen block and clifftop outcrop.
 */
export function headlandCliffCameraBlockers(
  heightField: Pick<HeightField, 'heightAt' | 'shapeField'>,
  out: CameraBlockerBox[],
  tier: Tier = 'high',
): void {
  const frame = headlandCliffFrame(heightField);
  if (frame.stations.length < 2) return;
  const detail = HEADLAND_CLIFF_DETAIL[tier];
  const columns = Math.max(2, Math.round(frame.length / BLOCKER_SPACING));
  const half = frame.length / columns / 2 + 0.35;
  const profile = new Float32Array(PROFILE_SAMPLES);
  const st: CliffStation = { ...frame.stations[0]! };
  for (let c = 0; c < columns; c++) {
    const s = ((c + 0.5) / columns) * frame.length;
    stationAt(frame, s, st);
    stationProfile(frame.heightAt, st, profile);
    const k = st.strength;
    const top = profileCrossing(profile, st.lipY);
    const rollD = top + (0.35 + caveBulge(frame, s) * HEADLAND_CAVE_BULGE) * k - 0.9 * (1 - k);
    const rollY = st.lipY + 0.3 * k - 0.6 * (1 - k);
    for (let y0 = -1.2; y0 < rollY; y0 += BLOCKER_BAND) {
      const y1 = Math.min(y0 + BLOCKER_BAND, rollY);
      let dIn = Infinity,
        dOut = -Infinity;
      for (let i = 0; i < BLOCKER_SAMPLES; i++) {
        const y = Math.min(st.lipY, y0 + ((y1 - y0) * i) / (BLOCKER_SAMPLES - 1));
        const d = profileCrossing(profile, y);
        const mesh = d + cliffOffset(frame, s, y, st.lipY, k);
        dIn = Math.min(dIn, d, mesh);
        dOut = Math.max(dOut, mesh);
      }
      if (y1 > st.lipY - 0.4) dOut = Math.max(dOut, rollD);
      // Into the rock behind the face, so a camera can't slip between the box and the height field.
      dIn -= 1;
      if (dOut - dIn < 1.2) continue;
      const mid = (dIn + dOut) * 0.5;
      out.push({
        x: st.x + st.nx * mid,
        z: st.z + st.nz * mid,
        hx: half,
        hz: (dOut - dIn) * 0.5,
        // Local z along the station's seaward normal.
        rot: Math.atan2(st.nx, st.nz),
        y0,
        y1,
      });
    }
  }
  const identity = new Matrix4();
  for (const part of [...footBlocks(frame, detail, profile), ...topOutcrops(frame, detail)])
    meshCameraBlockers(part.pos, identity, out, 2);
  // The game's cliff (built with the terrain, so before this) moved some of its face out further.
  const covered = coverBlockers.get(heightField);
  if (covered) for (const b of covered) out.push(b);
}
