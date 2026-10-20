import { describe, expect, it } from 'vitest';
import { THOUSAND_BOUGH as TB } from './layout';
import { fernWalkAt, thousandBoughHeight, thousandBoughWater } from './height';
import { thousandBoughStreamStones } from './stream-stones';
import { createThousandBoughWaterMesh } from './water-mesh';
import { BRIDGES, villageWalkable } from './village/surfaces';
import { NATURAL_POOL, NATURAL_STREAM } from '../fresh-water-natural';

const water = thousandBoughWater();
const natural = water.streams.filter((s) => s.spec.course);

describe("Thousand-Bough's streams run natural courses", () => {
  it('gives Silver Run, Fernrun and Thunder Run a course', () => {
    expect(natural.length).toBeGreaterThanOrEqual(4);
  });

  it('meanders between its own ends, through its pins, away from the straight line', () => {
    for (const s of natural) {
      const pts = s.spec.points;
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      // The ends stay put (the last sample within the resampling's 0.6 m of the line's end).
      expect(Math.hypot(s.x[0]! - a[0], s.z[0]! - a[1])).toBeLessThan(1e-6);
      expect(Math.hypot(s.x[s.count - 1]! - b[0], s.z[s.count - 1]! - b[1])).toBeLessThan(0.61);
      for (const p of s.spec.course!.pins ?? []) {
        let best = Infinity;
        for (let i = 0; i < s.count; i++) best = Math.min(best, Math.hypot(s.x[i]! - p.x, s.z[i]! - p.z));
        expect(best, `${s.spec.from} pin`).toBeLessThan(1.2);
      }
      // It swings off the centre line it was drawn on (not a ruled canal) by up to its meander.
      let swing = 0;
      for (let i = 0; i < s.count; i++) {
        let d = Infinity;
        for (let k = 0; k < pts.length - 1; k++) {
          const [ax, az] = pts[k]!;
          const [bx, bz] = pts[k + 1]!;
          const dx = bx - ax;
          const dz = bz - az;
          const t = Math.max(
            0,
            Math.min(1, ((s.x[i]! - ax) * dx + (s.z[i]! - az) * dz) / (dx * dx + dz * dz)),
          );
          d = Math.min(d, Math.hypot(s.x[i]! - ax - dx * t, s.z[i]! - az - dz * t));
        }
        swing = Math.max(swing, d);
      }
      if (s.spec.course!.meander > 0)
        expect(swing, s.spec.from).toBeGreaterThan(s.spec.course!.meander * 0.4);
      expect(swing, s.spec.from).toBeLessThan(s.spec.course!.meander * 1.6 + 1);
    }
  });

  it('keeps its width within bounds, narrowing and widening along it', () => {
    for (const s of natural) {
      const c = s.spec.course!;
      const lo = Math.min(c.minHalf, ...(c.pins ?? []).map((p) => p.half ?? s.spec.halfWidth));
      const hi = Math.max(c.maxHalf, ...(c.pins ?? []).map((p) => p.half ?? s.spec.halfWidth));
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < s.count; i++) {
        expect(s.half[i]!).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(s.half[i]!).toBeLessThanOrEqual(hi + 1e-9);
        min = Math.min(min, s.half[i]!);
        max = Math.max(max, s.half[i]!);
      }
      expect(max - min, s.spec.from).toBeGreaterThanOrEqual((c.maxHalf - c.minHalf) * 0.5);
    }
  });

  it('carves a bed under its water, deepest in the middle, with banks above it', () => {
    for (const s of natural) {
      for (let i = 0; i < s.count; i++) {
        if (water.basinAt(s.x[i]!, s.z[i]!, 1.2)) continue;
        const bed = thousandBoughHeight(s.x[i]!, s.z[i]!);
        expect(bed, `${s.spec.from} @${i}`).toBeLessThan(s.surface[i]! - s.depth[i]! * 0.8);
      }
    }
  });

  it('carves its bed and banks smoothly (no steps in the ground)', () => {
    for (const s of natural) {
      for (let i = 2; i < s.count - 2; i += 3) {
        // (Where it leaves or enters a pool, the pool's own banks.)
        if (water.basinAt(s.x[i]!, s.z[i]!, 1.8)) continue;
        const tx = s.x[i + 1]! - s.x[i - 1]!;
        const tz = s.z[i + 1]! - s.z[i - 1]!;
        const tl = Math.hypot(tx, tz);
        let last = NaN;
        for (let d = -s.half[i]! - 2.5; d <= s.half[i]! + 2.5; d += 0.25) {
          const x = s.x[i]! - (tz / tl) * d;
          const z = s.z[i]! + (tx / tl) * d;
          const h = thousandBoughHeight(x, z);
          // (A pool's own cut banks are steeper.)
          if (water.basinAt(x, z, 1.7)) {
            last = NaN;
            continue;
          }
          if (!Number.isNaN(last)) expect(Math.abs(h - last), `${s.spec.from} @${i} ${d}`).toBeLessThan(0.3);
          last = h;
        }
      }
    }
  });

  it("never runs over the village's walks, the Fern Walk or a puzzle site (only under the plank bridge)", () => {
    const b0 = BRIDGES.find((b) => b.id === 'B0')!;
    const nearB0 = (x: number, z: number) =>
      Math.hypot(x - (b0.from.x + b0.to.x) / 2, z - (b0.from.z + b0.to.z) / 2) < 7;
    const bad: string[] = [];
    for (const s of natural) {
      for (let i = 0; i < s.count; i++) {
        // In a pool (the Booth Pools have their booths' boards over them by design).
        if (water.basinAt(s.x[i]!, s.z[i]!, 1.3)) continue;
        const tx = s.x[Math.min(s.count - 1, i + 1)]! - s.x[Math.max(0, i - 1)]!;
        const tz = s.z[Math.min(s.count - 1, i + 1)]! - s.z[Math.max(0, i - 1)]!;
        const tl = Math.hypot(tx, tz) || 1;
        for (const side of [-1, -0.5, 0, 0.5, 1]) {
          const d = side * (s.half[i]! + 0.5);
          const x = s.x[i]! - (tz / tl) * d;
          const z = s.z[i]! + (tx / tl) * d;
          const at = `${s.spec.from}→${s.spec.to} ${x.toFixed(1)},${z.toFixed(1)}`;
          const walk = villageWalkable(x, z, s.surface[i]! + 0.5);
          if (walk !== null && !(nearB0(x, z) && walk > s.surface[i]! + 0.4)) bad.push(`${at} walk`);
          const fw = fernWalkAt(x, z);
          if (fw && fw.d < TB.fernWalk.width / 2 + 0.5 && !nearB0(x, z)) bad.push(`${at} fern walk`);
          if (Math.hypot(x - TB.flumeShelf.x, z - TB.flumeShelf.z) < TB.flumeShelf.radius)
            bad.push(`${at} flume`);
          if (Math.hypot(x - TB.spire.x, z - TB.spire.z) < TB.spire.radius + 4) bad.push(`${at} spire`);
          if (Math.hypot(x - TB.knoll.x, z - TB.knoll.z) < TB.knoll.radius) bad.push(`${at} knoll`);
        }
      }
    }
    expect(bad).toEqual([]);
    // Every cast member stands dry (or no deeper than wading).
    for (const [id, a] of Object.entries(TB.anchors)) {
      // (The reed booths' floors stand over their pools by design.)
      if (water.basinAt(a.x, a.z, 1.1)) continue;
      const level = water.levelAt(a.x, a.z);
      if (level !== null) expect(level - thousandBoughHeight(a.x, a.z), id).toBeLessThan(0.3);
    }
  });
});

describe("Thousand-Bough's pools hold water", () => {
  it('keeps every pool surface over its bed everywhere inside its shoreline', () => {
    for (const b of Object.values(water.basins)) {
      for (let a = 0; a < 64; a++)
        for (const k of [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.97]) {
          const [x, z] = water.rimPoint(b, (a / 64) * Math.PI * 2, k);
          expect(thousandBoughHeight(x, z), `${b.name} ${a} ${k}`).toBeLessThan(b.level - 0.1);
          // At least its own level (a stream or cascade running in stands over it at its mouth).
          expect(water.levelAt(x, z)!, b.name).toBeGreaterThanOrEqual(b.level);
        }
    }
  });
});

describe("Thousand-Bough's water mesh", () => {
  const strips = createThousandBoughWaterMesh(thousandBoughHeight);
  const g = strips.mesh.geometry;
  const pos = g.getAttribute('position');
  const flow = g.getAttribute('flow');
  const bed = g.getAttribute('bed');
  const count = (g.drawRange.count / 6) * 4;

  it('fits its buffers (no quad dropped)', () => {
    expect(strips.dropped).toBe(0);
    expect(count).toBeGreaterThan(1000);
  });

  it('draws each pool as water over its bed (depth > 0 inside, its own look)', () => {
    let pools = 0;
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      if (flow.getW(i) !== NATURAL_POOL) continue;
      pools++;
      const b = water.basinAt(x, z, 0.95);
      if (b) expect(bed.getX(i), b.name).toBeGreaterThan(0.05);
    }
    expect(pools).toBeGreaterThan(500);
  });

  it('draws no stream across a pool (the pool carries it in and out)', () => {
    for (let q = 0; q < count; q += 4) {
      if (flow.getW(q) !== NATURAL_STREAM) continue;
      const cx = (pos.getX(q) + pos.getX(q + 3)) / 2;
      const cz = (pos.getZ(q) + pos.getZ(q + 3)) / 2;
      expect(water.basinAt(cx, cz, 0.9), `${cx},${cz}`).toBeNull();
    }
  });

  it('places its stream stones in the water, clear of the plank bridge', () => {
    const stones = thousandBoughStreamStones();
    expect(stones.length).toBeGreaterThan(12);
    for (const st of stones) expect(water.shoreDistance(st.x, st.z, 3), `${st.x},${st.z}`).toBeLessThan(1.5);
  });
});
