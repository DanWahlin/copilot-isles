import { describe, expect, it } from 'vitest';
import { Box3, MeshStandardNodeMaterial } from 'three/webgpu';
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
