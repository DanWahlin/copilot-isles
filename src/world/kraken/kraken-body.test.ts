import { describe, expect, it } from 'vitest';
import { Box3, MeshStandardNodeMaterial, Vector3, type SkinnedMesh } from 'three/webgpu';
import { createKrakenBody } from './kraken-body';

describe('kraken body anatomy', () => {
  const body = createKrakenBody(new MeshStandardNodeMaterial(), 8);
  const box = new Box3().setFromObject(body.drawn);

  it('grows every arm from a ring under the head: below the eyes, in the bottom of the body', () => {
    expect(body.sockets).toHaveLength(8);
    const low = box.min.y + 0.25 * (box.max.y - box.min.y);
    for (const s of body.sockets) {
      expect(s.position.y).toBeLessThan(body.eyeHeight - 2);
      expect(s.position.y).toBeLessThan(low);
      // Inside the body's outline, and pointing out and down.
      expect(Math.hypot(s.position.x, s.position.z)).toBeLessThan(Math.max(box.max.x, box.max.z));
      expect(s.outward.y).toBeLessThan(0);
      expect(Math.hypot(s.outward.x, s.outward.z)).toBeGreaterThan(0.8);
    }
  });

  it('surfaces with its eyes over the water and its sockets under it', () => {
    expect(body.eyeHeight + body.surfaced).toBeGreaterThan(1);
    for (const s of body.sockets) expect(s.position.y + body.surfaced).toBeLessThan(-1.5);
  });
});

describe('kraken body faces', () => {
  it('winds its parts to face outward (only front faces are drawn): the eyes and the head', () => {
    const body = createKrakenBody(new MeshStandardNodeMaterial(), 8);
    let mesh: SkinnedMesh | null = null;
    body.drawn.traverse((o) => {
      if ((o as SkinnedMesh).isMesh) mesh = o as SkinnedMesh;
    });
    const g = mesh!.geometry;
    const p = g.getAttribute('position');
    const col = g.getAttribute('color');
    const idx = g.getIndex()!;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const n = new Vector3();
    const mid = new Vector3();
    const eye = new Vector3(1.95, body.eyeHeight, 2.4);
    let eyeOut = 0;
    let eyeIn = 0;
    let headOut = 0;
    let headIn = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const i = idx.getX(t);
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, idx.getX(t + 1));
      c.fromBufferAttribute(p, idx.getX(t + 2));
      n.subVectors(b, a).cross(c.clone().sub(a));
      mid
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      // A pole's triangles have no area.
      if (n.lengthSq() < 1e-10) continue;
      // The eye's glowing amber (the only colour that red).
      if (col.getX(i) > 0.95 && mid.distanceTo(eye) < 1.5) {
        if (n.dot(mid.clone().sub(eye)) > 0) eyeOut++;
        else eyeIn++;
      }
      // The head's own rings (the first triangles), away from its axis.
      if (t < 22 * 15 * 6) {
        if (n.x * mid.x + n.z * mid.z > 0) headOut++;
        else headIn++;
      }
    }
    expect(eyeOut).toBeGreaterThan(0);
    expect(eyeIn).toBe(0);
    expect(headOut / (headOut + headIn)).toBeGreaterThan(0.9);
  });
});
