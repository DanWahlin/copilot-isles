import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three/webgpu';
import { LeapsDirector, projectArc, type ScreenRect } from './director';
import type { HeightField } from '../../contracts';

function intersects(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const water: HeightField = {
  heightAt: () => -12,
  normalAt(_x, _z, out) {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 0, grass: 0, rock: 1, cliff: 0 }),
};

describe('LeapsDirector', () => {
  it('keeps 50 seeded predicted arcs on-screen and clear of UI rects', () => {
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 1500);
    camera.position.set(0, 18, 85);
    camera.lookAt(0, 3, -120);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const viewport = { width: 1280, height: 720 };
    const avoid: ScreenRect[] = [
      { x: 0, y: 0, w: 410, h: 720 },
      { x: 455, y: 535, w: 370, h: 130 },
      { x: 850, y: 40, w: 300, h: 115 },
    ];
    const director = new LeapsDirector({ seed: 0x5eed, heightField: water, viewport, avoidRects: avoid });
    for (let i = 0; i < 50; i++) {
      const projected = director.next(camera, i % 3 === 0 ? 'dolphin' : 'fish');
      expect(projected, `spawn ${i}`).not.toBeNull();
      if (!projected) continue;
      const again = projectArc(projected.arc, camera, viewport);
      expect(again).not.toBeNull();
      expect(projected.rect.x).toBeGreaterThanOrEqual(8);
      expect(projected.rect.y).toBeGreaterThanOrEqual(8);
      expect(projected.rect.x + projected.rect.w).toBeLessThanOrEqual(viewport.width - 8);
      expect(projected.rect.y + projected.rect.h).toBeLessThanOrEqual(viewport.height - 8);
      for (const rect of avoid) expect(intersects(projected.rect, rect)).toBe(false);
    }
  });
});
