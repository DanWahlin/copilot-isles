import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three/webgpu';
import type { CircleObstacle, WaveSampler } from '../contracts';
import { ShipDynamics } from '../ship/dynamics';
import { BERTH_APPROACH } from '../sites/helms-logic';
import type { CameraBlockerBox } from '../terrain/camera-blockers';
import { ROCK_ASSETS } from '../terrain/rock-assets';
import {
  MERIDIAN,
  MERIDIAN_ROCK_COUNT,
  meridianHeight,
  meridianRockMatrix,
  meridianMasks,
  meridianRockCameraBlockers,
  meridianRockShipObstacles,
} from './meridian';
import { MERIDIAN_HEIGHT_FIELD } from './meridian-plants';

describe("Port Meridian's coastal rock camera blockers", () => {
  it('cover every drawn rock surface within 0.3 m', () => {
    const blockers = meridianRockCameraBlockers(MERIDIAN_HEIGHT_FIELD);
    const cells = new Map<number, CameraBlockerBox[]>();
    const cell = (x: number, z: number) => (x + 4096) * 8192 + z + 4096;
    for (const blocker of blockers) {
      const r = Math.hypot(blocker.hx, blocker.hz) + 1;
      for (let x = Math.floor((blocker.x - r) / 16); x <= Math.floor((blocker.x + r) / 16); x++)
        for (let z = Math.floor((blocker.z - r) / 16); z <= Math.floor((blocker.z + r) / 16); z++) {
          const key = cell(x, z);
          const bucket = cells.get(key);
          if (bucket) bucket.push(blocker);
          else cells.set(key, [blocker]);
        }
    }

    const divisions = 4;
    const tolerance = 0.3;
    const matrix = new Matrix4();
    const uncovered: string[] = [];
    let testedRocks = 0;
    for (let assetIndex = 0; assetIndex < 3; assetIndex++) {
      const asset = ROCK_ASSETS[assetIndex]!;
      for (let instance = 0; instance < MERIDIAN_ROCK_COUNT; instance++) {
        meridianRockMatrix(assetIndex, instance, MERIDIAN_HEIGHT_FIELD, matrix);
        const e = matrix.elements;
        if (Math.hypot(e[0]!, e[1]!, e[2]!) === 0) continue;
        testedRocks++;
        for (let tri = 0; tri + 2 < asset.indices.length; tri += 3) {
          const a = asset.indices[tri]! * 3;
          const b = asset.indices[tri + 1]! * 3;
          const c = asset.indices[tri + 2]! * 3;
          for (let u = 0; u <= divisions; u++)
            for (let v = 0; u + v <= divisions; v++) {
              const wa = u / divisions,
                wb = v / divisions,
                wc = 1 - wa - wb;
              const lx = asset.positions[a]! * wa + asset.positions[b]! * wb + asset.positions[c]! * wc;
              const ly =
                asset.positions[a + 1]! * wa + asset.positions[b + 1]! * wb + asset.positions[c + 1]! * wc;
              const lz =
                asset.positions[a + 2]! * wa + asset.positions[b + 2]! * wb + asset.positions[c + 2]! * wc;
              const x = e[0]! * lx + e[4]! * ly + e[8]! * lz + e[12]!;
              const y = e[1]! * lx + e[5]! * ly + e[9]! * lz + e[13]!;
              const z = e[2]! * lx + e[6]! * ly + e[10]! * lz + e[14]!;
              if (y < -0.5) continue;
              const candidates = cells.get(cell(Math.floor(x / 16), Math.floor(z / 16))) ?? [];
              const covered = candidates.some((blocker) => {
                if (y < blocker.y0 - tolerance || y > blocker.y1 + tolerance) return false;
                const dx = x - blocker.x,
                  dz = z - blocker.z;
                const c = Math.cos(blocker.rot),
                  s = Math.sin(blocker.rot);
                return (
                  Math.abs(dx * c - dz * s) <= blocker.hx + tolerance &&
                  Math.abs(dx * s + dz * c) <= blocker.hz + tolerance
                );
              });
              if (!covered && uncovered.length < 20)
                uncovered.push(
                  `${asset.key} instance ${instance}, triangle ${tri / 3} at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`,
                );
            }
        }
      }
    }
    expect(testedRocks).toBeGreaterThan(0);
    expect(uncovered).toEqual([]);
  });
});

describe('Port Meridian terrain', () => {
  it('keeps named district pads flat enough for future town placement', () => {
    for (const pad of Object.values(MERIDIAN.pads)) {
      expect(meridianHeight(pad.x, pad.z)).toBeCloseTo(pad.height, 0);
      expect(Math.abs(meridianHeight(pad.x + 4, pad.z) - meridianHeight(pad.x - 4, pad.z))).toBeLessThan(1.8);
    }
  });

  it('has a dredged southwest harbor and a high northeastern ridge', () => {
    expect(meridianHeight(MERIDIAN.harbor.center.x, MERIDIAN.harbor.center.z)).toBeLessThan(-5);
    expect(meridianHeight(MERIDIAN.ridge.center.x, MERIDIAN.ridge.center.z)).toBeGreaterThan(120);
    expect(meridianHeight(MERIDIAN.pads.citadel.x, MERIDIAN.pads.citadel.z)).toBeGreaterThan(38);
  });

  it('berths the ship in deep water alongside the east arm, with a dry landing beside it', () => {
    const { berth, landing, eastArm } = MERIDIAN.harbor;
    // The whole hull (24 m long, 6.6 m beam, 2.7 m draft) floats with room to spare.
    for (const along of [-12, -6, 0, 6, 12])
      for (const across of [-3.3, 0, 3.3])
        expect(meridianHeight(berth.x + across, berth.z + along)).toBeLessThan(-4);
    expect(meridianHeight(landing.x, landing.z)).toBeCloseTo(eastArm.height, 1);
    expect(berth.x).toBeLessThan(eastArm.x0);
  });

  it('keeps the cliff lift car path outside the bluff with lateral clearance', () => {
    const bottom = { x: 770.3, y: 3.8, z: -766.8 };
    const top = { x: 798.2, y: 41.75, z: -779.2 };
    const dx = top.x - bottom.x;
    const dz = top.z - bottom.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const ease = (k: number) => k * k * (3 - 2 * k);
    for (let i = 0; i <= 20; i += 1) {
      const k = i / 20;
      const t = ease(k);
      const x = bottom.x + dx * t;
      const y = bottom.y + (top.y - bottom.y) * t - 1.4;
      const z = bottom.z + dz * t;
      for (const lateral of [-3.3, -1.65, 0, 1.65, 3.3]) {
        const tx = x + nx * lateral;
        const tz = z + nz * lateral;
        expect(meridianHeight(tx, tz), `k=${k.toFixed(2)} lateral=${lateral}`).toBeLessThan(y - 0.3);
      }
    }
  });

  it('keeps the mouth and the way in from Anchorage open to a brigantine', () => {
    const { lighthouse } = MERIDIAN.mole;
    const arm = MERIDIAN.harbor.eastArm;
    // Across the mouth, between the lighthouse and the arm's tip.
    for (let t = 0.2; t <= 0.8; t += 0.1) {
      const x = lighthouse.x + (arm.x0 - lighthouse.x) * t;
      const z = lighthouse.z + (arm.z1 - lighthouse.z) * t;
      expect(meridianHeight(x, z)).toBeLessThan(-3.5);
    }
    // From the berth out through the mouth and round the lighthouse to the south-west.
    for (const [x, z] of [
      [745, -675],
      [735, -640],
      [715, -600],
      [680, -585],
      [640, -575],
    ])
      expect(meridianHeight(x, z)).toBeLessThan(-3.5);
  });

  it('comes down to the deep sea floor at every edge of its height data', () => {
    // Past the edges the ocean's fallback floor (-52 m) takes over: an edge above it would show an
    // open terrain edge from the sea (the ridge used to stand 86 m tall at the east edge).
    const { minX, maxX, minZ, maxZ } = MERIDIAN.bounds;
    for (let x = minX; x <= maxX; x += 2)
      for (const z of [minZ, maxZ]) expect(meridianHeight(x, z), `${x}, ${z}`).toBeLessThanOrEqual(-52);
    for (let z = minZ; z <= maxZ; z += 2)
      for (const x of [minX, maxX]) expect(meridianHeight(x, z), `${x}, ${z}`).toBeLessThanOrEqual(-52);
    // The ridge reaches the water well inside them, and the sea bed between is deep enough to sail.
    for (let z = minZ; z <= maxZ; z += 4) expect(meridianHeight(maxX - 30, z)).toBeLessThan(-3);
    for (let x = minX; x <= maxX; x += 4) expect(meridianHeight(x, minZ + 30)).toBeLessThan(-3);
  });

  it("gives the ridge's seaward foot a varied, rocky coast (cliffs, slopes, headlands and bays)", () => {
    // Walk round the ridge's north side and north-east end: where the ground meets the sea, and how
    // high it stands 12 m back from the water. One smooth band would keep both nearly the same.
    const { center, halfX, halfZ } = MERIDIAN.ridge;
    const reach: number[] = [];
    const cliff: number[] = [];
    for (let a = -2.6; a <= 0.1; a += 0.1) {
      const ux = Math.cos(a) * halfX;
      const uz = Math.sin(a) * halfZ;
      const len = Math.hypot(ux, uz);
      let k = 0.6;
      while (meridianHeight(center.x + ux * k, center.z + uz * k) > 0) k += 0.5 / len;
      reach.push(k);
      cliff.push(meridianHeight(center.x + ux * (k - 12 / len), center.z + uz * (k - 12 / len)));
    }
    expect(Math.max(...reach) - Math.min(...reach)).toBeGreaterThan(0.3);
    expect(Math.min(...cliff)).toBeLessThan(20);
    expect(Math.max(...cliff)).toBeGreaterThan(40);
  });

  it('returns normalized material masks', () => {
    for (const [x, z] of [
      [MERIDIAN.pads.plaza.x, MERIDIAN.pads.plaza.z],
      [MERIDIAN.ridge.center.x, MERIDIAN.ridge.center.z],
      [MERIDIAN.harbor.center.x, MERIDIAN.harbor.center.z],
    ]) {
      const masks = meridianMasks(x, z);
      const sum = masks.sand + masks.grass + masks.rock + masks.cliff;
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    }
  });
});

describe("Port Meridian's foot rocks as ship obstacles", () => {
  const rocks = meridianRockShipObstacles(MERIDIAN_HEIGHT_FIELD);
  const calm: WaveSampler = {
    heightAt: () => 0,
    velocityAt: (_x, _z, _t, out) => {
      out[0] = 0;
      out[1] = 0;
      return out;
    },
  };
  /** Steps the ship; returns how far its hull reached into `target` (or any rock) and the seconds. */
  const run = (
    ship: ShipDynamics,
    obstacles: CircleObstacle[],
    seconds: number,
    trim: number,
    target?: CircleObstacle,
  ) => {
    const env = { waves: calm, ground: MERIDIAN_HEIGHT_FIELD, obstacles, t: 0 };
    let worst = -Infinity;
    let i = 0;
    for (; i < seconds * 60 && !ship.dockComplete; i++) {
      env.t += 1 / 60;
      ship.step(1 / 60, { trim, rudder: 0 }, env);
      const s = Math.sin(ship.pose.heading);
      const c = Math.cos(ship.pose.heading);
      for (const cap of ship.capsules)
        for (const o of target ? [target] : rocks) {
          const d = Math.hypot(ship.pose.x + s * cap.z - o.x, ship.pose.z + c * cap.z - o.z);
          worst = Math.max(worst, cap.radius + o.r - d);
        }
    }
    return { worst, seconds: i / 60 };
  };

  it('gives every rock at the foot of the sea cliffs a waterline footprint', () => {
    expect(rocks).toHaveLength(36);
    for (const o of rocks) {
      expect(o.r).toBeGreaterThan(2);
      expect(o.r).toBeLessThan(10);
    }
  });

  it('stops a ship under full sail at each rock, bow first from the open sea', () => {
    const { center } = MERIDIAN.ridge;
    const problems: string[] = [];
    for (const rock of rocks) {
      const dx = rock.x - center.x;
      const dz = rock.z - center.z;
      const len = Math.hypot(dx, dz);
      const ship = new ShipDynamics(rock.x + (dx / len) * 45, rock.z + (dz / len) * 45, Math.atan2(-dx, -dz));
      const { worst } = run(ship, rocks, 14, 1, rock);
      // A pointed bow can nose about half a metre into a circle before it's pushed back out.
      if (worst >= 0.75)
        problems.push(`rock at ${rock.x.toFixed(1)}, ${rock.z.toFixed(1)}: ${worst.toFixed(2)} m`);
    }
    expect(problems).toEqual([]);
  }, 20_000); // 36 full-sail runs: ~2.3 s alone, ~5 s under full-suite load.

  it('stays far from the harbour, its mouth and the way in, so docking is just the same', () => {
    const { berth } = MERIDIAN.harbor;
    const starts: [number, number, number][] = [
      [BERTH_APPROACH.x, BERTH_APPROACH.z, Math.PI],
      [741.5, -704, 0.1],
      [746.5, -726, 0],
      [735, -690, Math.PI],
    ];
    for (const o of rocks) {
      for (const [x, z] of [
        ...starts,
        [berth.x, berth.z],
        [MERIDIAN.mole.lighthouse.x, MERIDIAN.mole.lighthouse.z],
      ])
        expect(Math.hypot(o.x - x!, o.z - z!)).toBeGreaterThan(300);
    }
    // The dock assist from each of the town tests' four starts takes the same time with the rocks.
    for (const [x, z, heading] of starts) {
      const free = new ShipDynamics(x, z, heading);
      free.dockAssist(berth);
      const withRocks = new ShipDynamics(x, z, heading);
      withRocks.dockAssist(berth);
      const a = run(free, [], 60, 0);
      const b = run(withRocks, rocks, 60, 0);
      expect(withRocks.dockComplete).toBe(free.dockComplete);
      expect(b.seconds).toBe(a.seconds);
    }
  });
});
