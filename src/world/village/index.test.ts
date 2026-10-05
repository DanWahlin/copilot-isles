import { describe, expect, it } from 'vitest';
import { tierSettings } from '../../engine/quality';
import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { SQUARE, VILLAGE_BUILDING_COUNT, createVillage, walkable } from './index';

const heightField: HeightField = {
  heightAt: (x, z) => 3.05 + (x + 150) * 0.006 + (z + 75) * 0.004,
  normalAt: (_x, _z, out) => {
    out[0] = -0.006;
    out[1] = 1;
    out[2] = -0.004;
    return out;
  },
  masksAt: () => ({ sand: 0.2, grass: 0.7, rock: 0.1, cliff: 0 }),
};
const berth = { minX: -105.5, maxX: -98.9, minZ: -124.5, maxZ: -100.5 } as const;

function overlapsBerth(c: { x: number; z: number; r: number }): boolean {
  return c.x + c.r > berth.minX && c.x - c.r < berth.maxX && c.z + c.r > berth.minZ && c.z - c.r < berth.maxZ;
}

describe('createVillage', () => {
  it('creates a batched harbour village with expected anchors and colliders', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField });

    expect(village.metrics.buildingCount).toBe(VILLAGE_BUILDING_COUNT);
    expect(village.metrics.staticDraws).toBeLessThanOrEqual(10);
    expect(village.metrics.drawCalls).toBeLessThanOrEqual(18);
    expect(village.metrics.triangles).toBeLessThan(150_000);
    expect(village.colliders.boxes.length).toBeGreaterThanOrEqual(VILLAGE_BUILDING_COUNT);
    expect(village.colliders.boxes.every((box) => typeof box.height === 'number' && box.height > 0)).toBe(
      true,
    );
    expect(
      village.colliders.boxes.some(
        (box) => Math.abs(box.x + 124.8) < 0.01 && box.hx === 3.12 && box.hz === 4.16,
      ),
    ).toBe(true);
    expect(village.colliders.circles.length).toBeGreaterThan(24);
    expect(village.anchors.harbourmasterDoor?.y).toBeCloseTo(COVE.quay.height, 5);
    expect(village.anchors.tavernDoor?.y).toBeCloseTo(heightField.heightAt(-124.8, -54.2), 5);
    expect(village.anchors.marketStall).toBeDefined();
    expect(village.anchors.pierEnd?.z).toBeLessThan(COVE.pier.z0);
    expect(village.perches.length).toBeGreaterThanOrEqual(30);
    expect(village.perches.length).toBeLessThanOrEqual(50);
    expect(
      village.perches.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)),
    ).toBe(true);

    village.dispose();
  });

  it('exports gull perches on ridges, chimney tops, rails, bollards, and stalls', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField });
    const pierBollardX = COVE.pier.x + COVE.pier.width * 0.5 + 0.16;

    expect(village.perches.some((p) => p.y > 8 && p.x < -120 && p.z < -50)).toBe(true);
    expect(
      village.perches.some(
        (p) => Math.abs(p.x - pierBollardX) < 0.01 && p.y === COVE.pier.deck + 0.64 && p.z === -103,
      ),
    ).toBe(true);
    // The point lighthouse's gallery railing (eight) and its dome finial, well above the knoll.
    const lh = COVE.lighthouse;
    const railing = village.perches.filter(
      (p) => Math.abs(Math.hypot(p.x - lh.x, p.z - lh.z) - 2.68) < 0.01 && p.y > lh.top + 16,
    );
    expect(railing.length).toBe(8);
    expect(village.perches.some((p) => p.x === lh.x && p.z === lh.z && p.y > lh.top + 20)).toBe(true);
    const stallR = SQUARE.radius + 2.2;
    const stallX = COVE.village.center.x + Math.cos(SQUARE.stallAngle) * stallR;
    const stallZ = COVE.village.center.z + Math.sin(SQUARE.stallAngle) * stallR;
    expect(
      village.perches.some(
        (p) => Math.abs(p.x - stallX) < 0.01 && p.y > heightField.heightAt(stallX, stallZ) + 1.8,
      ),
    ).toBe(true);

    village.dispose();
  });

  it('keeps walking colliders off walkable quay and pier footprint boxes', async () => {
    const village = await createVillage({ tier: tierSettings('low'), heightField });
    const quayCenter = (COVE.quay.x0 + COVE.quay.x1) * 0.5;

    expect(
      village.colliders.boxes.some(
        (b) => Math.abs(b.x - quayCenter) < 0.01 && b.hx > 30 && b.z < COVE.quay.z,
      ),
    ).toBe(false);
    expect(village.colliders.boxes.some((b) => Math.abs(b.x - COVE.pier.x) < 0.01 && b.hz > 20)).toBe(false);

    village.dispose();
  });

  it('exposes ship-only obstacles for quay edge, pier piles, boathouse, and moored boats', async () => {
    const village = await createVillage({ tier: tierSettings('low'), heightField });
    const eastPileX = COVE.pier.x + COVE.pier.width * 0.5 + 0.55;

    expect(
      village.shipObstacles.filter((c) => Math.abs(c.z - (COVE.quay.z - 2.35)) < 0.01 && c.r >= 1.75).length,
    ).toBeGreaterThan(20);
    expect(village.shipObstacles.some((c) => Math.abs(c.x - eastPileX) < 0.05 && c.z < COVE.quay.z - 8)).toBe(
      true,
    );
    expect(village.shipObstacles.some(overlapsBerth)).toBe(false);
    expect(
      village.shipObstacles.some(
        (c) => Math.abs(c.x - (COVE.pier.x + 2.9)) < 0.01 && Math.abs(c.z + 96.5) < 0.5,
      ),
    ).toBe(true);
    for (const boat of COVE.boats) {
      expect(village.shipObstacles.some((c) => c.x === boat.x && c.z === boat.z && c.r >= 4)).toBe(true);
    }

    village.dispose();
  });

  it('stands the point lighthouse on its knoll, clear of the berth, with its door down the path', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField });
    const lh = COVE.lighthouse;
    const door = village.anchors.lighthouseDoor!;

    expect(Math.hypot(door.x - lh.x, door.z - lh.z)).toBeGreaterThan(3);
    expect(door.y).toBe(lh.top);
    // The door faces down the ridge path, toward the quay's west end.
    const toNeck = Math.atan2(lh.neck.x - lh.x, lh.neck.z - lh.z);
    expect(Math.abs(door.heading - toNeck)).toBeLessThan(1e-6);
    expect(village.colliders.circles.some((c) => c.x === lh.x && c.z === lh.z && (c.height ?? 0) > 18)).toBe(
      true,
    );
    expect(village.shipObstacles.some((c) => c.x === lh.x && c.z === lh.z && c.r >= 12)).toBe(true);
    // The lookout keeps watch from the gallery.
    expect(village.anchors.lookout!.y).toBeGreaterThan(lh.top + 15);
    expect(village.lighthouseLit()).toBe(false);
    village.setLighthouseLit(true);
    expect(village.lighthouseLit()).toBe(true);
    // The path is walkable from the door step to the quay.
    const mid = { x: (lh.x + lh.neck.x) / 2, z: (lh.z + lh.neck.z) / 2 };
    expect(walkable(mid.x, mid.z)).toBeCloseTo(heightField.heightAt(mid.x, mid.z) + 0.08, 5);

    village.dispose();
  });

  it('plants village palms by tier, each with a collider, clear of anchors, the mill and the berth', async () => {
    const low = await createVillage({ tier: tierSettings('low'), heightField });
    const high = await createVillage({ tier: tierSettings('high'), heightField });
    const palms = (v: typeof high) => v.plantings.filter((p) => p.species.startsWith('palm'));
    expect(palms(low).length).toBeGreaterThanOrEqual(8);
    expect(palms(high).length).toBeGreaterThan(palms(low).length);
    // One palm model (lodSeed < 0.6), so the village adds one instanced batch and one program.
    expect(palms(high).every((p) => p.lodSeed < 0.6)).toBe(true);

    for (const p of palms(high)) {
      expect(high.colliders.circles.some((c) => c.x === p.x && c.z === p.z)).toBe(true);
      for (const [name, a] of Object.entries(high.anchors))
        expect(Math.hypot(p.x - a.x, p.z - a.z), `${name} at (${p.x}, ${p.z})`).toBeGreaterThan(3);
      // The mill race and its puzzle ground stay clear.
      expect(p.x > -72 && p.x < -53 && p.z > -75 && p.z < -44).toBe(false);
      expect(overlapsBerth({ x: p.x, z: p.z, r: 1 })).toBe(false);
    }

    low.dispose();
    high.dispose();
  });

  it('plants shrubs and flowering bushes off the paving, doors and the mill, fewer on Low', async () => {
    const low = await createVillage({ tier: tierSettings('low'), heightField });
    const high = await createVillage({ tier: tierSettings('high'), heightField });
    const shrubs = (v: typeof high) => v.plantings.filter((p) => !p.species.startsWith('palm'));
    expect(shrubs(low).length).toBeGreaterThanOrEqual(10);
    expect(shrubs(high).length).toBeGreaterThan(shrubs(low).length);
    expect(shrubs(high).some((p) => p.species === 'flowerBush')).toBe(true);
    // The square's planters stand on its paving; every other bed is off the paving.
    const inSquare = (p: { x: number; z: number }) =>
      Math.hypot(p.x - COVE.village.center.x, p.z - COVE.village.center.z) < SQUARE.radius;
    expect(shrubs(low).filter(inSquare).length).toBe(SQUARE.planters.length);
    for (const p of shrubs(high)) {
      if (!inSquare(p)) expect(walkable(p.x, p.z), `paved at (${p.x}, ${p.z})`).toBeNull();
      expect(p.x > -74 && p.x < -51 && p.z > -77 && p.z < -42).toBe(false);
      for (const a of Object.values(high.anchors))
        expect(Math.hypot(p.x - a.x, p.z - a.z)).toBeGreaterThan(2.5);
    }
    low.dispose();
    high.dispose();
  });

  it('puts a fountain at the square centre, clear of Pip, with the stall and lawns outside the curb', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField });
    const c = COVE.village.center;
    expect(SQUARE.centrepiece).toBe('fountain');
    const fountain = village.colliders.circles.find((k) => k.x === c.x && k.z === c.z);
    expect(fountain?.r).toBeCloseTo(SQUARE.basin + 0.2, 5);
    // Pip circles the plaza-well anchor's orbit centre (the square centre) at 3.4 m.
    const well = village.anchors.plazaWell!;
    expect(Math.hypot(well.x - 2.7 - c.x, well.z + 1.2 - c.z)).toBeLessThan(0.01);
    expect(3.4 - (fountain?.r ?? 0)).toBeGreaterThan(0.5);
    // The fountain's water is one extra mesh (one draw) on the shared site-water material.
    const water = village.group.getObjectByName('anchorage-fountain-water');
    expect(water).toBeDefined();
    // The market stall stands outside the curb, its front facing the fountain.
    const stall = village.anchors.marketStall!;
    expect(Math.hypot(stall.x - c.x, stall.z - c.z)).toBeGreaterThan(SQUARE.radius);
    expect(Math.hypot(stall.x - c.x, stall.z - c.z)).toBeLessThan(SQUARE.radius + 2.2);
    // Paving ends at the curb: the lawn ring round the square is ground, not street.
    for (const a of [0.3, 1.2, 2.2, 3.6, 5.0]) {
      const x = c.x + Math.cos(a) * (SQUARE.radius - 1);
      const z = c.z + Math.sin(a) * (SQUARE.radius - 1);
      expect(walkable(x, z)).not.toBeNull();
    }
    expect(walkable(-107.5, -37.5)).toBeNull();
    expect(walkable(-125, -38)).toBeNull();
    village.dispose();
  });

  it('adds player-only mooring bollards on the pier east edge for the new berth', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField });
    const x = COVE.pier.x + COVE.pier.width * 0.5 + 0.16;

    for (const z of [-103, -121]) {
      expect(village.colliders.circles.some((c) => Math.abs(c.x - x) < 0.01 && c.z === z && c.r <= 0.6)).toBe(
        true,
      );
      expect(village.shipObstacles.some((c) => Math.abs(c.x - x) < 0.01 && c.z === z)).toBe(false);
    }

    village.dispose();
  });
});

describe('village walkable surfaces', () => {
  it('returns quay, pier, boathouse deck, and step heights only on structures', () => {
    expect(walkable(COVE.spawn.x, COVE.spawn.z)).toBe(COVE.quay.height);
    expect(walkable(COVE.pier.x, -100)).toBe(COVE.pier.deck);
    expect(walkable(COVE.pier.x, COVE.quay.z - 2.2)).toBeCloseTo(
      (COVE.pier.deck + COVE.quay.height) * 0.5,
      1,
    );
    expect(walkable(COVE.pier.x + 2.9, -96.5)).toBe(COVE.pier.deck);
    expect(walkable(-128, COVE.quay.z - 4.2)).not.toBeNull();
    expect(walkable(COVE.village.center.x, COVE.village.center.z)).toBeNull();
    expect(walkable(COVE.pier.x + COVE.pier.width + 3, -100)).toBeNull();
  });
});
