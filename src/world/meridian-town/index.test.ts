import { describe, expect, it } from 'vitest';
import { Vector3, type Mesh } from 'three/webgpu';
import { tierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField, WaveSampler } from '../contracts';
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
import type { VillageBoxCollider, VillageKit } from '../village/kit';
import { createMeridianTown, meridianTownStairHeight } from './index';
import { insideOutSummary } from '../village/inside-out';
import { meridianTownPlants } from './plantings';
import { ShipDynamics } from '../ship/dynamics';
import { BRIGANTINE_CAPSULES } from '../ship/lines';
import { BERTH_APPROACH } from '../sites/helms-logic';

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
      'recordsAlcoves',
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
    // Each material splits into spatial chunks of 24k triangles at most (frustum culling skips most).
    // High's façades, roofs and plaza dressing fill a few more chunks (PLAN §12.1 High has room).
    expect(town.metrics.staticDraws).toBeLessThanOrEqual(26);
    expect(town.metrics.drawCalls).toBeLessThanOrEqual(31);
    const chunks = town.group.children.filter((o) => o.name.startsWith('meridian-town-')) as Mesh[];
    expect(chunks.length).toBe(town.metrics.staticDraws);
    const chunkTriangles = chunks.reduce((sum, m) => sum + (m.geometry.index?.count ?? 0) / 3, 0);
    expect(chunkTriangles).toBe(town.metrics.staticTriangles);
    for (const m of chunks) expect((m.geometry.index?.count ?? 0) / 3).toBeLessThanOrEqual(24_000 + 2_000);
    expect(town.metrics.triangles).toBeLessThan(380_000);
    expect(town.metrics.buildingCount).toBeGreaterThanOrEqual(25);
    expect(town.colliders.boxes.length + town.colliders.circles.length).toBeGreaterThan(80);

    town.dispose();
    kit.dispose();
  });

  it('builds Lite cheaper (flat facade trim, fewer flower and tree segments) with the same colliders', () => {
    const kit = testKit();
    const lite = createMeridianTown({ tier: tierSettings('lite'), heightField, kit });
    const low = createMeridianTown({ tier: tierSettings('low'), heightField, kit });
    expect(lite.metrics.staticTriangles).toBeLessThan(low.metrics.staticTriangles - 30_000);
    expect(lite.colliders.boxes.length).toBe(low.colliders.boxes.length);
    expect(lite.colliders.circles.length).toBe(low.colliders.circles.length);
    expect(insideOutSummary(lite.group, (m) => m.name.startsWith('meridian-town-'))).toEqual([]);
    lite.dispose();
    low.dispose();
    kit.dispose();
  });

  it('builds no inside-out faces (a negative box size reverses the winding; double-sided stone then shades it unlit)', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    expect(insideOutSummary(town.group, (m) => m.name.startsWith('meridian-town-'))).toEqual([]);

    town.dispose();
    kit.dispose();
  });

  it('gives every player and camera box a positive half-size (a negative one never collides)', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const bad = [...town.colliders.boxes, ...town.cameraBlockers]
      .filter((b) => !(b.hx > 0 && b.hz > 0))
      .map((b) => `${b.x.toFixed(1)},${b.z.toFixed(1)} hx ${b.hx} hz ${b.hz}`);
    expect(bad).toEqual([]);

    town.dispose();
    kit.dispose();
  });

  it('walls the east arm on all three sea sides, open only at the gangway and the quay', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const { eastArm: arm, quay, berth } = MERIDIAN.harbor;
    const gangwayZ = berth.z - 0.15;
    const r = 0.36;
    const hit = (x: number, z: number) => town.colliders.boxes.some((b) => boxHitsPoint(b, x, z, r));
    const open: string[] = [];
    for (let z = quay.z1 + 0.5; z <= arm.z1; z += 0.5) {
      if (Math.abs(z - gangwayZ) > 1.3 && !hit(arm.x0 - 0.2, z)) open.push(`west ${z}`);
    }
    for (let z = arm.z0 + 0.5; z <= arm.z1; z += 0.5) if (!hit(arm.x1 + 0.2, z)) open.push(`east ${z}`);
    for (let x = arm.x0; x <= arm.x1; x += 0.5) if (!hit(x, arm.z1 + 0.2)) open.push(`south ${x}`);
    expect(open).toEqual([]);

    // The plank's foot and the walk between the quay and the arm stay clear.
    for (const x of [arm.x0 - 0.6, arm.x0, arm.x0 + 0.4])
      expect(hit(x, gangwayZ), `gangway ${x}`).toBe(false);
    for (let x = arm.x0 + 0.6; x <= arm.x1 - 0.6; x += 0.5) {
      expect(hit(x, quay.z1), `quay to arm at ${x}`).toBe(false);
    }

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
    expect(
      town.colliders.circles.some(
        (c) =>
          Math.abs(c.x - fountain.x) < 0.01 &&
          Math.abs(c.z - fountain.z) < 0.01 &&
          c.r > 3.1 &&
          c.r < 3.3 &&
          c.height! > 4.3 &&
          c.height! < 4.6,
      ),
    ).toBe(true);
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const x = fountain.x + Math.sin(a) * 3.4;
      const z = fountain.z + Math.cos(a) * 3.4;
      const h = town.walkable(x, z);
      expect(h, `fountain ring ${i}`).not.toBeNull();
      expect(h!, `fountain ring ${i}`).toBeGreaterThan(6.5);
      expect(h!, `fountain ring ${i}`).toBeLessThan(7.2);
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
    // From the quay in front of the stair's foot (it starts out on the quay) up to the plaza.
    const foot = -762.5;
    for (let z = foot; z >= MERIDIAN.pads.plaza.z; z -= 0.5) {
      const h = town.walkable(668, z) ?? meridianTownStairHeight(668, z);
      expect(h, `z=${z}`).not.toBeNull();
      if (last !== null) expect(Math.abs(h! - last)).toBeLessThanOrEqual(0.66);
      last = h!;
    }
    expect(town.walkable(668, foot)).toBeCloseTo(MERIDIAN.harbor.quay.height, 1);
    expect(town.walkable(668, MERIDIAN.pads.plaza.z)).toBeCloseTo(MERIDIAN.pads.plaza.height, 1);

    town.dispose();
    kit.dispose();
  });

  it("keeps the stair street's rails, posts and steps under the paving where the lane and plaza cover it", () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const paved = MERIDIAN.pads.plaza.height;
    const v = new Vector3();
    const proud: string[] = [];
    town.group.updateMatrixWorld(true);
    town.group.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || !/^meridian-town-(rope|metal|paving|stone)/.test(mesh.name)) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        // From the harbour-front lane to just past the fountain, up to rail height above the paving
        // (the top step stood 10 cm proud of it), but not the fountain itself. The paving's own top
        // (y = paved + 0.08) is allowed, and so are the plaza's stone inlays, 1.5 cm proud of it.
        if (v.x < 662 || v.x > 674 || v.z > -777.5 || v.z < -797 || v.y <= paved + 0.1 || v.y > paved + 1.6)
          continue;
        if (Math.hypot(v.x - 668, v.z + 797.2) < 3.35) continue;
        proud.push(`${mesh.name} ${v.x.toFixed(1)},${v.y.toFixed(2)},${v.z.toFixed(1)}`);
      }
    });
    expect(proud.slice(0, 5)).toEqual([]);

    town.dispose();
    kit.dispose();
  });

  it('puts you on top of the Hall of Records podium, a step up from the citadel floor', () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('low'), heightField, kit });
    // From the citadel floor in front of the portico steps, walking in between the columns and on
    // toward the doors (Pell stands at the top of the steps, by his desk: P1.3).
    const pell = { x: 809.4, z: -785.3 };
    expect(town.anchors.pell!.y).toBeCloseTo(40.6, 2);
    expect(town.walkable(town.anchors.pell!.x, town.anchors.pell!.z)).toBeCloseTo(40.6, 2);
    let last = town.walkable(pell.x, pell.z)!;
    expect(last).toBeCloseTo(40, 2);
    for (let z = pell.z; z <= pell.z + 4.2; z += 0.25) {
      const h = town.walkable(pell.x, z);
      expect(h, `z=${z}`).not.toBeNull();
      expect(Math.abs(h! - last), `step at z=${z}`).toBeLessThanOrEqual(0.66);
      last = h!;
    }
    // The portico paving's top (the regression: you walked at 40, 0.6 m inside it).
    expect(town.walkable(pell.x, pell.z + 2.2)).toBeCloseTo(40.6, 2);

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
    // The berthed hull (each capsule at the berth) stays half a metre clear of every circle, including
    // the east arm's row just inside its face.
    const { berth } = MERIDIAN.harbor;
    for (const cap of BRIGANTINE_CAPSULES) {
      const x = berth.x + Math.sin(berth.heading) * cap.z;
      const z = berth.z + Math.cos(berth.heading) * cap.z;
      expect(town.shipObstacles.some((c) => circleHitsPoint(c, x, z, cap.radius + 0.5))).toBe(false);
    }

    town.dispose();
    kit.dispose();
  });
});

describe('Port Meridian town planting', () => {
  it("keeps every plant out of walls, ways and the townsfolk's spots", () => {
    const kit = testKit();
    const town = createMeridianTown({ tier: tierSettings('high'), heightField, kit });
    const plants = meridianTownPlants('high');
    expect(plants.length).toBeGreaterThan(80);
    const problems: string[] = [];
    for (const p of plants) {
      const r = p.species === 'flowerBush' || p.species === 'fern' ? 0.25 : 0.5;
      const where = `${p.species} @ ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`;
      // Planted up on a terrace wall (above the walk and the ground there), not in anyone's way.
      if (p.y > (town.walkable(p.x, p.z) ?? meridianHeight(p.x, p.z)) + 0.4) continue;
      const box = town.colliders.boxes.find((b) => boxHitsPoint(b, p.x, p.z, r));
      if (box) problems.push(`${where} in box ${box.x.toFixed(1)},${box.z.toFixed(1)} ${box.hx}x${box.hz}`);
      const circle = town.colliders.circles.find((c) => circleHitsPoint(c, p.x, p.z, r));
      if (circle)
        problems.push(`${where} in circle ${circle.x.toFixed(1)},${circle.z.toFixed(1)} r${circle.r}`);
      // The quay's palm row stands on the promenade, against its back wall (trunks have colliders).
      const quayRow = p.species.startsWith('palm') && Math.abs(p.z - (MERIDIAN.harbor.quay.z0 + 2.2)) < 0.01;
      if (!quayRow && town.walkable(p.x, p.z) !== null) problems.push(`${where} on a walkway`);
      for (const [id, a] of Object.entries(town.anchors))
        if (Math.hypot(a.x - p.x, a.z - p.z) < 3) problems.push(`${where} at anchor ${id}`);
    }
    expect(problems).toEqual([]);
    town.dispose();
    kit.dispose();
  });
});

describe('Port Meridian east arm ship obstacles', () => {
  const kit = testKit();
  const town = createMeridianTown({ tier: tierSettings('low'), heightField, kit });
  const arm = MERIDIAN.harbor.eastArm;
  const quay = MERIDIAN.harbor.quay;
  const berth = MERIDIAN.harbor.berth;
  const widest = Math.max(...BRIGANTINE_CAPSULES.map((c) => c.radius));
  const calm: WaveSampler = {
    heightAt: () => 0,
    velocityAt: (_x, _z, _t, out) => {
      out[0] = 0;
      out[1] = 0;
      return out;
    },
  };
  const env = { waves: calm, ground: heightField, obstacles: town.shipObstacles, t: 0 };
  type Block = { x0: number; x1: number; z0: number; z1: number };
  /** How far a hull circle (centre x, z, radius r) reaches into a block's footprint. */
  const into = (b: Block, x: number, z: number, r: number) => {
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dz = Math.max(b.z0 - z, 0, z - b.z1);
    if (dx === 0 && dz === 0) return r + Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
    return r - Math.hypot(dx, dz);
  };
  /** How far the hull reaches into the quay or the east arm. */
  const deepestIntoStone = (ship: ShipDynamics) => {
    const s = Math.sin(ship.pose.heading);
    const c = Math.cos(ship.pose.heading);
    let worst = -Infinity;
    for (const cap of ship.capsules) {
      const x = ship.pose.x + s * cap.z;
      const z = ship.pose.z + c * cap.z;
      worst = Math.max(worst, into(arm, x, z, cap.radius), into(quay, x, z, cap.radius));
    }
    return worst;
  };
  /** Steps the ship; returns its deepest reach into the stone and the seconds it ran. */
  const run = (ship: ShipDynamics, seconds: number, trim: number, rudder = 0) => {
    let worst = -Infinity;
    let i = 0;
    for (; i < seconds * 60 && !ship.dockComplete; i++) {
      env.t += 1 / 60;
      ship.step(1 / 60, { trim, rudder }, env);
      worst = Math.max(worst, deepestIntoStone(ship));
    }
    return { worst, seconds: i / 60 };
  };

  it('builds only real circles', () => {
    expect(town.shipObstacles.every((o) => o.r > 0 && Number.isFinite(o.x) && Number.isFinite(o.z))).toBe(
      true,
    );
  });

  it("stops the widest hull section at the arm's west, south and east faces, and the quay face", () => {
    // Slide the widest capsule along each face (out = the face's outward normal) and find how far it
    // must stay out to touch no circle: the hull may reach into the stone by at most half a metre.
    const faces = [
      {
        name: 'west',
        x: arm.x0,
        z: MERIDIAN.harbor.quay.z1,
        ax: 0,
        az: 1,
        len: arm.z1 - MERIDIAN.harbor.quay.z1,
        ox: -1,
        oz: 0,
      },
      { name: 'south', x: arm.x0, z: arm.z1, ax: 1, az: 0, len: arm.x1 - arm.x0, ox: 0, oz: 1 },
      {
        name: 'east',
        x: arm.x1,
        z: MERIDIAN.harbor.quay.z1,
        ax: 0,
        az: 1,
        len: arm.z1 - MERIDIAN.harbor.quay.z1,
        ox: 1,
        oz: 0,
      },
      // The whole quay face, from the shipyard slip to the corner with the arm.
      { name: 'quay', x: quay.x0 + 2, z: quay.z1, ax: 1, az: 0, len: arm.x0 - quay.x0 - 2, ox: 0, oz: 1 },
    ];
    const problems: string[] = [];
    for (const f of faces)
      for (let t = 0; t <= f.len; t += 0.5) {
        const px = f.x + f.ax * t;
        const pz = f.z + f.az * t;
        let stayOut = -Infinity;
        for (const o of town.shipObstacles) {
          const along = (o.x - px) * f.ax + (o.z - pz) * f.az;
          const out = (o.x - px) * f.ox + (o.z - pz) * f.oz;
          const reach = widest + o.r;
          if (Math.abs(along) < reach)
            stayOut = Math.max(stayOut, out + Math.sqrt(reach * reach - along * along));
        }
        if (widest - stayOut > 0.5) problems.push(`${f.name} face at ${px.toFixed(1)}, ${pz.toFixed(1)}`);
      }
    expect(problems).toEqual([]);
  });

  // Each run went into the stone by a metre or more before the fix (through the whole arm from the south).
  const runs: [string, number, number, number, number][] = [
    ['into the west face, abeam the north end', 732, -731, Math.PI / 2, 12],
    ['into the west face, south of the berth', 732, -668, Math.PI / 2, 12],
    ['onto the south end from the basin mouth', 754, -622, Math.PI, 14],
    ['across the south-west corner', 738, -628, Math.atan2(14, -24), 14],
    ['over the shallows into the east side', 792, -664, -Math.PI / 2, 16],
    ['into the quay face beside the arm', 737, -730, Math.PI, 12],
    ['into the corner of the quay and the arm', 734, -734, Math.atan2(16, -24), 12],
  ];
  for (const [name, x, z, heading, seconds] of runs)
    it(`keeps a ship under full sail out of the arm: ${name}`, () => {
      // A pointed bow can nose about half a metre in between two circles; a broadside can't.
      expect(run(new ShipDynamics(x, z, heading), seconds, 1).worst).toBeLessThan(0.75);
    });

  it('keeps a ship under full sail out of the main quay face, between the fishing boats', () => {
    // Bow first into the face, every 1.5 m along the lanes between the moored boats (the old row's
    // circles were 7.5 m apart, so a bow went about 1.2 m into the stone between two of them).
    const lanes: [number, number][] = [
      [629, 650],
      [664, 679],
      [693, 703],
      [717, 728],
    ];
    const problems: string[] = [];
    for (const [x0, x1] of lanes)
      for (let x = x0; x <= x1; x += 1.5) {
        const { worst } = run(new ShipDynamics(x, -727, Math.PI), 10, 1);
        if (worst >= 0.75) problems.push(`x ${x.toFixed(1)}: ${worst.toFixed(2)} m`);
      }
    expect(problems).toEqual([]);
  });

  // The dock assist's last pivot swings the bow over the arm; the row only keeps the hull off the stone.
  // Each case's last number is its dock time before the arm and corner rows (14.0, 2.7, 8.0 and 8.0 s),
  // plus half a second: the rows must not slow the docking down.
  const docks: [string, number, number, number, number][] = [
    ["the Autopilot run's hand-over", BERTH_APPROACH.x, BERTH_APPROACH.z, Math.PI, 14.5],
    ['a few metres off the berth', 741.5, -704, 0.1, 3.2],
    ['overshot north, bow south', 746.5, -726, 0, 8.5],
    ['abeam, in the basin', 735, -690, Math.PI, 8.5],
  ];
  for (const [name, x, z, heading, maxSeconds] of docks)
    it(`docks at the Meridian berth from ${name}`, () => {
      const ship = new ShipDynamics(x, z, heading);
      ship.dockAssist(berth);
      const { worst, seconds } = run(ship, 60, 0);
      expect(worst).toBeLessThan(0.75);
      expect(ship.dockComplete).toBe(true);
      expect(seconds).toBeLessThan(maxSeconds);
      expect(Math.hypot(ship.pose.x - berth.x, ship.pose.z - berth.z)).toBeLessThan(0.5);
    });

  it('frees the test kit', () => {
    town.dispose();
    kit.dispose();
  });
});
