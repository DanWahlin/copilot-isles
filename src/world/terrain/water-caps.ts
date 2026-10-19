import type { TerrainBakeData } from './bake';

/**
 * An island's fresh water (its streams and pools, `FreshWater`), as the terrain sees it: the
 * coarser levels of detail keep under it (`CreateTerrainOptions.freshWater`).
 */
export interface TerrainFreshWater {
  /** Box (with margin) outside which there's no fresh water. */
  readonly box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The water's surface at (x, z), or null where there's none. */
  levelAt(x: number, z: number): number | null;
}

/** How far under the water's surface a coarse level's ground is kept (m; the water's drawn a little over it). */
const UNDER = 0.08;
/**
 * The most a vertex on a `step` m grid is lowered (m): water further below it (a pool at a cliff's
 * foot) is another place's, and dragging a cliff top down to it would notch the island's outline. A
 * coarser grid spans more of a gully's walls, so it may drop a little further.
 */
function maxDrop(step: number): number {
  return Math.max(3, step * 0.4);
}

/**
 * Fresh water sampled at the bake's grid points (NaN where dry), so a coarser level of detail can keep
 * its vertices under it. A coarse grid (8 m on Lite, past 40 m) can't follow a 3-5 m stream's carved
 * bed: its triangles span the bed from bank to bank and stood over the water, hiding half a stream's
 * course in the distance. A vertex whose grid cells hold water (within one step of it) is kept just
 * under the water nearest it, so the triangles over a stream or a pool lie under its surface and the
 * water reads on unbroken at every distance. The finest level (the one you walk on, and its gameplay
 * height field) is never changed.
 */
export class TerrainWaterCaps {
  private readonly levels: Float32Array;
  private ix0 = 0;
  private iz0 = 0;
  private cols = 0;
  private rows = 0;

  constructor(
    private readonly data: TerrainBakeData,
    private readonly water: TerrainFreshWater,
  ) {
    const { box } = water;
    const c = data.cell;
    this.ix0 = Math.max(0, Math.floor((box.minX - data.minX) / c));
    this.iz0 = Math.max(0, Math.floor((box.minZ - data.minZ) / c));
    const ix1 = Math.min(data.nx - 1, Math.ceil((box.maxX - data.minX) / c));
    const iz1 = Math.min(data.nz - 1, Math.ceil((box.maxZ - data.minZ) / c));
    this.cols = Math.max(0, ix1 - this.ix0 + 1);
    this.rows = Math.max(0, iz1 - this.iz0 + 1);
    this.levels = new Float32Array(this.cols * this.rows).fill(Number.NaN);
  }

  /** Samples the water, a few rows at a time (a slice point for the async build). */
  *build(): Generator<void, void, void> {
    const { data } = this;
    for (let r = 0; r < this.rows; r++) {
      const z = data.minZ + (this.iz0 + r) * data.cell;
      for (let c = 0; c < this.cols; c++) {
        const level = this.water.levelAt(data.minX + (this.ix0 + c) * data.cell, z);
        if (level !== null) this.levels[r * this.cols + c] = level;
      }
      if ((r & 7) === 7) yield;
    }
  }

  /**
   * The height a coarse vertex at (x, z) on a `step` m grid, `h` high, stands at: just under the
   * lowest water in its cells (within `step` of it; any point of a triangle it's a corner of lies
   * there, so the triangle stays under the water everywhere over it), ignoring water more than
   * `maxDrop` under it; else `h`.
   */
  heightAt(x: number, z: number, step: number, h: number): number {
    const { data } = this;
    const c = data.cell;
    const fx = (x - data.minX) / c - this.ix0;
    const fz = (z - data.minZ) / c - this.iz0;
    const reach = step / c;
    const c0 = Math.max(0, Math.ceil(fx - reach));
    const c1 = Math.min(this.cols - 1, Math.floor(fx + reach));
    const r0 = Math.max(0, Math.ceil(fz - reach));
    const r1 = Math.min(this.rows - 1, Math.floor(fz + reach));
    const floor = h - maxDrop(step);
    let cap = h;
    for (let r = r0; r <= r1; r++)
      for (let k = c0; k <= c1; k++) {
        const level = this.levels[r * this.cols + k]!;
        if (level >= floor) cap = Math.min(cap, level - UNDER);
      }
    return Math.max(cap, floor);
  }

  /**
   * The lowest a vertex kept under the water in a rectangle can stand (a chunk's skirt hangs under it),
   * or Infinity where it's dry.
   */
  lowestIn(minX: number, maxX: number, minZ: number, maxZ: number): number {
    const { data } = this;
    const c = data.cell;
    const c0 = Math.max(0, Math.floor((minX - data.minX) / c) - this.ix0);
    const c1 = Math.min(this.cols - 1, Math.ceil((maxX - data.minX) / c) - this.ix0);
    const r0 = Math.max(0, Math.floor((minZ - data.minZ) / c) - this.iz0);
    const r1 = Math.min(this.rows - 1, Math.ceil((maxZ - data.minZ) / c) - this.iz0);
    let lo = Infinity;
    for (let r = r0; r <= r1; r++)
      for (let k = c0; k <= c1; k++) {
        const level = this.levels[r * this.cols + k]!;
        if (!Number.isNaN(level)) lo = Math.min(lo, level - UNDER);
      }
    return lo;
  }
}
