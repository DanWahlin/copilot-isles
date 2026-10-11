import { describe, expect, it } from 'vitest';
import {
  SHADOW_CACHE,
  StaticShadowState,
  commitStaticRefresh,
  snapToGrid,
  staticCoverage,
  staticRefreshReason,
} from './shadow-cache';

const SUN = [0.3, 0.8, -0.52] as const;
const norm = (v: readonly number[]) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as [number, number, number];
};

function drawn(x = 0, z = 0, sun: readonly number[] = SUN): StaticShadowState {
  const s = new StaticShadowState();
  const [sx, sy, sz] = norm(sun);
  commitStaticRefresh(s, x, z, sx, sy, sz);
  return s;
}

describe('static shadow cache rules', () => {
  it('draws the first frame', () => {
    const [sx, sy, sz] = norm(SUN);
    expect(staticRefreshReason(new StaticShadowState(), 0, 0, sx, sy, sz, false, false)).toBe('first');
  });

  it('snaps the centre to the grid nearest the focus', () => {
    expect(snapToGrid(12.4, 25)).toBe(0);
    expect(snapToGrid(12.6, 25)).toBe(25);
    expect(snapToGrid(-37.6, 25)).toBe(-50);
    const s = drawn(61, -88);
    expect([s.cx, s.cz]).toEqual([50, -100]);
  });

  it('keeps the map until the focus passes the threshold', () => {
    const s = drawn(61, -88);
    const [sx, sy, sz] = norm(SUN);
    // 49 m from the snapped centre (50, -100): no refresh.
    expect(staticRefreshReason(s, 50 + 49, -100, sx, sy, sz, false, false)).toBe('none');
    expect(staticRefreshReason(s, 50 + 30, -100 - 30, sx, sy, sz, false, false)).toBe('none');
    // Past 50 m in any direction: refresh.
    expect(staticRefreshReason(s, 50 + 51, -100, sx, sy, sz, false, false)).toBe('focus');
    expect(staticRefreshReason(s, 50 - 36, -100 + 36, sx, sy, sz, false, false)).toBe('focus');
  });

  it('gives the same centre for nearby focus points (no shimmer between refreshes)', () => {
    const a = drawn(101, 3);
    const b = drawn(109, -9);
    expect([a.cx, a.cz]).toEqual([b.cx, b.cz]);
  });

  it('refreshes when the sun turns past the angle, not before', () => {
    const s = drawn();
    const a = SHADOW_CACHE.sunAngle;
    const [sx, sy, sz] = norm(SUN);
    // Rotate the sun about the vertical axis by a fraction of the threshold, then past it.
    const turn = (t: number) => {
      const c = Math.cos(t),
        n = Math.sin(t);
      return [sx * c - sz * n, sy, sx * n + sz * c] as const;
    };
    const small = turn(a * 0.5);
    const big = turn(a * 3);
    expect(staticRefreshReason(s, 0, 0, small[0], small[1], small[2], false, false)).toBe('none');
    expect(staticRefreshReason(s, 0, 0, big[0], big[1], big[2], false, false)).toBe('sun');
  });

  it('refreshes for a sun preset change', () => {
    const s = drawn(0, 0, SUN);
    const [mx, my, mz] = norm([-0.6, 0.25, 0.4]);
    expect(staticRefreshReason(s, 0, 0, mx, my, mz, false, false)).toBe('sun');
    commitStaticRefresh(s, 0, 0, mx, my, mz);
    expect(staticRefreshReason(s, 0, 0, mx, my, mz, false, false)).toBe('none');
  });

  it('refreshes when a static caster changes or a refresh is forced', () => {
    const s = drawn();
    const [sx, sy, sz] = norm(SUN);
    expect(staticRefreshReason(s, 0, 0, sx, sy, sz, true, false)).toBe('scene');
    expect(staticRefreshReason(s, 0, 0, sx, sy, sz, false, true)).toBe('forced');
  });

  it('covers the reach past the focus until the next refresh', () => {
    expect(staticCoverage(60)).toBe(SHADOW_CACHE.threshold + 60);
  });
});
