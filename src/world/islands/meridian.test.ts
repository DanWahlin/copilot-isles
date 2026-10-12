import { describe, expect, it } from 'vitest';
import { MERIDIAN, meridianHeight, meridianMasks } from './meridian';

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
