import { beforeAll, describe, expect, it } from 'vitest';
import { COVE } from '../layout';
import { CoveHeightField, coveHeight } from './cove-height';
import {
  headlandCaveShipObstacle,
  headlandCliffFrame,
  headlandCliffPlantSpots,
} from './headland-cliff-shape';
import { buildHeadlandCliffGeometry, HEADLAND_CLIFF_DETAIL } from './headland-cliff';

// A 1 m grid over the headland (like the baked pack), so the tests don't evaluate the analytic height
// tens of thousands of times.
let field: CoveHeightField;
beforeAll(() => {
  const minX = 60;
  const minZ = -140;
  const nx = 200;
  const nz = 270;
  const heights = new Float32Array(nx * nz);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) heights[z * nx + x] = coveHeight(minX + x, minZ + z);
  field = new CoveHeightField({ heights, nx, nz, minX, minZ, cell: 1 });
}, 60_000);

describe('headland cliff', { timeout: 30_000 }, () => {
  it('drops sheer from the clifftop to the sea on the east face', () => {
    for (const z of [-40, -20, 20, 40]) {
      let edge = 0;
      for (let x = 180; x < 230; x += 0.5) {
        if (coveHeight(x, z) < 0) {
          edge = x;
          break;
        }
      }
      expect(edge).toBeGreaterThan(190);
      // From the sea to most of the clifftop's height in a few metres.
      expect(coveHeight(edge - 6, z)).toBeGreaterThan(12);
    }
  });

  it('follows the cliff round the east, north and south faces, with seaward normals and the cave', () => {
    const frame = headlandCliffFrame(field);
    expect(frame.length).toBeGreaterThan(300);
    expect(frame.caveS).toBeGreaterThan(0);
    let strong = 0;
    for (const st of frame.stations) {
      expect(Math.hypot(st.nx, st.nz)).toBeCloseTo(1, 5);
      if (st.strength > 0.9) {
        strong++;
        expect(field.heightAt(st.x + st.nx * 10, st.z + st.nz * 10)).toBeLessThan(
          field.heightAt(st.x - st.nx * 10, st.z - st.nz * 10),
        );
      }
    }
    expect(strong).toBeGreaterThan(250);
    const xs = frame.stations.map((s) => s.x);
    const zs = frame.stations.map((s) => s.z);
    expect(Math.max(...xs)).toBeGreaterThan(COVE.headland.x1 - 5);
    expect(Math.min(...zs)).toBeLessThan(COVE.headland.z0 - 4);
    expect(Math.max(...zs)).toBeGreaterThan(COVE.headland.z1 + 4);
  });

  it('builds one clean mesh per tier, in front of the height field and within its triangle budget', () => {
    const budget = { lite: 5000, low: 14000, high: 46000 } as const;
    for (const tier of ['lite', 'low', 'high'] as const) {
      const geometry = buildHeadlandCliffGeometry(field, HEADLAND_CLIFF_DETAIL[tier])!;
      const pos = geometry.getAttribute('position').array;
      const karst = geometry.getAttribute('karst').array;
      for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true);
      for (let i = 0; i < karst.length; i++) {
        expect(karst[i]).toBeGreaterThanOrEqual(0);
        expect(karst[i]).toBeLessThanOrEqual(1);
      }
      expect(geometry.getIndex()!.count / 3).toBeLessThan(budget[tier]);
    }
    // The face never sinks behind the height field's own face above the water (that's what showed
    // stretched terrain through the old boulders), except where the cliff ends in a slope.
    const frame = headlandCliffFrame(field);
    const geometry = buildHeadlandCliffGeometry(field, HEADLAND_CLIFF_DETAIL.low)!;
    const pos = geometry.getAttribute('position').array;
    let checked = 0;
    let buried = 0;
    for (let v = 0; v < pos.length / 3; v++) {
      const x = pos[v * 3]!;
      const y = pos[v * 3 + 1]!;
      const z = pos[v * 3 + 2]!;
      if (y < 1 || y > 20) continue;
      let near = Infinity;
      let k = 0;
      let lip = 0;
      for (const st of frame.stations) {
        const d = Math.hypot(st.x - x, st.z - z);
        if (d < near) {
          near = d;
          k = st.strength;
          lip = st.lipY;
        }
      }
      // Skip the roll over the clifftop edge (it tucks under the ground on purpose).
      if (k < 1 || y > lip - 1) continue;
      checked++;
      if (field.heightAt(x, z) > y + 0.5) buried++;
    }
    expect(checked).toBeGreaterThan(300);
    expect(buried / checked).toBeLessThan(0.02);
  });

  it('places plants on the clifftop and its wooded ends, deterministically, and guards the cave buttress', () => {
    const a = headlandCliffPlantSpots(field, 1);
    expect(a).toEqual(headlandCliffPlantSpots(field, 1));
    expect(a.length).toBeGreaterThan(40);
    expect(headlandCliffPlantSpots(field, 0)).toEqual([]);
    for (const p of a) expect(Math.abs(p.y - field.heightAt(p.x, p.z))).toBeLessThan(0.6);
    const o = headlandCaveShipObstacle(field)!;
    expect(Math.hypot(o.x - COVE.seaCave.x, o.z - COVE.seaCave.z)).toBeLessThan(25);
    expect(field.heightAt(o.x, o.z)).toBeLessThan(0);
  });
});
