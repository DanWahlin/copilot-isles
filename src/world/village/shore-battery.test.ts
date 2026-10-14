import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { tierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { COVE } from '../layout';
import { ANCHORAGE_BATTERIES } from '../islands/anchorage/batteries';
import { createVillage } from '../islands/anchorage/village';
import { MERIDIAN, meridianHeight } from '../islands/meridian';
import { CITADEL_EMBRASURES, CITADEL_WALL, MERIDIAN_BATTERIES } from '../islands/meridian-batteries';
import { createMeridianTown } from '../meridian-town';
import { coveHeight } from '../terrain/cove-height';
import { createFallbackVillageKit, makeBuckets, type VillageBoxCollider } from './kit';
import {
  addShoreBatteries,
  GUN_COLLIDER,
  muzzleAt,
  shoreBatteryWalkable,
  truckContacts,
  type BatteryGun,
  type ShoreBattery,
} from './shore-battery';
import { CANNON, cannonParts, shotPyramid } from './shore-cannon';

function field(height: (x: number, z: number) => number): HeightField {
  return {
    heightAt: height,
    normalAt: (x, z, out) => {
      const e = 1;
      const nx = -(height(x + e, z) - height(x - e, z)) / (2 * e);
      const nz = -(height(x, z + e) - height(x, z - e)) / (2 * e);
      const len = Math.hypot(nx, 1, nz);
      out[0] = nx / len;
      out[1] = 1 / len;
      out[2] = nz / len;
      return out;
    },
    masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
  };
}

const triangles = (gs: readonly BufferGeometry[]) => gs.reduce((n, g) => n + g.index!.count / 3, 0);

function boxCorners(b: VillageBoxCollider): { x: number; z: number }[] {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => ({ x: b.x + i! * b.hx * c + j! * b.hz * s, z: b.z - i! * b.hx * s + j! * b.hz * c }));
}

/** Separating-axis overlap of two turned boxes (with a margin). */
function boxesOverlap(a: VillageBoxCollider, b: VillageBoxCollider, margin = 0): boolean {
  for (const r of [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2]) {
    const ax = Math.cos(r),
      az = -Math.sin(r);
    const span = (box: VillageBoxCollider) => {
      const p = boxCorners(box).map((q) => q.x * ax + q.z * az);
      return [Math.min(...p), Math.max(...p)] as const;
    };
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    if (a1 + margin < b0 || b1 + margin < a0) return false;
  }
  return true;
}

function boxHitsCircle(b: VillageBoxCollider, c: CircleObstacle, margin = 0): boolean {
  const dx = c.x - b.x;
  const dz = c.z - b.z;
  const lx = dx * Math.cos(b.rot) - dz * Math.sin(b.rot);
  const lz = dx * Math.sin(b.rot) + dz * Math.cos(b.rot);
  const qx = Math.max(0, Math.abs(lx) - b.hx);
  const qz = Math.max(0, Math.abs(lz) - b.hz);
  return Math.hypot(qx, qz) < c.r + margin;
}

function gunBox(g: BatteryGun): VillageBoxCollider {
  return {
    x: g.x + Math.sin(g.heading) * GUN_COLLIDER.offset,
    z: g.z + Math.cos(g.heading) * GUN_COLLIDER.offset,
    hx: GUN_COLLIDER.hx,
    hz: GUN_COLLIDER.hz,
    rot: g.heading,
  };
}

/** The battery's own colliders, to tell them from the town's. */
function ownColliders(batteries: readonly ShoreBattery[]): {
  boxes: VillageBoxCollider[];
  circles: CircleObstacle[];
} {
  return addShoreBatteries(makeBuckets(), batteries, () => 0, 'lite');
}

const sameBox = (a: VillageBoxCollider, b: VillageBoxCollider) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && a.hx === b.hx && a.hz === b.hz;
const sameCircle = (a: CircleObstacle, b: CircleObstacle) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && a.r === b.r;

describe('shore cannon model', () => {
  it('stands its trucks on the ground and lays its barrel along +z', () => {
    for (const detail of ['full', 'mid', 'lite'] as const) {
      const parts = cannonParts(detail);
      let minY = Infinity;
      let maxZ = -Infinity;
      let minZ = Infinity;
      for (const g of [...parts.metal, ...parts.wood]) {
        g.computeBoundingBox();
        minY = Math.min(minY, g.boundingBox!.min.y);
        maxZ = Math.max(maxZ, g.boundingBox!.max.z);
        minZ = Math.min(minZ, g.boundingBox!.min.z);
        // Ready to merge with the kit's pieces: indexed, with the kit's four attributes only.
        expect(g.index, detail).not.toBeNull();
        expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position', 'uv']);
      }
      expect(minY).toBeGreaterThan(-0.01);
      expect(minY).toBeLessThan(0.01);
      expect(maxZ).toBeCloseTo(CANNON.muzzleZ, 2);
      expect(minZ).toBeCloseTo(CANNON.cascabelZ, 2);
    }
  });

  it('keeps each level of detail within its triangle budget', () => {
    const count = (d: 'full' | 'mid' | 'lite') => {
      const p = cannonParts(d);
      return triangles([...p.metal, ...p.wood]);
    };
    expect(count('full')).toBeLessThan(4200);
    expect(count('mid')).toBeLessThan(2200);
    expect(count('lite')).toBeLessThan(1000);
    expect(triangles(shotPyramid('full'))).toBeLessThanOrEqual(800);
    expect(triangles(shotPyramid('lite'))).toBeLessThan(200);
  });
});

describe('shore battery walk surfaces', () => {
  const b: ShoreBattery = {
    id: 't',
    guns: [],
    decks: [{ x: 0, z: 0, heading: 0, width: 4, depth: 2, top: 3, kind: 'stone' }],
    stairs: [{ x: 0, z: -4, heading: 0, width: 1.6, run: 3, bottom: 0, top: 3 }],
  };
  it('stands you on decks and climbs stairs a tread at a time', () => {
    expect(shoreBatteryWalkable([b], 1.9, 0.9)).toBe(3);
    expect(shoreBatteryWalkable([b], 2.1, 0)).toBeNull();
    expect(shoreBatteryWalkable([b], 0, -3.99)).toBeCloseTo(0.3, 5);
    expect(shoreBatteryWalkable([b], 0, -1.01)).toBeCloseTo(3, 5);
    expect(shoreBatteryWalkable([b], 0.9, -2)).toBeNull();
    // Every tread rises less than the walker's step-up.
    let last = 0;
    for (let z = -4; z <= -1; z += 0.05) {
      const h = shoreBatteryWalkable([b], 0, z)!;
      expect(h - last).toBeLessThan(0.55);
      last = h;
    }
  });
});

/** Each gun's trucks all stand on its surface, within 2 cm. */
function expectGrounded(guns: readonly BatteryGun[], surface: (x: number, z: number) => number): void {
  for (const g of guns) {
    const y = surface(g.x, g.z);
    for (const p of truckContacts(g))
      expect(Math.abs(surface(p.x, p.z) - y), `${g.x},${g.z}`).toBeLessThan(0.02);
  }
}

describe("Anchorage Cay's point battery", () => {
  const guns = ANCHORAGE_BATTERIES.flatMap((b) => b.guns);
  const decks = ANCHORAGE_BATTERIES.flatMap((b) => b.decks ?? []);

  it('builds each platform just over the ridge it stands on', () => {
    for (const d of decks) {
      let max = -Infinity;
      const s = Math.sin(d.heading),
        c = Math.cos(d.heading);
      for (let i = 0; i <= 8; i++)
        for (let j = 0; j <= 8; j++) {
          const lx = (i / 8 - 0.5) * d.width;
          const lz = (j / 8 - 0.5) * d.depth;
          max = Math.max(max, coveHeight(d.x + lx * c + lz * s, d.z - lx * s + lz * c));
        }
      // The planks top the ground everywhere (it can't poke through), and not by a step's height.
      expect(d.top, `${d.x}`).toBeGreaterThan(max);
      expect(d.top - max, `${d.x}`).toBeLessThan(0.2);
    }
    // The terrace's two levels are an easy step apart.
    expect(Math.abs(decks[0]!.top - decks[1]!.top)).toBeLessThan(0.55);
  });

  it('stands every gun flat on its platform, aimed out over the harbour', () => {
    expectGrounded(guns, (x, z) => shoreBatteryWalkable(ANCHORAGE_BATTERIES, x, z) ?? coveHeight(x, z));
    for (const g of guns) {
      // Over open water from 12 m out to the harbour mouth.
      const m = muzzleAt(g);
      for (let d = 12; d <= 90; d += 6)
        expect(
          coveHeight(m.x + Math.sin(g.heading) * d, m.z + Math.cos(g.heading) * d),
          `${d} m`,
        ).toBeLessThan(0);
    }
  });

  it('fires past its fence with room to spare', () => {
    for (const b of ANCHORAGE_BATTERIES)
      for (const g of b.guns) {
        const m = muzzleAt(g);
        const fx = Math.sin(g.heading),
          fz = Math.cos(g.heading);
        for (const line of b.fences ?? [])
          for (let i = 0; i + 1 < line.length; i++)
            for (let t = 0; t <= 1; t += 0.05) {
              const p = {
                x: line[i]!.x + (line[i + 1]!.x - line[i]!.x) * t,
                z: line[i]!.z + (line[i + 1]!.z - line[i]!.z) * t,
              };
              const along = (p.x - m.x) * fx + (p.z - m.z) * fz;
              if (along < -0.3) continue;
              // The rails and posts stand off the line of fire by more than the barrel and a post.
              expect(Math.abs((p.x - m.x) * fz - (p.z - m.z) * fx), `${p.x},${p.z}`).toBeGreaterThan(0.5);
            }
      }
  });

  it('keeps clear of the ridge path, the village and the harbour', async () => {
    const L = COVE.lighthouse;
    const len = Math.hypot(L.neck.x - L.x, L.neck.z - L.z);
    const across = (p: { x: number; z: number }) =>
      ((p.x - L.x) * (L.neck.z - L.z) - (p.z - L.z) * (L.neck.x - L.x)) / len;
    for (const g of guns)
      for (const p of boxCorners(gunBox(g))) expect(Math.abs(across(p))).toBeGreaterThan(0.8 + 0.36);
    // Decks and fences stay off the path's walk strip too.
    for (const d of decks)
      for (const p of boxCorners({ x: d.x, z: d.z, hx: d.width / 2, hz: d.depth / 2, rot: d.heading }))
        expect(Math.abs(across(p))).toBeGreaterThan(0.8);

    const village = await createVillage({ tier: tierSettings('high'), heightField: field(coveHeight) });
    const own = ownColliders(ANCHORAGE_BATTERIES);
    const boxes = village.colliders.boxes.filter((b) => !own.boxes.some((o) => sameBox(o, b)));
    for (const g of guns) {
      const gb = gunBox(g);
      for (const b of boxes) expect(boxesOverlap(gb, b, 0.3), `box ${b.x},${b.z}`).toBe(false);
      for (const c of village.colliders.circles.filter((c) => !own.circles.some((o) => sameCircle(o, c))))
        expect(boxHitsCircle(gb, c, 0.3), `circle ${c.x},${c.z}`).toBe(false);
      // On the ridge, well above the waves and away from the berth (no ship comes near).
      expect(shoreBatteryWalkable(ANCHORAGE_BATTERIES, g.x, g.z)!).toBeGreaterThan(2.5);
      expect(Math.hypot(g.x - COVE.mooring.x, g.z - COVE.mooring.z)).toBeGreaterThan(40);
      for (const [id, a] of Object.entries(village.anchors))
        expect(Math.hypot(a.x - g.x, a.z - g.z), id).toBeGreaterThan(3);
      // The village's walk surface is the battery's there (the trucks stand on what you walk on).
      for (const p of truckContacts(g))
        expect(village.walkable(p.x, p.z)).toBe(shoreBatteryWalkable(ANCHORAGE_BATTERIES, g.x, g.z));
    }
    village.dispose();
  });
});

describe("Port Meridian's batteries", () => {
  const town = createMeridianTown({
    tier: tierSettings('high'),
    heightField: field(meridianHeight),
    kit: createFallbackVillageKit(),
  });

  it('stands every gun flat on its platform', () => {
    for (const b of MERIDIAN_BATTERIES)
      expectGrounded(b.guns, (x, z) => town.walkable(x, z) ?? meridianHeight(x, z));
  });

  it('runs the citadel guns out through their embrasures, inside the curtain wall', () => {
    const rampart = MERIDIAN_BATTERIES.find((b) => b.id === 'citadel-rampart')!;
    expect(CITADEL_EMBRASURES).toHaveLength(rampart.guns.length);
    const half = CITADEL_WALL.thickness / 2;
    // How far a point is inside the wall's centre line (its inner face is at +half).
    const inset = (px: number, pz: number) => {
      const t = Math.atan2((pz - CITADEL_WALL.z) / CITADEL_WALL.rz, (px - CITADEL_WALL.x) / CITADEL_WALL.rx);
      const wx = CITADEL_WALL.x + CITADEL_WALL.rx * Math.cos(t);
      const wz = CITADEL_WALL.z + CITADEL_WALL.rz * Math.sin(t);
      const r = Math.hypot(px - CITADEL_WALL.x, pz - CITADEL_WALL.z);
      return Math.hypot(wx - CITADEL_WALL.x, wz - CITADEL_WALL.z) - r;
    };
    for (const [i, g] of rampart.guns.entries()) {
      const y = town.walkable(g.x, g.z)!;
      const e = CITADEL_EMBRASURES[i]!;
      const fx = Math.sin(g.heading),
        fz = Math.cos(g.heading);
      // The parapet stands a gunner's height over the rampart.
      expect(CITADEL_WALL.top - y).toBeGreaterThan(1.2);
      // The muzzle sits in the embrasure: past its throat (the inner face), short of its mouth.
      const muzzle = inset(g.x + fx * CANNON.muzzleZ, g.z + fz * CANNON.muzzleZ);
      expect(muzzle).toBeLessThan(half);
      expect(muzzle).toBeGreaterThan(-half);
      // The carriage stays behind the inner face.
      expect(inset(g.x + fx * CANNON.carriageZ1, g.z + fz * CANNON.carriageZ1)).toBeGreaterThan(half);
      // Along the barrel through the wall, its belly clears the sloping sill with room to spare...
      for (let d = 0; d <= CANNON.muzzleZ; d += 0.05) {
        const k = inset(g.x + fx * d, g.z + fz * d);
        if (k > half) continue;
        const sill = CITADEL_WALL.floor + e.sillIn + ((half - k) / (2 * half)) * (e.sillOut - e.sillIn);
        expect(y + CANNON.axisY - 0.27, `${d}`).toBeGreaterThan(sill + 0.1);
      }
      // ...and the throat is wide enough round it, with the gun's line through the middle.
      const throat = e.halfIn * ((CITADEL_WALL.rx + CITADEL_WALL.rz) / 2);
      expect(throat).toBeGreaterThan(0.27 + 0.2);
      const wall = {
        x: CITADEL_WALL.x + CITADEL_WALL.rx * Math.cos(e.angle),
        z: CITADEL_WALL.z + CITADEL_WALL.rz * Math.sin(e.angle),
      };
      const off = (wall.x - g.x) * Math.cos(g.heading) - (wall.z - g.z) * Math.sin(g.heading);
      expect(Math.abs(off)).toBeLessThan(0.1);
    }
  });

  it('fires the mole and east arm guns clear over their stone', () => {
    for (const b of MERIDIAN_BATTERIES.filter((b) => b.id !== 'citadel-rampart'))
      for (const g of b.guns) {
        const belly = town.walkable(g.x, g.z)! + CANNON.axisY - 0.2;
        // Nothing drawn there (the drum, its rim, the arm's kerb stand at most 0.45 m over the walk
        // height) comes near the line of fire for 8 m beyond the muzzle.
        for (let d = CANNON.muzzleZ; d <= CANNON.muzzleZ + 8; d += 0.25) {
          const x = g.x + Math.sin(g.heading) * d,
            z = g.z + Math.cos(g.heading) * d;
          const ground = town.walkable(x, z) ?? meridianHeight(x, z);
          expect(belly - (ground + 0.45), `${b.id} ${d}`).toBeGreaterThan(0.2);
        }
      }
  });

  it('aims every gun out to sea and keeps clear of the town', () => {
    const own = ownColliders(MERIDIAN_BATTERIES);
    const boxes = town.colliders.boxes.filter((b) => !own.boxes.some((o) => sameBox(o, b)));
    for (const b of MERIDIAN_BATTERIES)
      for (const g of b.guns) {
        const far = { x: g.x + Math.sin(g.heading) * 250, z: g.z + Math.cos(g.heading) * 250 };
        expect(meridianHeight(far.x, far.z), b.id).toBeLessThan(-2);
        const gb = gunBox(g);
        // The citadel's own wall colliders sit under the barrels by design; nothing else may.
        for (const o of boxes)
          if (b.id !== 'citadel-rampart' || Math.hypot(o.x - CITADEL_WALL.x, o.z - CITADEL_WALL.z) < 20)
            expect(boxesOverlap(gb, o, 0.2), `${b.id} box ${o.x},${o.z}`).toBe(false);
        for (const c of town.colliders.circles.filter((c) => !own.circles.some((o) => sameCircle(o, c))))
          expect(boxHitsCircle(gb, c, 0.2), `${b.id} circle ${c.x},${c.z}`).toBe(false);
        // On stone above the waves, not in the water the ships use.
        expect(town.walkable(g.x, g.z)!, b.id).toBeGreaterThan(2.4);
        for (const [id, a] of Object.entries(town.anchors))
          expect(Math.hypot(a.x - g.x, a.z - g.z), `${b.id} ${id}`).toBeGreaterThan(3);
      }
    // The east arm's guns leave the berth and the landing alone.
    const { berth, landing } = MERIDIAN.harbor;
    for (const g of MERIDIAN_BATTERIES.find((b) => b.id === 'east-arm-head')!.guns) {
      expect(Math.hypot(g.x - berth.x, g.z - berth.z)).toBeGreaterThan(30);
      expect(Math.hypot(g.x - landing.x, g.z - landing.z)).toBeGreaterThan(30);
    }
  });
});
