import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { courseBoard } from '../../learn/course-board';
import { makeBuckets } from '../village/kit';
import {
  addCourseBoardTimber,
  courseBoardExcludes,
  courseBoardSpot,
  noteCells,
  wrapTitle,
} from './course-board';

describe('course notice board', () => {
  it('lays every chapter’s notes out on the board without overlaps', () => {
    for (const topics of [5, 7, 8, 9, 10, 12]) {
      const cells = noteCells(topics + 2);
      expect(cells).toHaveLength(topics + 2);
      expect(cells.filter((c) => c.pin)).toHaveLength(2);
      for (const c of cells) {
        expect(c.x - c.w / 2).toBeGreaterThanOrEqual(-1.2);
        expect(c.x + c.w / 2).toBeLessThanOrEqual(1.2);
        expect(c.y - c.h / 2).toBeGreaterThanOrEqual(0.93);
        expect(c.y + c.h / 2).toBeLessThanOrEqual(2.37);
        expect(c.w).toBeGreaterThan(0.3);
        expect(c.h).toBeGreaterThan(0.15);
      }
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!,
            b = cells[j]!;
          const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
          expect(apart, `${topics}: ${i}, ${j}`).toBe(true);
        }
    }
  });

  it('wraps a title into up to three lines and keeps every word', () => {
    for (const t of [
      'Settings',
      'Connect to Your Repository',
      'Exercise: Start a Session from a Branch and Attach an Issue',
    ]) {
      const lines = wrapTitle(t);
      expect(lines.length).toBeLessThanOrEqual(3);
      expect(lines.join(' ')).toBe(t);
    }
  });

  it('builds plain indexed timber that merges with the town’s, and colliders round it', () => {
    const buckets = makeBuckets();
    const pose = { x: 10, y: 2, z: -5, rot: 0.6 };
    const parts = addCourseBoardTimber(buckets, pose, courseBoard('00-setup')!);
    const all: BufferGeometry[] = [...buckets.wood, ...buckets.metal];
    expect(buckets.wood.length).toBeGreaterThan(10);
    for (const g of all) {
      expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position', 'uv']);
      expect(g.index).not.toBeNull();
    }
    expect(parts.box).toMatchObject({ x: 10, z: -5, rot: 0.6 });
    expect(parts.camera.y1).toBeGreaterThan(parts.camera.y0);
    const spot = courseBoardSpot(pose);
    expect(Math.hypot(spot.x - pose.x, spot.z - pose.z)).toBeCloseTo(1.5);
    expect(courseBoardExcludes(pose, pose.x, pose.z)).toBe(true);
    expect(courseBoardExcludes(pose, spot.x, spot.z)).toBe(true);
    expect(courseBoardExcludes(pose, pose.x + 5, pose.z)).toBe(false);
    for (const g of all) g.dispose();
  });
});
