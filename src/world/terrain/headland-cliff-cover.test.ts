import { beforeAll, describe, expect, it } from 'vitest';
import type { BufferGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
import type { HeightField, Tier } from '../contracts';
import { normalFromGrid, type TerrainBakeData } from './bake';
import { coveHeight } from './cove-height';
import { HEADLAND_CLIFF_AREA, headlandCliffFrame } from './headland-cliff-shape';
import type { CameraBlockerBox } from './camera-blockers';
import {
  buildHeadlandCliffGeometry,
  createHeadlandCliff,
  HEADLAND_CLIFF_DETAIL,
  headlandCliffCameraBlockers,
} from './headland-cliff';
import { buildTerrainLodGeometries, createTerrainHeightField } from './terrain-mesh';

// The headland as a baked 1 m terrain (like the real pack), so the drawn terrain and the cliff mesh are
// built the way the game builds them.
let data: TerrainBakeData;
beforeAll(() => {
  const minX = 60;
  const minZ = -140;
  const nx = 201;
  const nz = 271;
  const heights = new Float32Array(nx * nz);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) heights[z * nx + x] = coveHeight(minX + x, minZ + z);
  const normals = new Float32Array(nx * nz * 3);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++)
      normalFromGrid(heights, nx, nz, minX, minZ, 1, x, z, normals, (z * nx + x) * 3);
  const count = nx * nz;
  data = {
    heights,
    nx,
    nz,
    minX,
    minZ,
    cell: 1,
    maxX: minX + nx - 1,
    maxZ: minZ + nz - 1,
    normals,
    ao: new Uint8Array(count),
    sunMorning: new Uint8Array(count),
    sunGolden: new Uint8Array(count),
    rim: new Uint8Array(count),
    masks: new Uint8Array(count * 4),
    shoreline: [],
    hash: '',
  };
}, 60_000);

/** Triangles near the spots, bucketed by 1 m of height so a level ray only tests the ones it can hit. */
class TriangleSet {
  private readonly p: number[] = [];
  private readonly byY = new Map<number, number[]>();

  constructor(geometries: BufferGeometry[], near: (x: number, z: number) => boolean) {
    for (const g of geometries) {
      const p = g.getAttribute('position').array;
      const idx = g.getIndex()!.array;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t]! * 3;
        const b = idx[t + 1]! * 3;
        const c = idx[t + 2]! * 3;
        if (!near((p[a]! + p[b]! + p[c]!) / 3, (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3)) continue;
        const k = this.p.length;
        for (const v of [a, b, c]) this.p.push(p[v]!, p[v + 1]!, p[v + 2]!);
        const y0 = Math.floor(Math.min(p[a + 1]!, p[b + 1]!, p[c + 1]!));
        const y1 = Math.floor(Math.max(p[a + 1]!, p[b + 1]!, p[c + 1]!));
        for (let y = y0; y <= y1; y++) {
          let list = this.byY.get(y);
          if (!list) this.byY.set(y, (list = []));
          list.push(k);
        }
      }
    }
  }

  /** The distance along a level ray from (ox, y, oz) in direction (dx, 0, dz) to its first hit. */
  cast(ox: number, y: number, oz: number, dx: number, dz: number): number {
    const p = this.p;
    let best = Infinity;
    for (const k of this.byY.get(Math.floor(y)) ?? []) {
      // Möller–Trumbore with d = (dx, 0, dz).
      const e1x = p[k + 3]! - p[k]!;
      const e1y = p[k + 4]! - p[k + 1]!;
      const e1z = p[k + 5]! - p[k + 2]!;
      const e2x = p[k + 6]! - p[k]!;
      const e2y = p[k + 7]! - p[k + 1]!;
      const e2z = p[k + 8]! - p[k + 2]!;
      const px = -dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - p[k]!;
      const sy = y - p[k + 1]!;
      const sz = oz - p[k + 2]!;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < -1e-7 || u > 1 + 1e-7) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dz * qz) * inv;
      if (v < -1e-7 || u + v > 1 + 1e-7) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 0 && t < best) best = t;
    }
    return best;
  }
}

/** The cliff foot spots where slivers of terrain showed through the rock, and the cave notch. */
const SPOTS = [
  [212.6, -46.6],
  [150.7, -73.5],
  [204, 17],
] as const;
const SPOT_RADIUS = 15;
/** Rays start this far out to sea from the cliff line. */
const RAY_START = 24;

/**
 * The worst depth (m) by which the drawn finest terrain comes in front of the cliff mesh, on level rays
 * cast in from the sea at the full-strength stations near the spots (0 if it never does).
 */
function worstPokeThrough(tier: Tier, cover = true): { rays: number; worst: number } {
  const field: HeightField = createTerrainHeightField(data, tier, HEADLAND_CLIFF_AREA);
  const cliff = buildHeadlandCliffGeometry(field, HEADLAND_CLIFF_DETAIL[tier], cover)!;
  const terrain = buildTerrainLodGeometries(data, tier, 0, HEADLAND_CLIFF_AREA);
  const near = (x: number, z: number): boolean =>
    SPOTS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < SPOT_RADIUS + RAY_START + 4);
  const cliffTris = new TriangleSet([cliff], near);
  const terrainTris = new TriangleSet(terrain, near);
  let rays = 0;
  let worst = 0;
  for (const st of headlandCliffFrame(field).stations) {
    if (st.strength < 0.99) continue;
    if (!SPOTS.some(([sx, sz]) => Math.hypot(st.x - sx, st.z - sz) < SPOT_RADIUS)) continue;
    const ox = st.x + st.nx * RAY_START;
    const oz = st.z + st.nz * RAY_START;
    for (let y = 0.25; y < st.lipY - 0.3; y += 0.25) {
      const toCliff = cliffTris.cast(ox, y, oz, -st.nx, -st.nz);
      if (!Number.isFinite(toCliff)) continue;
      rays++;
      worst = Math.max(worst, toCliff - terrainTris.cast(ox, y, oz, -st.nx, -st.nz));
    }
  }
  for (const g of [cliff, ...terrain]) g.dispose();
  return { rays, worst };
}

describe('the headland cliff covers the drawn terrain', { timeout: 60_000 }, () => {
  for (const tier of ['lite', 'low', 'medium', 'high'] as const) {
    it(`shows no terrain through the cliff foot or the cave notch: ${tier}`, () => {
      const { rays, worst } = worstPokeThrough(tier);
      expect(rays).toBeGreaterThan(500);
      expect(worst).toBeLessThan(0.02);
    });
  }

  it('needs its cover pass: without it the terrain shows through', () => {
    expect(worstPokeThrough('lite', false).worst).toBeGreaterThan(0.2);
  });
});

/** How far (m) a point is outside the nearest camera box at its height (0 inside one). */
function outsideBoxes(boxes: CameraBlockerBox[], x: number, y: number, z: number): number {
  let best = Infinity;
  for (const b of boxes) {
    if (y < b.y0 || y > b.y1) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const lx = (x - b.x) * c - (z - b.z) * s;
    const lz = (x - b.x) * s + (z - b.z) * c;
    best = Math.min(best, Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz)));
  }
  return best;
}

describe('the headland cliff camera blockers', { timeout: 60_000 }, () => {
  for (const tier of ['lite', 'low'] as const) {
    it(`hold the face the cover pass moved: ${tier}`, () => {
      const field: HeightField = createTerrainHeightField(data, tier, HEADLAND_CLIFF_AREA);
      const plain = buildHeadlandCliffGeometry(field, HEADLAND_CLIFF_DETAIL[tier]);
      const steps = createHeadlandCliff(field, tier, {} as MeshStandardNodeMaterial);
      let r = steps.next();
      while (!r.done) r = steps.next();
      const boxes: CameraBlockerBox[] = [];
      headlandCliffCameraBlockers(field, boxes, tier);
      const a = plain!.getAttribute('position').array;
      const b = r.value!.geometry.getAttribute('position').array;
      let moved = 0;
      let worst = 0;
      for (let v = 0; v < a.length; v += 3) {
        if (Math.hypot(b[v]! - a[v]!, b[v + 2]! - a[v + 2]!) < 0.05) continue;
        // Under the sea or on the ground, the camera's own water and ground tests stop it.
        const y = b[v + 1]!;
        if (y < 0.3 || y < field.heightAt(b[v]!, b[v + 2]!) + 0.2) continue;
        moved++;
        worst = Math.max(worst, outsideBoxes(boxes, b[v]!, y, b[v + 2]!));
      }
      plain!.dispose();
      r.value!.geometry.dispose();
      expect(moved).toBeGreaterThan(5);
      expect(worst).toBeLessThan(0.05);
    });
  }
});

/** The cliff line's station nearest to (x, z). */
function nearestStation<T extends { x: number; z: number }>(stations: readonly T[], x: number, z: number): T {
  let best = stations[0]!;
  for (const st of stations)
    if (Math.hypot(st.x - x, st.z - z) < Math.hypot(best.x - x, best.z - z)) best = st;
  return best;
}

/** The distance (m) from a point to the nearest of the triangles. */
function distanceToTriangles(
  p: ArrayLike<number>,
  idx: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
): number {
  let best = Infinity;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]! * 3;
    const b = idx[t + 1]! * 3;
    const c = idx[t + 2]! * 3;
    const ax = p[a]!;
    const az = p[a + 2]!;
    if (Math.abs(ax - x) > 8 || Math.abs(az - z) > 8) continue;
    best = Math.min(
      best,
      pointTriangleDistance(
        x,
        y,
        z,
        ax,
        p[a + 1]!,
        az,
        p[b]!,
        p[b + 1]!,
        p[b + 2]!,
        p[c]!,
        p[c + 1]!,
        p[c + 2]!,
      ),
    );
  }
  return best;
}

/** The distance from P to triangle ABC (closest point by Voronoi regions). */
function pointTriangleDistance(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  const at = (u: number, v: number): number =>
    Math.hypot(ax + abx * u + acx * v - px, ay + aby * u + acy * v - py, az + abz * u + acz * v - pz);
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at(1 - w, w);
  }
  const denom = 1 / (va + vb + vc);
  return at(vb * denom, vc * denom);
}

/** Barycentric weights: each triangle's corners, edge middles, centre and near-corner points. */
const WEIGHTS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0.5, 0.5, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [1 / 3, 1 / 3, 1 / 3],
  [0.7, 0.15, 0.15],
  [0.15, 0.7, 0.15],
  [0.15, 0.15, 0.7],
] as const;

describe('the headland cliff camera blockers hold the drawn cliff', { timeout: 120_000 }, () => {
  for (const tier of ['lite', 'low', 'medium', 'high', 'ultra'] as const) {
    it(`leave no drawn rock the camera can reach outside them: ${tier}`, () => {
      const field: HeightField = createTerrainHeightField(data, tier, HEADLAND_CLIFF_AREA);
      const steps = createHeadlandCliff(field, tier, {} as MeshStandardNodeMaterial);
      let r = steps.next();
      while (!r.done) r = steps.next();
      const boxes: CameraBlockerBox[] = [];
      headlandCliffCameraBlockers(field, boxes, tier);
      const geometry = r.value!.geometry;
      const p = geometry.getAttribute('position').array;
      const idx = geometry.getIndex()!.array;
      let samples = 0;
      let worst = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t]! * 3;
        const b = idx[t + 1]! * 3;
        const c = idx[t + 2]! * 3;
        for (const [wa, wb, wc] of WEIGHTS) {
          const x = wa * p[a]! + wb * p[b]! + wc * p[c]!;
          const y = wa * p[a + 1]! + wb * p[b + 1]! + wc * p[c + 1]!;
          const z = wa * p[a + 2]! + wb * p[b + 2]! + wc * p[c + 2]!;
          // The camera never comes this close to the sea or the ground (its own tests stop it there).
          if (y < 0.4 || y < field.heightAt(x, z) + 0.4) continue;
          samples++;
          worst = Math.max(worst, outsideBoxes(boxes, x, y, z));
        }
      }
      geometry.dispose();
      expect(samples).toBeGreaterThan(10_000);
      expect(worst).toBeLessThan(0.3);
    });
  }

  for (const tier of ['lite', 'high'] as const) {
    it(`don't hold the pivot of a player standing clear of the rock: ${tier}`, () => {
      // A box that holds the pivot doesn't count (the camera would fold onto the player's head), so
      // a box that reaches well past the rock over walkable ground lets the camera into the rock.
      const field: HeightField = createTerrainHeightField(data, tier, HEADLAND_CLIFF_AREA);
      const steps = createHeadlandCliff(field, tier, {} as MeshStandardNodeMaterial);
      let r = steps.next();
      while (!r.done) r = steps.next();
      const boxes: CameraBlockerBox[] = [];
      headlandCliffCameraBlockers(field, boxes, tier);
      const geometry = r.value!.geometry;
      const p = geometry.getAttribute('position').array;
      const idx = geometry.getIndex()!.array;
      const rock = new TriangleSet([geometry], () => true);
      const stations = headlandCliffFrame(field).stations;
      let pivots = 0;
      let held = 0;
      for (let x = 120; x <= 230; x += 0.5)
        for (let z = -90; z <= 70; z += 0.5) {
          const ground = field.heightAt(x, z);
          // Only walkable ground (under about 35 degrees).
          const slope = Math.hypot(
            field.heightAt(x + 0.25, z) - field.heightAt(x - 0.25, z),
            field.heightAt(x, z + 0.25) - field.heightAt(x, z - 0.25),
          );
          if (ground < 1 || slope > 0.35) continue;
          const y = ground + 1.55;
          if (outsideBoxes(boxes, x, y, z) > 0) continue;
          pivots++;
          // Behind the cliff face (the player walks through the rock there) the pivot rule is meant to
          // apply: a level ray out to sea hits the face.
          const st = nearestStation(stations, x, z);
          if (Number.isFinite(rock.cast(x, y, z, st.nx, st.nz))) continue;
          // Within the camera's widest pad (0.7 m) of the rock is "by the rock": the rule is meant for it.
          if (distanceToTriangles(p, idx, x, y, z) > 0.8) held++;
        }
      geometry.dispose();
      expect(pivots).toBeGreaterThan(0);
      expect(held).toBe(0);
    });
  }
});
