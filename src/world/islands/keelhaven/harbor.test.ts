import { describe, expect, it } from 'vitest';
import { KEELHAVEN_ARRIVAL, KEELHAVEN_ISLAND } from '../../../islands/keelhaven';
import type { CircleObstacle, HeightField, WaveSampler } from '../../contracts';
import { ShipDynamics } from '../../ship/dynamics';
import { BRIGANTINE_CAPSULES } from '../../ship/lines';
import { makeBuckets } from '../../village/pieces';
import type { VillageKit } from '../../village/kit';
import { measureFootprint } from '../footprint';
import { KEELHAVEN_HARBOR as H } from './harbor';
import { keelhavenHeight, keelhavenHeightDry } from './height';
import { KEELHAVEN as K } from './layout';
import { buildShipyard } from './shipyard';
import { DeckIndex } from './decks';
import { KEELHAVEN_STARFISH } from './starfish';

const ground: HeightField = {
  heightAt: keelhavenHeight,
  normalAt: (_x, _z, out) => {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
};
const calm: WaveSampler = {
  heightAt: () => 0,
  velocityAt: (_x, _z, _t, out) => {
    out[0] = 0;
    out[1] = 0;
    return out;
  },
};

function works() {
  const kit = { pieces: new Map(), materials: {}, dispose() {} } as unknown as VillageKit;
  const steps = buildShipyard(makeBuckets(), kit, false);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}
const built = works();

/** Steps the ship; returns how far its hull reached into any obstacle (m), and the seconds. */
function sail(ship: ShipDynamics, obstacles: readonly CircleObstacle[], seconds: number, trim: number) {
  const env = { waves: calm, ground, obstacles: [...obstacles], t: 0 };
  let worst = -Infinity;
  let i = 0;
  for (; i < seconds * 60 && !ship.dockComplete; i++) {
    env.t += 1 / 60;
    ship.step(1 / 60, { trim, rudder: 0 }, env);
    const s = Math.sin(ship.pose.heading);
    const c = Math.cos(ship.pose.heading);
    for (const cap of ship.capsules)
      for (const o of obstacles)
        worst = Math.max(
          worst,
          cap.radius + o.r - Math.hypot(ship.pose.x + s * cap.z - o.x, ship.pose.z + c * cap.z - o.z),
        );
  }
  return { worst, seconds: i / 60 };
}

describe('Keelhaven berth and approach', () => {
  it('berths the ship in deep water alongside the quay, her port side 4.65 m off its face', () => {
    const b = H.berth;
    for (const along of [-12, -6, 0, 6, 12])
      for (const across of [-3.3, 0, 3.3]) {
        const x = b.x + Math.sin(b.heading) * along + Math.cos(b.heading) * across;
        const z = b.z + Math.cos(b.heading) * along - Math.sin(b.heading) * across;
        expect(keelhavenHeight(x, z)).toBeLessThan(-4);
      }
    // The registry's mooring and landing are the harbour's.
    expect(KEELHAVEN_ISLAND.mooring).toEqual(H.berth);
    expect(KEELHAVEN_ISLAND.contains(H.landing.x, H.landing.z)).toBe(true);
  });

  it('keeps the lane from the open sea through the mouth deep, 30 m either side', () => {
    const lane = H.lane;
    for (let i = 0; i < lane.length - 2; i++) {
      const a = lane[i]!;
      const b = lane[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      for (let s = 0; s <= len; s += 5)
        for (const off of [-30, -15, 0, 15, 30]) {
          const x = a.x + ux * s - uz * off;
          const z = a.z + uz * s + ux * off;
          expect(keelhavenHeight(x, z), `${x.toFixed(0)},${z.toFixed(0)}`).toBeLessThan(H.laneFloor);
        }
    }
  });

  it('keeps the quay’s ship obstacles half a metre clear of the berthed hull', () => {
    const b = H.berth;
    for (const cap of BRIGANTINE_CAPSULES) {
      const x = b.x + Math.sin(b.heading) * cap.z;
      const z = b.z + Math.cos(b.heading) * cap.z;
      for (const o of built.shipObstacles)
        expect(Math.hypot(o.x - x, o.z - z), `capsule ${cap.z}`).toBeGreaterThan(o.r + cap.radius + 0.5);
    }
  });

  it('docks cleanly from the lane and from the turning room', () => {
    const b = H.berth;
    const inner = H.lane[2]!;
    const t = H.turning;
    for (const [x, z, heading] of [
      [inner.x, inner.z, Math.atan2(b.x - inner.x, b.z - inner.z)],
      [t.x, t.z, Math.atan2(b.x - t.x, b.z - t.z)],
      [t.x + 10, t.z - 15, b.heading],
    ] as const) {
      const ship = new ShipDynamics(x, z, heading);
      ship.dockAssist(b);
      const { worst, seconds } = sail(ship, built.shipObstacles, 90, 0);
      expect(ship.dockComplete, `from ${x.toFixed(0)},${z.toFixed(0)}`).toBe(true);
      expect(seconds).toBeLessThan(80);
      expect(worst, `from ${x.toFixed(0)},${z.toFixed(0)}`).toBeLessThan(0.05);
    }
  });

  it('lands you on the quay’s deck', () => {
    const decks = new DeckIndex(built.decks);
    expect(decks.heightAt(H.landing.x, H.landing.z)).toBeCloseTo(H.deck, 2);
  });
});

describe('Keelhaven in the registry', () => {
  it('keeps its outline in step with its ground', () => {
    const m = measureFootprint(keelhavenHeightDry, K.center.x, K.center.z, 32, 900);
    expect(m.radii).toEqual(KEELHAVEN_ISLAND.footprint.radii);
  });

  it('keeps its ranges in order, freed before Thousand-Bough’s berth', () => {
    const r = KEELHAVEN_ISLAND.ranges;
    expect(r.show).toBeLessThan(r.load);
    expect(r.load).toBeLessThan(r.unload);
  });

  it('puts every starfish on the island', () => {
    for (const s of KEELHAVEN_STARFISH) {
      expect(KEELHAVEN_ISLAND.contains(s.x, s.z)).toBe(true);
      expect(keelhavenHeight(s.x, s.z)).toBeGreaterThan(-0.5);
    }
  });
});

describe('Keelhaven arrival flyover', () => {
  it('clears the ground by 4 m along its keys', () => {
    const keys = [...KEELHAVEN_ARRIVAL.keys, { ...H.landingShot, pace: 1 }];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i]!;
      const b = keys[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      for (let s = 0; s <= len; s += 1) {
        const t = s / len;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const z = a.z + (b.z - a.z) * t;
        expect(y - keelhavenHeight(x, z), `key ${i} at ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(4);
      }
    }
  });
});
