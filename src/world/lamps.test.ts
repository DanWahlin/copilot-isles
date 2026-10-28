import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { makeBuckets } from './village/kit';
import { HANGER, lampHanger } from './village/lamp-hanger';
import { lampFaults, meet, near, partsOf } from './village/lamp-joins';
import {
  addBoathouse,
  addLanternFixture,
  addPierPostLantern,
  addPostLamp,
  addWallLantern,
} from './islands/anchorage/village';
import { addLampPost, addStringLanterns } from './meridian-town/index';
import { lantern } from './islands/thousand-bough/village/index';
import { LANTERN_STAND } from './islands/thousand-bough/village/structure';
import { lampHead } from './islands/keelhaven/lamps';
import { lampPost } from './islands/keelhaven/town-build';
import { lockLamp, type ShipyardOut } from './islands/keelhaven/shipyard';
import { stationPost } from './islands/keelhaven/circuit';
import { addStallLantern } from './market-stall/parts';
import { millLantern } from './sites/mill';
import { addLantern as rackLantern } from './sites/gear-rack';
import { sternLanternGeometry } from './ship/brigantine';
import { box, rod } from './village/pieces';

/**
 * Every lamp and lantern the islands build, built alone: each part touches another (a gap of 1 cm at
 * most, no vertex more than 3 cm into it) and the lamp is one piece. Anchorage's quay lamps hung
 * under their arms with sky between them, and caps floated over their glass (issue 363).
 */

type Built = Record<string, BufferGeometry[]>;
const faults = (b: Built) => lampFaults(partsOf(Object.values(b).flat()));
const shipyardOut = (): ShipyardOut => ({
  colliders: [],
  circles: [],
  cameraBoxes: [],
  shipObstacles: [],
  dockHull: { x: 0, y: 0, z: 0, heading: 0 },
  berth: { x: 0, z: 0, heading: 0 },
  decks: [],
  lamps: [],
});
/** A Keelhaven build with its changing glass (out of the buckets) back in. */
const withLamps = (b: Built, out: ShipyardOut) => ({ ...b, lamps: out.lamps.map((l) => l.geo) });

const LAMPS: Record<string, () => Built> = {
  'Anchorage street lamp': () => {
    const b = makeBuckets();
    addPostLamp(b, -90, 2.46, -68, 1);
    return b;
  },
  'Anchorage street lamp, arm west': () => {
    const b = makeBuckets();
    addPostLamp(b, 4, 0.3, 2, -1);
    return b;
  },
  'Anchorage door lantern': () => {
    const b = makeBuckets();
    addWallLantern(b, { x: 3, z: -2, heading: 0.7 }, 1.5);
    return b;
  },
  'Anchorage lighthouse stair lantern': () => {
    const b = makeBuckets();
    addWallLantern(b, { x: 1, z: 1, heading: 2.2 }, 4, 0.8, 0.24);
    return b;
  },
  'Anchorage pier post lantern': () => {
    const b = makeBuckets();
    addPierPostLantern(b, { circles: [] }, -110.5, 1.8, -89.5, -1);
    return b;
  },
  'Anchorage standing lantern': () => {
    const b = makeBuckets();
    addLanternFixture(b, 0, 0, 0, 0.3, 0.72);
    return b;
  },
  'Port Meridian lamp post': () => {
    const b = makeBuckets();
    addLampPost(b, { circles: [], boxes: [] } as never, [], 600, 2, -760, Math.PI / 2);
    return b;
  },
  'Port Meridian string of lanterns': () => {
    const b = makeBuckets();
    addStringLanterns(b, { x: 0, y: 5, z: 0 }, { x: 9, y: 4.6, z: 3 }, 5);
    return b;
  },
  'Model Market stall lantern': () => {
    const b = makeBuckets();
    // The stall's face (a board the bracket comes out of) for the arm to start in.
    b.wood.push(...[box(makeBuckets(), 'wood', 0.6, 3, -0.04, 0.3, 0.6, 0.08, 0, 0xffffff)]);
    addStallLantern(b, 0.6, 0, 3.2, 0x333333);
    return b;
  },
  'Thousand-Bough hung lantern (an arm from a post)': () => {
    const b = makeBuckets();
    rod(b, 'wood', { x: 0, y: 0, z: 0 }, { x: 0, y: 3.3, z: 0 }, 0.11, 6, 0x555555);
    lantern(b, { x: 0.3, y: 2.6, z: 0.1, hang: true, arm: { x: 0.0854, z: 0.0285 } });
    return b;
  },
  'Thousand-Bough hung lantern (from a beam)': () => {
    const b = makeBuckets();
    rod(b, 'wood', { x: 0, y: -0.4, z: 0 }, { x: 0, y: 2.5, z: 0 }, 0.09, 6, 0x555555);
    box(b, 'wood', 0.33, 2.4, 0, 0.52, 0.06, 0.06, 0, 0x555555);
    lantern(b, { x: 0.55, y: 2.4 - 0.42, z: 0, hang: true, under: 2.4 - 0.03 });
    return b;
  },
  'Thousand-Bough standing lantern (on a post)': () => {
    const b = makeBuckets();
    rod(b, 'wood', { x: 0, y: -0.4, z: 0 }, { x: 0, y: 2.3, z: 0 }, 0.09, 6, 0x555555);
    lantern(b, { x: 0, y: 2.3 + LANTERN_STAND, z: 0, hang: false });
    return b;
  },
  'Keelhaven lamp post': () => {
    const b = makeBuckets();
    lampPost(b, shipyardOut(), 40, 10, 0.6);
    return b;
  },
  'Keelhaven station post': () => {
    const b = makeBuckets();
    const out = shipyardOut();
    stationPost(b, out, 's', 60, 4, 1.2);
    return withLamps(b, out);
  },
  'Keelhaven lock lamp': () => {
    const b = makeBuckets();
    const out = shipyardOut();
    lockLamp(b, out, 'l', 80, -6, 1.5, 'red');
    return withLamps(b, out);
  },
  'Keelhaven door lantern and wreck lantern head': () => {
    const b = makeBuckets();
    lampHead(b, b, { x: 1, y: 2, z: 1, w: 0.2, h: 0.28, yaw: 0.4, capR: 0.18, capH: 0.15, capColour: 0 });
    return b;
  },
  'mill lantern post': () => {
    const b = { stone: [], wood: [], iron: [], glow: [] };
    millLantern(b, 3, 4, 1.1);
    return b;
  },
  'gear rack lantern': () => {
    const b = { wood: [], metal: [], rope: [], glow: [], cloth: [] };
    rackLantern(b, { x: 1, y: 1, z: 1, rot: 0.3, hung: false }, false, { cyl: 10 });
    return b;
  },
  'ship stern lanterns': () => {
    const g = sternLanternGeometry();
    return { hanger: [g.hanger], lanterns: [g.lanterns] };
  },
};

describe('lamp joins', () => {
  it('Anchorage boathouse lantern: hung from the roof slab over it', () => {
    const b = makeBuckets();
    addBoathouse(b, { boxes: [] }, [], {} as never, 10, 20, 1);
    // The lantern hangs at (x - 0.9, z - 2.22); its parts, its hanger and the slab over it.
    // The lantern's parts and the roof slab (the only long part that reaches over 3.8 m), not the
    // corner post beside it (its own joins aren't a lamp's).
    const parts = near(partsOf(Object.values(b).flat()), { x: 9.1, y: 1 + 2.4, z: 17.78 }, 0.45).filter(
      (p) => (p.max.z - p.min.z < 1 && p.max.y - p.min.y < 2) || p.max.y > 1 + 2.8,
    );
    expect(parts.length).toBeGreaterThan(10);
    expect(lampFaults(parts)).toEqual([]);
  });

  for (const [name, build] of Object.entries(LAMPS))
    it(`${name}: every part touches its neighbour, and it's one piece`, () => {
      expect(faults(build())).toEqual([]);
    });

  it('finds a lantern hung with a gap under its arm, and a cap over its glass', () => {
    const b = makeBuckets();
    box(b, 'wood', 0, 2.4, 0, 1, 0.1, 0.1, 0, 0);
    lampHanger(b.metal, 0.4, 0, 2.2, 2.35, 0);
    box(b, 'glow', 0.4, 2.0, 0, 0.2, 0.3, 0.2, 0, 0);
    expect(faults(b).some((f) => f.includes('floats'))).toBe(true);
    const c = makeBuckets();
    box(c, 'glow', 0, 0, 0, 0.2, 0.3, 0.2, 0, 0);
    box(c, 'metal', 0, 0.15 + 0.03, 0, 0.3, 0.02, 0.3, 0, 0);
    expect(faults(c).some((f) => f.includes('floats 2.0 cm'))).toBe(true);
  });

  it('seats the shared hanger: its ring on the lantern, its link into the support', () => {
    for (const scale of [0.52, 0.6, 0.72, 0.8, 1]) {
      const b = makeBuckets();
      const support = partsOf([box(makeBuckets(), 'wood', 0, 2.5, 0, 0.6, 0.08, 0.08, 0, 0)])[0]!;
      const cap = partsOf([box(makeBuckets(), 'metal', 0, 2.2 - 0.05, 0, 0.1, 0.1, 0.1, 0, 0)])[0]!;
      const [ring, link] = partsOf(lampHanger(b.metal, 0, 0, 2.2, 2.46, 0, scale));
      expect(meet(ring!, cap)).toBeLessThanOrEqual(0);
      expect(meet(ring!, cap)).toBeGreaterThan(-0.01);
      expect(meet(link!, support)).toBeLessThan(0);
      expect(meet(link!, support)).toBeGreaterThan(-0.03);
      expect(meet(link!, ring!)).toBeLessThanOrEqual(0.001);
      expect(ring!.max.y - ring!.min.y).toBeCloseTo(2 * (HANGER.ring + HANGER.tube) * scale, 4);
    }
  });
});
