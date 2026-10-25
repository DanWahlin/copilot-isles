import { describe, expect, it } from 'vitest';
import { keelhavenHeight, keelhavenHeightDry, keelhavenMasks, keelhavenWater } from './height';
import { KEELHAVEN as K, toFrame, toWorld } from './layout';
import { inWorks } from './works';

const heightAt = (u: number, v: number) => {
  const p = toWorld(u, v);
  return keelhavenHeight(p.x, p.z);
};

/** Whether frame (u, v) lies within `r` m of fresh water (its channel cuts the beach and the shelf). */
const byWater = (u: number, v: number, r: number) => {
  const p = toWorld(u, v);
  return keelhavenWater().shoreDistance(p.x, p.z, r) < r;
};

/** The steepest rise (rise/run) at frame (u, v), from central differences 1 m either side. */
const slopeAt = (u: number, v: number) =>
  Math.hypot(heightAt(u + 1, v) - heightAt(u - 1, v), heightAt(u, v + 1) - heightAt(u, v - 1)) / 2;

describe('Keelhaven frame', () => {
  it('maps the frame to the world and back', () => {
    const p = toWorld(123, -45);
    const f = toFrame(p.x, p.z, { u: 0, v: 0 });
    expect(f.u).toBeCloseTo(123, 6);
    expect(f.v).toBeCloseTo(-45, 6);
  });

  it('opens the cove to the west-north-west (the entry line runs east-south-east)', () => {
    const a = toWorld(K.entry[0]!.u, K.entry[0]!.v);
    const b = toWorld(K.entry[1]!.u, K.entry[1]!.v);
    const bearing = ((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI + 360) % 360;
    expect(bearing).toBeCloseTo(125, 0);
  });
});

describe('keelhavenHeight', () => {
  it('is finite and inside the pack range everywhere in the bounds', () => {
    const b = K.bounds;
    let min = Infinity;
    let max = -Infinity;
    for (let z = b.minZ; z <= b.maxZ; z += 10)
      for (let x = b.minX; x <= b.maxX; x += 10) {
        const h = keelhavenHeight(x, z);
        expect(Number.isFinite(h)).toBe(true);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    expect(min).toBeGreaterThanOrEqual(-K.deepDepth);
    // Front crests 120-180 m, the spine 250-285 m, peaks to about 300 m.
    expect(max).toBeGreaterThan(220);
    expect(max).toBeLessThanOrEqual(310);
  });

  it('falls to the deep floor all round the edges of the bake', () => {
    const b = K.bounds;
    for (let t = 0; t <= 1; t += 1 / 64) {
      const x = b.minX + (b.maxX - b.minX) * t;
      const z = b.minZ + (b.maxZ - b.minZ) * t;
      for (const h of [
        keelhavenHeight(x, b.minZ),
        keelhavenHeight(x, b.maxZ),
        keelhavenHeight(b.minX, z),
        keelhavenHeight(b.maxX, z),
      ])
        expect(h).toBeLessThan(-K.deepDepth + 3);
    }
  });

  it('has no steps (no change over 0.25 m larger than a sheer face gives)', () => {
    const b = K.bounds;
    let worst = 0;
    for (let z = b.minZ; z <= b.maxZ; z += 7)
      for (let x = b.minX; x <= b.maxX; x += 7) {
        // The sea stacks are sheer columns of their own.
        if (K.seaStacks.some((st) => Math.hypot(x - st.x, z - st.z) < st.radius * 3)) continue;
        const h = keelhavenHeight(x, z);
        worst = Math.max(
          worst,
          Math.abs(keelhavenHeight(x + 0.25, z) - h),
          Math.abs(keelhavenHeight(x, z + 0.25) - h),
        );
      }
    // A rise of 5 m over 0.25 m is a near-sheer face (a sea cliff, a spire's side), not a step.
    expect(worst).toBeLessThan(5);
  });

  it('carves its fresh water into the ground, and leaves the rest as it was', () => {
    const river = keelhavenWater().streams[1]!;
    const i = Math.floor(river.count / 2);
    const [x, z] = [river.x[i]!, river.z[i]!];
    expect(keelhavenHeight(x, z)).toBeLessThan(keelhavenHeightDry(x, z));
    const p = toWorld(100, 160);
    expect(keelhavenHeight(p.x, p.z)).toBe(keelhavenHeightDry(p.x, p.z));
  });

  it('gives a walkable beach between the headlands', () => {
    for (let u = -5; u <= 25; u += 3)
      for (let v = -70; v <= 70; v += 7) {
        // The river's mouth and the works (the slipway, the cut, the quay) cut the beach.
        if (byWater(u, v, 6) || inWorks(u, v, 3)) continue;
        const h = heightAt(u, v);
        expect(h).toBeGreaterThan(-0.6);
        expect(h).toBeLessThan(3.6);
        expect(slopeAt(u, v)).toBeLessThan(0.18);
      }
  });

  it('gives a flat town shelf behind the beach (room for the town and the shipyard)', () => {
    const t = K.townShelf;
    for (let u = t.u0 + 5; u <= t.u1 - 5; u += 6)
      for (let v = -(t.halfWidth - 8); v <= t.halfWidth - 8; v += 6) {
        // The river crosses the shelf in its own bed; the works cut their chambers into it.
        if (byWater(u, v, 6) || inWorks(u, v, 3)) continue;
        const h = heightAt(u, v);
        expect(h).toBeGreaterThanOrEqual(t.minY);
        expect(h).toBeLessThanOrEqual(t.maxY);
        expect(slopeAt(u, v)).toBeLessThan(0.08);
      }
  });

  it('keeps the cove deep enough for the ship along the entry line (6 m either side)', () => {
    const draught = 2.7;
    let shallowest = Infinity;
    for (let i = 0; i < K.entry.length - 1; i++) {
      const a = K.entry[i]!;
      const b = K.entry[i + 1]!;
      const len = Math.hypot(b.u - a.u, b.v - a.v);
      const nu = -(b.v - a.v) / len;
      const nv = (b.u - a.u) / len;
      for (let s = 0; s <= len; s += 2) {
        const u = a.u + ((b.u - a.u) * s) / len;
        const v = a.v + ((b.v - a.v) * s) / len;
        for (const side of [-6, 0, 6])
          shallowest = Math.min(shallowest, -heightAt(u + nu * side, v + nv * side));
      }
    }
    expect(shallowest).toBeGreaterThan(draught + 1.5);
  });

  it('stands the main wall tall and steep from the sea (a sea cliff, then the wall to the crest)', () => {
    // Inland from the middle of the west coast (its shore near x 3615 at z -1500).
    expect(keelhavenHeight(3560, -1500)).toBeLessThan(0);
    let front = 0;
    let back = 0;
    for (let x = 3620; x <= 3800; x += 4) front = Math.max(front, keelhavenHeight(x, -1500));
    for (let x = 3800; x <= 4100; x += 4) back = Math.max(back, keelhavenHeight(x, -1500));
    expect(front).toBeGreaterThan(110);
    // Ranges behind ranges: the spine stands higher than the front wall.
    expect(back).toBeGreaterThan(front + 40);
  });

  it('keeps deep water close in off the cliffs (navy), and the reef flats just under the sea', () => {
    // 80 m off the main wall's point.
    expect(keelhavenHeight(3500, -1500)).toBeLessThan(-15);
    for (const r of K.reefs) {
      const h = heightAt(r.u, r.v);
      expect(h).toBeLessThan(0);
      expect(h).toBeGreaterThan(-2.5);
    }
  });

  it('ends the hanging valley high over the sea', () => {
    // Somewhere near its spot on the coast, the ground stands 45-80 m high within 60 m of the sea.
    let lip = 0;
    for (let du = -60; du <= 60; du += 6)
      for (let dv = -40; dv <= 40; dv += 4) lip = Math.max(lip, heightAt(K.hanging.u + du, K.hanging.v + dv));
    expect(lip).toBeGreaterThan(45);
  });
});

describe('keelhavenMasks', () => {
  it('sums to 1 and stays in range', () => {
    for (const [u, v] of [
      [0, 0],
      [100, 0],
      [60, 330],
      [60, 395],
      [-300, 0],
      [500, 100],
    ] as const) {
      const p = toWorld(u, v);
      const m = keelhavenMasks(p.x, p.z);
      for (const value of [m.sand, m.grass, m.rock, m.cliff]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(m.sand + m.grass + m.rock + m.cliff).toBeCloseTo(1, 5);
    }
  });

  it('puts sand on the beach and the street, plants on the town shelf, and cliff only in the sea-cliff band', () => {
    const beach = toWorld(5, 0);
    expect(keelhavenMasks(beach.x, beach.z).sand).toBeGreaterThan(0.8);
    // Between the houses (off the street and the yards).
    const shelf = toWorld(140, 56);
    expect(keelhavenMasks(shelf.x, shelf.z).grass).toBeGreaterThan(0.8);
    const street = toWorld(46, 45);
    expect(keelhavenMasks(street.x, street.z).sand).toBeGreaterThan(0.6);
    const high = toWorld(60, 300);
    expect(keelhavenMasks(high.x, high.z).cliff).toBe(0);
  });
});
