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

/**
 * Builds the cliff: a grid of stations along the cliff by rows up the face, from under the sea to the
 * clifftop edge, then two rows that roll back over the edge and tuck under the clifftop. Fallen blocks
 * are merged in, so it's one draw. Per-vertex `karst` = (cavity AO, run-off flow, moss, flute depth),
 * the same attribute the sea stack bakes, so both share one material.
 */
export function buildHeadlandCliffGeometry(
  heightField: Pick<HeightField, 'heightAt'>,
  detail: CliffDetail,
): BufferGeometry | null {
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

  for (let c = 0; c <= columns; c++) {
    const s = (c / columns) * frame.length;
    stationAt(frame, s, st);
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

/** The headland's sea cliff: one draw, sharing the sea stack's karst material. */
export function createHeadlandCliff(
  heightField: Pick<HeightField, 'heightAt'>,
  tier: Tier,
  material: MeshStandardNodeMaterial,
): Mesh | null {
  const geometry = buildHeadlandCliffGeometry(heightField, HEADLAND_CLIFF_DETAIL[tier]);
  if (!geometry) return null;
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
  heightField: Pick<HeightField, 'heightAt'>,
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
}
