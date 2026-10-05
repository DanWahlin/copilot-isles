import { describe, expect, it } from 'vitest';
import { BRIGANTINE_FLAGS, RAIDER_BRIGANTINE_FLAGS, createFlagGeometry, flagYaw } from './ship-flags';

/** Where ship-local +x ends up in world XZ after the flag yaw and the ship's heading. */
function streamDirection(heading: number, yaw: number): [number, number] {
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  return [lx * Math.cos(heading) + lz * Math.sin(heading), -lx * Math.sin(heading) + lz * Math.cos(heading)];
}

describe('flagYaw', () => {
  it('streams the flags toward the downwind direction whatever the heading', () => {
    for (const heading of [0, 0.7, Math.PI / 2, Math.PI, 4.3]) {
      for (const [dx, dz] of [
        [1, 0],
        [0.8, -0.6],
        [-0.3, 0.95],
      ]) {
        const [sx, sz] = streamDirection(heading, flagYaw(heading, dx, dz));
        const len = Math.hypot(dx, dz);
        expect(sx).toBeCloseTo(dx / len, 5);
        expect(sz).toBeCloseTo(dz / len, 5);
      }
    }
  });

  it('leaves the built pose alone when the wind already blows along local +x', () => {
    // Heading 0: local +x is world +x.
    expect(flagYaw(0, 5, 0)).toBeCloseTo(0);
  });
});

describe('flag layouts', () => {
  /** The fly edge's reach (max x of the painted sheet) at mid-height and at the corners. */
  function fly(layout: typeof BRIGANTINE_FLAGS): { mid: number; corner: number } {
    const g = createFlagGeometry(layout);
    const pos = g.getAttribute('position');
    const painted = g.getAttribute('flagPainted');
    const { y0, y1 } = layout.flag;
    let mid = 0;
    let corner = 0;
    for (let i = 0; i < pos.count; i++) {
      if (painted.getX(i) < 0.5) continue;
      const v = (pos.getY(i) - y0) / (y1 - y0);
      if (Math.abs(v - 0.5) < 0.04) mid = Math.max(mid, pos.getX(i));
      if (v < 0.04 || v > 0.96) corner = Math.max(corner, pos.getX(i));
    }
    return { mid, corner };
  }

  it("cuts a swallowtail into the raiders' colours, not into yours", () => {
    const raider = fly(RAIDER_BRIGANTINE_FLAGS);
    expect(raider.corner - raider.mid).toBeGreaterThan(0.5);
    const yours = fly(BRIGANTINE_FLAGS);
    expect(Math.abs(yours.corner - yours.mid)).toBeLessThan(0.2);
  });
});
