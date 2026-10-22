import { describe, expect, test } from 'vitest';
import { BufferAttribute, Mesh, Vector3, type Object3D } from 'three/webgpu';
import { TIERS } from '../../engine/quality';
import { loadPalmObject } from '../vegetation/model-loader';
import { palmTrunkRings, type PalmTrunkRing } from '../vegetation/palms';
import { createHammock } from './hammock';
import { installCanvasStub, kit } from './site-test-support';

/** A gently sloping beach, so each palm and the lute stand on their own ground. */
const ground = (x: number, z: number): number => 0.6 + 0.03 * (x + 18) - 0.05 * (z - 86);

async function camp() {
  installCanvasStub();
  const [left, right] = await Promise.all([loadPalmObject('a', 8.2), loadPalmObject('b', 8.2)]);
  const site = createHammock({ kit: kit(), tier: TIERS.high, ground, palms: { left, right } });
  site.group.updateMatrixWorld(true);
  return { site, left, right };
}

function mesh(site: { group: Object3D }, name: string): Mesh {
  const found = site.group.getObjectByName(name);
  if (!(found instanceof Mesh)) throw new Error(`no ${name}`);
  return found;
}

function vertices(m: Mesh): Vector3[] {
  const pos = m.geometry.getAttribute('position') as BufferAttribute;
  const out: Vector3[] = [];
  for (let i = 0; i < pos.count; i += 1)
    out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  return out;
}

/** A palm's trunk rings in world space, bottom up. */
function trunk(palm: Object3D): PalmTrunkRing[] {
  const rings: PalmTrunkRing[] = [];
  palm.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const s = o.matrixWorld.getMaxScaleOnAxis();
    for (const r of palmTrunkRings(o.geometry)) {
      const p = new Vector3(r.x, r.y, r.z).applyMatrix4(o.matrixWorld);
      rings.push({ x: p.x, y: p.y, z: p.z, r: r.r * s });
    }
  });
  return rings.sort((a, b) => a.y - b.y);
}

function ringAt(rings: PalmTrunkRing[], y: number): PalmTrunkRing {
  const i = Math.max(0, rings.findIndex((r) => r.y >= y) - 1);
  const a = rings[i]!;
  const b = rings[i + 1]!;
  const t = (y - a.y) / (b.y - a.y);
  return { x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t, r: a.r + (b.r - a.r) * t };
}

describe('bard hammock (issue 68)', () => {
  test('palm trunk rings follow the generated trunk, bottom up', async () => {
    const palm = await loadPalmObject('b', 8.2);
    const rings = trunk(palm);
    expect(rings.length).toBeGreaterThan(10);
    for (let i = 1; i < rings.length; i += 1) expect(rings[i]!.y).toBeGreaterThan(rings[i - 1]!.y);
    // A slender trunk, flared at its foot, leaning off the model's (crown-centred) origin.
    const foot = ringAt(rings, 0.3);
    expect(foot.r).toBeGreaterThan(0.1);
    expect(foot.r).toBeLessThan(0.25);
    expect(Math.hypot(foot.x, foot.z)).toBeGreaterThan(0.3);
  });

  test('each palm stands its trunk on its collider', async () => {
    const { site, left, right } = await camp();
    for (const [palm, circle] of [
      [left, site.colliders.circles[0]!],
      [right, site.colliders.circles[1]!],
    ] as const) {
      const rings = trunk(palm);
      const foot = ringAt(rings, ground(circle.x, circle.z) + 0.3);
      expect(Math.hypot(foot.x - circle.x, foot.z - circle.z)).toBeLessThan(0.02);
    }
  });

  test('the hammock ropes and the bunting wrap round both trunks', async () => {
    const { site, left, right } = await camp();
    const wood = vertices(mesh(site, 'bard hammock wood props'));
    for (const [palm, at] of [
      [left, site.colliders.circles[0]!],
      [right, site.colliders.circles[1]!],
    ] as const) {
      const rings = trunk(palm);
      const foot = ground(at.x, at.z);
      for (const height of [1.5, 2.45]) {
        const ring = ringAt(rings, foot + height);
        // Rope all the way round the bark at the tie: every quarter of the trunk has some.
        const quarters = new Set<number>();
        for (const v of wood) {
          if (Math.abs(v.y - ring.y) > 0.03) continue;
          const d = Math.hypot(v.x - ring.x, v.z - ring.z);
          if (d < ring.r - 0.01 || d > ring.r + 0.05) continue;
          quarters.add(
            Math.floor(((Math.atan2(v.z - ring.z, v.x - ring.x) + Math.PI) / (Math.PI * 2)) * 4) % 4,
          );
        }
        expect(quarters.size, `rope round the trunk at ${height} m`).toBe(4);
      }
    }
  });

  test('the lute rests on the sand, clear of the swaying hammock', async () => {
    const { site } = await camp();
    const lute = vertices(mesh(site, 'bard hammock wood props')).filter(
      (v) => Math.abs(v.x + 17.15) < 0.45 && v.z < 86.2 && v.y < ground(v.x, v.z) + 1.1,
    );
    expect(lute.length).toBeGreaterThan(100);
    const minY = Math.min(...lute.map((v) => v.y - ground(v.x, v.z)));
    expect(minY).toBeLessThan(0);
    expect(minY).toBeGreaterThan(-0.03);
    const top = Math.max(...lute.map((v) => v.y - ground(v.x, v.z)));
    expect(top).toBeGreaterThan(0.7);
    const xMin = Math.min(...lute.map((v) => v.x)) - 0.3;
    const xMax = Math.max(...lute.map((v) => v.x)) + 0.3;
    const luteFront = Math.max(...lute.map((v) => v.z));
    const cloth = mesh(site, 'bard hammock animated cloth');
    for (let t = 0; t < 6; t += 0.2) {
      site.update(0, t);
      const hammock = vertices(cloth).filter((v) => v.x > xMin && v.x < xMax && v.z > 85.5 && v.y < 2);
      expect(hammock.length).toBeGreaterThan(0);
      expect(luteFront).toBeLessThan(Math.min(...hammock.map((v) => v.z)) - 0.03);
    }
  });
});
