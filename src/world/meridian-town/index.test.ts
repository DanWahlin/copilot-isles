import { describe, expect, it } from 'vitest';
import { tierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { MERIDIAN, meridianHeight, meridianMasks } from '../islands/meridian';
import {
  createClothMaterial,
  createGlowMaterial,
  createHaloMaterial,
  createMetalMaterial,
  createPavingMaterial,
  createPlasterMaterial,
  createRoofTileMaterial,
  createRopeMaterial,
  createStoneMaterial,
  createThatchMaterial,
  createWoodMaterial,
} from '../village/materials';
import type { VillageBoxCollider, VillageKit } from '../village';
import { createMeridianTown, meridianTownStairHeight } from './index';

const heightField: HeightField = {
  heightAt: meridianHeight,
  normalAt: (x, z, out) => {
    const e = 1.5;
    const nx = -(meridianHeight(x + e, z) - meridianHeight(x - e, z)) / (2 * e);
    const nz = -(meridianHeight(x, z + e) - meridianHeight(x, z - e)) / (2 * e);
    const len = Math.hypot(nx, 1, nz) || 1;
    out[0] = nx / len;
    out[1] = 1 / len;
    out[2] = nz / len;
    return out;
  },
  masksAt: meridianMasks,
};

function testKit(): VillageKit {
  return {
    pieces: new Map(),
    materials: {
      stone: createStoneMaterial(),
      paving: createPavingMaterial(),
      plaster: createPlasterMaterial(),
      roofTile: createRoofTileMaterial(),
      thatch: createThatchMaterial(),
      wood: createWoodMaterial(),
      cloth: createClothMaterial(),
      metal: createMetalMaterial(),
      rope: createRopeMaterial(),
      glow: createGlowMaterial(),
      halo: createHaloMaterial(),
    },
    dispose() {
      for (const material of Object.values(this.materials)) material.dispose();
    },
  };
}

function circleHitsPoint(c: CircleObstacle, x: number, z: number, r = 0.9): boolean {
  return Math.hypot(c.x - x, c.z - z) < c.r + r;
}

function boxHitsPoint(b: VillageBoxCollider, x: number, z: number, r = 0.9): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < b.hx + r && Math.abs(lz) < b.hz + r;
}

function obstacleHitsSegment(
  c: CircleObstacle,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  clear = 4.5,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  const px = ax + dx * t;
  const pz = az + dz * t;
  return Math.hypot(c.x - px, c.z - pz) < c.r + clear;
}

describe('createMeridianTown', () => {
  it('creates a batched Mediterranean harbour town with the required anchors', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const required = [
      'tobias',
      'mina',
      'lyra',
      'anders',
      'rhea',
      'oren',
      'pell',
      'admiral',
      'voyageOffice',
      'bountyBoard',
      'clockTower',
      'outfitter',
      'crateYard',
      'recordsPortico',
      'liftBottom',
      'liftTop',
      'lighthouse',
      'extraFisher',
      'extraBench',
      'extraStall',
      'extraFountain',
      'extraQuayA',
      'extraQuayB',
      'extraCitadel',
    ];

    for (const id of required) {
      const anchor = town.anchors[id];
      expect(anchor, id).toBeDefined();
      expect(Number.isFinite(anchor!.x)).toBe(true);
      expect(Number.isFinite(anchor!.y)).toBe(true);
      expect(Number.isFinite(anchor!.z)).toBe(true);
      expect(anchor!.y).toBeGreaterThanOrEqual(-1);
      expect(anchor!.y).toBeLessThanOrEqual(42);
    }
    expect(town.metrics.staticDraws).toBeLessThanOrEqual(11);
    expect(town.metrics.drawCalls).toBeLessThanOrEqual(16);
    expect(town.metrics.triangles).toBeLessThan(260_000);
    expect(town.metrics.buildingCount).toBeGreaterThanOrEqual(25);
    expect(town.colliders.boxes.length + town.colliders.circles.length).toBeGreaterThan(80);

    town.dispose();
    kit.dispose();
  });

  it('provides clear extra townsfolk anchors and patrol paths', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    for (const id of ['extraFisher', 'extraBench', 'extraStall', 'extraCitadel'] as const) {
      const a = town.anchors[id]!;
      expect(
        town.colliders.circles.some((c) => circleHitsPoint(c, a.x, a.z, 0.6)),
        id,
      ).toBe(false);
      expect(
        town.colliders.boxes.some((b) => boxHitsPoint(b, a.x, a.z, 0.6)),
        id,
      ).toBe(false);
    }

    const fountain = town.anchors.extraFountain!;
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const x = fountain.x + Math.sin(a) * 3.4;
      const z = fountain.z + Math.cos(a) * 3.4;
      const h = town.walkable(x, z);
      expect(h, `fountain ring ${i}`).not.toBeNull();
      expect(h!, `fountain ring ${i}`).toBeGreaterThan(6.5);
      expect(h!, `fountain ring ${i}`).toBeLessThan(7.2);
      expect(
        town.colliders.circles.some((c) => circleHitsPoint(c, x, z, 0.3)),
        `circle ring ${i}`,
      ).toBe(false);
      expect(
        town.colliders.boxes.some((b) => boxHitsPoint(b, x, z, 0.3)),
        `box ring ${i}`,
      ).toBe(false);
    }

    const qa = town.anchors.extraQuayA!;
    const qb = town.anchors.extraQuayB!;
    expect(Math.hypot(qa.x - qb.x, qa.z - qb.z)).toBeGreaterThan(20);
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const x = qa.x + (qb.x - qa.x) * t;
      const z = qa.z + (qb.z - qa.z) * t;
      expect(town.walkable(x, z), `quay patrol ${i}`).toBeCloseTo(MERIDIAN.harbor.quay.height, 1);
      expect(
        town.colliders.circles.some((c) => circleHitsPoint(c, x, z, 0.5)),
        `quay circle ${i}`,
      ).toBe(false);
      expect(
        town.colliders.boxes.some((b) => boxHitsPoint(b, x, z, 0.5)),
        `quay box ${i}`,
      ).toBe(false);
    }

    town.dispose();
    kit.dispose();
  });

  it('makes the grand stair street walkable from quay to plaza with no tall step', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('low'), heightField, kit });
    let last: number | null = null;
    for (let z = MERIDIAN.harbor.quay.z0; z >= MERIDIAN.pads.plaza.z; z -= 0.5) {
      const h = town.walkable(668, z) ?? meridianTownStairHeight(668, z);
      expect(h, `z=${z}`).not.toBeNull();
      if (last !== null) expect(Math.abs(h! - last)).toBeLessThanOrEqual(0.66);
      last = h!;
    }
    expect(town.walkable(668, MERIDIAN.harbor.quay.z0)).toBeCloseTo(MERIDIAN.harbor.quay.height, 1);
    expect(town.walkable(668, MERIDIAN.pads.plaza.z)).toBeCloseTo(MERIDIAN.pads.plaza.height, 1);

    town.dispose();
    kit.dispose();
  });

  it('connects the shipyard apron to the mole, lighthouse, and fisher without blocking the lane', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const samples: { x: number; z: number }[] = [
      { x: 586, z: -735 },
      { x: 586, z: -752 },
      { x: 580, z: -730 },
      { x: 590, z: -720 },
      { x: MERIDIAN.mole.start.x, z: MERIDIAN.mole.start.z },
    ];
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      samples.push({
        x: MERIDIAN.mole.start.x + (MERIDIAN.mole.end.x - MERIDIAN.mole.start.x) * t,
        z: MERIDIAN.mole.start.z + (MERIDIAN.mole.end.z - MERIDIAN.mole.start.z) * t,
      });
    }
    samples.push({ x: MERIDIAN.mole.lighthouse.x - 6.2, z: MERIDIAN.mole.lighthouse.z - 2.7 });

    let last: number | null = null;
    for (const p of samples) {
      const h = town.walkable(p.x, p.z);
      expect(h, `walkable at ${p.x},${p.z}`).not.toBeNull();
      if (last !== null) expect(Math.abs(h! - last), `step at ${p.x},${p.z}`).toBeLessThanOrEqual(0.6);
      expect(
        town.colliders.circles.some((c) => circleHitsPoint(c, p.x, p.z, 0.35)),
        `circle at ${p.x},${p.z}`,
      ).toBe(false);
      expect(
        town.colliders.boxes.some((b) => boxHitsPoint(b, p.x, p.z, 0.35)),
        `box at ${p.x},${p.z}`,
      ).toBe(false);
      last = h!;
    }
    const fisher = town.anchors.extraFisher!;
    expect(town.walkable(fisher.x, fisher.z)).not.toBeNull();
    expect(town.colliders.circles.some((c) => circleHitsPoint(c, fisher.x, fisher.z, 0.6))).toBe(false);
    expect(town.colliders.boxes.some((b) => boxHitsPoint(b, fisher.x, fisher.z, 0.6))).toBe(false);

    town.dispose();
    kit.dispose();
  });

  it('keeps colliders off the berth, landing, promenade, stair route, and plaza stops', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const route = [
      MERIDIAN.harbor.landing,
      { x: 763, z: -742 },
      { x: 734, z: -762 },
      { x: 668, z: -762 },
      { x: 668, z: -778 },
      { x: 660, z: -791 },
      { x: 651, z: -788 },
      { x: 622, z: -796 },
      { x: 594, z: -759 },
      { x: 766.7, z: -765.6 },
    ];

    for (const p of route) {
      expect(
        town.colliders.circles.some((c) => circleHitsPoint(c, p.x, p.z)),
        `circle at ${p.x},${p.z}`,
      ).toBe(false);
      expect(
        town.colliders.boxes.some((b) => boxHitsPoint(b, p.x, p.z)),
        `box at ${p.x},${p.z}`,
      ).toBe(false);
    }

    town.dispose();
    kit.dispose();
  });

  it('leaves the sailing mouth and berth approach clear of ship obstacles', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const channel = [
      [724, -632, 735, -660],
      [735, -660, MERIDIAN.harbor.berth.x, MERIDIAN.harbor.berth.z],
    ] as const;

    for (const [ax, az, bx, bz] of channel) {
      expect(town.shipObstacles.some((c) => obstacleHitsSegment(c, ax, az, bx, bz))).toBe(false);
    }
    expect(
      town.shipObstacles.some((c) => circleHitsPoint(c, MERIDIAN.harbor.berth.x, MERIDIAN.harbor.berth.z, 6)),
    ).toBe(false);

    town.dispose();
    kit.dispose();
  });
});
